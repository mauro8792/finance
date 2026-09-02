import { Prisma } from "@prisma/client";
import type { Budget as PrismaBudget } from "@prisma/client";
import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  Budget,
  BudgetRepository,
  CreateBudgetInput,
  UpdateBudgetRecord,
} from "./budget.types.js";

export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateBudgetInput): Promise<Budget> {
    try {
      const record = await this.prisma.budget.create({
        data: {
          userId: input.userId,
          categoryId: input.categoryId,
          currency: input.currency,
          amount: input.amount,
          year: input.year,
          month: input.month,
        },
      });
      return toBudget(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "BUDGET_DUPLICATE",
          "Ya existe un presupuesto para esa categoría, moneda y mes.",
          409
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({ where: { id } });
    return record ? toBudget(record) : null;
  }

  async findByUserId(userId: string): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return records.map(toBudget);
  }

  async findByUserCategoryPeriod(
    userId: string,
    categoryId: string,
    currency: Currency,
    year: number,
    month: number
  ): Promise<Budget | null> {
    const record = await this.prisma.budget.findUnique({
      where: {
        userId_categoryId_currency_year_month: {
          userId,
          categoryId,
          currency,
          year,
          month,
        },
      },
    });
    return record ? toBudget(record) : null;
  }

  async findByUserPeriod(
    userId: string,
    year: number,
    month: number
  ): Promise<Budget[]> {
    const records = await this.prisma.budget.findMany({
      where: { userId, year, month },
      orderBy: [{ currency: "asc" }, { categoryId: "asc" }],
    });
    return records.map(toBudget);
  }

  async update(id: string, input: UpdateBudgetRecord): Promise<Budget> {
    const record = await this.prisma.budget.update({
      where: { id },
      data: { amount: input.amount },
    });
    return toBudget(record);
  }
}

function toBudget(record: PrismaBudget): Budget {
  return {
    id: record.id,
    userId: record.userId,
    categoryId: record.categoryId,
    currency: record.currency as Currency,
    amount: record.amount.toFixed(2),
    year: record.year,
    month: record.month,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
