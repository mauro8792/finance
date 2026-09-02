import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaBudgetRepository } from "./budget.repository.js";
import type { Budget, BudgetRepository, CreateBudgetInput } from "./budget.types.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { getPrismaClient } from "../../shared/db/prisma.js";

class MemoryBudgetRepository implements BudgetRepository {
  readonly items = new Map<string, Budget>();

  async create(input: CreateBudgetInput): Promise<Budget> {
    const key = periodKey(input);
    for (const item of this.items.values()) {
      if (periodKey(item) === key) {
        throw new Error("BUDGET_DUPLICATE");
      }
    }
    const now = new Date();
    const budget: Budget = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(budget.id, budget);
    return budget;
  }

  async findById(id: string): Promise<Budget | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Budget[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async findByUserCategoryPeriod(
    userId: string,
    categoryId: string,
    currency: CreateBudgetInput["currency"],
    year: number,
    month: number
  ): Promise<Budget | null> {
    return (
      [...this.items.values()].find(
        (item) =>
          item.userId === userId &&
          item.categoryId === categoryId &&
          item.currency === currency &&
          item.year === year &&
          item.month === month
      ) ?? null
    );
  }

  async findByUserPeriod(
    userId: string,
    year: number,
    month: number
  ): Promise<Budget[]> {
    return [...this.items.values()].filter(
      (item) => item.userId === userId && item.year === year && item.month === month
    );
  }

  async update(id: string, input: { amount: string }): Promise<Budget> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, amount: input.amount, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

function periodKey(input: {
  userId: string;
  categoryId: string;
  currency: string;
  year: number;
  month: number;
}): string {
  return `${input.userId}:${input.categoryId}:${input.currency}:${input.year}:${input.month}`;
}

test("MemoryBudgetRepository persists a budget with decimal amount and period", async () => {
  const repo = new MemoryBudgetRepository();
  const userId = randomUUID();
  const categoryId = randomUUID();
  const created = await repo.create({
    userId,
    categoryId,
    currency: "ARS",
    amount: "300000.00",
    year: 2026,
    month: 8,
  });

  assert.equal(created.amount, "300000.00");
  assert.equal(created.year, 2026);
  assert.equal(created.month, 8);
  assert.equal(created.currency, "ARS");
  assert.equal((await repo.findByUserId(userId)).length, 1);
  assert.equal((await repo.findByUserId(randomUUID())).length, 0);
  assert.equal(
    (await repo.findByUserCategoryPeriod(userId, categoryId, "ARS", 2026, 8))?.id,
    created.id
  );
});

test("MemoryBudgetRepository rejects a duplicate user/category/currency/month", async () => {
  const repo = new MemoryBudgetRepository();
  const input = {
    userId: randomUUID(),
    categoryId: randomUUID(),
    currency: "ARS" as const,
    amount: "100.00",
    year: 2026,
    month: 8,
  };
  await repo.create(input);
  await assert.rejects(() => repo.create({ ...input, amount: "200.00" }), /BUDGET_DUPLICATE/);
});

test("PrismaBudgetRepository persists and enforces uniqueness on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const categories = new PrismaCategoryRepository();
  const budgets = new PrismaBudgetRepository();
  const prisma = getPrismaClient();

  const user = await users.create({ name: "QA Budget M4.1" });
  const category = await categories.create({
    userId: user.id,
    name: `Comida M4.1 ${Date.now()}`,
    type: "EXPENSE",
  });

  try {
    const created = await budgets.create({
      userId: user.id,
      categoryId: category.id,
      currency: "ARS",
      amount: "300000.50",
      year: 2026,
      month: 8,
    });

    assert.equal(created.amount, "300000.50");
    assert.equal(created.userId, user.id);
    assert.equal(created.categoryId, category.id);
    assert.equal(created.year, 2026);
    assert.equal(created.month, 8);

    const found = await budgets.findById(created.id);
    assert.equal(found?.amount, "300000.50");

    const listed = await budgets.findByUserId(user.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, created.id);

    await assert.rejects(
      () =>
        budgets.create({
          userId: user.id,
          categoryId: category.id,
          currency: "ARS",
          amount: "1.00",
          year: 2026,
          month: 8,
        }),
      (error: unknown) =>
        error instanceof Error && error.message.includes("Ya existe un presupuesto")
    );

    const usd = await budgets.create({
      userId: user.id,
      categoryId: category.id,
      currency: "USD",
      amount: "200.00",
      year: 2026,
      month: 8,
    });
    assert.equal(usd.currency, "USD");
    assert.equal(usd.amount, "200.00");

    await assert.rejects(
      () =>
        budgets.create({
          userId: user.id,
          categoryId: randomUUID(),
          currency: "ARS",
          amount: "10.00",
          year: 2026,
          month: 9,
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2003"
    );
  } finally {
    await prisma.budget.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
