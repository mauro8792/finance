import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "./prisma.js";

test("CreditCardPurchase N cuotas: #1 RECOGNIZED + PENDING schedule + EXPENSE", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Purchase P07",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: {
      userId: user.id,
      name: `Electro ${Date.now()}`,
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
  const transactionId = randomUUID();
  const purchasedAt = new Date("2026-09-07T12:00:00.000Z");
  const installmentIds = [randomUUID(), randomUUID(), randomUUID()];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.creditCardPurchase.create({
        data: {
          id: purchaseId,
          userId: user.id,
          creditCardId: card.id,
          categoryId: category.id,
          description: "Electro",
          currency: "ARS",
          totalAmount: "100.00",
          installmentAmount: "33.33",
          installmentsCount: 3,
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
          amount: "33.33",
          currency: "ARS",
          description: "Electro",
          occurredAt: purchasedAt,
        },
      });

      const amounts = ["33.33", "33.33", "33.34"];
      for (let index = 0; index < 3; index += 1) {
        const isFirst = index === 0;
        await tx.creditCardInstallment.create({
          data: {
            id: installmentIds[index]!,
            purchaseId,
            installmentNumber: index + 1,
            amount: amounts[index]!,
            status: isFirst ? "RECOGNIZED" : "PENDING",
            scheduledFor: new Date(
              Date.UTC(2026, 8 + index, 7, 12, 0, 0, 0)
            ),
            recognizedTransactionId: isFirst ? transactionId : null,
            recognizedAt: isFirst ? purchasedAt : null,
          },
        });
      }
    });

    const purchase = await prisma.creditCardPurchase.findUnique({
      where: { id: purchaseId },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
    assert.ok(purchase);
    assert.equal(purchase.installmentsCount, 3);
    assert.equal(purchase.installments.length, 3);
    assert.equal(purchase.installments[0]?.status, "RECOGNIZED");
    assert.equal(purchase.installments[0]?.recognizedTransactionId, transactionId);
    assert.ok(purchase.installments[0]?.scheduledFor);
    assert.equal(purchase.installments[1]?.status, "PENDING");
    assert.equal(purchase.installments[1]?.recognizedTransactionId, null);

    await assert.rejects(() =>
      prisma.creditCardInstallment.create({
        data: {
          id: randomUUID(),
          purchaseId,
          installmentNumber: 1,
          amount: "1.00",
          status: "PENDING",
          scheduledFor: purchasedAt,
        },
      })
    );

    await assert.rejects(() =>
      prisma.creditCardInstallment.create({
        data: {
          id: randomUUID(),
          purchaseId,
          installmentNumber: 4,
          amount: "1.00",
          status: "RECOGNIZED",
          scheduledFor: purchasedAt,
          recognizedTransactionId: null,
        },
      })
    );
  } finally {
    await prisma.creditCardInstallment.deleteMany({ where: { purchaseId } });
    await prisma.transaction.deleteMany({ where: { id: transactionId } });
    await prisma.creditCardPurchase.deleteMany({ where: { id: purchaseId } });
    await prisma.creditCard.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
