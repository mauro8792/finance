import type { Currency } from "shared";

export type Budget = {
  id: string;
  userId: string;
  categoryId: string;
  currency: Currency;
  amount: string;
  year: number;
  month: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBudgetInput = {
  userId: string;
  categoryId: string;
  currency: Currency;
  amount: string;
  year: number;
  month: number;
};

export type UpdateBudgetRecord = {
  amount: string;
};

export type BudgetRepository = {
  create(input: CreateBudgetInput): Promise<Budget>;
  findById(id: string): Promise<Budget | null>;
  findByUserId(userId: string): Promise<Budget[]>;
  findByUserPeriod(userId: string, year: number, month: number): Promise<Budget[]>;
  findByUserCategoryPeriod(
    userId: string,
    categoryId: string,
    currency: Currency,
    year: number,
    month: number
  ): Promise<Budget | null>;
  update(id: string, input: UpdateBudgetRecord): Promise<Budget>;
};
