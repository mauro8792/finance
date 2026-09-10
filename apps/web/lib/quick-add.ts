import {
  isValidAmount,
  normalizeAmountInput,
  toApiAmount,
} from "shared";
import type { Account, Category, IncomeKind, MovementKind, PaymentMethod } from "./types";

export { isValidAmount, normalizeAmountInput, toApiAmount };

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

export function filterActiveAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.isActive);
}

export function isCategoryRequired(
  kind: MovementKind,
  incomeKind?: IncomeKind | null
): boolean {
  if (kind === "TRANSFER") {
    return false;
  }
  if (kind === "EXPENSE") {
    return true;
  }
  return incomeKind !== "CAPITAL";
}

export function filterCategoriesForType(
  categories: Category[],
  kind: MovementKind
): Category[] {
  if (kind === "TRANSFER") {
    return [];
  }
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
