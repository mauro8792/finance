import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../middlewares/error-handler.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { zonedLocalToUtc } from "../../shared/time/month-range.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { BudgetController } from "./budget.controller.js";
import { PrismaBudgetRepository } from "./budget.repository.js";
import { createBudgetRouter } from "./budget.routes.js";
import { BudgetService } from "./budget.service.js";
import type { Budget, BudgetRepository, CreateBudgetInput } from "./budget.types.js";

const YEAR = 2026;
const MONTH = 8;
const TZ = DEFAULT_USER_TIMEZONE;
const VIEW_KEYS = [
  "id",
  "category",
  "currency",
  "amount",
  "year",
  "month",
  "consumption",
  "available",
  "usedPercent",
  "spendingPace",
] as const;

class MemoryUserRepository implements UserRepository {
  constructor(private readonly user: User) {}

  async create(): Promise<User> {
    return this.user;
  }

  async findById(id: string): Promise<User | null> {
    return id === this.user.id ? this.user : null;
  }

  async findFirst(): Promise<User | null> {
    return this.user;
  }
}

class MemoryBudgetRepository implements BudgetRepository {
  readonly items = new Map<string, Budget>();

  async create(input: CreateBudgetInput): Promise<Budget> {
    const key = `${input.userId}:${input.categoryId}:${input.currency}:${input.year}:${input.month}`;
    for (const item of this.items.values()) {
      if (
        `${item.userId}:${item.categoryId}:${item.currency}:${item.year}:${item.month}` ===
        key
      ) {
        throw new AppError(
          "BUDGET_DUPLICATE",
          "Ya existe un presupuesto para esa categoría, moneda y mes.",
          409
        );
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

  async findByUserPeriod(
    userId: string,
    year: number,
    month: number
  ): Promise<Budget[]> {
    return [...this.items.values()].filter(
      (item) => item.userId === userId && item.year === year && item.month === month
    );
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

class MemoryCategoryRepository implements CategoryRepository {
  readonly items = new Map<string, Category>();

  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      isSystem: input.isSystem ?? false,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(category.id, category);
    return category;
  }

  async findById(id: string): Promise<Category | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Category[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async findByUserIdAndName(): Promise<Category | null> {
    return null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryTransactionRepository implements TransactionRepository {
  readonly items: Transaction[] = [];

  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const transaction: Transaction = {
      id: randomUUID(),
      userId: input.userId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      status: input.status ?? "ACTIVE",
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      occurredAt: input.occurredAt,
      paymentMethod: input.paymentMethod ?? null,
      isFixed: input.isFixed ?? false,
      reimbursementStatus: input.reimbursementStatus ?? "NONE",
      relatedTransactionId: input.relatedTransactionId ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(transaction);
    return transaction;
  }

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.type === undefined || item.type === query.type)
      .filter((item) => query.currency === undefined || item.currency === query.currency)
      .filter((item) => query.categoryId === undefined || item.categoryId === query.categoryId)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.occurredAtGte === undefined || item.occurredAt >= query.occurredAtGte
      )
      .filter(
        (item) =>
          query.occurredAtLt === undefined || item.occurredAt < query.occurredAtLt
      );
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(): Promise<Transaction> {
    throw new Error("unused");
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string }
  ): Promise<Transaction> {
    return this.create(input);
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
}

function makeUser(id = randomUUID()): User {
  const now = new Date();
  return {
    id,
    name: "Usuario demo",
    email: null,
    timezone: TZ,
    createdAt: now,
    updatedAt: now,
  };
}

function buildApp(user = makeUser()) {
  const budgets = new MemoryBudgetRepository();
  const categories = new MemoryCategoryRepository();
  const transactions = new MemoryTransactionRepository();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/budgets",
    createBudgetRouter(
      new BudgetController(
        new BudgetService(
          budgets,
          transactions,
          new MemoryUserRepository(user),
          categories
        ),
        new MemoryUserRepository(user)
      )
    )
  );
  app.use(errorHandler);
  return { app, budgets, categories, transactions, user };
}

test("POST /api/budgets creates a valid budget", async () => {
  const { app, categories, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });

  const response = await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "300000.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });

  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(response.body), [...VIEW_KEYS]);
  assert.equal(response.body.amount, "300000.00");
  assert.equal(response.body.currency, "ARS");
  assert.equal(response.body.consumption, "0.00");
  assert.equal(response.body.available, "300000.00");
  assert.equal(response.body.usedPercent, "0.00");
  assert.equal(response.body.category.name, "Comida");
});

test("POST /api/budgets rejects amount 0 and a negative amount", async () => {
  const { app, categories, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });

  const zero = await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "0.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(zero.status, 400);
  assert.equal(zero.body.error.code, "VALIDATION_ERROR");

  const negative = await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "-10.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(negative.status, 400);
  assert.equal(negative.body.error.code, "VALIDATION_ERROR");
});

test("POST /api/budgets rejects a missing, foreign, inactive or INCOME category", async () => {
  const { app, categories, user } = buildApp();
  const other = await categories.create({
    userId: randomUUID(),
    name: "Ajena",
    type: "EXPENSE",
  });
  const inactive = await categories.create({
    userId: user.id,
    name: "Inactiva",
    type: "EXPENSE",
    isActive: false,
  });
  const income = await categories.create({
    userId: user.id,
    name: "Sueldo",
    type: "INCOME",
  });

  const missing = await request(app).post("/api/budgets").send({
    categoryId: randomUUID(),
    amount: "100.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(missing.status, 404);

  const foreign = await request(app).post("/api/budgets").send({
    categoryId: other.id,
    amount: "100.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(foreign.status, 404);

  const inactiveRes = await request(app).post("/api/budgets").send({
    categoryId: inactive.id,
    amount: "100.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(inactiveRes.status, 400);
  assert.equal(inactiveRes.body.error.code, "CATEGORY_INACTIVE");

  const incomeRes = await request(app).post("/api/budgets").send({
    categoryId: income.id,
    amount: "100.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  assert.equal(incomeRes.status, 400);
  assert.equal(incomeRes.body.error.code, "CATEGORY_TYPE_INCOMPATIBLE");
});

test("POST /api/budgets rejects a duplicate with 409", async () => {
  const { app, categories, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });
  const body = {
    categoryId: category.id,
    amount: "100.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  };
  assert.equal((await request(app).post("/api/budgets").send(body)).status, 201);

  const duplicate = await request(app).post("/api/budgets").send({
    ...body,
    amount: "200.00",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "BUDGET_DUPLICATE");
});

test("PATCH /api/budgets/:id updates amount and rejects 0, protected fields and unknown ids", async () => {
  const { app, categories, budgets, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });
  const created = await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "300000.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });

  const updated = await request(app)
    .patch(`/api/budgets/${created.body.id}`)
    .send({ amount: "350000.00" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.amount, "350000.00");
  assert.equal(updated.body.category.id, category.id);

  const zero = await request(app)
    .patch(`/api/budgets/${created.body.id}`)
    .send({ amount: "0" });
  assert.equal(zero.status, 400);

  const protectedField = await request(app)
    .patch(`/api/budgets/${created.body.id}`)
    .send({ amount: "100.00", categoryId: category.id });
  assert.equal(protectedField.status, 400);
  assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");

  const missing = await request(app)
    .patch(`/api/budgets/${randomUUID()}`)
    .send({ amount: "100.00" });
  assert.equal(missing.status, 404);

  const foreign = await budgets.create({
    userId: randomUUID(),
    categoryId: category.id,
    currency: "ARS",
    amount: "10.00",
    year: YEAR,
    month: MONTH,
  });
  const owned = await request(app)
    .patch(`/api/budgets/${foreign.id}`)
    .send({ amount: "20.00" });
  assert.equal(owned.status, 404);
});

test("GET /api/budgets lists the current user period and rejects invalid query", async () => {
  const { app, categories, budgets, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });
  await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "300000.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  await budgets.create({
    userId: randomUUID(),
    categoryId: category.id,
    currency: "ARS",
    amount: "999.00",
    year: YEAR,
    month: MONTH,
  });

  const listed = await request(app).get("/api/budgets").query({
    year: YEAR,
    month: MONTH,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].amount, "300000.00");
  assert.deepEqual(Object.keys(listed.body[0]), [...VIEW_KEYS]);

  const otherMonth = await request(app).get("/api/budgets").query({
    year: YEAR,
    month: 9,
  });
  assert.equal(otherMonth.status, 200);
  assert.equal(otherMonth.body.length, 0);

  const invalidMonth = await request(app).get("/api/budgets").query({
    year: YEAR,
    month: 0,
  });
  assert.equal(invalidMonth.status, 400);

  const userIdQuery = await request(app).get("/api/budgets").query({
    year: YEAR,
    month: MONTH,
    userId: randomUUID(),
  });
  assert.equal(userIdQuery.status, 400);
  assert.equal(userIdQuery.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/budgets exposes BudgetService progress fields", async () => {
  const { app, categories, transactions, user } = buildApp();
  const category = await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
  });
  await request(app).post("/api/budgets").send({
    categoryId: category.id,
    amount: "300000.00",
    currency: "ARS",
    year: YEAR,
    month: MONTH,
  });
  await transactions.create({
    userId: user.id,
    accountId: randomUUID(),
    categoryId: category.id,
    type: "EXPENSE",
    amount: "120000.00",
    currency: "ARS",
    occurredAt: zonedLocalToUtc(YEAR, MONTH, 15, 12, 0, 0, TZ),
  });

  const listed = await request(app).get("/api/budgets").query({
    year: YEAR,
    month: MONTH,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].amount, "300000.00");
  assert.equal(listed.body[0].consumption, "120000.00");
  assert.equal(listed.body[0].available, "180000.00");
  assert.equal(listed.body[0].usedPercent, "40.00");
  assert.equal(typeof listed.body[0].spendingPace.monthProgress, "string");
  assert.equal(typeof listed.body[0].spendingPace.aboveExpectedPace, "boolean");
});

test("Budget API QA fixture on PostgreSQL: create, update and list Comida 300000", async () => {
  const users = new PrismaUserRepository();
  const categories = new PrismaCategoryRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const budgets = new PrismaBudgetRepository();
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Budget M4.2.1" });
  const category = await categories.create({
    userId: user.id,
    name: `Comida M4.2.1 ${Date.now()}`,
    type: "EXPENSE",
  });
  const account = await accounts.create({
    userId: user.id,
    name: `Caja M4.2.1 ${Date.now()}`,
    currency: "ARS",
    type: "CASH",
    initialBalance: ZERO_INITIAL_BALANCE,
  });

  const app = express();
  app.use(express.json());
  app.use(
    "/api/budgets",
    createBudgetRouter(
      new BudgetController(
        new BudgetService(budgets, transactions, users, categories),
        new (class implements UserRepository {
          async create(): Promise<User> {
            return user;
          }
          async findById(id: string): Promise<User | null> {
            return id === user.id ? user : null;
          }
          async findFirst(): Promise<User | null> {
            return user;
          }
        })()
      )
    )
  );
  app.use(errorHandler);

  try {
    const created = await request(app).post("/api/budgets").send({
      categoryId: category.id,
      amount: "300000.00",
      currency: "ARS",
      year: YEAR,
      month: MONTH,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.amount, "300000.00");

    await transactions.create({
      userId: user.id,
      accountId: account.id,
      categoryId: category.id,
      type: "EXPENSE",
      amount: "120000.00",
      currency: "ARS",
      occurredAt: zonedLocalToUtc(YEAR, MONTH, 15, 12, 0, 0, TZ),
    });

    const listed = await request(app).get("/api/budgets").query({
      year: YEAR,
      month: MONTH,
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body[0].amount, "300000.00");
    assert.equal(listed.body[0].consumption, "120000.00");
    assert.equal(listed.body[0].available, "180000.00");
    assert.equal(listed.body[0].usedPercent, "40.00");

    const updated = await request(app)
      .patch(`/api/budgets/${created.body.id}`)
      .send({ amount: "310000.00" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.amount, "310000.00");
    assert.equal(updated.body.available, "190000.00");
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.budget.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: account.id } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
