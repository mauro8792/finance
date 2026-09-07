import { fromCents, toCents } from "../transactions/transaction-balance.js";

/** Product max for P0.7 (MVP2 card installments). */
export const MAX_CREDIT_CARD_INSTALLMENTS = 60;

/**
 * Split totalAmount into `count` installment amounts in minor units.
 * First N-1 get floor(total/count); last gets floor + remainder.
 * Guarantees SUM(amounts) === totalAmount exactly.
 */
export function splitInstallmentAmounts(
  totalAmount: string,
  count: number
): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("installmentsCount must be a positive integer");
  }
  const totalCents = toCents(totalAmount);
  if (totalCents <= 0n) {
    throw new Error("totalAmount must be positive");
  }
  const base = totalCents / BigInt(count);
  const remainder = totalCents % BigInt(count);
  const amounts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const cents = index === count - 1 ? base + remainder : base;
    amounts.push(fromCents(cents));
  }
  return amounts;
}

/**
 * Add calendar months in UTC, clamping day to last day of target month.
 * Example: 2026-01-31 + 1 month → 2026-02-28.
 *
 * Always apply from the ORIGINAL purchaseDate + (installmentNumber - 1).
 * Never chain from the previous installment's scheduledFor (that would turn
 * 2024-01-31 → 02-29 → 03-29 instead of 03-31).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();

  const absoluteMonth = month + months;
  const targetYear = year + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms)
  );
}

/** scheduledFor[i] = purchasedAt + i calendar months (anchored, not chained). */
export function buildInstallmentSchedule(
  purchasedAt: Date,
  installmentsCount: number
): Date[] {
  const dates: Date[] = [];
  for (let index = 0; index < installmentsCount; index += 1) {
    dates.push(addCalendarMonths(purchasedAt, index));
  }
  return dates;
}
