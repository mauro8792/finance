import { formatMoney, formatPaidAt } from "./format-money";
import type {
  CreditCardFeeStatus,
  CreditCardRecurringChargeKind,
  Currency,
} from "./types";

export const FEE_STATUS_LABELS: Record<CreditCardFeeStatus, string> = {
  HAS_FEE: "Con comisión",
  WAIVED: "Bonificada",
  POTENTIALLY_WAIVED: "Bonificación condicional",
  UNKNOWN: "Sin configurar",
};

export type FeeStatusTone = "neutral" | "positive" | "warning" | "muted";

export const RECURRING_CHARGE_KIND_LABELS: Record<CreditCardRecurringChargeKind, string> = {
  MAINTENANCE: "Mantenimiento",
  RECURRING_SERVICE: "Servicio recurrente",
  INSURANCE: "Seguro",
  OTHER: "Otro",
};

export const RECURRING_CHARGE_KINDS: CreditCardRecurringChargeKind[] = [
  "MAINTENANCE",
  "RECURRING_SERVICE",
  "INSURANCE",
  "OTHER",
];

export const FEE_STATUSES: CreditCardFeeStatus[] = [
  "HAS_FEE",
  "WAIVED",
  "POTENTIALLY_WAIVED",
  "UNKNOWN",
];

/** UX brand options; "Otra" stores a custom free-text brand. */
export const CREDIT_CARD_BRAND_OPTIONS = [
  "Visa",
  "Mastercard",
  "American Express",
  "Otra",
] as const;

export type CreditCardBrandOption = (typeof CREDIT_CARD_BRAND_OPTIONS)[number];

export function brandOptionFromStored(brand: string): {
  option: CreditCardBrandOption;
  custom: string;
} {
  if (
    brand === "Visa" ||
    brand === "Mastercard" ||
    brand === "American Express"
  ) {
    return { option: brand, custom: "" };
  }
  return { option: "Otra", custom: brand };
}

export function resolveBrandValue(
  option: CreditCardBrandOption,
  custom: string
): string {
  if (option === "Otra") {
    return custom.trim();
  }
  return option;
}

const CARD_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  NOT_FOUND: "No encontramos ese recurso.",
  USER_NOT_CONFIGURED: "No hay un usuario configurado.",
  CREDIT_CARD_CONFIG_INCOMPLETE: "Completá cierre y vencimiento de la tarjeta.",
};

export function feeStatusLabel(status: CreditCardFeeStatus): string {
  return FEE_STATUS_LABELS[status];
}

export function feeStatusTone(status: CreditCardFeeStatus): FeeStatusTone {
  switch (status) {
    case "WAIVED":
      return "positive";
    case "POTENTIALLY_WAIVED":
      return "warning";
    case "HAS_FEE":
      return "neutral";
    default:
      return "muted";
  }
}

export function recurringChargeKindLabel(kind: CreditCardRecurringChargeKind): string {
  return RECURRING_CHARGE_KIND_LABELS[kind];
}

export function formatExpectedAmount(
  amount: string | null,
  currency: Currency
): string {
  if (amount === null) {
    return "Variable";
  }
  return formatMoney(amount, currency);
}

export function occurrenceKeyFor(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function dateOnDay(year: number, monthIndex0: number, dayOfMonth: number): Date {
  const clamped = Math.min(dayOfMonth, daysInMonth(year, monthIndex0));
  return new Date(Date.UTC(year, monthIndex0, clamped, 12, 0, 0, 0));
}

function calendarParts(date: Date, timezone?: string): { year: number; month: number; day: number } {
  if (!timezone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getFullYear());
  const month =
    Number(parts.find((part) => part.type === "month")?.value ?? date.getMonth() + 1) - 1;
  const day = Number(parts.find((part) => part.type === "day")?.value ?? date.getDate());
  return { year, month, day };
}

function noonLocal(year: number, monthIndex0: number, day: number): Date {
  return new Date(year, monthIndex0, day, 12, 0, 0, 0);
}

export function nextClosingDate(
  closingDay: number,
  fromDate: Date = new Date(),
  timezone?: string
): Date {
  const { year, month, day } = calendarParts(fromDate, timezone);
  const thisMonth = dateOnDay(year, month, closingDay);
  const fromNoon = timezone
    ? noonLocal(year, month, day)
    : new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12, 0, 0, 0);

  if (fromNoon.getTime() <= thisMonth.getTime()) {
    return thisMonth;
  }

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  return dateOnDay(nextYear, nextMonth, closingDay);
}

export function nextDueDate(dueDay: number, afterClosingDate: Date): Date {
  let year = afterClosingDate.getUTCFullYear();
  let month = afterClosingDate.getUTCMonth();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = dateOnDay(year, month, dueDay);
    if (candidate.getTime() > afterClosingDate.getTime()) {
      return candidate;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  throw new Error("No se pudo calcular el próximo vencimiento.");
}

export function formatCalendarDate(date: Date): string {
  return formatPaidAt(date.toISOString());
}

export function formatDayLabel(day: number | null): string {
  if (day === null) {
    return "Sin configurar";
  }
  return `Día ${day}`;
}

export function creditCardFormError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (
      code === "VALIDATION_ERROR" &&
      error.message.trim() &&
      !isRawErrorCode(error.message)
    ) {
      return error.message;
    }
    if (code && CARD_ERRORS[code]) {
      return CARD_ERRORS[code];
    }
    if (error.message.trim() && !isRawErrorCode(error.message)) {
      return error.message;
    }
  }
  return "No pudimos completar la operación. Probá de nuevo.";
}

function isRawErrorCode(message: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(message.trim());
}
