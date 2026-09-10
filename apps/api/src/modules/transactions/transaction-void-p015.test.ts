/**
 * P0.15 — safe void / corrections on real PostgreSQL.
 *
 * Covers: transfer atomic void (both legs, never one), individual leg still
 * immutable, idempotency via correction_operations, concurrent double void,
 * plain transaction void and the card-expense installment unwind.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCorrectionRepository } from "../corrections/correction.repository.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { CreditCardPurchaseService } from "../credit-card-purchases/credit-card-purchase.service.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaTransactionRepository } from "./transaction.repository.js";
import { TransactionService } from "./transaction.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Void",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: { userId: user.id, name: `Cat ${randomUUID()}`, type: "EXPENSE" },
  });
  const source = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Origen",
      currency: "ARS",
      type: "BANK",
      initialBalance: "500000.00",
    },
  });
  const destination = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Destino",
      currency: "ARS",
      type: "CASH",
      initialBalance: "0.00",
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
      closingDay: 20,
      dueDay: 10,
    },
  });

  const txRepo = new PrismaTransactionRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const categoryRepo = new PrismaCategoryRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const purchaseRepo = new PrismaCreditCardPurchaseRepository(prisma);

  return {
    prisma,
    user,
    category,
    source,
    destination,
    card,
    txRepo,
    txService: new TransactionService(
      txRepo,
      accountRepo,
      categoryRepo,
      cardRepo,
      new PrismaCorrectionRepository(prisma)
    ),
    accountService: new AccountService(accountRepo, txRepo),
    cardService: new CreditCardService(cardRepo, txRepo, purchaseRepo),
    purchaseService: new CreditCardPurchaseService(
      purchaseRepo,
      cardRepo,
      categoryRepo
    ),
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.transferLink.deleteMany({ where: { userId } });
  await prisma.creditCardInstallment.deleteMany({
    where: { purchase: { userId } },
  });
  await prisma.creditCardPurchase.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function createTransfer(ctx: Awaited<ReturnType<typeof seedBase>>) {
  return ctx.txService.createTransfer(ctx.user.id, {
    sourceAccountId: ctx.source.id,
    destinationAccountId: ctx.destination.id,
    amount: "100000.00",
    idempotencyKey: `xfer-${randomUUID()}`,
  });
}

test("P0.15 — transfer void reverses both legs atomically and restores balances", async () => {
  const ctx = await seedBase();
  try {
    const created = await createTransfer(ctx);
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.source.id)).balance,
      "400000.00"
    );
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.destination.id))
        .balance,
      "100000.00"
    );

    const result = await ctx.txService.voidTransfer(
      ctx.user.id,
      created.transferId,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.out.status, "REVERSED");
    assert.equal(result.in.status, "REVERSED");
    assert.ok(result.transfer.voidedAt);

    // No compensating income/expense: the reversal is the absence of ACTIVE legs.
    assert.equal(
      await ctx.prisma.transaction.count({
        where: {
          userId: ctx.user.id,
          type: { in: ["EXPENSE", "INCOME"] },
        },
      }),
      0
    );
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.source.id)).balance,
      "500000.00"
    );
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.destination.id))
        .balance,
      "0.00"
    );

    const link = await ctx.prisma.transferLink.findUnique({
      where: { transferId: created.transferId },
    });
    assert.ok(link?.voidedAt);
    assert.ok(link?.voidIdempotencyKey);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — a single TRANSFER leg stays immutable after and before the void", async () => {
  const ctx = await seedBase();
  try {
    const created = await createTransfer(ctx);

    await assert.rejects(
      () =>
        ctx.txService.void(ctx.user.id, created.out.id, {
          idempotencyKey: `leg-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
    );

    await ctx.txService.voidTransfer(ctx.user.id, created.transferId, {
      idempotencyKey: `void-${randomUUID()}`,
    });

    await assert.rejects(
      () =>
        ctx.txService.void(ctx.user.id, created.in.id, {
          idempotencyKey: `leg2-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — transfer void is idempotent and a second key is rejected", async () => {
  const ctx = await seedBase();
  try {
    const created = await createTransfer(ctx);
    const key = `void-${randomUUID()}`;

    const first = await ctx.txService.voidTransfer(
      ctx.user.id,
      created.transferId,
      { idempotencyKey: key }
    );
    const replay = await ctx.txService.voidTransfer(
      ctx.user.id,
      created.transferId,
      { idempotencyKey: key }
    );

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.out.id, first.out.id);
    assert.equal(replay.out.status, "REVERSED");
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "TRANSFER_VOID" },
      }),
      1
    );

    await assert.rejects(
      () =>
        ctx.txService.voidTransfer(ctx.user.id, created.transferId, {
          idempotencyKey: `other-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TRANSFER_ALREADY_VOIDED"
    );

    await assert.rejects(
      () =>
        ctx.txService.voidTransfer(ctx.user.id, created.transferId, {
          idempotencyKey: "short",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "VALIDATION_ERROR"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — concurrent double transfer void voids once, never one leg alone", async () => {
  const ctx = await seedBase();
  try {
    const created = await createTransfer(ctx);
    const results = await Promise.allSettled([
      ctx.txService.voidTransfer(ctx.user.id, created.transferId, {
        idempotencyKey: `c1-${randomUUID()}`,
      }),
      ctx.txService.voidTransfer(ctx.user.id, created.transferId, {
        idempotencyKey: `c2-${randomUUID()}`,
      }),
    ]);

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "TRANSFER_VOID" },
      }),
      1
    );

    const legs = await ctx.prisma.transaction.findMany({
      where: { userId: ctx.user.id, type: "TRANSFER" },
    });
    assert.equal(legs.length, 2);
    assert.ok(legs.every((leg) => leg.status === "REVERSED"));
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — transaction void records the correction and replays the same key", async () => {
  const ctx = await seedBase();
  try {
    const expense = await ctx.txService.createExpense(ctx.user.id, {
      amount: "5000.00",
      currency: "ARS",
      accountId: ctx.source.id,
      categoryId: ctx.category.id,
    });
    const key = `void-${randomUUID()}`;

    const voided = await ctx.txService.void(ctx.user.id, expense.id, {
      idempotencyKey: key,
    });
    assert.equal(voided.status, "VOIDED");

    const replay = await ctx.txService.void(ctx.user.id, expense.id, {
      idempotencyKey: key,
    });
    assert.equal(replay.id, expense.id);
    assert.equal(replay.status, "VOIDED");

    const correction = await ctx.prisma.correctionOperation.findFirst({
      where: { userId: ctx.user.id, idempotencyKey: key },
    });
    assert.equal(correction?.kind, "TRANSACTION_VOID");
    assert.equal(correction?.resultStatus, "VOIDED");
    assert.equal(correction?.targetId, expense.id);
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.source.id)).balance,
      "500000.00"
    );

    // Same key pointing at another movement is a conflict, not a silent replay.
    const other = await ctx.txService.createExpense(ctx.user.id, {
      amount: "1000.00",
      currency: "ARS",
      accountId: ctx.source.id,
      categoryId: ctx.category.id,
    });
    await assert.rejects(
      () => ctx.txService.void(ctx.user.id, other.id, { idempotencyKey: key }),
      (error: unknown) =>
        error instanceof AppError && error.code === "IDEMPOTENCY_CONFLICT"
    );

    // A different key over an already voided movement still 409s.
    await assert.rejects(
      () =>
        ctx.txService.void(ctx.user.id, expense.id, {
          idempotencyKey: `again-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "TRANSACTION_ALREADY_VOIDED"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — voiding a recognized card expense unwinds the installment to PENDING", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await ctx.purchaseService.create(ctx.user.id, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      currency: "ARS",
      totalAmount: "90000.00",
      purchaseDate: "2026-09-10",
      installmentsCount: 3,
    });
    const recognized = purchase.installments.find(
      (item) => item.status === "RECOGNIZED"
    );
    assert.ok(recognized?.recognizedTransactionId);

    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "30000.00"
    );

    const voided = await ctx.txService.void(
      ctx.user.id,
      recognized.recognizedTransactionId,
      { idempotencyKey: `unwind-${randomUUID()}` }
    );
    // Compound correction → REVERSED, not a plain VOIDED.
    assert.equal(voided.status, "REVERSED");

    const after = await ctx.prisma.creditCardInstallment.findMany({
      where: { purchaseId: purchase.purchase.id },
      orderBy: { installmentNumber: "asc" },
    });
    assert.ok(after.every((item) => item.status === "PENDING"));
    assert.ok(after.every((item) => item.recognizedTransactionId === null));
    assert.ok(after.every((item) => item.recognizedAt === null));

    const purchaseRow = await ctx.prisma.creditCardPurchase.findUnique({
      where: { id: purchase.purchase.id },
    });
    assert.equal(purchaseRow?.status, "ACTIVE");

    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "0.00"
    );

    const correction = await ctx.prisma.correctionOperation.findFirst({
      where: { userId: ctx.user.id, targetId: recognized.recognizedTransactionId },
    });
    assert.equal(correction?.resultStatus, "REVERSED");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — a card payment cannot be voided from the generic endpoint", async () => {
  const ctx = await seedBase();
  try {
    const payment = await ctx.prisma.transaction.create({
      data: {
        userId: ctx.user.id,
        accountId: ctx.source.id,
        creditCardId: ctx.card.id,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "1000.00",
        currency: "ARS",
        occurredAt: new Date("2026-09-10T12:00:00.000Z"),
      },
    });

    await assert.rejects(
      () =>
        ctx.txService.void(ctx.user.id, payment.id, {
          idempotencyKey: `pay-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CREDIT_CARD_PAYMENT_VOID_REQUIRED"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});
