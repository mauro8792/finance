import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CreditCardRecurringChargeController } from "./credit-card-recurring-charge.controller.js";
import { PrismaCreditCardRecurringChargeRepository } from "./credit-card-recurring-charge.repository.js";
import { createCreditCardRecurringChargeRouter } from "./credit-card-recurring-charge.routes.js";
import { CreditCardRecurringChargeService } from "./credit-card-recurring-charge.service.js";

async function seed() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Recurring HTTP",
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
  return { prisma, user, category, card };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardRecurringChargeOccurrence.deleteMany({ where: { userId } });
  await prisma.creditCardRecurringCharge.deleteMany({ where: { userId } });
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
    "/api/credit-card-recurring-charges",
    createCreditCardRecurringChargeRouter(
      new CreditCardRecurringChargeController(
        new CreditCardRecurringChargeService(
          new PrismaCreditCardRecurringChargeRepository()
        )
      )
    )
  );
  app.use(errorHandler);
  return app;
}

test("P0.13 controller — CRUD activate confirm outlook", async () => {
  const ctx = await seed();
  try {
    const app = buildApp(ctx.user.id);

    const created = await request(app)
      .post("/api/credit-card-recurring-charges")
      .send({
        creditCardId: ctx.card.id,
        kind: "MAINTENANCE",
        categoryId: ctx.category.id,
        description: "Mantenimiento HTTP",
        expectedAmount: "9000.00",
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.isActive, true);

    const listed = await request(app)
      .get(`/api/credit-card-recurring-charges?creditCardId=${ctx.card.id}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);

    const detail = await request(app).get(
      `/api/credit-card-recurring-charges/${created.body.id}`
    );
    assert.equal(detail.status, 200);

    const deactivated = await request(app).post(
      `/api/credit-card-recurring-charges/${created.body.id}/deactivate`
    );
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.isActive, false);

    const activated = await request(app).post(
      `/api/credit-card-recurring-charges/${created.body.id}/activate`
    );
    assert.equal(activated.status, 200);
    assert.equal(activated.body.isActive, true);

    const confirmed = await request(app)
      .post(`/api/credit-card-recurring-charges/${created.body.id}/confirm`)
      .send({
        occurrenceKey: "2026-09",
        amount: "9000.00",
        idempotencyKey: `http-${randomUUID()}`,
      });
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.body.created, true);
    assert.equal(confirmed.body.occurrence.amount, "9000.00");

    const outlook = await request(app).get(
      `/api/credit-card-recurring-charges/outlook?creditCardId=${ctx.card.id}&year=2026&month=9`
    );
    assert.equal(outlook.status, 200);
    assert.equal(outlook.body.occurrenceKey, "2026-09");
    assert.equal(outlook.body.items[0]?.hasOccurrence, true);
    assert.equal(outlook.body.expectedSumFixed, "0.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});
