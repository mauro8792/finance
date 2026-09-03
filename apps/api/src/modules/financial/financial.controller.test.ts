import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { stubAuth } from "../../middlewares/require-auth.js";
import request from "supertest";
import { errorHandler } from "../../middlewares/error-handler.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import type {
  Account,
  AccountRepository,
  CreateAccountInput,
  UpdateAccountInput,
} from "../accounts/account.types.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { FinancialController } from "./financial.controller.js";
import { createFinancialRouter } from "./financial.routes.js";
import { FinancialService } from "./financial.service.js";

const YEAR = 2026;
const MONTH = 8;
const SUMMARY_KEYS = [
  "year",
  "month",
  "currency",
  "monthlyGrossExpenses",
  "monthlyNetExpenses",
  "monthlyOperatingIncome",
  "monthlyFundConsumption",
  "monthlySurplus",
  "totalAvailableARS",
  "averageMonthlyFundConsumption",
  "runwayMonths",
] as const;

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
  async findAuthByEmail(email: string) {
    return this.user && this.user.email === email
      ? { user: this.user, passwordHash: "invalid" }
      : null;
  }
  async count() {
    return this.user ? 1 : 0;
  }
  async setCredentials() {
    if (!this.user) {
      throw new Error("no user");
    }
    return this.user;
  }
}

class MemoryAccountRepository implements AccountRepository {
  readonly items = new Map<string, Account>();

  async create(input: CreateAccountInput): Promise<Account> {
    const now = new Date();
    const account: Account = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      currency: input.currency,
      type: input.type,
      initialBalance: input.initialBalance ?? ZERO_INITIAL_BALANCE,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(account.id, account);
    return account;
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
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.relatedTransactionId === undefined ||
          item.relatedTransactionId === query.relatedTransactionId
      )
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

function at(year: number, month: number, day = 15): Date {
  return new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
}

function makeUser(id = randomUUID()): User {
  const now = new Date();
  return {
    id,
    name: "Usuario demo",
    email: "qa@example.test",
    timezone: DEFAULT_USER_TIMEZONE,
    createdAt: now,
    updatedAt: now,
  };
}

function buildApp(user = makeUser()) {
  const accounts = new MemoryAccountRepository();
  const transactions = new MemoryTransactionRepository();
  const app = express();
  app.use(stubAuth(user.id));
  app.use(express.json());
  app.use(
    "/api/financial",
    createFinancialRouter(
      new FinancialController(
        new FinancialService(transactions, accounts),
        new MemoryUserRepository(user)
      )
    )
  );
  app.use(errorHandler);
  return { app, accounts, transactions, user };
}

async function seedCurrentUserMonth(options?: {
  user?: User;
  otherUserExpense?: boolean;
}) {
  const current = options?.user ?? makeUser();
  const { app, accounts, transactions, user } = buildApp(current);
  const fund = await accounts.create({
    userId: user.id,
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });

  await transactions.create({
    userId: user.id,
    accountId: fund.id,
    type: "INCOME",
    amount: "8000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await transactions.create({
    userId: user.id,
    accountId: fund.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH - 1),
  });
  await transactions.create({
    userId: user.id,
    accountId: fund.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });

  if (options?.otherUserExpense) {
    const otherId = randomUUID();
    const otherFund = await accounts.create({
      userId: otherId,
      name: "Fondo ajeno",
      currency: "ARS",
      type: "FUND",
    });
    await transactions.create({
      userId: otherId,
      accountId: otherFund.id,
      type: "EXPENSE",
      amount: "999999.00",
      currency: "ARS",
      occurredAt: at(YEAR, MONTH),
    });
  }

  return { app, user, fund };
}

const MONEY_FIELDS = [
  "monthlyGrossExpenses",
  "monthlyNetExpenses",
  "monthlyOperatingIncome",
  "monthlyFundConsumption",
  "monthlySurplus",
  "totalAvailableARS",
] as const;

test("GET /api/financial/summary returns 200 with the exact FinancialSummary shape", async () => {
  const { app } = await seedCurrentUserMonth();

  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: MONTH,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body), [...SUMMARY_KEYS]);
  assert.equal(response.body.year, YEAR);
  assert.equal(response.body.month, MONTH);
  assert.equal(response.body.currency, "ARS");
  for (const field of MONEY_FIELDS) {
    assert.equal(typeof response.body[field], "string");
  }
  assert.equal(typeof response.body.averageMonthlyFundConsumption, "string");
  assert.equal(typeof response.body.runwayMonths, "string");
  assert.equal(response.body.monthlyGrossExpenses, "1000.00");
  assert.equal(response.body.monthlyNetExpenses, "1000.00");
  assert.equal(response.body.monthlyOperatingIncome, "0.00");
  assert.equal(response.body.monthlyFundConsumption, "1000.00");
  assert.equal(response.body.totalAvailableARS, "6000.00");
  assert.equal(response.body.averageMonthlyFundConsumption, "1000.00");
  assert.equal(response.body.runwayMonths, "6.00");
});

test("GET /api/financial/summary preserves null runway without history", async () => {
  const { app, accounts, user } = buildApp();
  await accounts.create({
    userId: user.id,
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });

  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: MONTH,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.averageMonthlyFundConsumption, null);
  assert.equal(response.body.runwayMonths, null);
});

test("GET /api/financial/summary rejects month 0", async () => {
  const { app } = buildApp();
  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: 0,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/financial/summary rejects month 13", async () => {
  const { app } = buildApp();
  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: 13,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/financial/summary rejects year without month", async () => {
  const { app } = buildApp();
  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/financial/summary rejects month without year", async () => {
  const { app } = buildApp();
  const response = await request(app).get("/api/financial/summary").query({
    month: MONTH,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/financial/summary rejects userId in query", async () => {
  const { app } = buildApp();
  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: MONTH,
    userId: randomUUID(),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("GET /api/financial/summary only includes the current user", async () => {
  const { app } = await seedCurrentUserMonth({ otherUserExpense: true });

  const response = await request(app).get("/api/financial/summary").query({
    year: YEAR,
    month: MONTH,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.monthlyGrossExpenses, "1000.00");
  assert.equal(response.body.totalAvailableARS, "6000.00");
});
