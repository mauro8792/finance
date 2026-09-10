import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { stubAuth } from "../../middlewares/require-auth.js";
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
import { CurrencyExchangeController } from "./currency-exchange.controller.js";
import { createCurrencyExchangeRouter } from "./currency-exchange.routes.js";
import { CurrencyExchangeService } from "./currency-exchange.service.js";
import type {
  CreateCurrencyExchangeRecord,
  CurrencyExchange,
  CurrencyExchangeRepository,
} from "./currency-exchange.types.js";
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

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.status === undefined || item.status === query.status);
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("missing");
    }
    this.items[index] = { ...this.items[index]!, ...input, updatedAt: new Date() };
    return this.items[index]!;
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
  async createTransferAtomic(): Promise<never> {
    throw new Error("createTransferAtomic not used in this test double");
  }
  async listTransfers(): Promise<[]> {
    return [];
  }
  async findTransferById(): Promise<null> {
    return null;
  }
}

class MemoryCurrencyExchangeRepository implements CurrencyExchangeRepository {
  readonly items: CurrencyExchange[] = [];

  constructor(private readonly transactions: MemoryTransactionRepository) {}

  async createAtomic(
    exchange: CreateCurrencyExchangeRecord,
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<{ exchange: CurrencyExchange; out: Transaction; in: Transaction }> {
    const created: CurrencyExchange = { ...exchange, createdAt: new Date() };
    this.items.push(created);
    const out = await this.transactions.create(outgoing);
    const inn = await this.transactions.create(incoming);
    return { exchange: created, out, in: inn };
  }
}

function buildApp() {
  const now = new Date();
  const user: User = {
    id: randomUUID(),
    name: "Usuario demo",
    email: "qa@example.test",
    timezone: DEFAULT_USER_TIMEZONE,
    createdAt: now,
    updatedAt: now,
  };
  const ars: Account = {
    id: randomUUID(),
    userId: user.id,
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
    initialBalance: ZERO_INITIAL_BALANCE,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const usd: Account = {
    id: randomUUID(),
    userId: user.id,
    name: "Fondo USD",
    currency: "USD",
    type: "FUND",
    initialBalance: ZERO_INITIAL_BALANCE,
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
  const accounts = new Map<string, Account>([
    [ars.id, ars],
    [usd.id, usd],
  ]);
  const transactions = new MemoryTransactionRepository();
  const accountRepo = new MemoryAccountRepository(accounts);
  const categoryRepo = new MemoryCategoryRepository(
    new Map([[incomeCategory.id, incomeCategory]])
  );
  const users = new MemoryUserRepository(user);
  const transactionService = new TransactionService(
    transactions,
    accountRepo,
    categoryRepo
  );
  const exchangeService = new CurrencyExchangeService(
    new MemoryCurrencyExchangeRepository(transactions),
    accountRepo,
    transactions
  );

  const app = express();
  app.use(stubAuth(user.id));
  app.use(express.json());
  app.use(
    "/api/transactions",
    createTransactionRouter(new TransactionController(transactionService, users))
  );
  app.use(
    "/api/currency-exchanges",
    createCurrencyExchangeRouter(
      new CurrencyExchangeController(exchangeService, users)
    )
  );
  app.use(errorHandler);
  return { app, ars, usd, incomeCategory };
}

test("POST /api/currency-exchanges buys USD", async () => {
  const { app, ars, usd, incomeCategory } = buildApp();
  const funded = await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "1500000.00",
    currency: "ARS",
    accountId: ars.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
  });
  assert.equal(funded.status, 201);

  const response = await request(app).post("/api/currency-exchanges").send({
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "1500000.00",
    exchangeRate: "1500.000000",
    description: "Compra USD",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.exchange.fromCurrency, "ARS");
  assert.equal(response.body.exchange.toCurrency, "USD");
  assert.equal(response.body.exchange.toAmount, "1000.00");
  assert.equal(response.body.out.type, "CURRENCY_EXCHANGE");
  assert.equal(response.body.in.type, "CURRENCY_EXCHANGE");
  assert.deepEqual(response.body.out.metadata, {
    currencyExchangeId: response.body.exchange.id,
    direction: "OUT",
  });
  assert.deepEqual(response.body.in.metadata, {
    currencyExchangeId: response.body.exchange.id,
    direction: "IN",
  });
});

test("POST /api/currency-exchanges rejects client-owned fields", async () => {
  const { app, ars, usd } = buildApp();
  const response = await request(app).post("/api/currency-exchanges").send({
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "10.00",
    exchangeRate: "1500",
    toAmount: "1.00",
    fromCurrency: "ARS",
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("PATCH and VOID reject a CURRENCY_EXCHANGE leg", async () => {
  const { app, ars, usd, incomeCategory } = buildApp();
  await request(app).post("/api/transactions").send({
    type: "INCOME",
    amount: "1500000.00",
    currency: "ARS",
    accountId: ars.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
  });
  const created = await request(app).post("/api/currency-exchanges").send({
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "1500000.00",
    exchangeRate: "1500",
  });

  const patch = await request(app)
    .patch(`/api/transactions/${created.body.out.id}`)
    .send({ description: "no" });
  const voided = await request(app).post(
    `/api/transactions/${created.body.in.id}/void`
  );

  assert.equal(patch.status, 400);
  assert.equal(patch.body.error.code, "CURRENCY_EXCHANGE_IMMUTABLE");
  assert.equal(voided.status, 400);
  assert.equal(voided.body.error.code, "CURRENCY_EXCHANGE_IMMUTABLE");
});
