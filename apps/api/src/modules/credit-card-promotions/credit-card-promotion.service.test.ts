import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { BudgetService } from "../budgets/budget.service.js";
import { PrismaBudgetRepository } from "../budgets/budget.repository.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { FinancialService } from "../financial/financial.service.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { CreditCardPurchaseService } from "../credit-card-purchases/credit-card-purchase.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaCreditCardRefundRepository } from "../credit-card-refunds/credit-card-refund.repository.js";
import { CreditCardRefundService } from "../credit-card-refunds/credit-card-refund.service.js";
import { PrismaCreditCardPromotionRepository } from "./credit-card-promotion.repository.js";
import { CreditCardPromotionService } from "./credit-card-promotion.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Promo",
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

  const promoRepo = new PrismaCreditCardPromotionRepository(prisma);
  const refundRepo = new PrismaCreditCardRefundRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const categoryRepo = new PrismaCategoryRepository(prisma);
  const purchaseRepo = new PrismaCreditCardPurchaseRepository(prisma);

  return {
    prisma,
    user,
    category,
    account,
    card,
    promoService: new CreditCardPromotionService(promoRepo),
    refundService: new CreditCardRefundService(refundRepo),
    cardService: new CreditCardService(cardRepo, txRepo, purchaseRepo),
    accountService: new AccountService(accountRepo, txRepo),
    financial: new FinancialService(txRepo, accountRepo),
    budgetService: new BudgetService(
      new PrismaBudgetRepository(prisma),
      txRepo,
      new PrismaUserRepository(prisma),
      categoryRepo
    ),
    purchaseService: new CreditCardPurchaseService(
      purchaseRepo,
      cardRepo,
      categoryRepo
    ),
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardPromotionApplication.deleteMany({ where: { userId } });
  await prisma.creditCardRefundAccreditation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
  await prisma.creditCardPromotion.deleteMany({ where: { userId } });
  await prisma.creditCardPaymentLink.deleteMany({ where: { userId } });
  await prisma.creditCardInstallment.deleteMany({
    where: { purchase: { userId } },
  });
  await prisma.creditCardPurchase.deleteMany({ where: { userId } });
  await prisma.creditCardStatement.deleteMany({ where: { userId } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.creditCard.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function addCardExpense(
  ctx: Awaited<ReturnType<typeof seedBase>>,
  amount: string,
  occurredAt = new Date("2026-09-10T12:00:00.000Z")
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

async function createPctPromo(
  ctx: Awaited<ReturnType<typeof seedBase>>,
  overrides: Partial<{
    percentage: string;
    capAmount: string | null;
    capPeriod: "NONE" | "PER_PURCHASE" | "MONTHLY" | "PROMOTION_PERIOD";
    minimumPurchaseAmount: string | null;
    validFrom: Date;
    validUntil: Date;
    name: string;
  }> = {}
) {
  const capPeriod = overrides.capPeriod ?? "NONE";
  return ctx.promoService.create({
    userId: ctx.user.id,
    creditCardId: ctx.card.id,
    name: overrides.name ?? "Promo 20%",
    currency: "ARS",
    benefitType: "PERCENTAGE",
    percentage: overrides.percentage ?? "0.200000",
    fixedAmount: null,
    minimumPurchaseAmount: overrides.minimumPurchaseAmount ?? null,
    capAmount: overrides.capAmount ?? null,
    capPeriod,
    validFrom: overrides.validFrom ?? new Date("2026-01-01T00:00:00.000Z"),
    validUntil: overrides.validUntil ?? new Date("2026-12-31T23:59:59.000Z"),
  });
}

test("P0.12 — percentage no cap creates expected without financial impact", async () => {
  const ctx = await seedBase();
  try {
    await ctx.budgetService.create(ctx.user.id, {
      categoryId: ctx.category.id,
      currency: "ARS",
      amount: "200000.00",
      year: 2026,
      month: 9,
    });
    const expense = await addCardExpense(ctx, "80000.00");
    const promo = await createPctPromo(ctx);
    const beforeBal = await ctx.accountService.getBalance(ctx.user.id, ctx.account.id);
    const beforeDebt = await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id);

    const applied = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: `apply-${randomUUID()}`,
    });

    assert.equal(applied.created, true);
    assert.equal(applied.expectation.expectedAmount, "16000.00");
    assert.equal(applied.expectation.status, "EXPECTED");
    assert.equal(applied.expectation.promotionId, promo.id);
    assert.equal(applied.expectation.cancelledRemainingAmount, "0.00");
    assert.equal(applied.calculation.limitedBy, "NONE");

    const afterBal = await ctx.accountService.getBalance(ctx.user.id, ctx.account.id);
    const afterDebt = await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id);
    assert.equal(afterBal.balance, beforeBal.balance);
    assert.equal(afterDebt.currentCardDebt, beforeDebt.currentCardDebt);

    const budgets = await ctx.budgetService.listByPeriod(ctx.user.id, 2026, 9);
    assert.equal(budgets[0]?.consumption, "80000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — monthly cap two purchases 25k → 16k then 9k", async () => {
  const ctx = await seedBase();
  try {
    const promo = await createPctPromo(ctx, {
      capAmount: "25000.00",
      capPeriod: "MONTHLY",
    });
    const e1 = await addCardExpense(ctx, "80000.00", new Date("2026-09-05T12:00:00.000Z"));
    const e2 = await addCardExpense(ctx, "100000.00", new Date("2026-09-15T12:00:00.000Z"));

    const a1 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: e1.id,
      idempotencyKey: `m1-${randomUUID()}`,
    });
    assert.equal(a1.expectation.expectedAmount, "16000.00");

    const a2 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: e2.id,
      idempotencyKey: `m2-${randomUUID()}`,
    });
    assert.equal(a2.expectation.expectedAmount, "9000.00");
    assert.equal(a2.calculation.limitedBy, "CAP");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — per-purchase cap + fixed + min fail/pass", async () => {
  const ctx = await seedBase();
  try {
    const perPurchase = await createPctPromo(ctx, {
      percentage: "0.500000",
      capAmount: "10000.00",
      capPeriod: "PER_PURCHASE",
      name: "50% cap 10k",
    });
    const expense = await addCardExpense(ctx, "80000.00");
    const capped = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: perPurchase.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: `pp-${randomUUID()}`,
    });
    assert.equal(capped.expectation.expectedAmount, "10000.00");

    const fixed = await ctx.promoService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      name: "Fixed 5k",
      currency: "ARS",
      benefitType: "FIXED_AMOUNT",
      percentage: null,
      fixedAmount: "5000.00",
      minimumPurchaseAmount: null,
      capAmount: null,
      capPeriod: "NONE",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T23:59:59.000Z"),
    });
    const eFixed = await addCardExpense(ctx, "20000.00", new Date("2026-09-11T12:00:00.000Z"));
    const fixedApply = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: fixed.id,
      originalExpenseTransactionId: eFixed.id,
      idempotencyKey: `fx-${randomUUID()}`,
    });
    assert.equal(fixedApply.expectation.expectedAmount, "5000.00");

    const fixedBig = await ctx.promoService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      name: "Fixed 50k",
      currency: "ARS",
      benefitType: "FIXED_AMOUNT",
      percentage: null,
      fixedAmount: "50000.00",
      minimumPurchaseAmount: null,
      capAmount: null,
      capPeriod: "NONE",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T23:59:59.000Z"),
    });
    const eSmall = await addCardExpense(ctx, "12000.00", new Date("2026-09-12T12:00:00.000Z"));
    const bigApply = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: fixedBig.id,
      originalExpenseTransactionId: eSmall.id,
      idempotencyKey: `fxb-${randomUUID()}`,
    });
    assert.equal(bigApply.expectation.expectedAmount, "12000.00");
    assert.equal(bigApply.calculation.limitedBy, "SOURCE_REMAINING");

    const minPromo = await createPctPromo(ctx, {
      minimumPurchaseAmount: "50000.00",
      name: "Min 50k",
    });
    const eLow = await addCardExpense(ctx, "10000.00", new Date("2026-09-13T12:00:00.000Z"));
    await assert.rejects(
      () =>
        ctx.promoService.apply({
          userId: ctx.user.id,
          promotionId: minPromo.id,
          originalExpenseTransactionId: eLow.id,
          idempotencyKey: `minf-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "BELOW_MINIMUM"
    );

    const eHigh = await addCardExpense(ctx, "60000.00", new Date("2026-09-14T12:00:00.000Z"));
    const minOk = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: minPromo.id,
      originalExpenseTransactionId: eHigh.id,
      idempotencyKey: `minp-${randomUUID()}`,
    });
    assert.equal(minOk.expectation.expectedAmount, "12000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — cancel releases unaccredited; accredited keeps consuming", async () => {
  const ctx = await seedBase();
  try {
    const promo = await createPctPromo(ctx, {
      capAmount: "25000.00",
      capPeriod: "MONTHLY",
    });
    const e1 = await addCardExpense(ctx, "80000.00", new Date("2026-09-05T12:00:00.000Z"));
    const e2 = await addCardExpense(ctx, "100000.00", new Date("2026-09-15T12:00:00.000Z"));
    const e3 = await addCardExpense(ctx, "100000.00", new Date("2026-09-20T12:00:00.000Z"));

    const a1 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: e1.id,
      idempotencyKey: `c1-${randomUUID()}`,
    });
    assert.equal(a1.expectation.expectedAmount, "16000.00");

    const cancelled = await ctx.refundService.cancelExpected(
      ctx.user.id,
      a1.expectation.id
    );
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.cancelledRemainingAmount, "16000.00");

    const a2 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: e2.id,
      idempotencyKey: `c2-${randomUUID()}`,
    });
    // Cap fully released after cancel → 20% of 100k
    assert.equal(a2.expectation.expectedAmount, "20000.00");

    await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: a2.expectation.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `acc-${randomUUID()}`,
    });
    const cancelledPartial = await ctx.refundService.cancelExpected(
      ctx.user.id,
      a2.expectation.id
    );
    assert.equal(cancelledPartial.status, "ACCREDITED");
    assert.equal(cancelledPartial.cancelledRemainingAmount, "10000.00");

    const a3 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: e3.id,
      idempotencyKey: `c3-${randomUUID()}`,
    });
    // Cap 25k; consumed from a2 = 20k - 10k = 10k → remaining 15k; raw 20k → 15k
    assert.equal(a3.expectation.expectedAmount, "15000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — inactive/expired/wrong card/currency + preview no write + idempotent", async () => {
  const ctx = await seedBase();
  try {
    const otherCard = await ctx.prisma.creditCard.create({
      data: {
        userId: ctx.user.id,
        name: "Amex",
        issuer: "Galicia",
        brand: "Amex",
        currency: "ARS",
        isActive: true,
      },
    });
    const promo = await createPctPromo(ctx);
    const expense = await addCardExpense(ctx, "50000.00");

    const preview = await ctx.promoService.preview({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: expense.id,
    });
    assert.equal(preview.calculation.expectedAmount, "10000.00");
    const countAfterPreview = await ctx.prisma.creditCardRefundExpectation.count({
      where: { userId: ctx.user.id },
    });
    assert.equal(countAfterPreview, 0);

    await ctx.promoService.deactivate(ctx.user.id, promo.id);
    await assert.rejects(
      () =>
        ctx.promoService.apply({
          userId: ctx.user.id,
          promotionId: promo.id,
          originalExpenseTransactionId: expense.id,
          idempotencyKey: `inact-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );
    await ctx.promoService.activate(ctx.user.id, promo.id);

    const expired = await createPctPromo(ctx, {
      name: "Expired",
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
      validUntil: new Date("2025-06-01T00:00:00.000Z"),
    });
    await assert.rejects(
      () =>
        ctx.promoService.apply({
          userId: ctx.user.id,
          promotionId: expired.id,
          originalExpenseTransactionId: expense.id,
          idempotencyKey: `exp-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );

    const wrongCard = await ctx.promoService.create({
      userId: ctx.user.id,
      creditCardId: otherCard.id,
      name: "Other card",
      currency: "ARS",
      benefitType: "PERCENTAGE",
      percentage: "0.100000",
      fixedAmount: null,
      minimumPurchaseAmount: null,
      capAmount: null,
      capPeriod: "NONE",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T23:59:59.000Z"),
    });
    await assert.rejects(
      () =>
        ctx.promoService.apply({
          userId: ctx.user.id,
          promotionId: wrongCard.id,
          originalExpenseTransactionId: expense.id,
          idempotencyKey: `wc-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );

    const key = `idem-${randomUUID()}`;
    const first = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: key,
    });
    const replay = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: key,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.expectation.id, first.expectation.id);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — pending installment excluded; multiple promos vs source; manual participates", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await ctx.purchaseService.create(ctx.user.id, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      totalAmount: "30000.00",
      currency: "ARS",
      installmentsCount: 3,
      purchaseDate: "2026-09-10",
      description: "3 cuotas",
    });
    const promo = await createPctPromo(ctx, { percentage: "0.100000", name: "10%" });
    const applied = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: promo.id,
      purchaseId: purchase.purchase.id,
      idempotencyKey: `pend-${randomUUID()}`,
    });
    // Only first installment recognized (10000)
    assert.equal(applied.expectation.expectedAmount, "1000.00");
    assert.equal(applied.calculation.eligibleBase, "10000.00");

    const expense = await addCardExpense(ctx, "20000.00", new Date("2026-09-16T12:00:00.000Z"));
    const p1 = await createPctPromo(ctx, { percentage: "0.300000", name: "P1" });
    const p2 = await createPctPromo(ctx, { percentage: "0.300000", name: "P2" });
    const a1 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: p1.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: `mp1-${randomUUID()}`,
    });
    assert.equal(a1.expectation.expectedAmount, "6000.00");
    const a2 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: p2.id,
      originalExpenseTransactionId: expense.id,
      idempotencyKey: `mp2-${randomUUID()}`,
    });
    assert.equal(a2.expectation.expectedAmount, "6000.00");
    await assert.rejects(
      () =>
        ctx.promoService.apply({
          userId: ctx.user.id,
          promotionId: p1.id,
          originalExpenseTransactionId: expense.id,
          idempotencyKey: `mp3-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError &&
        (err.code === "IDEMPOTENCY_CONFLICT" || err.statusCode === 400)
    );

    const expense2 = await addCardExpense(ctx, "10000.00", new Date("2026-09-17T12:00:00.000Z"));
    await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense2.id,
      expectedAmount: "7000.00",
    });
    const p3 = await createPctPromo(ctx, { percentage: "0.500000", name: "P3" });
    const a3 = await ctx.promoService.apply({
      userId: ctx.user.id,
      promotionId: p3.id,
      originalExpenseTransactionId: expense2.id,
      idempotencyKey: `man-${randomUUID()}`,
    });
    assert.equal(a3.expectation.expectedAmount, "3000.00");
    assert.equal(a3.calculation.limitedBy, "SOURCE_REMAINING");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.12 — concurrent monthly cap + P0.11 accredit still works", async () => {
  const ctx = await seedBase();
  try {
    const promo = await createPctPromo(ctx, {
      capAmount: "25000.00",
      capPeriod: "MONTHLY",
    });
    const e1 = await addCardExpense(ctx, "80000.00", new Date("2026-09-05T12:00:00.000Z"));
    const e2 = await addCardExpense(ctx, "80000.00", new Date("2026-09-06T12:00:00.000Z"));

    const results = await Promise.allSettled([
      ctx.promoService.apply({
        userId: ctx.user.id,
        promotionId: promo.id,
        originalExpenseTransactionId: e1.id,
        idempotencyKey: `conc-a-${randomUUID()}`,
      }),
      ctx.promoService.apply({
        userId: ctx.user.id,
        promotionId: promo.id,
        originalExpenseTransactionId: e2.id,
        idempotencyKey: `conc-b-${randomUUID()}`,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled") as Array<
      PromiseFulfilledResult<Awaited<ReturnType<typeof ctx.promoService.apply>>>
    >;
    assert.equal(fulfilled.length, 2);
    const amounts = fulfilled
      .map((r) => r.value.expectation.expectedAmount)
      .sort();
    assert.deepEqual(amounts, ["16000.00", "9000.00"]);

    const exp = fulfilled[0]!.value.expectation;
    const accredited = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: exp.id,
      amount: exp.expectedAmount,
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p11-${randomUUID()}`,
    });
    assert.equal(accredited.created, true);
    assert.equal(accredited.expectation?.status, "ACCREDITED");
  } finally {
    await cleanup(ctx.user.id);
  }
});
