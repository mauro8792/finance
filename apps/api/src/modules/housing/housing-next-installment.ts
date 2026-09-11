/**
 * P1.2.1 — next installment / due date from obligation periods.
 *
 * Rules:
 * - paidAt ≠ installment period
 * - VOIDED payments do not satisfy a period or installment
 * - prepaid ACTIVE payments can share the same paidAt
 * - next due = first calendar period after the max ACTIVE covered period
 * - never max(paidAt) + 1 month
 */

export type HousingPaymentPeriodInput = {
  installmentNumber: number | null;
  periodYear: number | null;
  periodMonth: number | null;
  voidedAt: Date | string | null;
};

export type NextHousingInstallment = {
  installmentNumber: number | null;
  periodYear: number | null;
  periodMonth: number | null;
  /** ISO date at local noon for dueDay clamp, or null if unknown. */
  dueDate: string | null;
  dueDateLabel: string | null;
};

export function isActiveHousingPayment(
  payment: Pick<HousingPaymentPeriodInput, "voidedAt">
): boolean {
  return payment.voidedAt == null;
}

export function computeNextHousingInstallment(
  payments: HousingPaymentPeriodInput[],
  dueDay: number | null
): NextHousingInstallment {
  const active = payments.filter(isActiveHousingPayment);

  const coveredPeriods = active
    .filter(
      (payment) =>
        payment.periodYear != null &&
        payment.periodMonth != null &&
        Number.isInteger(payment.periodYear) &&
        Number.isInteger(payment.periodMonth)
    )
    .map((payment) => ({
      year: payment.periodYear as number,
      month: payment.periodMonth as number,
    }));

  let periodYear: number | null = null;
  let periodMonth: number | null = null;

  if (coveredPeriods.length > 0) {
    let max = coveredPeriods[0]!;
    for (const period of coveredPeriods) {
      if (periodKey(period.year, period.month) > periodKey(max.year, max.month)) {
        max = period;
      }
    }
    const next = addMonth(max.year, max.month);
    periodYear = next.year;
    periodMonth = next.month;
  }

  const numbered = active
    .map((payment) => payment.installmentNumber)
    .filter((value): value is number => value != null && Number.isInteger(value));

  let installmentNumber: number | null = null;
  if (numbered.length > 0) {
    installmentNumber = Math.max(...numbered) + 1;
  } else if (periodYear != null) {
    // Periods known but no installment numbers: leave number null.
    installmentNumber = null;
  }

  // If voided records claimed a higher installment number than any ACTIVE,
  // the obligation installment still pending is max(active)+1 (already),
  // which equals the voided number when voided was exactly next. Good.

  const due = formatDue(periodYear, periodMonth, dueDay);

  return {
    installmentNumber,
    periodYear,
    periodMonth,
    dueDate: due?.iso ?? null,
    dueDateLabel: due?.label ?? null,
  };
}

function periodKey(year: number, month: number): number {
  return year * 12 + month;
}

function addMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

function formatDue(
  year: number | null,
  month: number | null,
  dueDay: number | null
): { iso: string; label: string } | null {
  if (year == null || month == null || dueDay == null) {
    return null;
  }
  const day = clampDayOfMonth(year, month - 1, dueDay);
  const iso = new Date(Date.UTC(year, month - 1, day, 15, 0, 0)).toISOString();
  const label = formatSpanishDayMonthYear(year, month - 1, day);
  return { iso, label };
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(day, 1), lastDay);
}

const MONTH_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function formatSpanishDayMonthYear(
  year: number,
  monthIndex: number,
  day: number
): string {
  return `${day} ${MONTH_SHORT[monthIndex]} ${year}`;
}
