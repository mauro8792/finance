import { randomUUID } from "node:crypto";
import { CURRENCIES, parseMoney, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import {
  calendarMonthRangesAcrossYears,
  monthUtcRange,
} from "../../shared/time/month-range.js";
import type { AccountRepository } from "../accounts/account.types.js";
import type { CategoryRepository } from "../categories/category.types.js";
import type { CreditCardRepository } from "../credit-cards/credit-card.types.js";
import {
  assertCorrectionTarget,
  requireIdempotencyKey,
} from "../corrections/correction.repository.js";
import type { CorrectionRepository } from "../corrections/correction.types.js";
import { buildTransactionsCsv } from "./transaction-csv.js";
import {
  EXPENSE_CATEGORY_TYPES,
  INCOME_CATEGORY_TYPES,
  INCOME_KINDS,
  PAYMENT_METHODS,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type CreateReimbursementInput,
  type CreateTransferInput,
  type IncomeKind,
  type ListTransactionsInput,
  type PaymentMethod,
  type Transaction,
  type TransactionRepository,
  type TransferCreateResult,
  type UpdateTransactionInput,
  type VoidTransactionInput,
  type VoidTransferResult,
} from "./transaction.types.js";
import {
  activeReimbursementsOf,
  calculateNetExpense,
  reimbursementStatusFromTotals,
  sumAmounts,
} from "./net-expense.js";
import { computeBalance, toCents } from "./transaction-balance.js";

export class TransactionService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly creditCards: CreditCardRepository | null = null,
    private readonly corrections: CorrectionRepository | null = null
  ) {}

  async createExpense(
    userId: string,
    input: CreateExpenseInput
  ): Promise<Transaction> {
    const amount = parsePositiveAmount(input.amount);
    const hasAccount = input.accountId !== undefined && input.accountId !== "";
    const hasCard =
      input.creditCardId !== undefined && input.creditCardId !== "";

    if (hasAccount === hasCard) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un gasto debe indicar exactamente una de accountId o creditCardId.",
        400
      );
    }

    const category = await this.requireActiveCategory(
      userId,
      input.categoryId,
      EXPENSE_CATEGORY_TYPES,
      "No se puede registrar un gasto con una categoría inactiva.",
      "Un gasto sólo puede usar categorías EXPENSE o BOTH."
    );
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);
    const paymentMethod = requirePaymentMethod(input.paymentMethod);

    if (hasCard) {
      const card = await this.requireActiveOwnedCreditCard(
        userId,
        input.creditCardId!
      );
      // P1.2: card purchases may be ARS or USD independently of card.currency
      // (primary/billing currency). Debt is always reported per currency.
      const currency = requireSupportedCurrency(input.currency);
      return this.transactions.create({
        userId,
        accountId: null,
        creditCardId: card.id,
        categoryId: category.id,
        type: "EXPENSE",
        status: "ACTIVE",
        amount,
        currency,
        description,
        occurredAt,
        paymentMethod,
        isFixed: input.isFixed ?? false,
        reimbursementStatus: "NONE",
      });
    }

    const account = await this.requireActiveOwnedAccount(
      userId,
      input.accountId!
    );
    const currency = requireMatchingCurrency(input.currency, account.currency);

    return this.transactions.create({
      userId,
      accountId: account.id,
      creditCardId: null,
      categoryId: category.id,
      type: "EXPENSE",
      status: "ACTIVE",
      amount,
      currency,
      description,
      occurredAt,
      paymentMethod,
      isFixed: input.isFixed ?? false,
      reimbursementStatus: "NONE",
    });
  }

  async createIncome(
    userId: string,
    input: CreateIncomeInput
  ): Promise<Transaction> {
    const amount = parsePositiveAmount(input.amount);
    const incomeKind = requireIncomeKind(input.incomeKind);
    const account = await this.requireActiveOwnedAccount(userId, input.accountId);
    const categoryId = await this.resolveIncomeCategoryId(userId, incomeKind, input.categoryId);
    const currency = requireMatchingCurrency(input.currency, account.currency);
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);

    return this.transactions.create({
      userId,
      accountId: account.id,
      categoryId,
      type: "INCOME",
      status: "ACTIVE",
      amount,
      currency,
      description,
      occurredAt,
      reimbursementStatus: "NONE",
      metadata: { incomeKind },
    });
  }

  async list(
    userId: string,
    input: ListTransactionsInput,
    timeZone: string
  ): Promise<Transaction[]> {
    const occurredAt = resolveOccurredAtFilter(input.year, input.month, timeZone);

    return this.transactions.findByUserId(userId, {
      occurredAtGte: occurredAt?.start,
      occurredAtLt: occurredAt?.endExclusive,
      occurredAtRanges: occurredAt?.ranges,
      type: input.type,
      accountId: input.accountId,
      categoryId: input.categoryId,
      status: input.status,
      currency: input.currency,
    });
  }

  async exportCsv(
    userId: string,
    input: ListTransactionsInput,
    timeZone: string
  ): Promise<string> {
    const [items, accounts, categories] = await Promise.all([
      this.list(userId, input, timeZone),
      this.accounts.findByUserId(userId),
      this.categories.findByUserId(userId),
    ]);
    return buildTransactionsCsv(items, {
      accountNameById: Object.fromEntries(accounts.map((item) => [item.id, item.name])),
      categoryNameById: Object.fromEntries(categories.map((item) => [item.id, item.name])),
      timeZone,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput
  ): Promise<Transaction> {
    const current = await this.requireOwnedTransaction(userId, id);
    rejectImmutableLeg(current, "editar");

    if (current.status !== "ACTIVE") {
      throw new AppError(
        "TRANSACTION_VOIDED",
        "No se puede editar un movimiento anulado.",
        400
      );
    }

    if (!hasUpdateFields(input)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Debe enviarse al menos un campo para actualizar.",
        400
      );
    }

    if (current.accountId) {
      const account = await this.requireActiveOwnedAccount(
        userId,
        current.accountId
      );
      requireMatchingCurrency(current.currency, account.currency);
    } else if (current.creditCardId) {
      // Card-funded EXPENSE: keep currency; do not require an Account.
      const card = await this.requireOwnedCreditCard(userId, current.creditCardId);
      requireMatchingCurrency(current.currency, card.currency);
    }

    const categoryId = await this.resolveUpdateCategoryId(userId, current, input.categoryId);

    return this.transactions.update(id, {
      ...(input.amount !== undefined
        ? { amount: parsePositiveAmount(input.amount) }
        : {}),
      categoryId,
      ...(input.description !== undefined
        ? { description: normalizeDescription(input.description ?? undefined) }
        : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.paymentMethod !== undefined
        ? { paymentMethod: requirePaymentMethod(input.paymentMethod ?? undefined) }
        : {}),
      ...(input.isFixed !== undefined ? { isFixed: input.isFixed } : {}),
    });
  }

  /**
   * P0.15 plain void: EXPENSE (bank or card), INCOME, ADJUSTMENT.
   * Compound operations have dedicated endpoints and are rejected here:
   * transfers, card payments, FX, housing and investments.
   */
  async void(
    userId: string,
    id: string,
    input: VoidTransactionInput
  ): Promise<Transaction> {
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const current = await this.requireOwnedTransaction(userId, id);

    if (current.type === "CREDIT_CARD_PAYMENT") {
      throw new AppError(
        "CREDIT_CARD_PAYMENT_VOID_REQUIRED",
        "Un pago de tarjeta se anula desde POST /api/credit-cards/:id/payments/:paymentId/void.",
        400
      );
    }

    rejectImmutableLeg(current, "anular");

    /**
     * The replay lookup runs before the already-voided check so that repeating
     * the same key returns the recorded result, while a *different* key on an
     * already voided movement still fails with TRANSACTION_ALREADY_VOIDED.
     */
    if (this.corrections) {
      const replay = await this.corrections.findByIdempotencyKey(
        userId,
        idempotencyKey
      );
      if (replay) {
        assertCorrectionTarget(replay, "TRANSACTION_VOID", id);
        return current;
      }
    }

    if (current.status !== "ACTIVE") {
      throw new AppError(
        "TRANSACTION_ALREADY_VOIDED",
        "El movimiento ya está anulado.",
        409
      );
    }

    if (current.relatedTransactionId) {
      throw new AppError(
        "TRANSACTION_RELATED",
        "No se puede anular un movimiento relacionado sin resolver los movimientos vinculados.",
        409
      );
    }

    const related = await this.transactions.findByUserId(userId, {
      relatedTransactionId: current.id,
    });
    if (related.length > 0) {
      throw new AppError(
        "TRANSACTION_RELATED",
        "No se puede anular un movimiento relacionado sin resolver los movimientos vinculados.",
        409
      );
    }

    const result = await this.transactions.voidTransactionAtomic({
      userId,
      transactionId: id,
      idempotencyKey,
    });
    return result.transaction;
  }

  /**
   * P0.15 atomic transfer void: both TRANSFER legs go to REVERSED together.
   * No compensating income/expense is created, so spending and budgets are
   * untouched (TRANSFER is already neutral for both).
   */
  async voidTransfer(
    userId: string,
    transferId: string,
    input: VoidTransactionInput
  ): Promise<VoidTransferResult> {
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    const transfer = await this.transactions.findTransferById(
      userId,
      transferId
    );
    if (!transfer) {
      throw new AppError("NOT_FOUND", "Transferencia no encontrada.", 404);
    }
    return this.transactions.voidTransferAtomic({
      userId,
      transferId,
      idempotencyKey,
    });
  }

  async registerReimbursement(
    userId: string,
    expenseId: string,
    input: CreateReimbursementInput
  ): Promise<Transaction> {
    const expense = await this.requireOwnedTransaction(userId, expenseId);

    if (expense.type !== "EXPENSE") {
      throw new AppError(
        "TRANSACTION_TYPE_INCOMPATIBLE",
        "El reintegro debe asociarse a un gasto.",
        400
      );
    }

    if (expense.status !== "ACTIVE") {
      throw new AppError(
        "TRANSACTION_VOIDED",
        "No se puede registrar un reintegro sobre un gasto anulado.",
        400
      );
    }

    const account = await this.requireActiveOwnedAccount(userId, input.accountId);
    if (account.currency !== expense.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la cuenta receptora debe coincidir con la del gasto.",
        400
      );
    }

    const amount = parsePositiveAmount(input.amount);
    const related = await this.transactions.findByUserId(userId, {
      relatedTransactionId: expense.id,
    });
    const active = activeReimbursementsOf(expense, related);
    const reimbursed = sumAmounts(active.map((item) => item.amount));
    const pending = toCents(expense.amount) - toCents(reimbursed);

    if (toCents(amount) > pending) {
      throw new AppError(
        "REIMBURSEMENT_EXCEEDS_PENDING",
        "El reintegro no puede superar el pendiente del gasto.",
        400
      );
    }

    const nextReimbursed = sumAmounts([...active.map((item) => item.amount), amount]);
    const reimbursementStatus = reimbursementStatusFromTotals(
      expense.amount,
      nextReimbursed
    );

    return this.transactions.createLinkedReimbursement(
      {
        userId,
        accountId: account.id,
        categoryId: null,
        type: "REIMBURSEMENT",
        status: "ACTIVE",
        amount,
        currency: expense.currency,
        description: normalizeDescription(input.description),
        occurredAt: input.occurredAt ?? new Date(),
        relatedTransactionId: expense.id,
      },
      { id: expense.id, reimbursementStatus }
    );
  }

  async createTransfer(
    userId: string,
    input: CreateTransferInput
  ): Promise<TransferCreateResult> {
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      throw new AppError(
        "VALIDATION_ERROR",
        "idempotencyKey es obligatorio (mínimo 8 caracteres).",
        400
      );
    }
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La cuenta origen y la cuenta destino deben ser distintas.",
        400
      );
    }

    const amount = parsePositiveAmount(input.amount);
    const clientSentOccurredAt = input.occurredAt !== undefined;
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);

    return this.transactions.createTransferAtomic({
      userId,
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      amount,
      description,
      occurredAt,
      clientSentOccurredAt,
      idempotencyKey: input.idempotencyKey.trim(),
    });
  }

  async listTransfers(userId: string) {
    return this.transactions.listTransfers(userId);
  }

  async getTransfer(userId: string, transferId: string) {
    const transfer = await this.transactions.findTransferById(
      userId,
      transferId
    );
    if (!transfer) {
      throw new AppError("NOT_FOUND", "Transferencia no encontrada.", 404);
    }
    return transfer;
  }

  async getNetExpense(
    userId: string,
    expenseId: string
  ): Promise<{
    expenseId: string;
    currency: Transaction["currency"];
    grossAmount: string;
    netAmount: string;
    reimbursementStatus: Transaction["reimbursementStatus"];
  }> {
    const expense = await this.requireOwnedTransaction(userId, expenseId);

    if (expense.type !== "EXPENSE") {
      throw new AppError(
        "TRANSACTION_TYPE_INCOMPATIBLE",
        "El gasto neto sólo aplica a un gasto.",
        400
      );
    }

    if (expense.status !== "ACTIVE") {
      throw new AppError(
        "TRANSACTION_VOIDED",
        "Un gasto anulado no participa en el gasto neto activo.",
        400
      );
    }

    const related = await this.transactions.findByUserId(userId, {
      relatedTransactionId: expense.id,
    });
    const netAmount = calculateNetExpense(
      expense.amount,
      activeReimbursementsOf(expense, related).map((item) => item.amount)
    );

    return {
      expenseId: expense.id,
      currency: expense.currency,
      grossAmount: expense.amount,
      netAmount,
      reimbursementStatus: expense.reimbursementStatus,
    };
  }

  private async requireOwnedTransaction(userId: string, id: string) {
    const transaction = await this.transactions.findById(id);

    if (!transaction || transaction.userId !== userId) {
      throw new AppError("NOT_FOUND", "Movimiento no encontrado.", 404);
    }

    return transaction;
  }

  private async resolveIncomeCategoryId(
    userId: string,
    incomeKind: IncomeKind,
    categoryId: string | undefined
  ): Promise<string | null> {
    if (incomeKind === "CAPITAL" && !categoryId) {
      return null;
    }

    if (!categoryId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El categoryId es obligatorio para un ingreso operativo.",
        400
      );
    }

    const category = await this.requireActiveCategory(
      userId,
      categoryId,
      INCOME_CATEGORY_TYPES,
      "No se puede registrar un ingreso con una categoría inactiva.",
      "Un ingreso sólo puede usar categorías INCOME o BOTH."
    );
    return category.id;
  }

  private async resolveUpdateCategoryId(
    userId: string,
    current: Transaction,
    nextCategoryId: string | undefined
  ): Promise<string | null> {
    const categoryId = nextCategoryId ?? current.categoryId;
    if (isCapitalIncome(current) && !categoryId) {
      return null;
    }

    if (!categoryId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La categoría es obligatoria.",
        400
      );
    }

    const categoryTypes =
      current.type === "INCOME" ? INCOME_CATEGORY_TYPES : EXPENSE_CATEGORY_TYPES;
    const category = await this.requireActiveCategory(
      userId,
      categoryId,
      categoryTypes,
      current.type === "INCOME"
        ? "No se puede registrar un ingreso con una categoría inactiva."
        : "No se puede registrar un gasto con una categoría inactiva.",
      current.type === "INCOME"
        ? "Un ingreso sólo puede usar categorías INCOME o BOTH."
        : "Un gasto sólo puede usar categorías EXPENSE o BOTH."
    );
    return category.id;
  }

  private async requireActiveOwnedAccount(userId: string, accountId: string) {
    const account = await this.accounts.findById(accountId);

    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }

    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede registrar un movimiento sobre una cuenta inactiva.",
        400
      );
    }

    return account;
  }

  private async requireOwnedCreditCard(userId: string, creditCardId: string) {
    if (!this.creditCards) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Las compras con tarjeta no están disponibles.",
        400
      );
    }
    const card = await this.creditCards.findById(creditCardId);
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    return card;
  }

  private async requireActiveOwnedCreditCard(
    userId: string,
    creditCardId: string
  ) {
    const card = await this.requireOwnedCreditCard(userId, creditCardId);
    if (!card.isActive) {
      throw new AppError(
        "CREDIT_CARD_INACTIVE",
        "No se puede registrar un consumo sobre una tarjeta inactiva.",
        400
      );
    }
    return card;
  }

  private async requireActiveCategory(
    userId: string,
    categoryId: string,
    allowedTypes: readonly string[],
    inactiveMessage: string,
    incompatibleMessage: string
  ) {
    const category = await this.categories.findById(categoryId);

    if (!category || category.userId !== userId) {
      throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
    }

    if (!category.isActive) {
      throw new AppError("CATEGORY_INACTIVE", inactiveMessage, 400);
    }

    if (!allowedTypes.includes(category.type)) {
      throw new AppError(
        "CATEGORY_TYPE_INCOMPATIBLE",
        incompatibleMessage,
        400
      );
    }

    return category;
  }
}

