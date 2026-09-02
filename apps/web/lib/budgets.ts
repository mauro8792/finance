import { filterCategoriesForType } from "./quick-add";
import type { BudgetView, Category, Currency } from "./types";

export function categoriesForNewBudget(
  categories: Category[],
  budgets: BudgetView[],
  currency: Currency
): Category[] {
  const used = new Set(
    budgets
      .filter((budget) => budget.currency === currency)
      .map((budget) => budget.category.id)
  );
  return filterCategoriesForType(categories, "EXPENSE").filter(
    (category) => !used.has(category.id)
  );
}

export function budgetFormError(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "BUDGET_DUPLICATE"
  ) {
    return "Ya existe un presupuesto para esa categoría y moneda este mes.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "No pudimos guardar el presupuesto. Probá de nuevo.";
}
