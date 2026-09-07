import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStatementCycle,
  computeDueDate,
  dateOnClosingOrDueDay,
} from "./credit-card-statement.math.js";

test("P0.9 A — closingDay=20 builds Aug21→Sep20 cycle", () => {
  const cycle = buildStatementCycle(new Date("2026-09-20T12:00:00.000Z"), 20);
  assert.equal(cycle.closingDate.toISOString().slice(0, 10), "2026-09-20");
  assert.equal(cycle.periodEnd.toISOString().slice(0, 10), "2026-09-20");
  assert.equal(cycle.periodStart.toISOString().slice(0, 10), "2026-08-21");
});

test("P0.9 B — closingDay=31 February clamps to last day", () => {
  const feb = dateOnClosingOrDueDay(2026, 1, 31);
  assert.equal(feb.toISOString().slice(0, 10), "2026-02-28");
  const cycle = buildStatementCycle(feb, 31);
  assert.equal(cycle.closingDate.toISOString().slice(0, 10), "2026-02-28");
  assert.equal(cycle.periodStart.toISOString().slice(0, 10), "2026-02-01");
});

test("P0.9 C — dueDay later same month", () => {
  const closing = new Date("2026-09-10T12:00:00.000Z");
  const due = computeDueDate(closing, 20);
  assert.equal(due.toISOString().slice(0, 10), "2026-09-20");
});

test("P0.9 D — dueDay next month", () => {
  const closing = new Date("2026-09-20T12:00:00.000Z");
  const due = computeDueDate(closing, 10);
  assert.equal(due.toISOString().slice(0, 10), "2026-10-10");
});

test("P0.9 E — dueDay 31 in short month clamps", () => {
  const closing = new Date("2026-01-20T12:00:00.000Z");
  const due = computeDueDate(closing, 31);
  assert.equal(due.toISOString().slice(0, 10), "2026-01-31");
  const closingEnd = new Date("2026-01-31T12:00:00.000Z");
  const dueFeb = computeDueDate(closingEnd, 31);
  assert.equal(dueFeb.toISOString().slice(0, 10), "2026-02-28");
});
