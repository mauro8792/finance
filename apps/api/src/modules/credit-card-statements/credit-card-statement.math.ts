/**
 * Deterministic credit-card statement cycle helpers (UTC calendar).
 * closingDay/dueDay missing days clamp to last day of month.
 */

export function utcNoon(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0, 0));
}

export function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Calendar date with day clamped to last day of month (UTC noon). */
export function dateOnClosingOrDueDay(
  year: number,
  monthIndex0: number,
  dayOfMonth: number
): Date {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error("dayOfMonth must be an integer 1..31");
  }
  const clamped = Math.min(dayOfMonth, daysInUtcMonth(year, monthIndex0));
  return utcNoon(year, monthIndex0, clamped);
}

export function addUtcCalendarDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
      12,
      0,
      0,
      0
    )
  );
}

export type StatementCycle = {
  periodStart: Date;
  periodEnd: Date;
  closingDate: Date;
};

/**
 * Build cycle ending on closingDate for a card closingDay.
 * periodEnd = closingDate (normalized).
 * periodStart = previousClosingDate + 1 day.
 */
export function buildStatementCycle(
  closingDateInput: Date,
  closingDay: number
): StatementCycle {
  const year = closingDateInput.getUTCFullYear();
  const month = closingDateInput.getUTCMonth();
  const closingDate = dateOnClosingOrDueDay(year, month, closingDay);

  const prevMonthAbsolute = month - 1;
  const prevYear = year + Math.floor(prevMonthAbsolute / 12);
  const prevMonth = ((prevMonthAbsolute % 12) + 12) % 12;
  const previousClosing = dateOnClosingOrDueDay(prevYear, prevMonth, closingDay);
  const periodStart = addUtcCalendarDays(previousClosing, 1);

  return {
    periodStart,
    periodEnd: closingDate,
    closingDate,
  };
}

/**
 * First occurrence of dueDay strictly after closingDate.
 * Same month if dueDay date > closingDate; otherwise next month(+).
 */
export function computeDueDate(closingDate: Date, dueDay: number): Date {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("dueDay must be an integer 1..31");
  }

  let year = closingDate.getUTCFullYear();
  let month = closingDate.getUTCMonth();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = dateOnClosingOrDueDay(year, month, dueDay);
    if (candidate.getTime() > closingDate.getTime()) {
      return candidate;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  throw new Error("Unable to compute dueDate after closingDate");
}

/** Inclusive membership: periodStart <= occurredAt <= periodEnd */
export function isOccurredAtInStatementPeriod(
  occurredAt: Date,
  periodStart: Date,
  periodEnd: Date
): boolean {
  const t = occurredAt.getTime();
  return t >= periodStart.getTime() && t <= periodEnd.getTime();
}
