/**
 * P0.15 — card payment void invariants: the CREDIT_CARD_PAYMENT goes REVERSED,
 * the bank balance and the derived card debt restore on their own, and the
 * statement payment status is recomputed from ACTIVE payments only.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaCreditCardStatementRepository } from "../credit-card-statements/credit-card-statement.repository.js";
import { CreditCardStatementService } from "../credit-card-statements/credit-card-statement.service.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaCreditCardPaymentRepository } from "./credit-card-payment.repository.js";
import { CreditCardPaymentService } from "./credit-card-payment.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Payment Void",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const category = await prisma.category.create({
    data: { userId: user.id, name: `Cat ${randomUUID()}`, type: "EXPENSE" },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: "BBVA",
      currency: "ARS",
      type: "BANK",
      initialBalance: "500000.00",
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

  const paymentRepo = new PrismaCreditCardPaymentRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);

  return {
    prisma,
    user,
    category,
    account,
    card,
    paymentService: new CreditCardPaymentService(paymentRepo, cardRepo, txRepo),
    cardService: new CreditCardService(
      cardRepo,
      txRepo,
      new PrismaCreditCardPurchaseRepository(prisma)
    ),
    statementService: new CreditCardStatementService(
      new PrismaCreditCardStatementRepository(prisma),
      cardRepo,
      txRepo,
      paymentRepo
    ),
    accountService: new AccountService(accountRepo, txRepo),
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.creditCardPaymentLink.deleteMany({ where: { userId } });
  await prisma.creditCardStatement.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function addCardExpense(
  ctx: Awaited<ReturnType<typeof seedBase>>,
  amount: string,
  occurredAt = new Date("2026-09-05T12:00:00.000Z")
) {
  return ctx.prisma.transaction.create({
    data: {
      userId: ctx.user.id,
      accountId: null,
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      type: "EXPENSE",
      status: "ACTIVE",
      amount,
      currency: "ARS",
      occurredAt,
      description: "Card expense",
    },
  });
}

test("P0.15 — payment void restores bank balance and card debt", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const payment = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "40000.00",
      idempotencyKey: `pay-${randomUUID()}`,
    });
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      "460000.00"
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "60000.00"
    );

    const result = await ctx.paymentService.void(
      ctx.user.id,
      ctx.card.id,
      payment.payment.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.payment.status, "REVERSED");
    assert.ok(result.payment.voidedAt);
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      "500000.00"
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "100000.00"
    );
    // No compensating movement: only the original payment row exists.
    assert.equal(
      await ctx.prisma.transaction.count({
        where: { userId: ctx.user.id, type: "CREDIT_CARD_PAYMENT" },
      }),
      1
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — payment void recomputes the statement payment status", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const projected = await ctx.statementService.getOrCreateProjected(
      ctx.user.id,
      ctx.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    const closed = await ctx.statementService.close(
      ctx.user.id,
      ctx.card.id,
      projected.statement.id,
      "100000.00"
    );

    const first = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "40000.00",
      statementId: closed.statement.id,
      idempotencyKey: `st1-${randomUUID()}`,
    });
    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "60000.00",
      statementId: closed.statement.id,
      idempotencyKey: `st2-${randomUUID()}`,
    });
    const paid = await ctx.statementService.getById(
      ctx.user.id,
      ctx.card.id,
      closed.statement.id
    );
    assert.equal(paid.statement.status, "PAID");

    const result = await ctx.paymentService.void(
      ctx.user.id,
      ctx.card.id,
      first.payment.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );
    assert.equal(result.statementStatus, "PARTIALLY_PAID");

    const after = await ctx.statementService.getById(
      ctx.user.id,
      ctx.card.id,
      closed.statement.id
    );
    assert.equal(after.statement.status, "PARTIALLY_PAID");
    assert.equal(after.paidAmount, "60000.00");
    assert.equal(after.remainingAmount, "40000.00");
    // The closing snapshot is never silently rewritten.
    assert.equal(after.statement.closedProjectedAmount, "100000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — payment void is idempotent and rejects a second key", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const payment = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "20000.00",
      idempotencyKey: `pay-${randomUUID()}`,
    });
    const key = `void-${randomUUID()}`;

    const first = await ctx.paymentService.void(
      ctx.user.id,
      ctx.card.id,
      payment.payment.id,
      { idempotencyKey: key }
    );
    const replay = await ctx.paymentService.void(
      ctx.user.id,
      ctx.card.id,
      payment.payment.id,
      { idempotencyKey: key }
    );

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.payment.id, first.payment.id);
    assert.equal(replay.payment.status, "REVERSED");
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "PAYMENT_VOID" },
      }),
      1
    );

    await assert.rejects(
      () =>
        ctx.paymentService.void(ctx.user.id, ctx.card.id, payment.payment.id, {
          idempotencyKey: `other-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PAYMENT_ALREADY_VOIDED"
    );

    await assert.rejects(
      () =>
        ctx.paymentService.void(ctx.user.id, ctx.card.id, randomUUID(), {
          idempotencyKey: `missing-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — a reversed payment frees room for a new payment", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "50000.00");
    const payment = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "50000.00",
      idempotencyKey: `full-${randomUUID()}`,
    });
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1.00",
          idempotencyKey: `over-${randomUUID()}`,
        }),
      (error: unknown) => error instanceof AppError
    );

    await ctx.paymentService.void(
      ctx.user.id,
      ctx.card.id,
      payment.payment.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    const retry = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "50000.00",
      idempotencyKey: `retry-${randomUUID()}`,
    });
    assert.equal(retry.created, true);
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "0.00"
    );
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      "450000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});
