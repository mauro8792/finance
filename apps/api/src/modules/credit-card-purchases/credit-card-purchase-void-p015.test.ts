/**
 * P0.15 — purchase void. Without recognized installments the schedule is just
 * cancelled; with recognized ones the EXPENSEs are reversed first so card debt
 * and spending drop back on their own (both derived from ACTIVE rows).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { PrismaCreditCardRefundRepository } from "../credit-card-refunds/credit-card-refund.repository.js";
import { CreditCardRefundService } from "../credit-card-refunds/credit-card-refund.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaCreditCardPurchaseRepository } from "./credit-card-purchase.repository.js";
import { CreditCardPurchaseService } from "./credit-card-purchase.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Purchase Void",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: { userId: user.id, name: `Cat ${randomUUID()}`, type: "EXPENSE" },
  });
  const card = await prisma.creditCard.create({
    data: {
      userId: user.id,
      name: "Visa",
      issuer: "Santander",
      brand: "Visa",
      currency: "ARS",
      isActive: true,
      closingDay: 20,
      dueDay: 10,
    },
  });

  const purchaseRepo = new PrismaCreditCardPurchaseRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);

  return {
    prisma,
    user,
    category,
    card,
    purchaseService: new CreditCardPurchaseService(
      purchaseRepo,
      cardRepo,
      new PrismaCategoryRepository(prisma)
    ),
    cardService: new CreditCardService(cardRepo, txRepo, purchaseRepo),
    refundService: new CreditCardRefundService(
      new PrismaCreditCardRefundRepository(prisma)
    ),
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundAccreditation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
  await prisma.creditCardInstallment.deleteMany({
    where: { purchase: { userId } },
  });
  await prisma.creditCardPurchase.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function createPurchase(
  ctx: Awaited<ReturnType<typeof seedBase>>,
  installmentsCount = 3,
  totalAmount = "90000.00"
) {
  return ctx.purchaseService.create(ctx.user.id, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount,
    purchaseDate: "2026-09-10",
    installmentsCount,
  });
}

test("P0.15 — purchase void without recognized installments only cancels the schedule", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await createPurchase(ctx);
    // Roll installment #1 back to PENDING so nothing is recognized.
    const first = purchase.installments[0]!;
    await ctx.prisma.creditCardInstallment.update({
      where: { id: first.id },
      data: {
        status: "PENDING",
        recognizedTransactionId: null,
        recognizedAt: null,
      },
    });
    await ctx.prisma.transaction.delete({
      where: { id: first.recognizedTransactionId! },
    });

    const result = await ctx.purchaseService.void(
      ctx.user.id,
      purchase.purchase.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.purchase.purchase.status, "VOIDED");
    assert.deepEqual(result.reversedTransactionIds, []);
    assert.equal(result.cancelledInstallmentsCount, 3);
    assert.ok(
      result.purchase.installments.every((item) => item.status === "CANCELLED")
    );
    assert.equal(
      (await ctx.cardService.getCommitments(ctx.user.id, ctx.card.id))
        .futureInstallmentCommitment,
      "0.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — purchase void reverses recognized expenses and cancels the rest", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await createPurchase(ctx);
    const recognized = purchase.installments.find(
      (item) => item.status === "RECOGNIZED"
    );
    assert.ok(recognized?.recognizedTransactionId);
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "30000.00"
    );

    const result = await ctx.purchaseService.void(
      ctx.user.id,
      purchase.purchase.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.purchase.purchase.status, "VOIDED");
    assert.deepEqual(result.reversedTransactionIds, [
      recognized.recognizedTransactionId,
    ]);
    assert.ok(
      result.purchase.installments.every((item) => item.status === "CANCELLED")
    );

    const expense = await ctx.prisma.transaction.findUnique({
      where: { id: recognized.recognizedTransactionId },
    });
    assert.equal(expense?.status, "REVERSED");
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "0.00"
    );

    const correction = await ctx.prisma.correctionOperation.findFirst({
      where: { userId: ctx.user.id, kind: "PURCHASE_VOID" },
    });
    assert.equal(correction?.resultStatus, "REVERSED");
    assert.equal(correction?.targetId, purchase.purchase.id);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — purchase void is idempotent and rejects a second key", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await createPurchase(ctx, 2, "40000.00");
    const key = `void-${randomUUID()}`;

    const first = await ctx.purchaseService.void(
      ctx.user.id,
      purchase.purchase.id,
      { idempotencyKey: key }
    );
    const replay = await ctx.purchaseService.void(
      ctx.user.id,
      purchase.purchase.id,
      { idempotencyKey: key }
    );

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.purchase.purchase.status, "VOIDED");
    assert.deepEqual(
      replay.reversedTransactionIds,
      first.reversedTransactionIds
    );
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "PURCHASE_VOID" },
      }),
      1
    );

    await assert.rejects(
      () =>
        ctx.purchaseService.void(ctx.user.id, purchase.purchase.id, {
          idempotencyKey: `other-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PURCHASE_ALREADY_VOIDED"
    );

    await assert.rejects(
      () =>
        ctx.purchaseService.void(randomUUID(), purchase.purchase.id, {
          idempotencyKey: `foreign-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — purchase void refuses to leave an accredited refund dangling", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await createPurchase(ctx, 1, "50000.00");
    await ctx.refundService.accredit({
      userId: ctx.user.id,
      purchaseId: purchase.purchase.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `refund-${randomUUID()}`,
    });

    await assert.rejects(
      () =>
        ctx.purchaseService.void(ctx.user.id, purchase.purchase.id, {
          idempotencyKey: `void-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "PURCHASE_HAS_ACTIVE_REFUNDS"
    );

    const purchaseRow = await ctx.prisma.creditCardPurchase.findUnique({
      where: { id: purchase.purchase.id },
    });
    assert.equal(purchaseRow?.status, "ACTIVE");
  } finally {
    await cleanup(ctx.user.id);
  }
});
