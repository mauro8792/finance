import { AppError } from "../../shared/errors/app-error.js";
import {
  daysInZonedMonth,
  monthUtcRange,
  zonedDateParts,
} from "../../shared/time/month-range.js";
import type { CategoryRepository } from "../categories/category.types.js";
import { divideRoundHalfUp } from "../currency-exchanges/currency-exchange.math.js";
import {
  activeReimbursementsOf,
  calculateNetExpense,
  sumAmounts,
} from "../transactions/net-expense.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import {
  EXPENSE_CATEGORY_TYPES,
  type TransactionRepository,
} from "../transactions/transaction.types.js";
import type { UserRepository } from "../users/user.types.js";
import type {
  Budget,
  BudgetRepository,
  CreateBudgetInput,
} from "./budget.types.js";

export type BudgetProgressResult = {
  consumption: string;
  usedPercent: string | null;
};

export type BudgetAvailableResult = {
  consumption: string;
  available: string;
};

export type SpendingPaceResult = {
  elapsedDays: number;
  totalDays: number;
  monthProgressPercent: string;
  budgetProgressPercent: string | null;
  aboveExpectedPace: boolean;
};

export type BudgetView = {
  id: string;
  category: { id: string; name: string };
  currency: Budget["currency"];
  amount: string;
  year: number;
  month: number;
  consumption: string;
  available: string;
  usedPercent: string | null;
  spendingPace: {
    elapsedDays: number;
    totalDays: number;
    monthProgress: string;
    budgetProgress: string | null;
    aboveExpectedPace: boolean;
  };
};

export type CreateBudgetRequest = Omit<CreateBudgetInput, "userId">;