export function parsePositiveAmount(raw: string): string {
  const parsed = parseMoney(raw);
  if (!parsed.ok) {
    throw new AppError("VALIDATION_ERROR", parsed.reason, 400);
  }
  return parsed.canonical;
}

function requireIncomeKind(incomeKind: string): IncomeKind {
  if ((INCOME_KINDS as readonly string[]).includes(incomeKind)) {
    return incomeKind as IncomeKind;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "incomeKind debe ser OPERATING o CAPITAL.",
    400
  );
}

function isCapitalIncome(transaction: Transaction): boolean {
  if (transaction.type !== "INCOME" || !transaction.metadata || typeof transaction.metadata !== "object") {
    return false;
  }
  return (transaction.metadata as { incomeKind?: unknown }).incomeKind === "CAPITAL";
}

function requireSupportedCurrency(requested: Currency): Currency {
  if (!(CURRENCIES as readonly string[]).includes(requested)) {
    throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
  }
  return requested;
}

function requireMatchingCurrency(
  requested: Currency,
  accountCurrency: Currency
): Currency {
  if (!(CURRENCIES as readonly string[]).includes(requested)) {
    throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
  }

  if (requested !== accountCurrency) {
    throw new AppError(
      "CURRENCY_MISMATCH",
      "La moneda del movimiento debe coincidir con la moneda de la cuenta.",
      400
    );
  }

  return accountCurrency;
}

