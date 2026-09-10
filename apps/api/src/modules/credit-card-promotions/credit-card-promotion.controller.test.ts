import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CreditCardPromotionController } from "./credit-card-promotion.controller.js";
import { PrismaCreditCardPromotionRepository } from "./credit-card-promotion.repository.js";
import { createCreditCardPromotionRouter } from "./credit-card-promotion.routes.js";
import { CreditCardPromotionService } from "./credit-card-promotion.service.js";

async function seed() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Promo HTTP",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: {
      userId: user.id,
      name: `Cat ${Date.now()}`,
      type: "EXPENSE",
    },
  });
  const card = await prisma.creditCard.create({
    data: {
      userId: user.id,
      name: "Visa",
      issuer: "Santander",
      brand: "Visa",
      currency: "ARS",
      isActive: true,
    },
  });
  const expense = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: null,
      creditCardId: card.id,
      categoryId: category.id,
      type: "EXPENSE",
      status: "ACTIVE",
      amount: "50000.00",
      currency: "ARS",
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });
  return { prisma, user, card, expense };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardPromotionApplication.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
  await prisma.creditCardPromotion.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function buildApp(userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { auth?: AuthContext }).auth = {
      userId,
      sessionId: randomUUID(),
    };
    next();
  });
  app.use(express.json());
  app.use(
    "/api/credit-card-promotions",
    createCreditCardPromotionRouter(
      new CreditCardPromotionController(
        new CreditCardPromotionService(new PrismaCreditCardPromotionRepository())
      )
    )
  );
  app.use(errorHandler);
  return app;
}

test("P0.12 controller — CRUD activate preview apply", async () => {
  const ctx = await seed();
  try {
    const app = buildApp(ctx.user.id);
    const created = await request(app).post("/api/credit-card-promotions").send({
      creditCardId: ctx.card.id,
      name: "HTTP Promo",
      currency: "ARS",
      benefitType: "PERCENTAGE",
      percentage: "0.200000",
      capPeriod: "NONE",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2026-12-31T23:59:59.000Z",
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;

    const deactivated = await request(app)
      .post(`/api/credit-card-promotions/${id}/deactivate`)
      .send({});
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.isActive, false);

    const activated = await request(app)
      .post(`/api/credit-card-promotions/${id}/activate`)
      .send({});
    assert.equal(activated.status, 200);
    assert.equal(activated.body.isActive, true);

    const preview = await request(app)
      .post(`/api/credit-card-promotions/${id}/preview`)
      .send({ originalExpenseTransactionId: ctx.expense.id });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.calculation.expectedAmount, "10000.00");

    const applied = await request(app)
      .post(`/api/credit-card-promotions/${id}/apply`)
      .send({
        originalExpenseTransactionId: ctx.expense.id,
        idempotencyKey: `http-${randomUUID()}`,
      });
    assert.equal(applied.status, 201);
    assert.equal(applied.body.expectation.expectedAmount, "10000.00");
    assert.equal(applied.body.expectation.status, "EXPECTED");
  } finally {
    await cleanup(ctx.user.id);
  }
});
