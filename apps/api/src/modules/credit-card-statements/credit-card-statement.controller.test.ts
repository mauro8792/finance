import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CreditCardController } from "../credit-cards/credit-card.controller.js";
import { createCreditCardRouter } from "../credit-cards/credit-card.routes.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "../credit-cards/credit-card.types.js";
import { CreditCardStatementController } from "./credit-card-statement.controller.js";
import { CreditCardStatementService } from "./credit-card-statement.service.js";
import type {
  CloseStatementRecord,
  CreateStatementRecord,
  CreditCardStatement,
  CreditCardStatementRepository,
} from "./credit-card-statement.types.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";

class MemoryCards implements CreditCardRepository {
  readonly items = new Map<string, CreditCard>();
  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    const now = new Date();
    const card: CreditCard = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      issuer: input.issuer,
      brand: input.brand,
      currency: input.currency,
      isActive: true,
      isPrimary: false,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
      feeStatus: "UNKNOWN",
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(card.id, card);
    return card;
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async update(id: string, input: UpdateCreditCardInput) {
    const current = this.items.get(id)!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
  async setPrimary(_userId: string, id: string) {
    return this.update(id, { isPrimary: true });
  }
}

class MemoryTransactions implements TransactionRepository {
  readonly items: Transaction[] = [];
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const tx: Transaction = {
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
      paymentMethod: null,
      isFixed: false,
      reimbursementStatus: "NONE",
      relatedTransactionId: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(tx);
    return tx;
  }
  async findByUserId(userId: string, query: FindTransactionsQuery = {}) {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.type === undefined || item.type === query.type)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.creditCardId === undefined ||
          item.creditCardId === query.creditCardId
      )
      .filter(
        (item) =>
          query.occurredAtGte === undefined ||
          item.occurredAt >= query.occurredAtGte
      )
      .filter(
        (item) =>
          query.occurredAtLt === undefined || item.occurredAt < query.occurredAtLt
      );
  }
  async findById(id: string) {
    return this.items.find((item) => item.id === id) ?? null;
  }
  async update(id: string, input: UpdateTransactionRecord) {
    const index = this.items.findIndex((item) => item.id === id);
    const updated = { ...this.items[index]!, ...input, updatedAt: new Date() };
    this.items[index] = updated;
    return updated;
  }
  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string }
  ) {
    return this.create(input);
  }
  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
}

class MemoryStatements implements CreditCardStatementRepository {
  readonly items = new Map<string, CreditCardStatement>();
  async createProjected(input: CreateStatementRecord) {
    const now = new Date();
    const row: CreditCardStatement = {
      ...input,
      status: "PROJECTED",
      closedProjectedAmount: null,
      actualAmount: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(row.id, row);
    return row;
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByCreditCardAndClosingDate(creditCardId: string, closingDate: Date) {
    return (
      [...this.items.values()].find(
        (row) =>
          row.creditCardId === creditCardId &&
          row.closingDate.toISOString() === closingDate.toISOString()
      ) ?? null
    );
  }
  async findByCreditCardId(creditCardId: string) {
    return [...this.items.values()].filter(
      (row) => row.creditCardId === creditCardId
    );
  }
  async close(id: string, input: CloseStatementRecord) {
    const current = this.items.get(id)!;
    const updated: CreditCardStatement = {
      ...current,
      status: "CLOSED",
      closedProjectedAmount: input.closedProjectedAmount,
      actualAmount: input.actualAmount,
      closedAt: input.closedAt,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }
}

function stubAuth(userId: string) {
  return (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ): void => {
    const auth: AuthContext = { userId, sessionId: randomUUID() };
    (req as express.Request & { auth?: AuthContext }).auth = auth;
    next();
  };
}

function buildApp(userId = randomUUID()) {
  const cards = new MemoryCards();
  const transactions = new MemoryTransactions();
  const statements = new MemoryStatements();
  const statementService = new CreditCardStatementService(
    statements,
    cards,
    transactions
  );
  const app = express();
  app.use(stubAuth(userId));
  app.use(express.json());
  app.use(
    "/api/credit-cards",
    createCreditCardRouter(
      new CreditCardController(new CreditCardService(cards, transactions)),
      new CreditCardStatementController(statementService)
    )
  );
  app.use(errorHandler);
  return { app, userId, cards, statements, statementService };
}

test("HTTP GET statements missing card → 404 Tarjeta no encontrada", async () => {
  const { app } = buildApp();
  const res = await request(app).get(
    `/api/credit-cards/${randomUUID()}/statements`
  );
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
  assert.match(res.body.error.message, /Tarjeta/);
});

test("HTTP GET statement detail missing card → 404", async () => {
  const { app } = buildApp();
  const res = await request(app).get(
    `/api/credit-cards/${randomUUID()}/statements/${randomUUID()}`
  );
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});

test("HTTP POST project missing card → 404 (no write)", async () => {
  const { app, statements } = buildApp();
  const res = await request(app)
    .post(`/api/credit-cards/${randomUUID()}/statements/project`)
    .send({ closingDate: "2026-09-20" });
  assert.equal(res.status, 404);
  assert.equal(statements.items.size, 0);
});

test("HTTP POST close missing card → 404 (no write)", async () => {
  const { app, statements } = buildApp();
  const res = await request(app)
    .post(
      `/api/credit-cards/${randomUUID()}/statements/${randomUUID()}/close`
    )
    .send({});
  assert.equal(res.status, 404);
  assert.equal(statements.items.size, 0);
});

test("HTTP project/list/get/close wired to real statement service", async () => {
  const { app, userId, cards } = buildApp();
  const card = await cards.create({
    userId,
    name: "Visa",
    issuer: "Bank",
    brand: "Visa",
    currency: "ARS",
    closingDay: 20,
    dueDay: 10,
  });

  const projected = await request(app)
    .post(`/api/credit-cards/${card.id}/statements/project`)
    .send({ closingDate: "2026-09-20" });
  assert.equal(projected.status, 201);
  assert.equal(projected.body.status, "PROJECTED");
  assert.equal(projected.body.projectedAmount, "0.00");
  assert.ok(Array.isArray(projected.body.transactions));

  const listed = await request(app).get(
    `/api/credit-cards/${card.id}/statements`
  );
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  const detail = await request(app).get(
    `/api/credit-cards/${card.id}/statements/${projected.body.id}`
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.body.id, projected.body.id);

  const closed = await request(app)
    .post(`/api/credit-cards/${card.id}/statements/${projected.body.id}/close`)
    .send({ actualAmount: "100.00" });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.status, "CLOSED");
  assert.equal(closed.body.closedProjectedAmount, "0.00");
  assert.equal(closed.body.actualAmount, "100.00");
  assert.equal(closed.body.difference, "100.00");
});
