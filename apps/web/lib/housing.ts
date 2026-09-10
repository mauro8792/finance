import { amountToCents, formatPaidAt } from "./format-money";
import type { Account, Currency, HousingObligation } from "./types";

const PAYMENT_ERRORS: Record<string, string> = {
  INSUFFICIENT_BALANCE: "La cuenta no tiene saldo suficiente.",
  CURRENCY_MISMATCH: "La moneda de la cuenta debe coincidir con la de la obligación.",
  HOUSING_OBLIGATION_INACTIVE: "No se puede registrar un pago sobre una obligación inactiva.",
  NO_REMAINING_INSTALLMENTS: "La obligación no tiene cuotas pendientes.",
  ACCOUNT_INACTIVE: "No se puede registrar un movimiento sobre una cuenta inactiva.",
  NOT_FOUND: "No encontramos esa vivienda o cuenta.",
};

export function firstActiveHousing(
  obligations: HousingObligation[]
): HousingObligation | null {
  return obligations.find((item) => item.isActive) ?? null;
}

export function accountsForHousingCurrency(
  accounts: Account[],
  currency: Currency,
  currentId: string | null = null
): Account[] {
  return accounts.filter(
    (account) =>
      account.currency === currency && (account.isActive || account.id === currentId)
  );
}

export function paymentAccountsForHousing(
  accounts: Account[],
  currency: Currency
): Account[] {
  return accounts.filter((account) => account.isActive && account.currency === currency);
}

export function parseOptionalInteger(
  raw: string,
  min: number,
  max?: number
): number | null | "invalid" {
  const value = raw.trim();
  if (value === "") {
    return null;
  }
  if (!/^-?\d+$/.test(value)) {
    return "invalid";
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    return "invalid";
  }
  return parsed;
}

export function parseRequiredInteger(
  raw: string,
  min: number
): number | "invalid" {
  const parsed = parseOptionalInteger(raw, min);
  if (parsed === null || parsed === "invalid") {
    return "invalid";
  }
  return parsed;
}

/**
 * Ancho visual de la barra de cobertura: cuotas cubiertas sobre cuotas
 * pendientes, tope 100%. El label muestra el valor exacto (ej. 7,73 cuotas);
 * la barra sólo se recorta visualmente.
 */
export function coverageBarWidth(
  coveredInstallments: string | null,
  remainingInstallments: number
): string {
  if (coveredInstallments === null) {
    return "0%";
  }

  const covered = amountToCents(coveredInstallments);
  const zero = BigInt(0);
  if (covered <= zero) {
    return "0%";
  }
  if (remainingInstallments <= 0) {
    return "100%";
  }

  const remaining = BigInt(remainingInstallments) * BigInt(100);
  if (covered >= remaining) {
    return "100%";
  }

  const hundredths = (covered * BigInt(10_000)) / remaining;
  const whole = hundredths / BigInt(100);
  const fraction = (hundredths % BigInt(100)).toString().padStart(2, "0");
  return fraction === "00" ? `${whole}%` : `${whole}.${fraction}%`;
}

/** Próxima fecha de vencimiento a partir del día del mes configurado. */
export function nextDueDateLabel(dueDay: number | null, from: Date = new Date()): string | null {
  if (dueDay === null) {
    return null;
  }

  const year = from.getFullYear();
  const monthIndex = from.getMonth();
  if (from.getDate() <= clampDayOfMonth(year, monthIndex, dueDay)) {
    return formatDueDate(year, monthIndex, dueDay);
  }

  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  return formatDueDate(nextYear, nextMonthIndex, dueDay);
}

function formatDueDate(year: number, monthIndex: number, dueDay: number): string {
  const day = clampDayOfMonth(year, monthIndex, dueDay);
  return formatPaidAt(new Date(year, monthIndex, day, 12, 0, 0, 0).toISOString());
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

export function housingFormError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "No pudimos guardar la vivienda. Probá de nuevo.";
}

export function housingPaymentError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code && PAYMENT_ERRORS[code]) {
      return PAYMENT_ERRORS[code];
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "No pudimos registrar el pago. Probá de nuevo.";
}
