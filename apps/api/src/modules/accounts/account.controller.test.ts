import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { stubAuth } from "../../middlewares/require-auth.js";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { FinancialController } from "../financial/financial.controller.js";
import { createFinancialRouter } from "../financial/financial.routes.js";
import { FinancialService } from "../financial/financial.service.js";
import { TransactionController } from "../transactions/transaction.controller.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { createTransactionRouter } from "../transactions/transaction.routes.js";
import { TransactionService } from "../transactions/transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { AccountController } from "./account.controller.js";
import { PrismaAccountRepository } from "./account.repository.js";
import { createAccountRouter } from "./account.routes.js";
import { AccountService } from "./account.service.js";
import {
  ZERO_INITIAL_BALANCE,
  type Account,
  type AccountRepository,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "./account.types.js";

const TZ = DEFAULT_USER_TIMEZONE;

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
  async findAuthByEmail(email: string): Promise<import("../users/user.types.js").UserAuthRecord | null> {
    return this.user && this.user.email === email
      ? { user: this.user, passwordHash: "invalid" }
      : null;
  }
  async count(): Promise<number> {
    return this.user ? 1 : 0;
  }
  async setCredentials(): Promise<User> {
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

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.status === undefined || item.status === query.status);
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("missing");
    }
    const current = this.items[index]!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: Transaction["reimbursementStatus"] }
  ): Promise<Transaction> {
    const created = await this.create(input);
    await this.update(expense.id, { reimbursementStatus: expense.reimbursementStatus });
    return created;
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
}

const user: User = {
  id: randomUUID(),
  name: "QA Accounts HTTP",
    email: "qa@example.test",
  timezone: TZ,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function appWith(accounts = new MemoryAccountRepository(), transactions = new MemoryTransactionRepository()) {
  const app = express();
  app.use(stubAuth(user.id));
  app.use(express.json());
  app.use(
    "/api/accounts",
    createAccountRouter(
      new AccountController(new AccountService(accounts, transactions), new MemoryUserRepository(user))
    )
  );
  app.use(errorHandler);
  return { app, accounts, transactions };
}

test("POST /api/accounts creates an active account with initialBalance 0", async () => {
  const { app } = appWith();
  const response = await request(app).post("/api/accounts").send({
    name: "Fondo indemnización prueba",
    currency: "ARS",
    type: "FUND",
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.name, "Fondo indemnización prueba");
  assert.equal(response.body.currency, "ARS");
  assert.equal(response.body.type, "FUND");
  assert.equal(response.body.initialBalance, "0.00");
  assert.equal(response.body.isActive, true);
});

test("GET /api/accounts lists accounts and GET balance starts at zero", async () => {
  const { app } = appWith();
  const created = await request(app).post("/api/accounts").send({
    name: "QA Fondo",
    currency: "ARS",
    type: "FUND",
  });
  const list = await request(app).get("/api/accounts");
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  const balance = await request(app).get(`/api/accounts/${created.body.id}/balance`);
  assert.equal(balance.status, 200);
  assert.equal(balance.body.balance, "0.00");
  assert.equal(balance.body.currency, "ARS");
});

test("PATCH /api/accounts/:id renames and POST deactivate/activate toggles isActive", async () => {
  const { app } = appWith();
  const created = await request(app).post("/api/accounts").send({
    name: "Caja",
    currency: "ARS",
    type: "CASH",
  });
  const patched = await request(app).patch(`/api/accounts/${created.body.id}`).send({
    name: "Efectivo",
    type: "CASH",
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.name, "Efectivo");
  const off = await request(app).post(`/api/accounts/${created.body.id}/deactivate`);
  assert.equal(off.body.isActive, false);
  const on = await request(app).post(`/api/accounts/${created.body.id}/activate`);
  assert.equal(on.body.isActive, true);
});

test("POST /api/accounts QA Fondo on PostgreSQL: CAPITAL 100000 updates balance and available ARS", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const categories = new PrismaCategoryRepository();
  const owner = await users.create({ name: "QA Accounts M7.6 HTTP" });
  const userRepo: UserRepository = {
    create: async () => owner,
    findById: async (id: string) => (id === owner.id ? owner : null),
    findFirst: async () => owner,
    findAuthByEmail: async () => ({ user: owner, passwordHash: "invalid" }),
    count: async () => 1,
    setCredentials: async () => owner,
  };
  const app = express();
  app.use(stubAuth(owner.id));
  app.use(express.json());
  app.use(
    "/api/accounts",
    createAccountRouter(new AccountController(new AccountService(accounts, transactions), userRepo))
  );
  app.use(
    "/api/transactions",
    createTransactionRouter(
      new TransactionController(
        new TransactionService(transactions, accounts, categories),
        userRepo
      )
    )
  );
  app.use(
    "/api/financial",
    createFinancialRouter(
      new FinancialController(new FinancialService(transactions, accounts), userRepo)
    )
  );
  app.use(errorHandler);
  const prisma = getPrismaClient();

  try {
    const created = await request(app).post("/api/accounts").send({
      name: "QA Fondo",
      currency: "ARS",
      type: "FUND",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.initialBalance, "0.00");
    const id = created.body.id as string;

    const zero = await request(app).get(`/api/accounts/${id}/balance`);
    assert.equal(zero.body.balance, "0.00");

    const category = await categories.create({
      userId: owner.id,
      name: `Capital QA ${Date.now()}`,
      type: "INCOME",
    });
    const income = await request(app).post("/api/transactions").send({
      type: "INCOME",
      amount: "100000.00",
      currency: "ARS",
      accountId: id,
      categoryId: category.id,
      incomeKind: "CAPITAL",
      description: "Capital QA",
    });
    assert.equal(income.status, 201);

    const after = await request(app).get(`/api/accounts/${id}/balance`);
    assert.equal(after.body.balance, "100000.00");

    const summary = await request(app).get("/api/financial/summary").query({
      year: 2026,
      month: 9,
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.totalAvailableARS, "100000.00");
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: owner.id } });
    await prisma.category.deleteMany({ where: { userId: owner.id } });
    await prisma.account.deleteMany({ where: { userId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
});
