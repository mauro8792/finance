import { randomUUID } from "node:crypto";
import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import {
  calendarMonthRangesAcrossYears,
  monthUtcRange,
} from "../../shared/time/month-range.js";
import type { AccountRepository } from "../accounts/account.types.js";
import type { CategoryRepository } from "../categories/category.types.js";
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
  type UpdateTransactionInput,
} from "./transaction.types.js";
import {
  activeReimbursementsOf,
  calculateNetExpense,
  reimbursementStatusFromTotals,
  sumAmounts,
} from "./net-expense.js";
import { computeBalance, toCents } from "./transaction-balance.js";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class TransactionService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository
  ) {}

  async createExpense(
    userId: string,
    input: CreateExpenseInput
  ): Promise<Transaction> {
    const amount = parsePositiveAmount(input.amount);
    const account = await this.requireActiveOwnedAccount(userId, input.accountId);
    const category = await this.requireActiveCategory(
      userId,
      input.categoryId,
      EXPENSE_CATEGORY_TYPES,
      "No se puede registrar un gasto con una categoría inactiva.",
      "Un gasto sólo puede usar categorías EXPENSE o BOTH."
    );
    const currency = requireMatchingCurrency(input.currency, account.currency);
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);
    const paymentMethod = requirePaymentMethod(input.paymentMethod);

    return this.transactions.create({
      userId,
      accountId: account.id,
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

    if (current.status === "VOIDED") {
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

    const account = await this.requireActiveOwnedAccount(
      userId,
      current.accountId
    );
    requireMatchingCurrency(current.currency, account.currency);

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

  async void(userId: string, id: string): Promise<Transaction> {
    const current = await this.requireOwnedTransaction(userId, id);
    rejectImmutableLeg(current, "anular");

    if (current.status === "VOIDED") {
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

    return this.transactions.update(id, { status: "VOIDED" });
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

    if (expense.status === "VOIDED") {
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
  ): Promise<{ transferId: string; out: Transaction; in: Transaction }> {
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La cuenta origen y la cuenta destino deben ser distintas.",
        400
      );
    }

    const source = await this.requireActiveOwnedAccount(
      userId,
      input.sourceAccountId
    );
    const destination = await this.requireActiveOwnedAccount(
      userId,
      input.destinationAccountId
    );

    if (source.currency !== destination.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La transferencia requiere la misma moneda en ambas cuentas.",
        400
      );
    }

    const amount = parsePositiveAmount(input.amount);
    const sourceMovements = await this.transactions.findByUserId(userId, {
      accountId: source.id,
      status: "ACTIVE",
    });
    const available = computeBalance(source.initialBalance, sourceMovements);

    if (toCents(available) < toCents(amount)) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "La cuenta origen no tiene saldo suficiente.",
        400
      );
    }

    const transferId = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);
    const shared = {
      userId,
      categoryId: null,
      type: "TRANSFER" as const,
      status: "ACTIVE" as const,
      amount,
      currency: source.currency,
      description,
      occurredAt,
      relatedTransactionId: null,
    };

    const [out, incoming] = await this.transactions.createTransferPair(
      {
        ...shared,
        accountId: source.id,
        metadata: { transferId, direction: "OUT" },
      },
      {
        ...shared,
        accountId: destination.id,
        metadata: { transferId, direction: "IN" },
      }
    );

    return { transferId, out, in: incoming };
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

    if (expense.status === "VOIDED") {
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
  const value = raw.trim();

  if (!AMOUNT_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El importe debe ser un decimal positivo con hasta 2 decimales.",
      400
    );
  }

  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (scaled <= 0n) {
    throw new AppError("VALIDATION_ERROR", "El importe debe ser mayor que 0.", 400);
  }

  return `${whole}.${fraction.padEnd(2, "0")}`;
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
