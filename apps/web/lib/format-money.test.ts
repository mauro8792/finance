import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  amountToCents,
  barSharePercent,
  currentYearMonth,
  formatArsAmount,
  formatCoveredInstallments,
  formatMoney,
  formatMonthLabel,
  formatPaidAt,
  formatRunway,
  formatUsedPercent,
  isPositiveAmount,
  isUsedPercentOver,
  maxAmount,
  usedPercentBarWidth,
} from "./format-money";

describe("format-money", () => {
  it("formats ARS with Argentine grouping", () => {
    assert.equal(formatArsAmount("1085608.66"), "$ 1.085.608,66");
    assert.equal(formatArsAmount("600000.00"), "$ 600.000,00");
    assert.equal(formatArsAmount("0.00"), "$ 0,00");
    assert.equal(formatArsAmount("-12.50"), "-$ 12,50");
    assert.equal(formatMoney("300000.00", "ARS"), "$ 300.000,00");
    assert.equal(formatMoney("1100.00", "USD"), "USD 1.100,00");
    assert.equal(formatMoney("-25000.00", "ARS"), "-$ 25.000,00");
  });

  it("formats coverage quotas and paidAt without Number math", () => {
    assert.equal(formatCoveredInstallments("4.00"), "4,00");
    assert.equal(formatCoveredInstallments("0.00"), "0,00");
    assert.equal(formatCoveredInstallments("1.82"), "1,82");
    const paidAt = new Date(2026, 7, 15, 12, 0, 0).toISOString();
    assert.equal(formatPaidAt(paidAt), "15 ago 2026");
  });

  it("formats usedPercent and caps the bar at 100 without Number math", () => {
    assert.equal(formatUsedPercent("40.00"), "40%");
    assert.equal(formatUsedPercent("72.50"), "72,5%");
    assert.equal(formatUsedPercent("125.00"), "125%");
    assert.equal(formatUsedPercent(null), "—");
    assert.equal(usedPercentBarWidth("40.00"), "40%");
    assert.equal(usedPercentBarWidth("72.50"), "72.50%");
    assert.equal(usedPercentBarWidth("125.00"), "100%");
    assert.equal(isUsedPercentOver("100.00"), false);
    assert.equal(isUsedPercentOver("125.00"), true);
  });

  it("formats runway without inventing zero or infinity", () => {
    assert.equal(formatRunway("6.00"), "6 meses");
    assert.equal(formatRunway("6.50"), "6,5 meses");
    assert.equal(formatRunway("1.00"), "1 mes");
    assert.equal(formatRunway(null), "Sin datos suficientes");
  });

  it("detects a positive surplus without Number math", () => {
    assert.equal(isPositiveAmount("83919.77"), true);
    assert.equal(isPositiveAmount("0.00"), false);
    assert.equal(isPositiveAmount("-1.00"), false);
  });

  it("scales bar widths from amount strings without Number math", () => {
    assert.equal(amountToCents("10.00"), BigInt(1000));
    assert.equal(maxAmount("2.00", "10.00", "5.00"), "10.00");
    assert.equal(barSharePercent("5.00", "10.00"), "50%");
    assert.equal(barSharePercent("0.00", "10.00"), "0%");
    assert.equal(barSharePercent("1.00", "1000.00"), "1%");
  });

  it("uses the local calendar month", () => {
    const { year, month } = currentYearMonth(new Date(2026, 7, 31, 22, 0, 0));
    assert.equal(year, 2026);
    assert.equal(month, 8);
    assert.equal(formatMonthLabel(2026, 8), "Agosto 2026");
  });
});
