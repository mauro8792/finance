import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarMonthRangesAcrossYears,
  daysInZonedMonth,
  monthUtcRange,
  zonedDateParts,
  zonedYearMonth,
} from "./month-range.js";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

test("calendarMonthRangesAcrossYears covers June of each configured year", () => {
  const ranges = calendarMonthRangesAcrossYears(6, BUENOS_AIRES, 2026, 2026);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]?.start.toISOString(), "2026-06-01T03:00:00.000Z");
  assert.equal(ranges[0]?.endExclusive.toISOString(), "2026-07-01T03:00:00.000Z");
});

test("monthUtcRange uses the user timezone, not UTC midnight", () => {
  const { start, endExclusive } = monthUtcRange(2026, 8, BUENOS_AIRES);

  assert.equal(start.toISOString(), "2026-08-01T03:00:00.000Z");
  assert.equal(endExclusive.toISOString(), "2026-09-01T03:00:00.000Z");
});

test("monthUtcRange spans December into the next year", () => {
  const { start, endExclusive } = monthUtcRange(2026, 12, BUENOS_AIRES);

  assert.equal(start.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(endExclusive.toISOString(), "2027-01-01T03:00:00.000Z");
});

test("zonedYearMonth maps UTC instants to the user calendar month", () => {
  assert.deepEqual(
    zonedYearMonth(new Date("2026-08-01T03:00:00.000Z"), BUENOS_AIRES),
    { year: 2026, month: 8 }
  );
  assert.deepEqual(
    zonedYearMonth(new Date("2026-08-01T02:00:00.000Z"), BUENOS_AIRES),
    { year: 2026, month: 7 }
  );
});

test("zonedDateParts uses the Argentina calendar day, not UTC", () => {
  assert.deepEqual(
    zonedDateParts(new Date("2026-09-01T02:00:00.000Z"), BUENOS_AIRES),
    { year: 2026, month: 8, day: 31 }
  );
  assert.deepEqual(
    zonedDateParts(new Date("2026-09-01T04:00:00.000Z"), BUENOS_AIRES),
    { year: 2026, month: 9, day: 1 }
  );
});

test("daysInZonedMonth counts calendar days of the user month", () => {
  assert.equal(daysInZonedMonth(2026, 8, BUENOS_AIRES), 31);
  assert.equal(daysInZonedMonth(2026, 2, BUENOS_AIRES), 28);
});
