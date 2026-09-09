/**
 * P0.9 CreditCardStatement — grouping/projection/snapshot only (F9).
 * Does NOT alter currentCardDebt, bank balance, or installments.
 * projectedAmount is live-derived while PROJECTED; snapshotted on close.
 * P0.10: paidAmount/remainingAmount derived from payment links (status only).
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreditCardPaymentRepository } from "../credit-card-payments/credit-card-payment.types.js";
import {
  statementTargetAmount,
} from "../credit-cards/credit-card-debt.js";
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
  StatementPaymentSummary,
  StatementTransactionSummary,
  StatementView,
} from "./credit-card-statement.types.js";

export class CreditCardStatementService {
  constructor(
    private readonly statements: CreditCardStatementRepository,
    private readonly cards: CreditCardRepository,
    private readonly transactions: TransactionRepository,
    private readonly payments: CreditCardPaymentRepository | null = null
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

    const target = statementTargetAmount({
      actualAmount,
      closedProjectedAmount,
    });
    const closeStatus =
      target != null && toCents(target) === 0n ? "PAID" : "CLOSED";

    try {
      const closed = await this.statements.close(statement.id, {
        closedProjectedAmount,
        actualAmount,
        closedAt: new Date(),
        status: closeStatus,
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

    const targetAmount =
      statement.status === "PROJECTED"
        ? null
        : statementTargetAmount(statement);

    let paidAmount: string | null = null;
    let remainingAmount: string | null = null;
    let payments: StatementPaymentSummary[] | undefined;
    let hasPaymentCoverageGap = false;

    if (statement.status !== "PROJECTED" && this.payments) {
      const links = await this.payments.findByStatementId(statement.id);
      const paymentViews: StatementPaymentSummary[] = [];
      let paidCents = 0n;
      for (const link of links) {
        const tx = await this.transactions.findById(link.transactionId);
        if (!tx || tx.status !== "ACTIVE" || tx.accountId == null) {
          continue;
        }
        paidCents += toCents(tx.amount);
        paymentViews.push({
          id: link.transactionId,
          amount: tx.amount,
          accountId: tx.accountId,
          occurredAt: tx.occurredAt,
          status: tx.status,
        });
      }
      paidAmount = fromCents(paidCents);
      if (targetAmount != null) {
        const rem = toCents(targetAmount) - paidCents;
        remainingAmount = fromCents(rem < 0n ? 0n : rem);
      }
      hasPaymentCoverageGap =
        toCents(currentDerivedAmount) > paidCents;
      if (includeTransactions) {
        payments = paymentViews;
      }
    } else if (statement.status !== "PROJECTED") {
      paidAmount = "0.00";
      remainingAmount = targetAmount;
    }

    const view: StatementView = {
      statement,
      projectedAmount,
      currentDerivedAmount,
      difference,
      hasReconciliationDifference,
      targetAmount,
      paidAmount,
      remainingAmount,
      hasPaymentCoverageGap,
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
      if (payments) {
        view.payments = payments;
      }
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
