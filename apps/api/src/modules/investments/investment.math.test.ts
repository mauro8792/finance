import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateExpectedReturn,
  calendarDaysBetween,
} from "./investment.math.js";

test("calendarDaysBetween uses business calendar dates, not clock duration", () => {
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T15:00:00.000Z"),
      new Date("2026-09-08T15:00:00.000Z")
    ),
    7
  );
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T15:00:00.000Z"),
      new Date("2026-09-02T15:00:00.000Z")
    ),
    1
  );
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T15:00:00.000Z"),
      new Date("2026-09-01T15:00:00.000Z")
    ),
    0
  );
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T03:00:00.000Z"),
      new Date("2026-09-08T14:00:00.000Z")
    ),
    7
  );
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T15:00:00.000Z"),
      new Date("2026-09-08T03:00:00.000Z")
    ),
    7
  );
  assert.equal(
    calendarDaysBetween(
      new Date("2026-09-01T03:00:00.000Z"),
      new Date("2026-09-09T02:00:00.000Z")
    ),
    7
  );
});

test("calculateExpectedReturn uses fraction rate and ROUND_HALF_UP", () => {
  assert.equal(calculateExpectedReturn("100000.00", "0.300000", 7), "575.34");
  assert.equal(calculateExpectedReturn("100000.00", "0.300000", 3), "246.58");
  assert.equal(calculateExpectedReturn("100000.00", "0.300000", 0), "0.00");
  assert.equal(calculateExpectedReturn("100000.00", "0.000000", 7), "0.00");
});
