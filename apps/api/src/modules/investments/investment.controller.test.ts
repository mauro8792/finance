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
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { TransactionController } from "../transactions/transaction.controller.js";
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
import { InvestmentController } from "./investment.controller.js";
import { createInvestmentRouter } from "./investment.routes.js";
import { InvestmentService } from "./investment.service.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateInvestmentRecord,
  Investment,
  InvestmentRepository,
  UpdateActiveCaucionRecord,
} from "./investment.types.js";

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

class MemoryTransactionRepository implements TransactionRepository {
  readonly items: Transaction[] = [];

  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const transaction: Transaction = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      accountId: input.accountId,
      creditCardId: input.creditCardId ?? null,
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

class MemoryInvestmentRepository implements InvestmentRepository {
  readonly items = new Map<string, Investment>();

  constructor(private readonly transactions: MemoryTransactionRepository) {}

  async createCaucionAtomic(
    investment: CreateInvestmentRecord,
    transaction: CreateTransactionInput & { id: string }
  ): Promise<{ investment: Investment; transaction: Transaction }> {
    const now = new Date();
    const created: Investment = {
      ...investment,
      renewedFromInvestmentId: null,
      actualReturn: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(created.id, created);
    const createdTx = await this.transactions.create(transaction);
    return { investment: created, transaction: createdTx };
  }

  async matureAtomic(
    investmentId: string,
    patch: { status: "MATURED"; actualReturn: string },
    principalReturn: CreateTransactionInput & { id: string },
    investmentReturn: (CreateTransactionInput & { id: string }) | null
  ): Promise<{
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
  }> {
    const createdPrincipal = await this.transactions.create(principalReturn);
    const createdReturn = investmentReturn
      ? await this.transactions.create(investmentReturn)
      : null;
    const current = this.items.get(investmentId);
    if (!current) {
      throw new Error("missing");
    }
    const updated: Investment = {
      ...current,
      status: patch.status,
      actualReturn: patch.actualReturn,
      updatedAt: new Date(),
    };
    this.items.set(investmentId, updated);
    return {
      investment: updated,
      principalReturn: createdPrincipal,
      investmentReturn: createdReturn,
    };
  }

  async renewAtomic(input: {
    originalId: string;
    originalPatch: { status: "RENEWED"; actualReturn: string };
    newInvestment: CreateInvestmentRecord & { renewedFromInvestmentId: string };
    principalReturn: CreateTransactionInput & { id: string };
    investmentReturn: (CreateTransactionInput & { id: string }) | null;
    outflow: CreateTransactionInput & { id: string };
  }): Promise<{
    original: Investment;
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
    outflow: Transaction;
  }> {
    const createdPrincipal = await this.transactions.create(input.principalReturn);
    const createdReturn = input.investmentReturn
      ? await this.transactions.create(input.investmentReturn)
      : null;
    const current = this.items.get(input.originalId);
    if (!current) {
      throw new Error("missing");
    }
    const now = new Date();
    const original: Investment = {
      ...current,
      status: input.originalPatch.status,
      actualReturn: input.originalPatch.actualReturn,
      updatedAt: now,
    };
    this.items.set(original.id, original);
    const created: Investment = {
      ...input.newInvestment,
      actualReturn: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(created.id, created);
    const outflow = await this.transactions.create(input.outflow);
    return {
      original,
      investment: created,
      principalReturn: createdPrincipal,
      investmentReturn: createdReturn,
      outflow,
    };
  }

  async findById(id: string): Promise<Investment | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Investment[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async updateActiveCaucionAtomic(
    investmentId: string,
    patch: UpdateActiveCaucionRecord
  ): Promise<{ investment: Investment; outflow: Transaction }> {
    const current = this.items.get(investmentId);
    if (!current || current.status !== "ACTIVE") {
      throw new AppError(
        "INVESTMENT_NOT_ACTIVE",
        "Sólo una inversión ACTIVE puede editarse.",
        409
      );
    }
    const outflows = this.transactions.items.filter(
      (item) =>
        item.type === "INVESTMENT_OUTFLOW" &&
        item.status === "ACTIVE" &&
        item.metadata &&
        typeof item.metadata === "object" &&
        (item.metadata as { investmentId?: string }).investmentId ===
          investmentId
    );
    if (outflows.length !== 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "No hay un INVESTMENT_OUTFLOW único vinculado a esta caución.",
        409
      );
    }
    const outflow = outflows[0]!;
    const updated: Investment = {
      ...current,
      principal: patch.principal,
      annualRate: patch.annualRate,
      startDate: patch.startDate,
      maturityDate: patch.maturityDate,
      expectedReturn: patch.expectedReturn,
      notes: patch.notes,
      updatedAt: new Date(),
    };
    this.items.set(investmentId, updated);
    const outflowUpdated = await this.transactions.update(outflow.id, {
      amount: patch.principal,
      occurredAt: patch.startDate,
    });
    return { investment: updated, outflow: outflowUpdated };
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

class MemoryCategoryRepository implements CategoryRepository {
  async create(_input: CreateCategoryInput): Promise<Category> {
    throw new Error("unused");
  }
  async findById(): Promise<Category | null> {
    return null;
  }
  async findByUserId(): Promise<Category[]> {
    return [];
  }
  async findByUserIdAndName(): Promise<Category | null> {
    return null;
  }
  async update(_id: string, _input: UpdateCategoryInput): Promise<Category> {
    throw new Error("unused");
  }
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
  const transactions = new MemoryTransactionRepository();
  const investments = new MemoryInvestmentRepository(transactions);
  const accounts = new MemoryAccountRepository();
  const users = new MemoryUserRepository(user);
  const app = express();
  app.use(stubAuth(user.id));
  app.use(express.json());
  app.use(
    "/api/investments",
    createInvestmentRouter(
      new InvestmentController(
        new InvestmentService(investments, accounts, transactions),
        users
      )
    )
  );
  app.use(
    "/api/transactions",
    createTransactionRouter(
      new TransactionController(
        new TransactionService(transactions, accounts, new MemoryCategoryRepository()),
        users
      )
    )
  );
  app.use(errorHandler);
  return { app, accounts, user, transactions, investments };
}

test("GET /api/investments lists the user's investments", async () => {
  const { app, accounts, user } = buildApp();
  const empty = await request(app).get("/api/investments");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, []);

  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  assert.equal(created.status, 201);

  const listed = await request(app).get("/api/investments");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].id, created.body.id);
  assert.equal(listed.body[0].status, "ACTIVE");
  assert.equal(listed.body[0].expectedReturn, "575.34");
  assert.equal(listed.body[0].userId, undefined);
});

test("POST /api/investments creates a caución and rejects extra fields", async () => {
  const { app, accounts, user } = buildApp();
  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });

  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.type, "CAUCION");
  assert.equal(created.body.status, "ACTIVE");
  assert.equal(created.body.principal, "100000.00");
  assert.equal(created.body.annualRate, "0.300000");
  assert.equal(created.body.expectedReturn, "575.34");
  assert.equal(created.body.actualReturn, null);
  assert.equal(created.body.renewedFromInvestmentId, null);
  assert.equal(created.body.accountId, origin.id);

