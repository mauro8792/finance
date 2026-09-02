import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  filterActiveAccounts,
  filterCategoriesForType,
  isValidAmount,
  localDateTimeToIso,
  normalizeAmountInput,
  toApiAmount,
} from "./quick-add";
import type { Account, Category } from "./types";

const accounts: Account[] = [
  { id: "a1", name: "Efectivo", currency: "ARS", isActive: true },
  { id: "a2", name: "Vieja", currency: "USD", isActive: false },
];

const categories: Category[] = [
  { id: "c1", name: "Comida", type: "EXPENSE", isActive: true },
  { id: "c2", name: "Sueldo", type: "INCOME", isActive: true },
  { id: "c3", name: "Mix", type: "BOTH", isActive: true },
  { id: "c4", name: "Inactiva", type: "EXPENSE", isActive: false },
];

describe("quick-add helpers", () => {
  it("normalizes comma decimals and rejects invalid amounts", () => {
    assert.equal(normalizeAmountInput(" 12,5 "), "12.5");
    assert.equal(isValidAmount("12,50"), true);
    assert.equal(isValidAmount("0"), false);
    assert.equal(isValidAmount("-1"), false);
    assert.equal(isValidAmount("10.123"), false);
    assert.equal(toApiAmount("12,5"), "12.50");
  });

  it("filters active accounts and categories by movement kind", () => {
    assert.deepEqual(
      filterActiveAccounts(accounts).map((item) => item.id),
      ["a1"]
    );
    assert.deepEqual(
      filterCategoriesForType(categories, "EXPENSE").map((item) => item.id),
      ["c1", "c3"]
    );
    assert.deepEqual(
      filterCategoriesForType(categories, "INCOME").map((item) => item.id),
      ["c2", "c3"]
    );
  });

  it("converts local datetime input without treating it as UTC", () => {
    const iso = localDateTimeToIso("2026-08-31T18:30");
    const parsed = new Date(iso);
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 7);
    assert.equal(parsed.getDate(), 31);
    assert.equal(parsed.getHours(), 18);
    assert.equal(parsed.getMinutes(), 30);
  });
});
