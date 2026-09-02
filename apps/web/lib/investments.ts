import { amountToCents } from "./format-money";
import { normalizeAmountInput } from "./quick-add";
import type { Account, Currency, Investment, InvestmentStatus } from "./types";

const ART_TIMEZONE = "America/Argentina/Buenos_Aires";
const RATE_MICRO = BigInt(1_000_000);
const YEAR_DAYS = BigInt(365);
const PERCENT_PATTERN = /^(?:0|[1-9]\d{0,5})(?:[.,]\d{1,8})?$/;
const NON_NEGATIVE_AMOUNT = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export const INVESTMENT_STATUS_LABELS: Record<InvestmentStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  MATURED: "Vencida",
  RENEWED: "Renovada",
  CANCELLED: "Cancelada",
};

export const INVESTMENT_TYPE_LABELS = {
  CAUCION: "Caución",
  OTHER: "Otra",
} as const;

const INVESTMENT_ERRORS: Record<string, string> = {
  INSUFFICIENT_BALANCE: "La cuenta no tiene saldo suficiente.",
  CURRENCY_MISMATCH: "La moneda de la cuenta debe coincidir con la de la inversión.",
  INVESTMENT_NOT_ACTIVE: "Sólo una inversión activa puede usar esta acción.",
  ACCOUNT_INACTIVE: "No se puede usar una cuenta inactiva.",
  NOT_FOUND: "No encontramos esa inversión o cuenta.",
  VALIDATION_ERROR: "Revisá los datos ingresados.",
};

export function accountsForInvestmentCurrency(
  accounts: Account[],
  currency: Currency
): Account[] {
  return accounts.filter((account) => account.isActive && account.currency === currency);
}

export function groupInvestments(items: Investment[]) {
  return {
    active: items.filter((item) => item.status === "ACTIVE"),
    upcoming: items
      .filter((item) => item.status === "ACTIVE" && item.maturityDate)
      .slice()
      .sort((left, right) => (left.maturityDate ?? "").localeCompare(right.maturityDate ?? "")),
    finished: items.filter(
      (item) =>
        item.status === "MATURED" ||
        item.status === "RENEWED" ||
        item.status === "CANCELLED"
    ),
    drafts: items.filter((item) => item.status === "DRAFT"),
  };
}

export function percentToAnnualRate(raw: string): string | null {
  const value = raw.trim().replace(",", ".");
  if (!PERCENT_PATTERN.test(value)) {
    return null;
  }

  const [whole = "0", fraction = ""] = value.split(".");
  let percentE8 =
    BigInt(whole) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, "0").slice(0, 8));
  if (fraction.length > 8 && fraction[8]! >= "5") {
    percentE8 += BigInt(1);
  }

  const rateE8 = percentE8 / BigInt(100);
  let micros = rateE8 / BigInt(100);
  if (rateE8 % BigInt(100) >= BigInt(50)) {
    micros += BigInt(1);
  }

  const wholeRate = micros / RATE_MICRO;
  const fractionRate = (micros % RATE_MICRO).toString().padStart(6, "0");
  return `${wholeRate}.${fractionRate}`;
}

export function formatAnnualRatePercent(annualRate: string): string {
  const [whole = "0", fraction = ""] = annualRate.split(".");
  const micros =
    BigInt(stripLeadingZeros(whole)) * RATE_MICRO +
    BigInt(fraction.padEnd(6, "0").slice(0, 6));
  const percentMicros = micros * BigInt(100);
  const percentWhole = percentMicros / RATE_MICRO;
  const percentFraction = (percentMicros % RATE_MICRO)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  const display =
    percentFraction.length > 0
      ? `${percentWhole},${percentFraction}`
      : `${percentWhole}`;
  return `${display}%`;
}

export function isNonNegativeAmount(raw: string): boolean {
  return NON_NEGATIVE_AMOUNT.test(normalizeAmountInput(raw));
}

export function artDateToIso(dateOnly: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }
  return `${dateOnly}T15:00:00.000Z`;
}

export function isoToArtDateInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ART_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

export function formatArtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const formatted = new Intl.DateTimeFormat("es-AR", {
    timeZone: ART_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return formatted.replace(".", "");
}

export function calendarDaysBetweenDateOnly(start: string, maturity: string): number | null {
  const startParts = parseDateOnly(start);
  const maturityParts = parseDateOnly(maturity);
  if (!startParts || !maturityParts) {
    return null;
  }
  return calendarDayNumber(maturityParts) - calendarDayNumber(startParts);
}

export function estimateExpectedReturn(
  principal: string,
  annualRate: string,
  days: number
): string | null {
  if (days < 0) {
    return null;
  }
  if (days === 0) {
    return "0.00";
  }
  const numerator = amountToCents(principal) * toRateMicro(annualRate) * BigInt(days);
  const denominator = RATE_MICRO * YEAR_DAYS;
  return fromCents(divideRoundHalfUp(numerator, denominator));
}

export function addAmounts(left: string, right: string): string {
  return fromCents(amountToCents(left) + amountToCents(right));
}

export function investmentFormError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (
      code === "VALIDATION_ERROR" &&
      error.message.trim() &&
      !isRawErrorCode(error.message)
    ) {
      return error.message;
    }
    if (code && INVESTMENT_ERRORS[code]) {
      return INVESTMENT_ERRORS[code];
    }
  }

  if (error instanceof Error && error.message.trim() && !isRawErrorCode(error.message)) {
    return error.message;
  }

  return "No pudimos completar la operación. Probá de nuevo.";
}

function isRawErrorCode(message: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(message.trim());
}

function parseDateOnly(
  value: string
): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day };
}

function calendarDayNumber(parts: { year: number; month: number; day: number }): number {
  const a = Math.trunc((14 - parts.month) / 12);
  const y = parts.year + 4800 - a;
  const m = parts.month + 12 * a - 3;
  return (
    parts.day +
    Math.trunc((153 * m + 2) / 5) +
    365 * y +
    Math.trunc(y / 4) -
    Math.trunc(y / 100) +
    Math.trunc(y / 400) -
    32045
  );
}

function toRateMicro(annualRate: string): bigint {
  const [whole = "0", fraction = ""] = annualRate.split(".");
  return BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) {
    return quotient + BigInt(1);
  }
  return quotient;
}

function fromCents(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const whole = abs / BigInt(100);
  const fraction = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function stripLeadingZeros(value: string): string {
  const stripped = value.replace(/^0+(?=\d)/, "");
  return stripped.length > 0 ? stripped : "0";
}
