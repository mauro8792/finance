import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  feeStatusLabel,
  feeStatusTone,
  formatExpectedAmount,
  nextClosingDate,
  nextDueDate,
  occurrenceKeyFor,
} from "./credit-cards";

describe("credit card helpers", () => {
  it("maps fee statuses to Spanish labels", () => {
    assert.equal(feeStatusLabel("HAS_FEE"), "Con comisión");
    assert.equal(feeStatusLabel("WAIVED"), "Bonificada");
    assert.equal(feeStatusLabel("POTENTIALLY_WAIVED"), "Bonificación condicional");
    assert.equal(feeStatusLabel("UNKNOWN"), "Sin configurar");
  });

  it("maps fee statuses to badge tones", () => {
    assert.equal(feeStatusTone("WAIVED"), "positive");
    assert.equal(feeStatusTone("POTENTIALLY_WAIVED"), "warning");
    assert.equal(feeStatusTone("HAS_FEE"), "neutral");
    assert.equal(feeStatusTone("UNKNOWN"), "muted");
  });

  it("formats expected amount or Variable", () => {
    assert.equal(formatExpectedAmount("1500.00", "ARS"), "$ 1.500,00");
    assert.equal(formatExpectedAmount(null, "USD"), "Variable");
  });

  it("builds occurrence keys as YYYY-MM", () => {
    assert.equal(occurrenceKeyFor(new Date(2026, 8, 10)), "2026-09");
  });

  it("computes next closing date in current month when still ahead", () => {
    const from = new Date(Date.UTC(2026, 8, 10, 12, 0, 0, 0));
    const next = nextClosingDate(20, from);
    assert.equal(next.getUTCFullYear(), 2026);
    assert.equal(next.getUTCMonth(), 8);
    assert.equal(next.getUTCDate(), 20);
  });

  it("computes next closing date in following month when past this cycle", () => {
    const from = new Date(Date.UTC(2026, 8, 25, 12, 0, 0, 0));
    const next = nextClosingDate(20, from);
    assert.equal(next.getUTCFullYear(), 2026);
    assert.equal(next.getUTCMonth(), 9);
    assert.equal(next.getUTCDate(), 20);
  });

  it("clamps closing day to end of month", () => {
    const from = new Date(Date.UTC(2026, 0, 5, 12, 0, 0, 0));
    const next = nextClosingDate(31, from);
    assert.equal(next.getUTCMonth(), 0);
    assert.equal(next.getUTCDate(), 31);
    const feb = nextClosingDate(31, new Date(Date.UTC(2026, 1, 5, 12, 0, 0, 0)));
    assert.equal(feb.getUTCMonth(), 1);
    assert.equal(feb.getUTCDate(), 28);
  });

  it("computes due date strictly after closing", () => {
    const closing = new Date(Date.UTC(2026, 8, 20, 12, 0, 0, 0));
    const due = nextDueDate(10, closing);
    assert.equal(due.getUTCMonth(), 9);
    assert.equal(due.getUTCDate(), 10);
  });
});
