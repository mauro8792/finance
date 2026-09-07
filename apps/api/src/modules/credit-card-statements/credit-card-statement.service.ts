import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreditCardRepository } from "../credit-cards/credit-card.types.js";
import { sumAmounts } from "../transactions/net-expense.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type {
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import {
  buildStatementCycle,
  computeDueDate,
} from "./credit-card-statement.math.js";
import {
  StatementCloseConflictError,
} from "./credit-card-statement.repository.js";
import type {
  CreditCardStatement,
  CreditCardStatementRepository,
  StatementTransactionSummary,
  StatementView,
} from "./credit-card-statement.types.js";

/**
 * P0.9 CreditCardStatement — grouping/projection/snapshot only (F9).
 * Does NOT alter currentCardDebt, bank balance, or installments.
 * projectedAmount is live-derived while PROJECTED; snapshotted on close.
 */
export class CreditCardStatementService {
  constructor(
    private readonly statements: CreditCardStatementRepository,
    private readonly cards: CreditCardRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async list(userId: string, creditCardId: string): Promise<StatementView[]> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    const rows = await this.statements.findByCreditCardId(card.id);
    const views: StatementView[] = [];
    for (const row of rows) {
      views.push(await this.toView(row, false));
    }
    return views;
  }

  async getById(
    userId: string,
    creditCardId: string,
    statementId: string
  ): Promise<StatementView> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    const statement = await this.requireOwnedStatement(
      userId,
      card.id,
      statementId
    );
    return this.toView(statement, true);
  }

  async getOrCreateProjected(
    userId: string,
    creditCardId: string,
    closingDateInput: Date
  ): Promise<StatementView> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    if (card.closingDay === null) {
      throw new AppError(
        "CREDIT_CARD_CONFIG_INCOMPLETE",
        "No se puede proyectar un resumen sin closingDay configurado.",
        400
      );
    }

    const cycle = buildStatementCycle(closingDateInput, card.closingDay);
    const dueDate =
      card.dueDay === null ? null : computeDueDate(cycle.closingDate, card.dueDay);

    const existing = await this.statements.findByCreditCardAndClosingDate(
      card.id,
      cycle.closingDate
    );
    if (existing) {
      return this.toView(existing, true);
    }

    try {
      const created = await this.statements.createProjected({
        id: randomUUID(),
        userId,
        creditCardId: card.id,
        currency: card.currency,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        closingDate: cycle.closingDate,
        dueDate,
        status: "PROJECTED",
      });
      return this.toView(created, true);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.statements.findByCreditCardAndClosingDate(
          card.id,
          cycle.closingDate
        );
        if (raced) {
          return this.toView(raced, true);
        }
      }
      throw error;
    }
  }

  async close(
    userId: string,
    creditCardId: string,
    statementId: string,
    actualAmountRaw?: string | number | null
  ): Promise<StatementView> {
    const card = await this.requireOwnedCard(userId, creditCardId);
    const statement = await this.requireOwnedStatement(
      userId,
      card.id,
      statementId
    );
    if (statement.status !== "PROJECTED") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Solo un statement PROJECTED puede cerrarse.",
        400
      );
    }

    const movements = await this.loadPeriodExpenses(statement);
    const closedProjectedAmount = sumMatchingCurrency(
      movements,
      statement.currency
    );
    const actualAmount =
      actualAmountRaw === undefined || actualAmountRaw === null
        ? null
        : parseNonNegativeAmount(String(actualAmountRaw));

    try {
      const closed = await this.statements.close(statement.id, {
        closedProjectedAmount,
        actualAmount,
        closedAt: new Date(),
      });
      return this.toView(closed, true);
    } catch (error) {
      if (error instanceof StatementCloseConflictError) {
        throw new AppError(
          "VALIDATION_ERROR",
          "El statement ya no está PROJECTED.",
          409
        );
      }
      throw error;
    }
  }

  private async toView(
    statement: CreditCardStatement,
    includeTransactions: boolean
  ): Promise<StatementView> {
    const movements = await this.loadPeriodExpenses(statement);
    const currentDerivedAmount = sumMatchingCurrency(
      movements,
      statement.currency
    );

    const projectedAmount =
      statement.status === "PROJECTED"
        ? currentDerivedAmount
        : (statement.closedProjectedAmount ?? currentDerivedAmount);

    const difference =
      statement.actualAmount === null
        ? null
        : fromCents(
            toCents(statement.actualAmount) - toCents(projectedAmount)
          );

    const hasReconciliationDifference =
      statement.status !== "PROJECTED" &&
      statement.closedProjectedAmount !== null &&
      statement.closedProjectedAmount !== currentDerivedAmount;

    const view: StatementView = {
      statement,
      projectedAmount,
      currentDerivedAmount,
      difference,
      hasReconciliationDifference,
    };

    if (includeTransactions) {
      view.transactions = movements
        .filter((tx) => tx.currency === statement.currency)
        .map(
          (tx): StatementTransactionSummary => ({
            id: tx.id,
            amount: tx.amount,
            currency: tx.currency,
            description: tx.description,
            occurredAt: tx.occurredAt,
          })
        );
    }

    return view;
  }

  private async loadPeriodExpenses(
    statement: CreditCardStatement
  ): Promise<Transaction[]> {
    const rows = await this.transactions.findByUserId(statement.userId, {
      creditCardId: statement.creditCardId,
      type: "EXPENSE",
      status: "ACTIVE",
      occurredAtGte: statement.periodStart,
      // inclusive end: use lt of next ms after periodEnd
      occurredAtLt: new Date(statement.periodEnd.getTime() + 1),
    });
    return rows.filter((tx) => tx.accountId === null);
  }

  private async requireOwnedCard(userId: string, creditCardId: string) {
    const card = await this.cards.findById(creditCardId);
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    return card;
  }

  private async requireOwnedStatement(
    userId: string,
    creditCardId: string,
    statementId: string
  ) {
    const statement = await this.statements.findById(statementId);
    if (
      !statement ||
      statement.userId !== userId ||
      statement.creditCardId !== creditCardId
    ) {
      throw new AppError("NOT_FOUND", "Resumen no encontrado.", 404);
    }
    return statement;
  }
}

function sumMatchingCurrency(
  movements: Transaction[],
  currency: CreditCardStatement["currency"]
): string {
  const amounts = movements
    .filter((tx) => tx.currency === currency)
    .map((tx) => tx.amount);
  if (amounts.length === 0) {
    return "0.00";
  }
  return sumAmounts(amounts);
}

function parseNonNegativeAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "actualAmount debe ser un monto no negativo con hasta 2 decimales.",
      400
    );
  }
  const normalized = toCents(trimmed.includes(".") ? trimmed : `${trimmed}.00`);
  if (normalized < 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      "actualAmount no puede ser negativo.",
      400
    );
  }
  return fromCents(normalized);
}

function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
