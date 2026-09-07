import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "./prisma.js";

test("CreditCardPurchase cash purchase persists purchase + installment + EXPENSE atomically", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Purchase",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: {
      userId: user.id,
      name: `Nafta ${Date.now()}`,
      type: "EXPENSE",
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

  const purchaseId = randomUUID();
  const installmentId = randomUUID();
  const transactionId = randomUUID();
  const purchasedAt = new Date("2026-09-07T12:00:00.000Z");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.creditCardPurchase.create({
        data: {
          id: purchaseId,
          userId: user.id,
          creditCardId: card.id,
          categoryId: category.id,
          description: "Nafta",
          currency: "ARS",
          totalAmount: "20000.00",
          installmentAmount: "20000.00",
          installmentsCount: 1,
          purchasedAt,
          status: "ACTIVE",
        },
      });
      await tx.transaction.create({
        data: {
          id: transactionId,
          userId: user.id,
          accountId: null,
          creditCardId: card.id,
          categoryId: category.id,
          type: "EXPENSE",
          status: "ACTIVE",
          amount: "20000.00",
          currency: "ARS",
          description: "Nafta",
          occurredAt: purchasedAt,
        },
      });
      await tx.creditCardInstallment.create({
        data: {
          id: installmentId,
          purchaseId,
          installmentNumber: 1,
          amount: "20000.00",
          status: "RECOGNIZED",
          recognizedTransactionId: transactionId,
          recognizedAt: purchasedAt,
        },
      });
    });

    const purchase = await prisma.creditCardPurchase.findUnique({
      where: { id: purchaseId },
      include: { installments: true },
    });
    assert.ok(purchase);
    assert.equal(purchase.installmentsCount, 1);
    assert.equal(purchase.installments.length, 1);
    assert.equal(purchase.installments[0]?.recognizedTransactionId, transactionId);

    const expense = await prisma.transaction.findUnique({ where: { id: transactionId } });
    assert.equal(expense?.accountId, null);
    assert.equal(expense?.creditCardId, card.id);
    assert.equal(expense?.type, "EXPENSE");
  } finally {
    await prisma.creditCardInstallment.deleteMany({ where: { purchaseId } });
    await prisma.transaction.deleteMany({ where: { id: transactionId } });
    await prisma.creditCardPurchase.deleteMany({ where: { id: purchaseId } });
    await prisma.creditCard.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
