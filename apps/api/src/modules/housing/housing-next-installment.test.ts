import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeNextHousingInstallment } from "./housing-next-installment.js";

describe("computeNextHousingInstallment", () => {
  it("uses prepaid periods with same paidAt and skips VOIDED 27 → Jan 2027", () => {
    const next = computeNextHousingInstallment(
      [
        {
          installmentNumber: 24,
          periodYear: 2026,
          periodMonth: 10,
          voidedAt: null,
        },
        {
          installmentNumber: 25,
          periodYear: 2026,
          periodMonth: 11,
          voidedAt: null,
        },
        {
          installmentNumber: 26,
          periodYear: 2026,
          periodMonth: 12,
          voidedAt: null,
        },
        {
          installmentNumber: 27,
          periodYear: 2027,
          periodMonth: 1,
          voidedAt: new Date("2026-09-11T18:01:18.632Z"),
        },
      ],
      10
    );

    assert.equal(next.installmentNumber, 27);
    assert.equal(next.periodYear, 2027);
    assert.equal(next.periodMonth, 1);
    assert.equal(next.dueDateLabel, "10 ene 2027");
  });

  it("voided payment does not satisfy its period", () => {
    const next = computeNextHousingInstallment(
      [
        {
          installmentNumber: 24,
          periodYear: 2026,
          periodMonth: 10,
          voidedAt: null,
        },
        {
          installmentNumber: 25,
          periodYear: 2026,
          periodMonth: 11,
          voidedAt: new Date("2026-09-11T00:00:00.000Z"),
        },
      ],
      10
    );
    assert.equal(next.periodYear, 2026);
    assert.equal(next.periodMonth, 11);
    assert.equal(next.installmentNumber, 25);
  });

  it("period metadata independent from paidAt (no max paidAt + 1 month)", () => {
    const next = computeNextHousingInstallment(
      [
        {
          installmentNumber: 1,
          periodYear: 2026,
          periodMonth: 12,
          voidedAt: null,
        },
      ],
      10
    );
    assert.equal(next.periodYear, 2027);
    assert.equal(next.periodMonth, 1);
    assert.equal(next.dueDateLabel, "10 ene 2027");
  });

  it("returns null due when periods are missing", () => {
    const next = computeNextHousingInstallment(
      [
        {
          installmentNumber: 24,
          periodYear: null,
          periodMonth: null,
          voidedAt: null,
        },
      ],
      10
    );
    assert.equal(next.periodYear, null);
    assert.equal(next.periodMonth, null);
    assert.equal(next.installmentNumber, 25);
    assert.equal(next.dueDate, null);
  });
});