  const extra = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
    userId: user.id,
    type: "CAUCION",
    status: "ACTIVE",
    expectedReturn: "1.00",
  });
  assert.equal(extra.status, 400);
  assert.equal(extra.body.error.code, "VALIDATION_ERROR");
});

test("PATCH /api/investments/:id edits ACTIVE caución and recalculates expectedReturn", async () => {
  const { app, accounts, user, transactions } = buildApp();
  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  assert.equal(created.status, 201);
  const beforeTx = transactions.items.length;

  const patched = await request(app)
    .patch(`/api/investments/${created.body.id}`)
    .send({
      principal: "90000.00",
      annualRate: "0.300000",
      startDate: "2026-09-01T15:00:00.000Z",
      maturityDate: "2026-09-08T15:00:00.000Z",
    });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.principal, "90000.00");
  assert.equal(patched.body.status, "ACTIVE");
  assert.equal(patched.body.expectedReturn, "517.81");
  assert.equal(transactions.items.length, beforeTx);
  assert.equal(
    transactions.items.find((t) => t.type === "INVESTMENT_OUTFLOW")?.amount,
    "90000.00"
  );

  await request(app).post(`/api/investments/${created.body.id}/mature`).send({
    destinationAccountId: origin.id,
    capitalReturned: "90000.00",
    actualReturn: "517.81",
    occurredAt: "2026-09-08T15:00:00.000Z",
  });
  const closed = await request(app)
    .patch(`/api/investments/${created.body.id}`)
    .send({
      principal: "80000.00",
      annualRate: "0.300000",
      startDate: "2026-09-01T15:00:00.000Z",
      maturityDate: "2026-09-08T15:00:00.000Z",
    });
  assert.equal(closed.status, 400);
  assert.equal(closed.body.error.code, "INVESTMENT_NOT_ACTIVE");
});

test("PATCH and VOID of INVESTMENT_OUTFLOW are rejected over HTTP", async () => {
  const { app, accounts, user, transactions } = buildApp();
  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  assert.equal(created.status, 201);
  const outflowId = transactions.items[0]!.id;

  const patch = await request(app)
    .patch(`/api/transactions/${outflowId}`)
    .send({ description: "no" });
  const voided = await request(app).post(`/api/transactions/${outflowId}/void`);
  assert.equal(patch.status, 400);
  assert.equal(patch.body.error.code, "INVESTMENT_OUTFLOW_IMMUTABLE");
  assert.equal(voided.status, 400);
  assert.equal(voided.body.error.code, "INVESTMENT_OUTFLOW_IMMUTABLE");
});

