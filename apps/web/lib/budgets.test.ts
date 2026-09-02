import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ApiClientError } from "./api";
import { budgetFormError, categoriesForNewBudget } from "./budgets";
import type { BudgetView, Category } from "./types";

const categories: Category[] = [
  { id: "comida", name: "Comida", type: "EXPENSE", isActive: true },
  { id: "nafta", name: "Nafta", type: "EXPENSE", isActive: true },
  { id: "sueldo", name: "Sueldo", type: "INCOME", isActive: true },
  { id: "vieja", name: "Vieja", type: "EXPENSE", isActive: false },
];

function budget(categoryId: string, currency: "ARS" | "USD" = "ARS"): BudgetView {
  return {
    id: `b-${categoryId}-${currency}`,
    category: { id: categoryId, name: categoryId },
    currency,
    amount: "100.00",
    year: 2026,
    month: 8,
    consumption: "0.00",
    available: "100.00",
    usedPercent: "0.00",
    spendingPace: {
      elapsedDays: 10,
      totalDays: 31,
      monthProgress: "32.26",
      budgetProgress: "0.00",
      aboveExpectedPace: false,
    },
  };
}

describe("budgets helpers", () => {
  it("offers only active EXPENSE/BOTH categories not already budgeted in that currency", () => {
    const options = categoriesForNewBudget(categories, [budget("comida")], "ARS");
    assert.deepEqual(
      options.map((item) => item.id),
      ["nafta"]
    );
  });

  it("keeps a category if it is only budgeted in the other currency", () => {
    const options = categoriesForNewBudget(categories, [budget("comida", "USD")], "ARS");
    assert.deepEqual(
      options.map((item) => item.id),
      ["comida", "nafta"]
    );
  });

  it("maps BUDGET_DUPLICATE to a specific user copy", () => {
    assert.equal(
      budgetFormError(new ApiClientError(409, "BUDGET_DUPLICATE", "dup")),
      "Ya existe un presupuesto para esa categoría y moneda este mes."
    );
  });
});
