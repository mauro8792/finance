import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./prisma.js";

function isForeignKeyViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return true;
  }
  const haystack = String(error);
  return haystack.includes("P2003") || haystack.includes("23503");
}

test("Transaction.accountId may be null for card-funded EXPENSE (P0.5)", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Tx accountId null",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const card = await prisma.creditCard.create({
    data: {
      userId: user.id,
      name: "Visa QA",
      issuer: "Santander",
      brand: "Visa",
      currency: "ARS",
    },
  });

  try {
    const created = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: null,
        creditCardId: card.id,
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "50.00",
        currency: "ARS",
        occurredAt: new Date("2026-09-07T12:00:00.000Z"),
        description: "QA card expense without account",
      },
    });

    assert.equal(created.accountId, null);
    assert.equal(created.creditCardId, card.id);
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.creditCard.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Transaction.creditCardId may be null (MVP1-compatible bank EXPENSE)", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Tx CreditCardId null",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: `QA Account ${Date.now()}`,
      currency: "ARS",
      type: "BANK",
    },
  });

  try {
    const created = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "100.00",
        currency: "ARS",
        occurredAt: new Date("2026-09-07T12:00:00.000Z"),
        description: "QA expense without credit card",
      },
    });

    assert.equal(created.creditCardId, null);
    assert.equal(created.accountId, account.id);
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Transaction.creditCardId rejects an invalid CreditCard FK", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Tx CreditCardId invalid FK",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });

  try {
    await assert.rejects(
      () =>
        prisma.transaction.create({
          data: {
            userId: user.id,
            accountId: null,
            creditCardId: randomUUID(),
            type: "EXPENSE",
            status: "ACTIVE",
            amount: "10.00",
            currency: "ARS",
            occurredAt: new Date("2026-09-07T12:00:00.000Z"),
          },
        }),
      (error: unknown) => isForeignKeyViolation(error)
    );
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