test("POST /api/investments/:id/mature records return and rejects extra fields", async () => {
  const { app, accounts, user, transactions } = buildApp();
  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  assert.equal(created.status, 201);

  const matured = await request(app)
    .post(`/api/investments/${created.body.id}/mature`)
    .send({
      destinationAccountId: origin.id,
      capitalReturned: "100000.00",
      actualReturn: "560.00",
      occurredAt: "2026-09-08T15:00:00.000Z",
    });
  assert.equal(matured.status, 200);
  assert.equal(matured.body.status, "MATURED");
  assert.equal(matured.body.expectedReturn, "575.34");
  assert.equal(matured.body.actualReturn, "560.00");
  assert.equal(matured.body.destinationAccountId, origin.id);
  assert.equal(typeof matured.body.occurredAt, "string");

  const extra = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  const extraMature = await request(app)
    .post(`/api/investments/${extra.body.id}/mature`)
    .send({
      destinationAccountId: origin.id,
      capitalReturned: "100000.00",
      actualReturn: "560.00",
      occurredAt: "2026-09-08T15:00:00.000Z",
      userId: user.id,
      status: "MATURED",
      expectedReturn: "1.00",
    });
  assert.equal(extraMature.status, 400);
  assert.equal(extraMature.body.error.code, "VALIDATION_ERROR");

  const principal = transactions.items.find(
    (item) => item.type === "INVESTMENT_PRINCIPAL_RETURN"
  )!;
  const yieldTx = transactions.items.find((item) => item.type === "INVESTMENT_RETURN")!;
  const patchPrincipal = await request(app)
    .patch(`/api/transactions/${principal.id}`)
    .send({ description: "no" });
  const voidPrincipal = await request(app).post(`/api/transactions/${principal.id}/void`);
  const patchYield = await request(app)
    .patch(`/api/transactions/${yieldTx.id}`)
    .send({ description: "no" });
  const voidYield = await request(app).post(`/api/transactions/${yieldTx.id}/void`);
  assert.equal(patchPrincipal.body.error.code, "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE");
  assert.equal(voidPrincipal.body.error.code, "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE");
  assert.equal(patchYield.body.error.code, "INVESTMENT_RETURN_IMMUTABLE");
  assert.equal(voidYield.body.error.code, "INVESTMENT_RETURN_IMMUTABLE");

  const second = await request(app)
    .post(`/api/investments/${created.body.id}/mature`)
    .send({
      destinationAccountId: origin.id,
      capitalReturned: "100000.00",
      actualReturn: "560.00",
      occurredAt: "2026-09-08T15:00:00.000Z",
    });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.code, "INVESTMENT_NOT_ACTIVE");
});

test("POST /api/investments/:id/renew creates a new caución and rejects extra fields", async () => {
  const { app, accounts, user } = buildApp();
  const origin = await accounts.create({
    userId: user.id,
    name: "Banco QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  const created = await request(app).post("/api/investments").send({
    accountId: origin.id,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
  });
  assert.equal(created.status, 201);

  const renewed = await request(app)
    .post(`/api/investments/${created.body.id}/renew`)
    .send({
      accountId: origin.id,
      renewalPrincipal: "70000.00",
      actualReturn: "560.00",
      annualRate: "0.280000",
      occurredAt: "2026-09-08T15:00:00.000Z",
      maturityDate: "2026-09-15T15:00:00.000Z",
    });
  assert.equal(renewed.status, 201);
  assert.equal(renewed.body.original.status, "RENEWED");
  assert.equal(renewed.body.original.actualReturn, "560.00");
  assert.equal(renewed.body.original.expectedReturn, "575.34");
  assert.equal(renewed.body.investment.status, "ACTIVE");
  assert.equal(renewed.body.investment.principal, "70000.00");
  assert.equal(renewed.body.investment.annualRate, "0.280000");
  assert.equal(renewed.body.investment.expectedReturn, "375.89");
  assert.equal(renewed.body.investment.renewedFromInvestmentId, created.body.id);

  const extra = await request(app)
    .post(`/api/investments/${renewed.body.investment.id}/renew`)
    .send({
      accountId: origin.id,
      renewalPrincipal: "70000.00",
      actualReturn: "0.00",
      annualRate: "0.280000",
      occurredAt: "2026-09-15T15:00:00.000Z",
      maturityDate: "2026-09-22T15:00:00.000Z",
      userId: user.id,
      status: "RENEWED",
      expectedReturn: "1.00",
      renewedFromInvestmentId: created.body.id,
    });
  assert.equal(extra.status, 400);
  assert.equal(extra.body.error.code, "VALIDATION_ERROR");

  const secondOriginal = await request(app)
    .post(`/api/investments/${created.body.id}/renew`)
    .send({
      accountId: origin.id,
      renewalPrincipal: "70000.00",
      actualReturn: "560.00",
      annualRate: "0.280000",
      occurredAt: "2026-09-08T15:00:00.000Z",
      maturityDate: "2026-09-15T15:00:00.000Z",
    });
  assert.equal(secondOriginal.status, 400);
  assert.equal(secondOriginal.body.error.code, "INVESTMENT_NOT_ACTIVE");
});
