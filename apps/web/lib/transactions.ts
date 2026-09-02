import { PAYMENT_METHOD_LABELS } from "./quick-add";
import type {
  IncomeKind,
  ReimbursementStatus,
  Transaction,
  TransactionListFilters,
  TransactionMetadata,
  TransactionStatus,
  TransactionType,
} from "./types";

export const TRANSACTION_TYPES: TransactionType[] = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REIMBURSEMENT",
  "ADJUSTMENT",
  "INVESTMENT_OUTFLOW",
  "INVESTMENT_PRINCIPAL_RETURN",
  "INVESTMENT_RETURN",
  "CURRENCY_EXCHANGE",
  "HOUSING_PAYMENT",
];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  TRANSFER: "Transferencia",
  REIMBURSEMENT: "Reembolso",
  ADJUSTMENT: "Ajuste",
  INVESTMENT_OUTFLOW: "Inversión",
  INVESTMENT_PRINCIPAL_RETURN: "Retorno de capital",
  INVESTMENT_RETURN: "Rendimiento",
  CURRENCY_EXCHANGE: "Cambio de moneda",
  HOUSING_PAYMENT: "Pago vivienda",
};

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  OPERATING: "Ingreso normal",
  CAPITAL: "Capital",
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  ACTIVE: "Activo",
  VOIDED: "Anulado",
};

const IMMUTABLE_TYPES = new Set<TransactionType>([
  "TRANSFER",
  "CURRENCY_EXCHANGE",
  "HOUSING_PAYMENT",
  "INVESTMENT_OUTFLOW",
  "INVESTMENT_PRINCIPAL_RETURN",
  "INVESTMENT_RETURN",
]);

export type AmountSign = "+" | "-" | "";

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_LABELS[type];
}

export function incomeKindLabel(kind: IncomeKind | undefined): string | null {
  if (!kind) {
    return null;
  }
  return INCOME_KIND_LABELS[kind];
}

export function transactionStatusLabel(status: TransactionStatus): string {
  return TRANSACTION_STATUS_LABELS[status];
}

export function isImmutableTransactionType(type: TransactionType): boolean {
  return IMMUTABLE_TYPES.has(type);
}

export function canEditTransaction(transaction: Transaction): boolean {
  return transaction.status === "ACTIVE" && !isImmutableTransactionType(transaction.type);
}

export function canVoidTransaction(transaction: Transaction): boolean {
  if (transaction.status !== "ACTIVE") {
    return false;
  }
  if (isImmutableTransactionType(transaction.type)) {
    return false;
  }
  if (transaction.relatedTransactionId) {
    return false;
  }
  if (transaction.reimbursementStatus !== "NONE") {
    return false;
  }
  return true;
}

export function transactionAmountSign(transaction: Transaction): AmountSign {
  switch (transaction.type) {
    case "EXPENSE":
    case "HOUSING_PAYMENT":
    case "INVESTMENT_OUTFLOW":
      return "-";
    case "INCOME":
    case "REIMBURSEMENT":
    case "INVESTMENT_PRINCIPAL_RETURN":
    case "INVESTMENT_RETURN":
      return "+";
    case "TRANSFER":
    case "CURRENCY_EXCHANGE":
      return metadataDirectionSign(transaction.metadata);
    case "ADJUSTMENT":
      return "";
  }
}

function metadataDirectionSign(metadata: TransactionMetadata | null): AmountSign {
  if (metadata?.direction === "IN") {
    return "+";
  }
  if (metadata?.direction === "OUT") {
    return "-";
  }
  return "";
}

export function formatTransactionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function reimbursementLabel(
  status: ReimbursementStatus
): string | null {
  if (status === "COMPLETED") {
    return "Reembolsado";
  }
  if (status === "PARTIAL") {
    return "Parcialmente reembolsado";
  }
  if (status === "PENDING") {
    return "Reembolso pendiente";
  }
  return null;
}

export function directionLabel(metadata: TransactionMetadata | null): string | null {
  if (metadata?.direction === "IN") {
    return "Entrada";
  }
  if (metadata?.direction === "OUT") {
    return "Salida";
  }
  return null;
}

export function paymentMethodLabel(
  paymentMethod: Transaction["paymentMethod"]
): string | null {
  if (!paymentMethod) {
    return null;
  }
  return PAYMENT_METHOD_LABELS[paymentMethod];
}

export function toTransactionListFilters(input: {
  year: string;
  month: string;
  type: string;
  accountId: string;
  categoryId: string;
  status: string;
}): TransactionListFilters {
  return {
    ...(input.month ? { month: Number(input.month) } : {}),
    ...(input.month && input.year ? { year: Number(input.year) } : {}),
    ...(input.type ? { type: input.type as TransactionType } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.status ? { status: input.status as TransactionStatus } : {}),
  };
}

export function filterYearOptions(now = new Date()): number[] {
  const current = now.getFullYear();
  const years = new Set([current - 1, current, current + 1, 2026]);
  return [...years].sort((left, right) => left - right);
}

const TRANSACTION_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  NOT_FOUND: "No encontramos ese movimiento.",
  USER_NOT_CONFIGURED: "No hay un usuario configurado.",
  TRANSACTION_VOIDED: "No se puede editar un movimiento anulado.",
  TRANSACTION_ALREADY_VOIDED: "El movimiento ya está anulado.",
  TRANSACTION_RELATED:
    "No se puede anular un movimiento relacionado sin resolver los movimientos vinculados.",
  TRANSFER_IMMUTABLE: "Este movimiento no se puede modificar.",
  CURRENCY_EXCHANGE_IMMUTABLE: "Este movimiento no se puede modificar.",
  HOUSING_PAYMENT_IMMUTABLE: "Este movimiento no se puede modificar.",
  INVESTMENT_OUTFLOW_IMMUTABLE: "Este movimiento no se puede modificar.",
  INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE: "Este movimiento no se puede modificar.",
  INVESTMENT_RETURN_IMMUTABLE: "Este movimiento no se puede modificar.",
};

export function transactionFormError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    TRANSACTION_ERRORS[error.code]
  ) {
    return TRANSACTION_ERRORS[error.code];
  }
  if (error instanceof Error && error.message && !/^[A-Z_]+$/.test(error.message)) {
    return error.message;
  }
  return "No pudimos guardar el movimiento. Probá de nuevo.";
}
