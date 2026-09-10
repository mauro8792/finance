/**
 * P0.15 — refund accreditation void. The REIMBURSEMENT goes REVERSED, the
 * expectation status is recomputed from the remaining ACTIVE accreditations
 * and the statement snapshot is left untouched.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaCreditCardRefundRepository } from "./credit-card-refund.repository.js";
import { CreditCardRefundService } from "./credit-card-refund.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Refund Void",
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

  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);

  return {
    prisma,
    user,
    category,
    account,
    card,
    refundService: new CreditCardRefundService(
      new PrismaCreditCardRefundRepository(prisma)
    ),
    cardService: new CreditCardService(
      cardRepo,
      txRepo,
      new PrismaCreditCardPurchaseRepository(prisma)
    ),
    accountService: new AccountService(accountRepo, txRepo),
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundAccreditation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function addCardExpense(
  ctx: Awaited<ReturnType<typeof seedBase>>,
  amount: string
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
      occurredAt: new Date("2026-09-05T12:00:00.000Z"),
      description: "Card expense",
    },
  });
}

test("P0.15 — accreditation void reopens the expectation as EXPECTED", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "20000.00",
    });
    const accredited = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "20000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `acc-${randomUUID()}`,
    });
    assert.equal(accredited.expectation?.status, "ACCREDITED");
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "30000.00"
    );

    const result = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      accredited.accreditation.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.accreditation.status, "REVERSED");
    assert.ok(result.accreditation.voidedAt);
    assert.equal(result.expectation?.status, "EXPECTED");
    assert.equal(result.expectation?.accreditedAmount, "0.00");
    assert.equal(result.expectation?.remainingExpected, "20000.00");

    const tx = await ctx.prisma.transaction.findUnique({
      where: { id: accredited.accreditation.transactionId },
    });
    assert.equal(tx?.status, "REVERSED");
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "50000.00"
    );

    const original = await ctx.prisma.transaction.findUnique({
      where: { id: expense.id },
    });
    assert.equal(original?.reimbursementStatus, "NONE");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — voiding one of two accreditations leaves PARTIALLY_ACCREDITED", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "30000.00",
    });
    const first = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p1-${randomUUID()}`,
    });
    const second = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "20000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p2-${randomUUID()}`,
    });
    assert.equal(second.expectation?.status, "ACCREDITED");

    const result = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      second.accreditation.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.expectation?.status, "PARTIALLY_ACCREDITED");
    assert.equal(result.expectation?.accreditedAmount, "10000.00");
    assert.equal(result.expectation?.remainingExpected, "20000.00");

    const stillActive = await ctx.prisma.transaction.findUnique({
      where: { id: first.accreditation.transactionId },
    });
    assert.equal(stillActive?.status, "ACTIVE");
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "40000.00"
    );

    const original = await ctx.prisma.transaction.findUnique({
      where: { id: expense.id },
    });
    assert.equal(original?.reimbursementStatus, "PARTIAL");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — bank accreditation void gives the money back to the card debt", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const accredited = await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "15000.00",
      destinationType: "BANK_ACCOUNT",
      accountId: ctx.account.id,
      idempotencyKey: `bank-${randomUUID()}`,
    });
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      "515000.00"
    );

    const result = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      accredited.accreditation.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );
    assert.equal(result.accreditation.status, "REVERSED");
    assert.equal(result.expectation, null);
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      "500000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — accreditation void is idempotent and rejects a second key", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const accredited = await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `acc-${randomUUID()}`,
    });
    const key = `void-${randomUUID()}`;

    const first = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      accredited.accreditation.id,
      { idempotencyKey: key }
    );
    const replay = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      accredited.accreditation.id,
      { idempotencyKey: key }
    );

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.accreditation.id, first.accreditation.id);
    assert.equal(replay.accreditation.status, "REVERSED");
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "REFUND_ACCREDITATION_VOID" },
      }),
      1
    );

    await assert.rejects(
      () =>
        ctx.refundService.voidAccreditation(
          ctx.user.id,
          accredited.accreditation.id,
          { idempotencyKey: `other-${randomUUID()}` }
        ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "REFUND_ACCREDITATION_ALREADY_VOIDED"
    );

    await assert.rejects(
      () =>
        ctx.refundService.voidAccreditation(randomUUID(), accredited.accreditation.id, {
          idempotencyKey: `foreign-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.15 — a cancelled expectation is never resurrected by a void", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "20000.00",
    });
    const accredited = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "5000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `acc-${randomUUID()}`,
    });
    const closed = await ctx.refundService.cancelExpected(
      ctx.user.id,
      expected.id
    );
    assert.equal(closed.status, "ACCREDITED");

    const result = await ctx.refundService.voidAccreditation(
      ctx.user.id,
      accredited.accreditation.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );
    assert.equal(result.expectation?.status, "CANCELLED");
    assert.equal(result.expectation?.accreditedAmount, "0.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});
