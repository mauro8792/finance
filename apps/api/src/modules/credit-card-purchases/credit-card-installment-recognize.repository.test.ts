import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { PrismaCreditCardPurchaseRepository } from "./credit-card-purchase.repository.js";
import { CreditCardPurchaseService } from "./credit-card-purchase.service.js";

test("P0.8 DB — concurrent recognizeDue yields one EXPENSE per installment", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Recognize",
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
      name: "Visa QA",
      issuer: "Bank",
      brand: "Visa",
      currency: "ARS",
    },
  });

  const service = new CreditCardPurchaseService(
    new PrismaCreditCardPurchaseRepository(prisma),
    new PrismaCreditCardRepository(prisma),
    new PrismaCategoryRepository(prisma),
    { now: () => new Date("2027-01-15T12:00:00.000Z") }
  );

  let purchaseId: string | null = null;
  try {
    const created = await service.create(user.id, {
      creditCardId: card.id,
      categoryId: category.id,
      description: "Electro",
      currency: "ARS",
      totalAmount: "600000.00",
      purchaseDate: "2026-09-07",
      installmentsCount: 6,
    });
    purchaseId = created.purchase.id;
    const asOf = created.installments[1]!.scheduledFor;

    const [a, b] = await Promise.all([
      service.recognizeDueInstallments({ asOf, userId: user.id }),
      service.recognizeDueInstallments({ asOf, userId: user.id }),
    ]);

    assert.equal(a.recognized + b.recognized, 1);
    assert.equal(a.skipped + b.skipped, 1);

    const installments = await prisma.creditCardInstallment.findMany({
      where: { purchaseId: created.purchase.id },
      orderBy: { installmentNumber: "asc" },
    });
    assert.equal(installments[1]?.status, "RECOGNIZED");
    assert.ok(installments[1]?.recognizedTransactionId);

    const expenses = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        creditCardId: card.id,
        type: "EXPENSE",
        status: "ACTIVE",
      },
    });
    assert.equal(expenses.length, 2);

    const linkedIds = new Set(
      installments
        .map((row) => row.recognizedTransactionId)
        .filter((id): id is string => id !== null)
    );
    assert.equal(linkedIds.size, 2);
    assert.ok(expenses.every((tx) => linkedIds.has(tx.id)));
  } finally {
    if (purchaseId) {
      await prisma.creditCardInstallment.deleteMany({ where: { purchaseId } });
      await prisma.transaction.deleteMany({
        where: { userId: user.id, creditCardId: card.id },
      });
      await prisma.creditCardPurchase.deleteMany({ where: { id: purchaseId } });
    }
    await prisma.creditCard.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
