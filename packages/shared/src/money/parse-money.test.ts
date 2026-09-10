import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidAmount,
  normalizeMoneyInput,
  parseMoney,
  toApiAmount,
} from "./parse-money.js";

describe("P0.14 parseMoney es-AR", () => {
  it("parses required human cases to canonical", () => {
    const cases: Array<[string, string]> = [
      ["95.784,34", "95784.34"],
      ["95,784.34", "95784.34"],
      ["95784,34", "95784.34"],
      ["95784.34", "95784.34"],
      ["$ 95.784,34", "95784.34"],
      ["ARS 95.784,34", "95784.34"],
      ["USD 12.50", "12.50"],
      ["$12,5", "12.50"],
    ];
    for (const [input, expected] of cases) {
      const result = parseMoney(input);
      assert.equal(result.ok, true, input);
      if (result.ok) {
        assert.equal(result.canonical, expected, input);
      }
    }
  });

  it("resolves ambiguous 1.000 / 1,000 as thousands", () => {
    assert.equal(normalizeMoneyInput("1.000"), "1000");
    assert.equal(normalizeMoneyInput("1,000"), "1000");
    assert.equal(toApiAmount("1.000"), "1000.00");
    assert.equal(toApiAmount("1,000"), "1000.00");
    assert.equal(isValidAmount("1.000"), true);
    assert.equal(isValidAmount("1,000"), true);
  });

  it("treats 1–2 digit sole separators as decimals", () => {
    assert.equal(toApiAmount("1,00"), "1.00");
    assert.equal(toApiAmount("1.00"), "1.00");
    assert.equal(toApiAmount("12,5"), "12.50");
    assert.equal(toApiAmount("12.5"), "12.50");
  });

  it("parses multi-thousand es-AR forms", () => {
    assert.equal(toApiAmount("25.400.000"), "25400000.00");
    assert.equal(toApiAmount("25.400.000,00"), "25400000.00");
    assert.equal(toApiAmount("10.123"), "10123.00");
  });

  it("rejects invalid / zero / negative", () => {
    assert.equal(parseMoney("").ok, false);
    assert.equal(parseMoney("0").ok, false);
    assert.equal(parseMoney("0,00").ok, false);
    assert.equal(parseMoney("-1").ok, false);
    assert.equal(parseMoney("abc").ok, false);
    assert.equal(parseMoney("12.3456").ok, false);
    assert.equal(parseMoney("12,3456").ok, false);
  });
});
