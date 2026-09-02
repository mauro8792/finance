import { AppError } from "../../shared/errors/app-error.js";
import { monthUtcRange, zonedYearMonth } from "../../shared/time/month-range.js";
import type { AccountRepository } from "../accounts/account.types.js";
import { divideRoundHalfUp } from "../currency-exchanges/currency-exchange.math.js";
import {
  activeReimbursementsOf,
  calculateNetExpense,
  sumAmounts,
} from "../transactions/net-expense.js";
import { computeBalance, fromCents, toCents } from "../transactions/transaction-balance.js";
import type {
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import { RUNWAY_ACCOUNT_TYPES, type FinancialSummary } from "./financial.types.js";

const ARS = "ARS" as const;
const MAX_VALID_MONTHS = 3;

export class FinancialService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository
  ) {}

  async getMonthlyGrossExpenses(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string> {
    const expenses = await this.activeArsExpensesInMonth(userId, year, month, timeZone);
    return sumAmounts(expenses.map((item) => item.amount));
  }

  async getMonthlyNetExpenses(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string> {
    const expenses = await this.activeArsExpensesInMonth(userId, year, month, timeZone);
    if (expenses.length === 0) {
      return "0.00";
    }

    const reimbursements = await this.transactions.findByUserId(userId, {
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

  async getMonthlyOperatingIncome(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string> {
    const range = resolveMonthRange(year, month, timeZone);
    const incomes = await this.transactions.findByUserId(userId, {
      type: "INCOME",
      status: "ACTIVE",
      currency: ARS,
      occurredAtGte: range.start,
      occurredAtLt: range.endExclusive,
    });

    return sumAmounts(
      incomes.filter(isOperatingIncome).map((item) => item.amount)
    );
  }

  async getMonthlyFundConsumption(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string> {
    const { consumption } = await this.monthlyOperatingResult(
      userId,
      year,
      month,
      timeZone
    );
    return consumption;
  }

  async getTotalAvailableARS(userId: string): Promise<string> {
    const accounts = await this.accounts.findByUserId(userId);
    const eligible = accounts.filter(
      (account) =>
        account.currency === ARS &&
        account.isActive &&
        (RUNWAY_ACCOUNT_TYPES as readonly string[]).includes(account.type)
    );

    let cents = 0n;
    for (const account of eligible) {
      const movements = await this.transactions.findByUserId(userId, {
        accountId: account.id,
        status: "ACTIVE",
      });
      cents += toCents(computeBalance(account.initialBalance, movements));
    }

    return fromCents(cents);
  }

  async calculateRunway(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string | null> {
    const average = await this.averageMonthlyFundConsumption(
      userId,
      year,
      month,
      timeZone
    );
    if (average === null || toCents(average) === 0n) {
      return null;
    }

    const available = await this.getTotalAvailableARS(userId);
    const hundredths = divideRoundHalfUp(toCents(available) * 100n, toCents(average));
    return fromCents(hundredths);
  }

  async getFinancialSummary(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<FinancialSummary> {
    resolveMonthRange(year, month, timeZone);
    const { consumption, surplus, net, operating } =
      await this.monthlyOperatingResult(userId, year, month, timeZone);
    const [gross, available, average, runwayMonths] = await Promise.all([
      this.getMonthlyGrossExpenses(userId, year, month, timeZone),
      this.getTotalAvailableARS(userId),
      this.averageMonthlyFundConsumption(userId, year, month, timeZone),
      this.calculateRunway(userId, year, month, timeZone),
    ]);

    return {
      year,
      month,
      currency: ARS,
      monthlyGrossExpenses: gross,
      monthlyNetExpenses: net,
      monthlyOperatingIncome: operating,
      monthlyFundConsumption: consumption,
      monthlySurplus: surplus,
      totalAvailableARS: available,
      averageMonthlyFundConsumption: average,
      runwayMonths,
    };
  }

  private async monthlyOperatingResult(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ) {
    const net = await this.getMonthlyNetExpenses(userId, year, month, timeZone);
    const operating = await this.getMonthlyOperatingIncome(
      userId,
      year,
      month,
      timeZone
    );
    const raw = toCents(net) - toCents(operating);
    return {
      net,
      operating,
      consumption: fromCents(raw > 0n ? raw : 0n),
      surplus: fromCents(raw < 0n ? -raw : 0n),
    };
  }

  private async averageMonthlyFundConsumption(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<string | null> {
    resolveMonthRange(year, month, timeZone);
    const expenses = await this.transactions.findByUserId(userId, {
      type: "EXPENSE",
      status: "ACTIVE",
      currency: ARS,
    });

    const validKeys = new Set<string>();
    for (const expense of expenses) {
      const zoned = zonedYearMonth(expense.occurredAt, timeZone);
      if (compareYearMonth(zoned.year, zoned.month, year, month) <= 0) {
        validKeys.add(yearMonthKey(zoned.year, zoned.month));
      }
    }

    const selected = [...validKeys]
      .map(parseYearMonthKey)
      .sort((left, right) => compareYearMonth(right.year, right.month, left.year, left.month))
      .slice(0, MAX_VALID_MONTHS);

    if (selected.length === 0) {
      return null;
    }

    let total = 0n;
    for (const item of selected) {
      const consumption = await this.getMonthlyFundConsumption(
        userId,
        item.year,
        item.month,
        timeZone
      );
      total += toCents(consumption);
    }

    return fromCents(divideRoundHalfUp(total, BigInt(selected.length)));
  }

  private async activeArsExpensesInMonth(
    userId: string,
    year: number,
    month: number,
    timeZone: string
  ): Promise<Transaction[]> {
    const range = resolveMonthRange(year, month, timeZone);
    return this.transactions.findByUserId(userId, {
      type: "EXPENSE",
      status: "ACTIVE",
      currency: ARS,
      occurredAtGte: range.start,
      occurredAtLt: range.endExclusive,
    });
  }
}

function isOperatingIncome(transaction: Transaction): boolean {
  const metadata = transaction.metadata;
  if (metadata === null || typeof metadata !== "object") {
    return false;
  }

  return (
    "incomeKind" in metadata &&
    (metadata as { incomeKind?: unknown }).incomeKind === "OPERATING"
  );
}

function resolveMonthRange(year: number, month: number, timeZone: string) {
  if (!Number.isInteger(year)) {
    throw new AppError("VALIDATION_ERROR", "year debe ser un entero.", 400);
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("VALIDATION_ERROR", "month debe estar entre 1 y 12.", 400);
  }

  try {
    return monthUtcRange(year, month, timeZone);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Zona horaria inválida.", 400);
  }
}

function yearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseYearMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year: year!, month: month! };
}

function compareYearMonth(
  leftYear: number,
  leftMonth: number,
  rightYear: number,
  rightMonth: number
): number {
  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }
  return leftMonth - rightMonth;
}
