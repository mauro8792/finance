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
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
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
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { HousingController } from "./housing.controller.js";
import { createHousingRouter } from "./housing.routes.js";
import { HousingService } from "./housing.service.js";
import type {
  CreateHousingObligationInput,
  CreateHousingPaymentRecord,
  HousingObligation,
  HousingObligationRepository,
  HousingPayment,
  UpdateHousingObligationRecord,
} from "./housing.types.js";
import { RemainingInstallmentsConflictError } from "./housing.types.js";

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

class MemoryHousingRepository implements HousingObligationRepository {
  readonly items = new Map<string, HousingObligation>();
  readonly payments = new Map<string, HousingPayment>();

  constructor(private readonly transactions = new MemoryTransactionRepository()) {}

  async create(input: CreateHousingObligationInput): Promise<HousingObligation> {
    const now = new Date();
    const item: HousingObligation = {
      id: randomUUID(),
      userId: input.userId,
      reserveAccountId: input.reserveAccountId ?? null,
      name: input.name,
      currency: input.currency,
      installmentAmount: input.installmentAmount,
      remainingInstallments: input.remainingInstallments,
      dueDay: input.dueDay ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(item.id, item);
    return item;
  }

  async findById(id: string): Promise<HousingObligation | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<HousingObligation[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(
    id: string,
    input: UpdateHousingObligationRecord
  ): Promise<HousingObligation> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async findPaymentsByObligationId(obligationId: string): Promise<HousingPayment[]> {
    return [...this.payments.values()]
      .filter((item) => item.housingObligationId === obligationId)
      .sort((left, right) => {
        const byPaid = right.paidAt.getTime() - left.paidAt.getTime();
        if (byPaid !== 0) {
          return byPaid;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  async registerPaymentAtomic(
    payment: CreateHousingPaymentRecord,
    transaction: CreateTransactionInput & { id: string },
    obligationId: string
  ) {
    const current = this.items.get(obligationId);
    if (!current || current.remainingInstallments <= 0) {
      throw new RemainingInstallmentsConflictError();
    }
    const createdTx = await this.transactions.create(transaction);
    const createdPayment: HousingPayment = { ...payment, createdAt: new Date() };
    this.payments.set(createdPayment.id, createdPayment);
    const updated = {
      ...current,
      remainingInstallments: current.remainingInstallments - 1,
      updatedAt: new Date(),
    };
    this.items.set(obligationId, updated);
    return { payment: createdPayment, transaction: createdTx, obligation: updated };
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
  const housing = new MemoryHousingRepository(transactions);
  const accounts = new MemoryAccountRepository();
  const users = new MemoryUserRepository(user);
  const app = express();
  app.use(stubAuth(user.id));
  app.use(express.json());
  app.use(
    "/api/housing",
    createHousingRouter(
      new HousingController(new HousingService(housing, accounts, transactions), users)
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
  return { app, housing, accounts, user, transactions };
}

test("POST /api/housing creates and GET lists the current user obligation", async () => {
  const { app, housing, user } = buildApp();
  const created = await request(app).post("/api/housing").send({
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    dueDay: 10,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.installmentAmount, "500.00");
  assert.equal(created.body.remainingInstallments, 12);
  assert.equal(typeof created.body.installmentAmount, "string");

  await housing.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "USD",
    installmentAmount: "999.00",
    remainingInstallments: 1,
  });

  const listed = await request(app).get("/api/housing");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].id, created.body.id);

  const fetched = await request(app).get(`/api/housing/${created.body.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.name, "Casa QA");

  const foreign = await request(app).get(`/api/housing/${randomUUID()}`);
  assert.equal(foreign.status, 404);
  assert.equal(user.name, "Usuario demo");
});

test("PATCH /api/housing/:id updates amount and rejects protected currency", async () => {
  const { app } = buildApp();
  const created = await request(app).post("/api/housing").send({
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
  });

  const updated = await request(app).patch(`/api/housing/${created.body.id}`).send({
    installmentAmount: "520.00",
    remainingInstallments: 11,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.installmentAmount, "520.00");
  assert.equal(updated.body.remainingInstallments, 11);

  const protectedField = await request(app)
    .patch(`/api/housing/${created.body.id}`)
    .send({ currency: "ARS", installmentAmount: "520.00" });
  assert.equal(protectedField.status, 400);
  assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");
});

test("POST /api/housing/:id/payments registers a valid payment", async () => {
  const { app, accounts, user } = buildApp();
  const reserve = await accounts.create({
    userId: user.id,
    name: "Reserva QA",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const created = await request(app).post("/api/housing").send({
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });

  const paid = await request(app).post(`/api/housing/${created.body.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
  });

  assert.equal(paid.status, 201);
  assert.equal(paid.body.payment.amount, "500.00");
  assert.equal(paid.body.transaction.type, "HOUSING_PAYMENT");
  assert.equal(paid.body.transaction.categoryId, null);
  assert.deepEqual(paid.body.transaction.metadata, {
    housingPaymentId: paid.body.payment.id,
    housingObligationId: created.body.id,
  });
  assert.equal(paid.body.remainingInstallments, 11);

  const extra = await request(app).post(`/api/housing/${created.body.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
    userId: user.id,
    currency: "USD",
    type: "HOUSING_PAYMENT",
  });
  assert.equal(extra.status, 400);
  assert.equal(extra.body.error.code, "VALIDATION_ERROR");

  const patch = await request(app)
    .patch(`/api/transactions/${paid.body.transaction.id}`)
    .send({ description: "no" });
  const voided = await request(app)
    .post(`/api/transactions/${paid.body.transaction.id}/void`)
    .send({ idempotencyKey: `void-${randomUUID()}` });
  assert.equal(patch.status, 400);
  assert.equal(patch.body.error.code, "HOUSING_PAYMENT_IMMUTABLE");
  assert.equal(voided.status, 400);
  assert.equal(voided.body.error.code, "HOUSING_PAYMENT_IMMUTABLE");
});

test("POST /api/housing/:id/payments rejects a foreign obligation", async () => {
  const { app, housing, accounts, user } = buildApp();
  const reserve = await accounts.create({
    userId: user.id,
    name: "Reserva QA",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const foreign = await housing.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
  });
  const response = await request(app).post(`/api/housing/${foreign.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
  });
  assert.equal(response.status, 404);
});

test("GET /api/housing/:id/coverage returns the HousingCoverage shape", async () => {
  const { app, accounts, user } = buildApp();
  const reserve = await accounts.create({
    userId: user.id,
    name: "Reserva QA",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const created = await request(app).post("/api/housing").send({
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });

  const coverage = await request(app).get(`/api/housing/${created.body.id}/coverage`);
  assert.equal(coverage.status, 200);
  assert.deepEqual(Object.keys(coverage.body).sort(), [
    "coveredInstallments",
    "currency",
    "housingObligationId",
    "installmentAmount",
    "remainingInstallments",
    "reserveAccountId",
    "reserveBalance",
  ]);
  assert.equal(coverage.body.housingObligationId, created.body.id);
  assert.equal(coverage.body.currency, "USD");
  assert.equal(coverage.body.reserveAccountId, reserve.id);
  assert.equal(coverage.body.reserveBalance, "2000.00");
  assert.equal(coverage.body.installmentAmount, "500.00");
  assert.equal(coverage.body.remainingInstallments, 12);
  assert.equal(coverage.body.coveredInstallments, "4.00");
  assert.equal(typeof coverage.body.reserveBalance, "string");
  assert.equal(typeof coverage.body.coveredInstallments, "string");

  const withoutReserve = await request(app).post("/api/housing").send({
    name: "Sin reserva",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 6,
  });
  const nullCoverage = await request(app).get(
    `/api/housing/${withoutReserve.body.id}/coverage`
  );
  assert.equal(nullCoverage.status, 200);
  assert.equal(nullCoverage.body.reserveAccountId, null);
  assert.equal(nullCoverage.body.reserveBalance, null);
  assert.equal(nullCoverage.body.coveredInstallments, null);

  await request(app).patch(`/api/housing/${created.body.id}`).send({ isActive: false });
  const inactive = await request(app).get(`/api/housing/${created.body.id}/coverage`);
  assert.equal(inactive.status, 200);
  assert.equal(inactive.body.coveredInstallments, "4.00");

  const foreign = await request(app).get(`/api/housing/${randomUUID()}/coverage`);
  assert.equal(foreign.status, 404);
  const invalid = await request(app).get("/api/housing/not-a-uuid/coverage");
  assert.equal(invalid.status, 400);
});

test("GET /api/housing/:id/payments lists only that obligation newest first", async () => {
  const { app, housing, accounts, user } = buildApp();
  const reserve = await accounts.create({
    userId: user.id,
    name: "Reserva QA",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const created = await request(app).post("/api/housing").send({
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });

  const empty = await request(app).get(`/api/housing/${created.body.id}/payments`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, []);

  const first = await request(app).post(`/api/housing/${created.body.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
    occurredAt: "2026-07-01T12:00:00.000Z",
  });
  const second = await request(app).post(`/api/housing/${created.body.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
    occurredAt: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const listed = await request(app).get(`/api/housing/${created.body.id}/payments`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 2);
  assert.equal(listed.body[0].id, second.body.payment.id);
  assert.equal(listed.body[1].id, first.body.payment.id);
  assert.equal(listed.body[0].amount, "500.00");
  assert.equal(typeof listed.body[0].amount, "string");
  assert.deepEqual(Object.keys(listed.body[0]).sort(), [
    "accountId",
    "amount",
    "currency",
    "housingObligationId",
    "id",
    "installmentNumber",
    "paidAt",
    "transactionId",
  ]);

  const other = await request(app).post("/api/housing").send({
    name: "Otra",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
    reserveAccountId: reserve.id,
  });
  await request(app).post(`/api/housing/${other.body.id}/payments`).send({
    accountId: reserve.id,
    amount: "500.00",
  });
  const onlyFirst = await request(app).get(`/api/housing/${created.body.id}/payments`);
  assert.equal(onlyFirst.body.length, 2);

  await request(app).patch(`/api/housing/${created.body.id}`).send({ isActive: false });
  const inactive = await request(app).get(`/api/housing/${created.body.id}/payments`);
  assert.equal(inactive.status, 200);
  assert.equal(inactive.body.length, 2);

  const foreign = await housing.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 2,
  });
  const forbidden = await request(app).get(`/api/housing/${foreign.id}/payments`);
  assert.equal(forbidden.status, 404);
});
