import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CreditCardController } from "./credit-card.controller.js";
import { createCreditCardRouter } from "./credit-card.routes.js";
import { CreditCardService } from "./credit-card.service.js";
import { createStatementControllerStub } from "./statement-controller-stub.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "./credit-card.types.js";

class MemoryCreditCards implements CreditCardRepository {
  readonly items = new Map<string, CreditCard>();

  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    if (input.isPrimary) {
      for (const item of this.items.values()) {
        if (item.userId === input.userId && item.isPrimary) {
          this.items.set(item.id, { ...item, isPrimary: false });
        }
      }
    }
    const now = new Date();
    const card: CreditCard = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      issuer: input.issuer,
      brand: input.brand,
      currency: input.currency,
      isActive: input.isActive ?? true,
      isPrimary: input.isPrimary ?? false,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
      feeStatus: input.feeStatus ?? "UNKNOWN",
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(card.id, card);
    return card;
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<CreditCard[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(id: string, input: UpdateCreditCardInput): Promise<CreditCard> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async setPrimary(userId: string, id: string): Promise<CreditCard> {
    for (const item of this.items.values()) {
      if (item.userId === userId && item.isPrimary) {
        this.items.set(item.id, { ...item, isPrimary: false });
      }
    }
    return this.update(id, { isPrimary: true });
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
  const repo = new MemoryCreditCards();
  const app = express();
  app.use(stubAuth(userId));
  app.use(express.json());
  app.use(
    "/api/credit-cards",
    createCreditCardRouter(
      new CreditCardController(new CreditCardService(repo)),
      createStatementControllerStub()
    )
  );
  app.use(errorHandler);
  return { app, userId, repo };
}

const payload = {
  name: "Visa Santander",
  issuer: "Santander",
  brand: "Visa",
  currency: "ARS",
};

test("POST /api/credit-cards creates an active incomplete card", async () => {
  const { app } = buildApp();
  const response = await request(app).post("/api/credit-cards").send(payload);
  assert.equal(response.status, 201);
  assert.equal(response.body.name, "Visa Santander");
  assert.equal(response.body.isActive, true);
  assert.equal(response.body.closingDay, null);
  assert.equal(response.body.dueDay, null);
  assert.equal(response.body.configComplete, false);
  assert.equal(response.body.feeStatus, "UNKNOWN");
});

test("GET /api/credit-cards lists only current user", async () => {
  const ownerId = randomUUID();
  const { app, repo } = buildApp(ownerId);
  await request(app).post("/api/credit-cards").send(payload);
  await repo.create({
    userId: randomUUID(),
    name: "Ajena",
    issuer: "BBVA",
    brand: "Visa",
    currency: "ARS",
  });
  const list = await request(app).get("/api/credit-cards");
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, "Visa Santander");
});

test("PATCH /api/credit-cards/:id updates and set-primary switches", async () => {
  const { app } = buildApp();
  const a = await request(app).post("/api/credit-cards").send({
    ...payload,
    isPrimary: true,
  });
  const b = await request(app).post("/api/credit-cards").send({
    ...payload,
    name: "Amex Santander",
    brand: "Amex",
  });
  const patched = await request(app)
    .patch(`/api/credit-cards/${a.body.id}`)
    .send({ issuer: "Santander Río" });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.issuer, "Santander Río");

  const primary = await request(app).post(
    `/api/credit-cards/${b.body.id}/set-primary`
  );
  assert.equal(primary.status, 200);
  assert.equal(primary.body.isPrimary, true);

  const list = await request(app).get("/api/credit-cards");
  const primaries = list.body.filter((item: { isPrimary: boolean }) => item.isPrimary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0].id, b.body.id);
});

test("POST deactivate/activate and validation errors", async () => {
  const { app } = buildApp();
  const created = await request(app).post("/api/credit-cards").send(payload);
  const off = await request(app).post(
    `/api/credit-cards/${created.body.id}/deactivate`
  );
  assert.equal(off.status, 200);
  assert.equal(off.body.isActive, false);
  const on = await request(app).post(
    `/api/credit-cards/${created.body.id}/activate`
  );
  assert.equal(on.status, 200);
  assert.equal(on.body.isActive, true);

  const badDay = await request(app).post("/api/credit-cards").send({
    ...payload,
    name: "Bad",
    closingDay: 40,
  });
  assert.equal(badDay.status, 400);

  const badCurrency = await request(app).post("/api/credit-cards").send({
    ...payload,
    name: "Euro",
    currency: "EUR",
  });
  assert.equal(badCurrency.status, 400);
});

test("PATCH foreign card returns 404", async () => {
  const { app, repo } = buildApp();
  const foreign = await repo.create({
    userId: randomUUID(),
    name: "Ajena",
    issuer: "BBVA",
    brand: "Visa",
    currency: "ARS",
  });
  const response = await request(app)
    .patch(`/api/credit-cards/${foreign.id}`)
    .send({ name: "Hack" });
  assert.equal(response.status, 404);
});
