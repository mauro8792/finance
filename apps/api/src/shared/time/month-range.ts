const OFFSET_PATTERN = /^GMT([+-])(\d{2}):(\d{2})$/;

function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = tzName?.match(OFFSET_PATTERN);

  if (!match) {
    throw new RangeError(`Zona horaria no soportada: ${timeZone}`);
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes) * 60_000;
}

export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);
  offset = timeZoneOffsetMs(result, timeZone);
  result = new Date(utcGuess - offset);
  return result;
}

export const CALENDAR_MONTH_FILTER_FROM_YEAR = 2020;
export const CALENDAR_MONTH_FILTER_TO_YEAR = 2030;

export function monthUtcRange(
  year: number,
  month: number,
  timeZone: string
): { start: Date; endExclusive: Date } {
  const start = zonedLocalToUtc(year, month, 1, 0, 0, 0, timeZone);
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endExclusive = zonedLocalToUtc(endYear, endMonth, 1, 0, 0, 0, timeZone);
  return { start, endExclusive };
}

export function calendarMonthRangesAcrossYears(
  month: number,
  timeZone: string,
  fromYear = CALENDAR_MONTH_FILTER_FROM_YEAR,
  toYear = CALENDAR_MONTH_FILTER_TO_YEAR
): Array<{ start: Date; endExclusive: Date }> {
  const ranges: Array<{ start: Date; endExclusive: Date }> = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    ranges.push(monthUtcRange(year, month, timeZone));
  }
  return ranges;
}

export function zonedYearMonth(
  at: Date,
  timeZone: string
): { year: number; month: number } {
  const { year, month } = zonedDateParts(at, timeZone);
  return { year, month };
}

export function zonedDateParts(
  at: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new RangeError(`Zona horaria no soportada: ${timeZone}`);
  }

  return { year, month, day };
}

export function daysInZonedMonth(
  year: number,
  month: number,
  timeZone: string
): number {
  const { start, endExclusive } = monthUtcRange(year, month, timeZone);
  return Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);
}
