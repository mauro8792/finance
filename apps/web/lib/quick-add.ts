import type { Account, Category, MovementKind, PaymentMethod } from "./types";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  BANK_TRANSFER: "Transferencia bancaria",
  DIGITAL_WALLET: "Billetera digital",
  OTHER: "Otro",
};

export const LAST_ACCOUNT_KEY = "pf.quickAdd.accountId";
export const LAST_PAYMENT_KEY = "pf.quickAdd.paymentMethod";

export function normalizeAmountInput(raw: string): string {
  return raw.trim().replace(",", ".");
}

export function isValidAmount(raw: string): boolean {
  const value = normalizeAmountInput(raw);

  if (!AMOUNT_PATTERN.test(value)) {
    return false;
  }

  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return scaled > BigInt(0);
}

export function toApiAmount(raw: string): string {
  const value = normalizeAmountInput(raw);
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function filterActiveAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive);
}

export function filterCategoriesForType(
  categories: Category[],
  kind: MovementKind
): Category[] {
  const allowed = kind === "EXPENSE" ? ["EXPENSE", "BOTH"] : ["INCOME", "BOTH"];
  return categories.filter(
    (category) => category.isActive && allowed.includes(category.type)
  );
}

export function toLocalDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeToIso(value: string): string {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}