export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly transactions: TransactionRepository,
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository
  ) {}

  async create(userId: string, input: CreateBudgetRequest): Promise<BudgetView> {
    const amount = parsePositiveAmount(input.amount);
    const year = requireYear(input.year);
    const month = requireMonth(input.month);
    await this.requireBudgetCategory(userId, input.categoryId);

    const budget = await this.budgets.create({
      userId,
      categoryId: input.categoryId,
      currency: input.currency,
      amount,
      year,
      month,
    });

    return this.viewOf(budget);
  }

  async updateAmount(userId: string, id: string, amount: string): Promise<BudgetView> {
    const current = await this.requireOwned(userId, id);
    const parsed = parsePositiveAmount(amount);
    const budget = await this.budgets.update(current.id, { amount: parsed });
    return this.viewOf(budget);
  }

  async listByPeriod(userId: string, year: number, month: number): Promise<BudgetView[]> {
    requireYear(year);
    requireMonth(month);
    const budgets = await this.budgets.findByUserPeriod(userId, year, month);
    const views = await Promise.all(budgets.map((budget) => this.viewOf(budget)));
    return views.sort(compareBudgetViews);
  }

  async getProgress(budgetId: string): Promise<BudgetProgressResult> {
    const snapshot = await this.snapshot(budgetId);
    return {
      consumption: snapshot.consumption,
      usedPercent: snapshot.usedPercent,
    };
  }

  async getAvailable(budgetId: string): Promise<BudgetAvailableResult> {
    const snapshot = await this.snapshot(budgetId);
    return {
      consumption: snapshot.consumption,
      available: snapshot.available,
    };
  }

  async getSpendingPace(
    budgetId: string,
    asOf: Date = new Date()
  ): Promise<SpendingPaceResult> {
    const snapshot = await this.snapshot(budgetId, asOf);
    return {
      elapsedDays: snapshot.elapsedDays,
      totalDays: snapshot.totalDays,
      monthProgressPercent: snapshot.monthProgressPercent,
      budgetProgressPercent: snapshot.budgetProgressPercent,
      aboveExpectedPace: snapshot.aboveExpectedPace,
    };
  }

  private async viewOf(budget: Budget, asOf: Date = new Date()): Promise<BudgetView> {
    const category = await this.categories.findById(budget.categoryId);
    if (!category) {
      throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
    }

    const metrics = await this.metricsOf(budget, asOf);
    return {
      id: budget.id,
      category: { id: category.id, name: category.name },
      currency: budget.currency,
      amount: budget.amount,
      year: budget.year,
      month: budget.month,
      consumption: metrics.consumption,
      available: metrics.available,
      usedPercent: metrics.usedPercent,
      spendingPace: {
        elapsedDays: metrics.elapsedDays,
        totalDays: metrics.totalDays,
        monthProgress: metrics.monthProgressPercent,
        budgetProgress: metrics.budgetProgressPercent,
        aboveExpectedPace: metrics.aboveExpectedPace,
      },
    };
  }

  private async snapshot(budgetId: string, asOf: Date = new Date()) {
    const budget = await this.budgets.findById(budgetId);
    if (!budget) {
      throw new AppError("NOT_FOUND", "El presupuesto no existe.", 404);
    }
    return this.metricsOf(budget, asOf);
  }

  private async metricsOf(budget: Budget, asOf: Date) {
    const user = await this.users.findById(budget.userId);
    if (!user) {
      throw new AppError("USER_NOT_FOUND", "El usuario no existe.", 404);
    }

    const consumption = await this.consumptionOf(budget, user.timezone);
    const amountCents = toCents(budget.amount);
    const consumptionCents = toCents(consumption);
    const available = fromCents(amountCents - consumptionCents);
    const usedPercent =
      amountCents === 0n ? null : ratioToPercent(consumptionCents, amountCents);

    const totalDays = daysInZonedMonth(budget.year, budget.month, user.timezone);
    const elapsedDays = elapsedDaysOf(budget, asOf, user.timezone, totalDays);
    const monthProgressPercent = ratioToPercent(
      BigInt(elapsedDays) * 100n,
      BigInt(totalDays) * 100n
    );
    const budgetProgressPercent =
      amountCents === 0n ? null : ratioToPercent(consumptionCents, amountCents);
    const aboveExpectedPace =
      amountCents === 0n
        ? consumptionCents > 0n
        : consumptionCents * BigInt(totalDays) >
          amountCents * BigInt(elapsedDays);

    return {
      consumption,
      available,
      usedPercent,
      elapsedDays,
      totalDays,
      monthProgressPercent,
      budgetProgressPercent,
      aboveExpectedPace,
    };
  }

  private async consumptionOf(budget: Budget, timeZone: string): Promise<string> {
    const range = monthUtcRange(budget.year, budget.month, timeZone);
    const expenses = await this.transactions.findByUserId(budget.userId, {
      type: "EXPENSE",
      status: "ACTIVE",
      categoryId: budget.categoryId,
      currency: budget.currency,
      occurredAtGte: range.start,
      occurredAtLt: range.endExclusive,
    });

    if (expenses.length === 0) {
      return "0.00";
    }

    const reimbursements = await this.transactions.findByUserId(budget.userId, {
      type: "REIMBURSEMENT",
      status: "ACTIVE",
    });

    return sumAmounts(
      expenses.map((expense) =>
        calculateNetExpense(
          expense.amount,
          activeReimbursementsOf(expense, reimbursements).map((item) => item.amount)
        )
      )
    );
  }

  private async requireOwned(userId: string, id: string): Promise<Budget> {
    const budget = await this.budgets.findById(id);
    if (!budget || budget.userId !== userId) {
      throw new AppError("NOT_FOUND", "El presupuesto no existe.", 404);
    }
    return budget;
  }

  private async requireBudgetCategory(userId: string, categoryId: string) {
    const category = await this.categories.findById(categoryId);

    if (!category || category.userId !== userId) {
      throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
    }

    if (!category.isActive) {
      throw new AppError(
        "CATEGORY_INACTIVE",
        "No se puede crear un presupuesto con una categoría inactiva.",
        400
      );
    }

    if (!(EXPENSE_CATEGORY_TYPES as readonly string[]).includes(category.type)) {
      throw new AppError(
        "CATEGORY_TYPE_INCOMPATIBLE",
        "Un presupuesto de gasto sólo puede usar categorías EXPENSE o BOTH.",
        400
      );
    }

    return category;
  }
}

function requireYear(year: number): number {
  if (!Number.isInteger(year) || year < 2000) {
    throw new AppError("VALIDATION_ERROR", "year debe ser un entero mayor o igual a 2000.", 400);
  }
  return year;
}

function requireMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("VALIDATION_ERROR", "month debe estar entre 1 y 12.", 400);
  }
  return month;
}

function elapsedDaysOf(
  budget: Budget,
  asOf: Date,
  timeZone: string,
  totalDays: number
): number {
  const parts = zonedDateParts(asOf, timeZone);
  const asOfKey = parts.year * 12 + parts.month;
  const budgetKey = budget.year * 12 + budget.month;

  if (asOfKey < budgetKey) {
    return 0;
  }

  if (asOfKey > budgetKey) {
    return totalDays;
  }

  return parts.day;
}

function ratioToPercent(numerator: bigint, denominator: bigint): string {
  return fromCents(divideRoundHalfUp(numerator * 10000n, denominator));
}

function compareBudgetViews(left: BudgetView, right: BudgetView): number {
  const byName = left.category.name.localeCompare(right.category.name, "es");
  if (byName !== 0) {
    return byName;
  }
  const byCurrency = left.currency.localeCompare(right.currency);
  if (byCurrency !== 0) {
    return byCurrency;
  }
  return left.id.localeCompare(right.id);
}
