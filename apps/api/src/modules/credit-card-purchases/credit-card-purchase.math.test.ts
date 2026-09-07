import assert from "node:assert/strict";
import { test } from "node:test";
import { toCents } from "../transactions/transaction-balance.js";
import {
  addCalendarMonths,
  buildInstallmentSchedule,
  MAX_CREDIT_CARD_INSTALLMENTS,
  splitInstallmentAmounts,
} from "./credit-card-purchase.math.js";

test("splitInstallmentAmounts: 100/3 distributes remainder on last", () => {
  const amounts = splitInstallmentAmounts("100.00", 3);
  assert.deepEqual(amounts, ["33.33", "33.33", "33.34"]);
  const sum = amounts.reduce((acc, value) => acc + toCents(value), 0n);
  assert.equal(sum, toCents("100.00"));
});

test("splitInstallmentAmounts: 600000/6 exact", () => {
  const amounts = splitInstallmentAmounts("600000.00", 6);
  assert.equal(amounts.length, 6);
  assert.ok(amounts.every((value) => value === "100000.00"));
  const sum = amounts.reduce((acc, value) => acc + toCents(value), 0n);
  assert.equal(sum, toCents("600000.00"));
});

test("splitInstallmentAmounts: USD 10/3", () => {
  const amounts = splitInstallmentAmounts("10.00", 3);
  assert.deepEqual(amounts, ["3.33", "3.33", "3.34"]);
});

test("MAX_CREDIT_CARD_INSTALLMENTS product cap is 60", () => {
  assert.equal(MAX_CREDIT_CARD_INSTALLMENTS, 60);
});

test("addCalendarMonths clamps end-of-month and leap years", () => {
  const jan31 = new Date("2024-01-31T12:00:00.000Z");
  assert.equal(
    addCalendarMonths(jan31, 1).toISOString().slice(0, 10),
    "2024-02-29"
  );
  assert.equal(
    addCalendarMonths(jan31, 2).toISOString().slice(0, 10),
    "2024-03-31"
  );

  const jan31NonLeap = new Date("2025-01-31T12:00:00.000Z");
  assert.equal(
    addCalendarMonths(jan31NonLeap, 1).toISOString().slice(0, 10),
    "2025-02-28"
  );

  const nov7 = new Date("2026-11-07T12:00:00.000Z");
  assert.equal(
    addCalendarMonths(nov7, 2).toISOString().slice(0, 10),
    "2027-01-07"
  );
});

test("buildInstallmentSchedule starts at purchaseDate", () => {
  const purchase = new Date("2026-09-07T12:00:00.000Z");
  const schedule = buildInstallmentSchedule(purchase, 3);
  assert.deepEqual(
    schedule.map((date) => date.toISOString().slice(0, 10)),
    ["2026-09-07", "2026-10-07", "2026-11-07"]
  );
});

/**
 * P0.7 invariant: each scheduledFor = purchaseDate ORIGINAL + (n-1) months.
 * Must NOT chain from previous installment (would yield 2024-03-29 after Feb 29).
 */
test("schedule anchored to purchaseDate — leap year Jan 31 (not chained)", () => {
  const purchaseDate = new Date("2024-01-31T12:00:00.000Z");
  const schedule = buildInstallmentSchedule(purchaseDate, 4).map((date) =>
    date.toISOString().slice(0, 10)
  );
  assert.deepEqual(schedule, [
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
    "2024-04-30",
  ]);
  assert.notEqual(schedule[2], "2024-03-29");
});

test("schedule anchored to purchaseDate — non-leap Jan 31", () => {
  const purchaseDate = new Date("2025-01-31T12:00:00.000Z");
  const schedule = buildInstallmentSchedule(purchaseDate, 4).map((date) =>
    date.toISOString().slice(0, 10)
  );
  assert.deepEqual(schedule, [
    "2025-01-31",
    "2025-02-28",
    "2025-03-31",
    "2025-04-30",
  ]);
});
