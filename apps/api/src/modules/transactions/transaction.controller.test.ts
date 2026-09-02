import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../middlewares/error-handler.js";
import type {
  Account,
  AccountRepository,
  CreateAccountInput,
  UpdateAccountInput,
} from "../accounts/account.types.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { TransactionController } from "./transaction.controller.js";
import {
  createTransactionRouter,
  createTransferRouter,
} from "./transaction.routes.js";
import { TransactionService } from "./transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "./transaction.types.js";

function matchesOccurredAt(occurredAt: Date, query: FindTransactionsQuery): boolean {
  if (query.occurredAtRanges && query.occurredAtRanges.length > 0) {
    return query.occurredAtRanges.some(
      (range) => occurredAt >= range.gte && occurredAt < range.lt
    );
  }
  if (query.occurredAtGte !== undefined && occurredAt < query.occurredAtGte) {
    return false;
  }
  if (query.occurredAtLt !== undefined && occurredAt >= query.occurredAtLt) {
    return false;
  }
  return true;
}

class MemoryUserRepository implements UserRepository {
  constructor(private readonly user: User) {}

  async create(): Promise<User> {
    return this.user;
  }

  async findById(): Promise<User | null> {
    return this.user;
  }

  async findFirst(): Promise<User | null> {
    return this.user;
  }
}

class MemoryAccountRepository implements AccountRepository {
  constructor(private readonly items: Map<string, Account>) {}

  async create(input: CreateAccountInput): Promise<Account> {
    const account = [...this.items.values()][0];
    return { ...account!, ...input };
  }

  async findById(id: string): Promise<Account | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Account[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryCategoryRepository implements CategoryRepository {
  constructor(private readonly items: Map<string, Category>) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    const category = [...this.items.values()][0];
    return { ...category!, ...input };
  }

  async findById(id: string): Promise<Category | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(): Promise<Category[]> {
    return [...this.items.values()];
  }

  async findByUserIdAndName(): Promise<Category | null> {
    return [...this.items.values()][0] ?? null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    return { ...current, ...input };
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
      .filter(
        (item) =>
          query.categoryId === undefined || item.categoryId === query.categoryId
      )
      .filter(
        (item) => query.currency === undefined || item.currency === query.currency
      )
      .filter(
        (item) => query.accountId === undefined || item.accountId === query.accountId
      )
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.relatedTransactionId === undefined ||
          item.relatedTransactionId === query.relatedTransactionId
      )
      .filter((item) => matchesOccurredAt(item.occurredAt, query))
      .sort((left, right) => {
        const byOccurred = right.occurredAt.getTime() - left.occurredAt.getTime();
        if (byOccurred !== 0) {
          return byOccurred;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("missing");
    }
    const current = this.items[index]!;
    const updated: Transaction = {
      ...current,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.paymentMethod !== undefined
        ? { paymentMethod: input.paymentMethod }
        : {}),
      ...(input.isFixed !== undefined ? { isFixed: input.isFixed } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.reimbursementStatus !== undefined
        ? { reimbursementStatus: input.reimbursementStatus }
        : {}),
      updatedAt: new Date(),
    };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: Transaction["reimbursementStatus"] }
  ): Promise<Transaction> {
    const created = await this.create(input);
    await this.update(expense.id, {
      reimbursementStatus: expense.reimbursementStatus,
    });
    return created;
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    const snapshot = this.items.slice();
    try {
      const out = await this.create(outgoing);
      const inn = await this.create(incoming);
      return [out, inn];
    } catch (error) {
      this.items.splice(0, this.items.length, ...snapshot);
      throw error;
    }
  }
}