function normalizeDescription(
  description: string | undefined
): string | null {
  if (description === undefined) {
    return null;
  }

  const value = description.trim();

  if (value.length > 255) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La descripción no puede superar 255 caracteres.",
      400
    );
  }

  return value || null;
}

function resolveOccurredAtFilter(
  year: number | undefined,
  month: number | undefined,
  timeZone: string
):
  | { start: Date; endExclusive: Date; ranges?: undefined }
  | { start?: undefined; endExclusive?: undefined; ranges: Array<{ gte: Date; lt: Date }> }
  | undefined {
  if (year === undefined && month === undefined) {
    return undefined;
  }

  if (month === undefined) {
    throw new AppError("VALIDATION_ERROR", "year requiere month.", 400);
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError(
      "VALIDATION_ERROR",
      "month debe estar entre 1 y 12.",
      400
    );
  }

  try {
    if (year === undefined) {
      return {
        ranges: calendarMonthRangesAcrossYears(month, timeZone).map((range) => ({
          gte: range.start,
          lt: range.endExclusive,
        })),
      };
    }

    if (!Number.isInteger(year)) {
      throw new AppError("VALIDATION_ERROR", "year debe ser un entero.", 400);
    }

    return monthUtcRange(year, month, timeZone);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("VALIDATION_ERROR", "Zona horaria inválida.", 400);
  }
}

