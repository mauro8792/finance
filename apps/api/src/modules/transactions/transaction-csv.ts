import type { Transaction } from "./transaction.types.js";

export const CSV_DELIMITER = ";";

export const TRANSACTION_CSV_HEADERS = [
  "Fecha",
  "Tipo",
  "Categoría",
  "Descripción",
  "Importe",
  "Moneda",
  "Cuenta",
  "Estado",
  "Clasificación",
  "Reembolso",
  "Medio de pago",
] as const;

const TYPE_LABELS: Record<Transaction["type"], string> = {
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
  CREDIT_CARD_PAYMENT: "PAGO_TARJETA",
};

const STATUS_LABELS: Record<Transaction["status"], string> = {
  ACTIVE: "Activo",
  VOIDED: "Anulado",
  REVERSED: "Reversado",
};

const INCOME_KIND_LABELS = {
  OPERATING: "Ingreso normal",
  CAPITAL: "Capital",
} as const;

const REIMBURSEMENT_LABELS: Record<Transaction["reimbursementStatus"], string> = {
  NONE: "",
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  COMPLETED: "Completado",
};

const PAYMENT_METHOD_LABELS: Record<NonNullable<Transaction["paymentMethod"]>, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  BANK_TRANSFER: "Transferencia bancaria",
  DIGITAL_WALLET: "Billetera digital",
  OTHER: "Otro",
};

export type TransactionCsvLookups = {
  accountNameById: Record<string, string>;
  categoryNameById: Record<string, string>;
  timeZone: string;
};

export function escapeCsvField(value: string): string {
  if (/["\n\r;]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function formatCsvDate(occurredAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(occurredAt);
}

export function transactionToCsvRow(
  transaction: Transaction,
  lookups: TransactionCsvLookups
): string[] {
  return [
    formatCsvDate(transaction.occurredAt, lookups.timeZone),
    TYPE_LABELS[transaction.type],
    transaction.categoryId
      ? lookups.categoryNameById[transaction.categoryId] ?? ""
      : "",
    transaction.description ?? "",
    transaction.amount,
    transaction.currency,
    lookups.accountNameById[transaction.accountId ?? ""] ?? "",
    STATUS_LABELS[transaction.status],
    incomeKindLabel(transaction),
    REIMBURSEMENT_LABELS[transaction.reimbursementStatus],
    transaction.paymentMethod ? PAYMENT_METHOD_LABELS[transaction.paymentMethod] : "",
  ];
}

export function buildTransactionsCsv(
  transactions: Transaction[],
  lookups: TransactionCsvLookups
): string {
  const lines = [
    TRANSACTION_CSV_HEADERS.join(CSV_DELIMITER),
    ...transactions.map((item) =>
      transactionToCsvRow(item, lookups).map(escapeCsvField).join(CSV_DELIMITER)
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function incomeKindLabel(transaction: Transaction): string {
  if (transaction.type !== "INCOME" || !transaction.metadata || typeof transaction.metadata !== "object") {
    return "";
  }
  const kind = (transaction.metadata as { incomeKind?: unknown }).incomeKind;
  if (kind === "OPERATING" || kind === "CAPITAL") {
    return INCOME_KIND_LABELS[kind];
  }
  return "";
}
