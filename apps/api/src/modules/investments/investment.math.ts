import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { divideRoundHalfUp } from "../currency-exchanges/currency-exchange.math.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import { zonedDateParts } from "../../shared/time/month-range.js";

const RATE_MICRO = 1_000_000n;
const YEAR_DAYS = 365n;

export function calendarDaysBetween(
  startDate: Date,
  maturityDate: Date,
  timeZone: string = DEFAULT_USER_TIMEZONE
): number {
  const start = zonedDateParts(startDate, timeZone);
  const maturity = zonedDateParts(maturityDate, timeZone);
  return calendarDayNumber(maturity) - calendarDayNumber(start);
}

export function calculateExpectedReturn(
  principal: string,
  annualRate: string,
  days: number
): string {
  if (days === 0) {
    return "0.00";
  }

  const numerator = toCents(principal) * toRateMicro(annualRate) * BigInt(days);
  const denominator = RATE_MICRO * YEAR_DAYS;
  return fromCents(divideRoundHalfUp(numerator, denominator));
}

function calendarDayNumber(parts: {
  year: number;
  month: number;
  day: number;
}): number {
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
