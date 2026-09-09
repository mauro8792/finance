import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { CreditCardRefundController } from "./credit-card-refund.controller.js";
import { PrismaCreditCardRefundRepository } from "./credit-card-refund.repository.js";
import { createCreditCardRefundRouter } from "./credit-card-refund.routes.js";
import { CreditCardRefundService } from "./credit-card-refund.service.js";

async function seed() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Refund HTTP",
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
      amount: "20000.00",
      currency: "ARS",
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
    },
  });
  return { prisma, user, expense };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardRefundAccreditation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
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
    "/api/credit-card-refunds",
    createCreditCardRefundRouter(
      new CreditCardRefundController(
        new CreditCardRefundService(new PrismaCreditCardRefundRepository())
      )
    )
  );
  app.use(errorHandler);
  return app;
}

test("P0.11 controller — validation + cancel expected", async () => {
  const ctx = await seed();
  try {
    const app = buildApp(ctx.user.id);
    const bad = await request(app).post("/api/credit-card-refunds/expected").send({
      expectedAmount: "1000.00",
    });
    assert.equal(bad.status, 400);

    const created = await request(app).post("/api/credit-card-refunds/expected").send({
      originalExpenseTransactionId: ctx.expense.id,
      expectedAmount: "5000.00",
    });
    assert.equal(created.status, 201);

    const cancelled = await request(app)
      .post(`/api/credit-card-refunds/expected/${created.body.id}/cancel`)
      .send({});
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, "CANCELLED");
  } finally {
    await cleanup(ctx.user.id);
  }
});
