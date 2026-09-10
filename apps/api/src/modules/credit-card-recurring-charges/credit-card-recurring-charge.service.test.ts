import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaCreditCardRecurringChargeRepository } from "./credit-card-recurring-charge.repository.js";
import { CreditCardRecurringChargeService } from "./credit-card-recurring-charge.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Recurring",
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

  const recurringRepo = new PrismaCreditCardRecurringChargeRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const purchaseRepo = new PrismaCreditCardPurchaseRepository(prisma);
  const recurringService = new CreditCardRecurringChargeService(recurringRepo);
  const cardService = new CreditCardService(cardRepo, txRepo, purchaseRepo);
  const accountService = new AccountService(
    new PrismaAccountRepository(prisma),
    txRepo
  );

  return {
    prisma,
    user,
    category,
    account,
    card,
    recurringService,
    cardService,
    accountService,
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardRecurringChargeOccurrence.deleteMany({ where: { userId } });
  await prisma.creditCardRecurringCharge.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

test("P0.13 — template create and fee fields change do not affect debt", async () => {
  const ctx = await seedBase();
  try {
    const beforeDebt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    const beforeBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );

    const template = await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "MAINTENANCE",
      categoryId: ctx.category.id,
      description: "Mantenimiento Visa",
      expectedAmount: "8500.00",
      dayOfMonthHint: 15,
    });
    assert.equal(template.isActive, true);
    assert.equal(template.expectedAmount, "8500.00");
    assert.equal(template.currency, "ARS");

    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      beforeDebt.currentCardDebt
    );
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id)).balance,
      beforeBal.balance
    );

    await ctx.cardService.update(ctx.user.id, ctx.card.id, {
      feeStatus: "HAS_FEE",
      feeExpectedAmount: "12000.00",
      feeNotes: "Pack premium",
    });
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      beforeDebt.currentCardDebt
    );

    await ctx.recurringService.update({
      userId: ctx.user.id,
      id: template.id,
      expectedAmount: null,
    });
    const updated = await ctx.recurringService.get(ctx.user.id, template.id);
    assert.equal(updated.expectedAmount, null);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.13 — confirm creates EXPENSE with accountId null and increases debt", async () => {
  const ctx = await seedBase();
  try {
    const template = await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "RECURRING_SERVICE",
      categoryId: ctx.category.id,
      description: "Spotify",
      expectedAmount: "4500.00",
    });

    const result = await ctx.recurringService.confirm({
      userId: ctx.user.id,
      recurringChargeId: template.id,
      occurrenceKey: "2026-09",
      amount: "4500.00",
      idempotencyKey: `confirm-${randomUUID()}`,
    });
    assert.equal(result.created, true);
    assert.equal(result.occurrence.amount, "4500.00");

    const tx = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: result.occurrence.transactionId },
    });
    assert.equal(tx.type, "EXPENSE");
    assert.equal(tx.accountId, null);
    assert.equal(tx.creditCardId, ctx.card.id);
    assert.equal(tx.categoryId, ctx.category.id);
    assert.equal(tx.isFixed, false);
    assert.deepEqual(tx.metadata, {
      recurringChargeId: template.id,
      occurrenceKey: "2026-09",
      kind: "RECURRING_SERVICE",
    });

    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "4500.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.13 — idempotent replay and conflict", async () => {
  const ctx = await seedBase();
  try {
    const template = await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "OTHER",
      categoryId: ctx.category.id,
      description: "Servicio variable",
      expectedAmount: null,
    });
    const key = `idem-${randomUUID()}`;
    const first = await ctx.recurringService.confirm({
      userId: ctx.user.id,
      recurringChargeId: template.id,
      occurrenceKey: "2026-09",
      amount: "3200.00",
      idempotencyKey: key,
    });
    const second = await ctx.recurringService.confirm({
      userId: ctx.user.id,
      recurringChargeId: template.id,
      occurrenceKey: "2026-09",
      amount: "3200.00",
      idempotencyKey: key,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.occurrence.transactionId, first.occurrence.transactionId);

    await assert.rejects(
      () =>
        ctx.recurringService.confirm({
          userId: ctx.user.id,
          recurringChargeId: template.id,
          occurrenceKey: "2026-09",
          amount: "5000.00",
          idempotencyKey: key,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT"
    );

    await assert.rejects(
      () =>
        ctx.recurringService.confirm({
          userId: ctx.user.id,
          recurringChargeId: template.id,
          occurrenceKey: "2026-09",
          amount: "3200.00",
          idempotencyKey: `other-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.13 — deactivate then confirm rejects; amount must be > 0", async () => {
  const ctx = await seedBase();
  try {
    const template = await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "INSURANCE",
      categoryId: ctx.category.id,
      description: "Seguro",
      expectedAmount: "2000.00",
    });
    await ctx.recurringService.deactivate(ctx.user.id, template.id);

    await assert.rejects(
      () =>
        ctx.recurringService.confirm({
          userId: ctx.user.id,
          recurringChargeId: template.id,
          occurrenceKey: "2026-09",
          amount: "2000.00",
          idempotencyKey: `inactive-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );

    await ctx.recurringService.activate(ctx.user.id, template.id);
    await assert.rejects(
      () =>
        ctx.recurringService.confirm({
          userId: ctx.user.id,
          recurringChargeId: template.id,
          occurrenceKey: "2026-09",
          amount: "0.00",
          idempotencyKey: `zero-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.13 — outlook lists templates with occurrence status and expected sum", async () => {
  const ctx = await seedBase();
  try {
    const fixed = await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "MAINTENANCE",
      categoryId: ctx.category.id,
      description: "Mantenimiento",
      expectedAmount: "8500.00",
    });
    await ctx.recurringService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      kind: "OTHER",
      categoryId: ctx.category.id,
      description: "Variable",
      expectedAmount: null,
    });

    await ctx.recurringService.confirm({
      userId: ctx.user.id,
      recurringChargeId: fixed.id,
      occurrenceKey: "2026-09",
      amount: "8500.00",
      idempotencyKey: `outlook-${randomUUID()}`,
    });

    const outlook = await ctx.recurringService.outlook(
      ctx.user.id,
      ctx.card.id,
      2026,
      10
    );
    assert.equal(outlook.occurrenceKey, "2026-10");
    assert.equal(outlook.items.length, 2);
    assert.equal(outlook.expectedSumFixed, "8500.00");
    assert.equal(outlook.variableCountPending, 1);
    assert.equal(outlook.items.every((item) => !item.hasOccurrence), true);
  } finally {
    await cleanup(ctx.user.id);
  }
});