function buildApp() {
  const now = new Date();
  const user: User = {
    id: randomUUID(),
    name: "Usuario demo",
    email: null,
    timezone: DEFAULT_USER_TIMEZONE,
    createdAt: now,
    updatedAt: now,
  };
  const account: Account = {
    id: randomUUID(),
    userId: user.id,
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
    initialBalance: ZERO_INITIAL_BALANCE,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const category: Category = {
    id: randomUUID(),
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
    isSystem: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const incomeCategory: Category = {
    id: randomUUID(),
    userId: user.id,
    name: "Sueldo",
    type: "INCOME",
    isSystem: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const destinationAccount: Account = {
    id: randomUUID(),
    userId: user.id,
    name: "Banco",
    currency: "ARS",
    type: "BANK",
    initialBalance: ZERO_INITIAL_BALANCE,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const categories = new Map<string, Category>([
    [category.id, category],
    [incomeCategory.id, incomeCategory],
  ]);

  const accounts = new Map<string, Account>([
    [account.id, account],
    [destinationAccount.id, destinationAccount],
  ]);

  const controller = new TransactionController(
    new TransactionService(
      new MemoryTransactionRepository(),
      new MemoryAccountRepository(accounts),
      new MemoryCategoryRepository(categories)
    ),
    new MemoryUserRepository(user)
  );

  const app = express();
  app.use(express.json());
  app.use("/api/transactions", createTransactionRouter(controller));
  app.use("/api/transfers", createTransferRouter(controller));
  app.use(errorHandler);

  return {
    app,
    account,
    destinationAccount,
    accounts,
    user,
    category,
    incomeCategory,
  };
}

test("POST /api/transactions creates an expense", async () => {
  const { app, account, category } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    amount: "1500.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    description: "Almuerzo",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.type, "EXPENSE");
  assert.equal(response.body.status, "ACTIVE");
  assert.equal(response.body.amount, "1500.00");
  assert.equal(response.body.accountId, account.id);
  assert.equal(response.body.categoryId, category.id);
});

test("POST /api/transactions rejects an invalid body", async () => {
  const { app, account, category } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    amount: "1500.00",
    currency: "ARS",
    accountId: "not-a-uuid",
    categoryId: category.id,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.ok(account.id);
});

test("POST /api/transactions returns 404 for an unknown account", async () => {
  const { app, category } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: randomUUID(),
    categoryId: category.id,
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("POST /api/transactions creates an OPERATING income", async () => {
  const { app, account, incomeCategory } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "80000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.type, "INCOME");
  assert.equal(response.body.status, "ACTIVE");
  assert.equal(response.body.amount, "80000.00");
  assert.deepEqual(response.body.metadata, { incomeKind: "OPERATING" });
});

test("POST /api/transactions creates a CAPITAL income", async () => {
  const { app, account, incomeCategory } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "1000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
    description: "Capital inicial ficticio",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.type, "INCOME");
  assert.deepEqual(response.body.metadata, { incomeKind: "CAPITAL" });
});

test("POST /api/transactions rejects an invalid incomeKind", async () => {
  const { app, account, incomeCategory } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "BONUS",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("POST /api/transactions rejects an invalid INCOME body", async () => {
  const { app, account } = buildApp();

  const response = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/transactions lists movements newest first", async () => {
  const { app, account, category } = buildApp();

  const older = await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-08-10T12:00:00.000Z",
  });
  const newer = await request(app).post("/api/transactions").send({
    amount: "20.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-08-20T12:00:00.000Z",
  });

  const response = await request(app).get("/api/transactions");

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 2);
  assert.equal(response.body[0].id, newer.body.id);
  assert.equal(response.body[1].id, older.body.id);
  assert.equal(response.body[0].type, "EXPENSE");
  assert.equal(response.body[0].status, "ACTIVE");
  assert.equal(response.body[0].amount, "20.00");
});

test("GET /api/transactions filters by type", async () => {
  const { app, account, category, incomeCategory } = buildApp();

  await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const income = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "80.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });

  const response = await request(app).get("/api/transactions").query({
    type: "INCOME",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].id, income.body.id);
  assert.deepEqual(response.body[0].metadata, { incomeKind: "OPERATING" });
});

test("GET /api/transactions filters by accountId and status", async () => {
  const { app, account, destinationAccount, category } = buildApp();

  const first = await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await request(app).post("/api/transactions").send({
    amount: "20.00",
    currency: "ARS",
    accountId: destinationAccount.id,
    categoryId: category.id,
  });
  const toVoid = await request(app).post("/api/transactions").send({
    amount: "30.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await request(app).post(`/api/transactions/${toVoid.body.id}/void`);

  const byAccount = await request(app).get("/api/transactions").query({
    accountId: account.id,
  });
  const byStatus = await request(app).get("/api/transactions").query({
    status: "VOIDED",
  });

  assert.equal(byAccount.status, 200);
  assert.ok(byAccount.body.every((item: { accountId: string }) => item.accountId === account.id));
  assert.equal(byAccount.body.length, 2);
  assert.equal(byAccount.body.some((item: { id: string }) => item.id === first.body.id), true);
  assert.equal(byStatus.status, 200);
  assert.equal(byStatus.body.length, 1);
  assert.equal(byStatus.body[0].id, toVoid.body.id);
  assert.equal(byStatus.body[0].status, "VOIDED");
});

test("GET /api/transactions filters by month in the user timezone", async () => {
  const { app, account, category } = buildApp();

  await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-08-01T02:00:00.000Z",
  });
  const august = await request(app).post("/api/transactions").send({
    amount: "20.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-08-01T03:00:00.000Z",
  });

  const response = await request(app).get("/api/transactions").query({
    year: 2026,
    month: 8,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].id, august.body.id);
});

test("GET /api/transactions filters by month without year", async () => {
  const { app, account, category, incomeCategory } = buildApp();

  const june = await request(app).post("/api/transactions").send({
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-06-15T15:00:00.000Z",
  });
  await request(app).post("/api/transactions").send({
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-07-15T15:00:00.000Z",
  });
  await request(app).post("/api/transactions").send({
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: "2026-08-15T15:00:00.000Z",
  });
  await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "40000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
    occurredAt: "2026-09-01T15:00:00.000Z",
  });

  const onlyJune = await request(app).get("/api/transactions").query({ month: 6 });
  const onlyJuly = await request(app).get("/api/transactions").query({ month: 7 });
  const august2026 = await request(app).get("/api/transactions").query({
    year: 2026,
    month: 8,
  });
  const all = await request(app).get("/api/transactions");

  assert.equal(onlyJune.status, 200);
  assert.equal(onlyJune.body.length, 1);
  assert.equal(onlyJune.body[0].id, june.body.id);
  assert.equal(onlyJuly.status, 200);
  assert.equal(onlyJuly.body.length, 1);
  assert.ok(String(onlyJuly.body[0].occurredAt).startsWith("2026-07-15"));
  assert.equal(august2026.body.length, 1);
  assert.ok(String(august2026.body[0].occurredAt).startsWith("2026-08-15"));
  assert.equal(all.body.length, 4);
});

test("GET /api/transactions rejects an invalid month", async () => {
  const { app } = buildApp();

  const response = await request(app).get("/api/transactions").query({
    year: 2026,
    month: 13,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/transactions rejects a protected query field", async () => {
  const { app } = buildApp();

  const response = await request(app).get("/api/transactions").query({
    userId: randomUUID(),
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("PATCH /api/transactions/:id updates an expense", async () => {
  const { app, account, category } = buildApp();
  const created = await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app)
    .patch(`/api/transactions/${created.body.id}`)
    .send({
      amount: "18.75",
      description: "Editado M1.8",
      isFixed: true,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.id, created.body.id);
  assert.equal(response.body.type, "EXPENSE");
  assert.equal(response.body.status, "ACTIVE");
  assert.equal(response.body.amount, "18.75");
  assert.equal(response.body.description, "Editado M1.8");
  assert.equal(response.body.isFixed, true);
  assert.equal(response.body.userId, created.body.userId);
});

test("PATCH /api/transactions/:id rejects a protected field", async () => {
  const { app, account, category } = buildApp();
  const created = await request(app).post("/api/transactions").send({
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app)
    .patch(`/api/transactions/${created.body.id}`)
    .send({ type: "INCOME", amount: "18.75" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("PATCH /api/transactions/:id returns 404 for an unknown movement", async () => {
  const { app } = buildApp();

  const response = await request(app)
    .patch(`/api/transactions/${randomUUID()}`)
    .send({ amount: "18.75" });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("POST /api/transactions/:id/void voids an expense", async () => {
  const { app, account, category } = buildApp();
  const created = await request(app).post("/api/transactions").send({
    amount: "44.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app).post(
    `/api/transactions/${created.body.id}/void`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.id, created.body.id);
  assert.equal(response.body.status, "VOIDED");
  assert.equal(response.body.amount, "44.00");
  assert.equal(response.body.type, "EXPENSE");
});

test("POST /api/transactions/:id/void rejects an already voided movement", async () => {
  const { app, account, category } = buildApp();
  const created = await request(app).post("/api/transactions").send({
    amount: "44.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await request(app).post(`/api/transactions/${created.body.id}/void`);

  const response = await request(app).post(
    `/api/transactions/${created.body.id}/void`
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "TRANSACTION_ALREADY_VOIDED");
});

test("POST /api/transactions/:id/reimbursements creates a partial reimbursement", async () => {
  const { app, account, category } = buildApp();
  const expense = await request(app).post("/api/transactions").send({
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({
      amount: "40.00",
      accountId: account.id,
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.type, "REIMBURSEMENT");
  assert.equal(response.body.status, "ACTIVE");
  assert.equal(response.body.amount, "40.00");
  assert.equal(response.body.relatedTransactionId, expense.body.id);
  assert.equal(response.body.categoryId, null);

  const listed = await request(app).get("/api/transactions");
  const original = listed.body.find((item: { id: string }) => item.id === expense.body.id);
  assert.equal(original.reimbursementStatus, "PARTIAL");
  assert.equal(original.amount, "100.00");
});

test("POST /api/transactions/:id/reimbursements completes the expense", async () => {
  const { app, account, category } = buildApp();
  const expense = await request(app).post("/api/transactions").send({
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({
      amount: "100.00",
      accountId: account.id,
    });

  assert.equal(response.status, 201);
  const listed = await request(app).get("/api/transactions");
  const original = listed.body.find((item: { id: string }) => item.id === expense.body.id);
  assert.equal(original.reimbursementStatus, "COMPLETED");
});

test("POST /api/transactions/:id/reimbursements rejects over-reimbursement", async () => {
  const { app, account, category } = buildApp();
  const expense = await request(app).post("/api/transactions").send({
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({ amount: "80.00", accountId: account.id });

  const response = await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({ amount: "25.00", accountId: account.id });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "REIMBURSEMENT_EXCEEDS_PENDING");
});

test("POST /api/transactions/:id/reimbursements rejects a VOIDED expense", async () => {
  const { app, account, category } = buildApp();
  const expense = await request(app).post("/api/transactions").send({
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await request(app).post(`/api/transactions/${expense.body.id}/void`);

  const response = await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({ amount: "10.00", accountId: account.id });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "TRANSACTION_VOIDED");
});

test("POST /api/transactions/:id/reimbursements rejects a protected field", async () => {
  const { app, account, category } = buildApp();
  const expense = await request(app).post("/api/transactions").send({
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const response = await request(app)
    .post(`/api/transactions/${expense.body.id}/reimbursements`)
    .send({
      amount: "10.00",
      accountId: account.id,
      userId: randomUUID(),
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

async function fundSource(
  app: ReturnType<typeof buildApp>["app"],
  accountId: string,
  incomeCategoryId: string,
  amount = "1000.00"
) {
  const funded = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount,
    currency: "ARS",
    accountId,
    categoryId: incomeCategoryId,
    incomeKind: "CAPITAL",
  });
  assert.equal(funded.status, 201);
}

test("POST /api/transfers creates an atomic same-currency transfer", async () => {
  const { app, account, destinationAccount, incomeCategory } = buildApp();
  await fundSource(app, account.id, incomeCategory.id, "1000.00");
  await fundSource(app, destinationAccount.id, incomeCategory.id, "100.00");

  const response = await request(app).post("/api/transfers").send({
    sourceAccountId: account.id,
    destinationAccountId: destinationAccount.id,
    amount: "300.00",
    description: "Ahorro",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.out.type, "TRANSFER");
  assert.equal(response.body.in.type, "TRANSFER");
  assert.equal(response.body.out.status, "ACTIVE");
  assert.equal(response.body.in.status, "ACTIVE");
  assert.equal(response.body.out.amount, "300.00");
  assert.equal(response.body.in.amount, "300.00");
  assert.equal(response.body.out.categoryId, null);
  assert.equal(response.body.in.categoryId, null);
  assert.equal(response.body.out.relatedTransactionId, null);
  assert.equal(response.body.in.relatedTransactionId, null);
  assert.deepEqual(response.body.out.metadata, {
    transferId: response.body.transferId,
    direction: "OUT",
  });
  assert.deepEqual(response.body.in.metadata, {
    transferId: response.body.transferId,
    direction: "IN",
  });
});

test("POST /api/transfers rejects client-owned fields", async () => {
  const { app, account, destinationAccount } = buildApp();

  const response = await request(app).post("/api/transfers").send({
    sourceAccountId: account.id,
    destinationAccountId: destinationAccount.id,
    amount: "10.00",
    transferId: randomUUID(),
    direction: "OUT",
    type: "TRANSFER",
    currency: "ARS",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("POST /api/transfers rejects an unknown source account", async () => {
  const { app, destinationAccount } = buildApp();

  const response = await request(app).post("/api/transfers").send({
    sourceAccountId: randomUUID(),
    destinationAccountId: destinationAccount.id,
    amount: "10.00",
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("PATCH /api/transactions/:id rejects an individual TRANSFER leg", async () => {
  const { app, account, destinationAccount, incomeCategory } = buildApp();
  await fundSource(app, account.id, incomeCategory.id);
  const created = await request(app).post("/api/transfers").send({
    sourceAccountId: account.id,
    destinationAccountId: destinationAccount.id,
    amount: "10.00",
  });

  const response = await request(app)
    .patch(`/api/transactions/${created.body.out.id}`)
    .send({ description: "no" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "TRANSFER_IMMUTABLE");
});

test("POST /api/transactions/:id/void rejects an individual TRANSFER leg", async () => {
  const { app, account, destinationAccount, incomeCategory } = buildApp();
  await fundSource(app, account.id, incomeCategory.id);
  const created = await request(app).post("/api/transfers").send({
    sourceAccountId: account.id,
    destinationAccountId: destinationAccount.id,
    amount: "10.00",
  });

  const response = await request(app).post(
    `/api/transactions/${created.body.in.id}/void`
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "TRANSFER_IMMUTABLE");
});