function rejectImmutableLeg(transaction: Transaction, action: "editar" | "anular") {
  if (transaction.type === "TRANSFER") {
    throw new AppError(
      "TRANSFER_IMMUTABLE",
      action === "editar"
        ? "No se puede editar una pierna de transferencia de forma individual."
        : "No se puede anular una pierna de transferencia de forma individual.",
      400
    );
  }

  if (transaction.type === "CURRENCY_EXCHANGE") {
    throw new AppError(
      "CURRENCY_EXCHANGE_IMMUTABLE",
      action === "editar"
        ? "No se puede editar una pierna de cambio de moneda de forma individual."
        : "No se puede anular una pierna de cambio de moneda de forma individual.",
      400
    );
  }

  if (transaction.type === "HOUSING_PAYMENT") {
    throw new AppError(
      "HOUSING_PAYMENT_IMMUTABLE",
      action === "editar"
        ? "No se puede editar un pago de vivienda de forma individual."
        : "No se puede anular un pago de vivienda de forma individual.",
      400
    );
  }

  if (transaction.type === "ADJUSTMENT") {
    throw new AppError(
      "ADJUSTMENT_IMMUTABLE",
      action === "editar"
        ? "No se puede editar una conciliación de saldo de forma individual."
        : "No se puede anular una conciliación de saldo de forma individual.",
      400
    );
  }

  /**
   * P0.15: investment legs stay IMMUTABLE. There is no void path for them;
   * corrections go through the investment lifecycle (mature / renew / cancel).
   */
  if (transaction.type === "INVESTMENT_OUTFLOW") {
    throw new AppError(
      "INVESTMENT_OUTFLOW_IMMUTABLE",
      action === "editar"
        ? "No se puede editar una colocación de inversión de forma individual."
        : "No se puede anular una colocación de inversión de forma individual.",
      400
    );
  }

  if (transaction.type === "INVESTMENT_PRINCIPAL_RETURN") {
    throw new AppError(
      "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE",
      action === "editar"
        ? "No se puede editar una devolución de capital de forma individual."
        : "No se puede anular una devolución de capital de forma individual.",
      400
    );
  }

  if (transaction.type === "INVESTMENT_RETURN") {
    throw new AppError(
      "INVESTMENT_RETURN_IMMUTABLE",
      action === "editar"
        ? "No se puede editar un rendimiento de inversión de forma individual."
        : "No se puede anular un rendimiento de inversión de forma individual.",
      400
    );
  }
}

function hasUpdateFields(input: UpdateTransactionInput): boolean {
  return (
    input.amount !== undefined ||
    input.categoryId !== undefined ||
    input.description !== undefined ||
    input.occurredAt !== undefined ||
    input.paymentMethod !== undefined ||
    input.isFixed !== undefined
  );
}

function requirePaymentMethod(
  paymentMethod: PaymentMethod | undefined
): PaymentMethod | null {
  if (paymentMethod === undefined) {
    return null;
  }

  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new AppError("VALIDATION_ERROR", "Método de pago inválido.", 400);
  }

  return paymentMethod;
}
