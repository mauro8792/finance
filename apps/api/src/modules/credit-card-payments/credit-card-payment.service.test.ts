import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { AuthContext } from "../auth/auth.types.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { BudgetService } from "../budgets/budget.service.js";
import { PrismaBudgetRepository } from "../budgets/budget.repository.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { FinancialService } from "../financial/financial.service.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { CreditCardPaymentController } from "./credit-card-payment.controller.js";
import { PrismaCreditCardPaymentRepository } from "./credit-card-payment.repository.js";
import { CreditCardPaymentService } from "./credit-card-payment.service.js";
import { CreditCardPurchaseService } from "../credit-card-purchases/credit-card-purchase.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { CreditCardStatementController } from "../credit-card-statements/credit-card-statement.controller.js";
import { PrismaCreditCardStatementRepository } from "../credit-card-statements/credit-card-statement.repository.js";
import { CreditCardStatementService } from "../credit-card-statements/credit-card-statement.service.js";
import { CreditCardController } from "../credit-cards/credit-card.controller.js";
import { computeCurrentCardDebt } from "../credit-cards/credit-card-debt.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { createCreditCardRouter } from "../credit-cards/credit-card.routes.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { buildTransactionsCsv } from "../transactions/transaction-csv.js";
import { balanceDirection } from "../transactions/transaction-balance.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { AppError } from "../../shared/errors/app-error.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Payment",
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

  const paymentRepo = new PrismaCreditCardPaymentRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const statementRepo = new PrismaCreditCardStatementRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const paymentService = new CreditCardPaymentService(
    paymentRepo,
    cardRepo,
    txRepo
  );
  const cardService = new CreditCardService(
    cardRepo,
    txRepo,
    new PrismaCreditCardPurchaseRepository(prisma)
  );
  const statementService = new CreditCardStatementService(
    statementRepo,
    cardRepo,
    txRepo,
    paymentRepo
  );
  const accountService = new AccountService(accountRepo, txRepo);

  return {
    prisma,
    user,
    category,
    account,
    card,
    paymentService,
    cardService,
    statementService,
    accountService,
    paymentRepo,
    txRepo,
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
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

test("P0.10 matrix — CREDIT_CARD_PAYMENT balanceDirection debit; spending/budget 0", () => {
  assert.equal(
    balanceDirection({
      type: "CREDIT_CARD_PAYMENT",
      metadata: null,
      accountId: "acc",
      creditCardId: "card",
    }),
    "debit"
  );
});

test("P0.10 debt formula — expenses minus payments, floor 0", () => {
  assert.equal(
    computeCurrentCardDebt([
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "150000.00",
        creditCardId: "c",
      },
      {
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "100000.00",
        creditCardId: "c",
      },
    ]),
    "50000.00"
  );
  assert.equal(
    computeCurrentCardDebt([
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "100.00",
        creditCardId: "c",
      },
      {
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "100.00",
        creditCardId: "c",
      },
      {
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "1.00",
        creditCardId: "c",
      },
    ]),
    "0.00"
  );
});

test("P0.10 A/B/C/O/P — partial/full/overpayment + bank/debt/spending", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "300000.00");
    const beforeDebt = await ctx.cardService.getCommitments(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(beforeDebt.currentCardDebt, "300000.00");
    const beforeBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    assert.equal(beforeBal.balance, "500000.00");

    const partial = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "200000.00",
      idempotencyKey: `pay-partial-${randomUUID()}`,
    });
    assert.equal(partial.created, true);
    assert.equal(partial.payment.amount, "200000.00");

    const midDebt = await ctx.cardService.getCommitments(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(midDebt.currentCardDebt, "100000.00");
    assert.equal(midDebt.futureInstallmentCommitment, "0.00");
    const midBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    assert.equal(midBal.balance, "300000.00");

    const financial = new FinancialService(
      new PrismaTransactionRepository(ctx.prisma),
      new PrismaAccountRepository(ctx.prisma)
    );
    const summary = await financial.getFinancialSummary(
      ctx.user.id,
      2026,
      9,
      DEFAULT_USER_TIMEZONE
    );
    assert.equal(summary.monthlyGrossExpenses, "300000.00");

    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "100000.00",
      idempotencyKey: `pay-full-${randomUUID()}`,
    });
    const zeroDebt = await ctx.cardService.getCommitments(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(zeroDebt.currentCardDebt, "0.00");

    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1.00",
          idempotencyKey: `pay-over-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && /deuda actual/i.test(err.message)
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 D/E/F/G — wrong user / inactive card / wrong account / currency", async () => {
  const ctx = await seedBase();
  let otherId: string | null = null;
  try {
    await addCardExpense(ctx, "10000.00");
    const other = await ctx.prisma.user.create({
      data: {
        name: "Other",
        email: `${randomUUID()}@qa.invalid`,
        passwordHash: "x",
      },
    });
    otherId = other.id;
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: other.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1000.00",
          idempotencyKey: `x-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && /Tarjeta no encontrada/i.test(err.message)
    );

    await ctx.prisma.creditCard.update({
      where: { id: ctx.card.id },
      data: { isActive: false },
    });
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1000.00",
          idempotencyKey: `inactive-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && /inactiva/i.test(err.message)
    );
    await ctx.prisma.creditCard.update({
      where: { id: ctx.card.id },
      data: { isActive: true },
    });

    const foreignAccount = await ctx.prisma.account.create({
      data: {
        userId: other.id,
        name: "Foreign",
        currency: "ARS",
        type: "BANK",
      },
    });
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: foreignAccount.id,
          amount: "1000.00",
          idempotencyKey: `acc-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && /Cuenta no encontrada/i.test(err.message)
    );

    const usdAccount = await ctx.prisma.account.create({
      data: {
        userId: ctx.user.id,
        name: "USD",
        currency: "USD",
        type: "BANK",
      },
    });
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: usdAccount.id,
          amount: "1000.00",
          idempotencyKey: `fx-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && /moneda/i.test(err.message)
    );
  } finally {
    await cleanup(ctx.user.id);
    if (otherId) {
      await ctx.prisma.account.deleteMany({ where: { userId: otherId } });
      await ctx.prisma.user.delete({ where: { id: otherId } }).catch(() => undefined);
    }
  }
});

test("P0.10 H/U — payment without statement reduces P0.5 debt", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "50000.00");
    const pay = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "20000.00",
      statementId: null,
      idempotencyKey: `nostmt-${randomUUID()}`,
    });
    assert.equal(pay.payment.statementId, null);
    const debt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(debt.currentCardDebt, "30000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 I/J/K/L/M — statement PROJECTED reject; CLOSED→PARTIAL→PAID; no more", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00", new Date("2026-09-05T12:00:00.000Z"));
    const projected = await ctx.statementService.getOrCreateProjected(
      ctx.user.id,
      ctx.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "10000.00",
          statementId: projected.statement.id,
          idempotencyKey: `proj-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof Error && /CLOSED o PARTIALLY_PAID/i.test(err.message)
    );

    const closed = await ctx.statementService.close(
      ctx.user.id,
      ctx.card.id,
      projected.statement.id,
      "100000.00"
    );
    assert.equal(closed.statement.status, "CLOSED");
    assert.equal(closed.targetAmount, "100000.00");

    const p1 = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "40000.00",
      statementId: closed.statement.id,
      idempotencyKey: `st1-${randomUUID()}`,
    });
    assert.equal(p1.created, true);
    const afterPartial = await ctx.statementService.getById(
      ctx.user.id,
      ctx.card.id,
      closed.statement.id
    );
    assert.equal(afterPartial.statement.status, "PARTIALLY_PAID");
    assert.equal(afterPartial.paidAmount, "40000.00");
    assert.equal(afterPartial.remainingAmount, "60000.00");

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
    assert.equal(paid.remainingAmount, "0.00");
    assert.ok((paid.payments ?? []).length >= 2);

    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1.00",
          statementId: closed.statement.id,
          idempotencyKey: `st3-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof Error &&
        (/completamente pagado|CLOSED o PARTIALLY_PAID|deuda actual/i.test(
          err.message
        ))
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 N — payment no budget impact", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "80000.00", new Date("2026-09-05T12:00:00.000Z"));
    await ctx.prisma.budget.create({
      data: {
        userId: ctx.user.id,
        categoryId: ctx.category.id,
        currency: "ARS",
        amount: "200000.00",
        year: 2026,
        month: 9,
      },
    });
    const budgets = new BudgetService(
      new PrismaBudgetRepository(ctx.prisma),
      new PrismaTransactionRepository(ctx.prisma),
      new PrismaUserRepository(ctx.prisma),
      new PrismaCategoryRepository(ctx.prisma)
    );
    const before = await budgets.listByPeriod(ctx.user.id, 2026, 9);
    const beforeConsumed = before[0]?.consumption;
    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "30000.00",
      idempotencyKey: `bud-${randomUUID()}`,
    });
    const after = await budgets.listByPeriod(ctx.user.id, 2026, 9);
    const afterConsumed = after[0]?.consumption;
    assert.equal(afterConsumed, beforeConsumed);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 Q/V — payment does not alter installments/future commitment; pays recognized debt", async () => {
  const ctx = await seedBase();
  try {
    const purchaseService = new CreditCardPurchaseService(
      new PrismaCreditCardPurchaseRepository(ctx.prisma),
      new PrismaCreditCardRepository(ctx.prisma),
      new PrismaCategoryRepository(ctx.prisma)
    );
    const purchase = await purchaseService.create(ctx.user.id, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      description: "TV",
      currency: "ARS",
      totalAmount: "300000.00",
      purchaseDate: "2026-09-07",
      installmentsCount: 3,
    });
    const before = await ctx.cardService.getCommitments(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(before.currentCardDebt, "100000.00");
    assert.equal(before.futureInstallmentCommitment, "200000.00");

    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "100000.00",
      idempotencyKey: `inst-${randomUUID()}`,
    });
    const after = await ctx.cardService.getCommitments(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(after.currentCardDebt, "0.00");
    assert.equal(after.futureInstallmentCommitment, "200000.00");
    const installments = await ctx.prisma.creditCardInstallment.findMany({
      where: { purchaseId: purchase.purchase.id },
    });
    assert.equal(installments.filter((i) => i.status === "PENDING").length, 2);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 R — concurrent overpayments protected by card lock", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const results = await Promise.allSettled([
      ctx.paymentService.create({
        userId: ctx.user.id,
        creditCardId: ctx.card.id,
        accountId: ctx.account.id,
        amount: "70000.00",
        idempotencyKey: `c1-${randomUUID()}`,
      }),
      ctx.paymentService.create({
        userId: ctx.user.id,
        creditCardId: ctx.card.id,
        accountId: ctx.account.id,
        amount: "70000.00",
        idempotencyKey: `c2-${randomUUID()}`,
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(rejected.length, 1);
    const debt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(debt.currentCardDebt, "30000.00");
    const payments = await ctx.prisma.transaction.count({
      where: {
        userId: ctx.user.id,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
      },
    });
    assert.equal(payments, 1);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 T — idempotency replay returns same payment", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "50000.00");
    const key = `idem-${randomUUID()}`;
    const first = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "10000.00",
      idempotencyKey: key,
    });
    const second = await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "10000.00",
      idempotencyKey: key,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.payment.id, first.payment.id);
    const count = await ctx.prisma.transaction.count({
      where: {
        userId: ctx.user.id,
        type: "CREDIT_CARD_PAYMENT",
      },
    });
    assert.equal(count, 1);

    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "20000.00",
          idempotencyKey: key,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 guardrail A — concurrent same key + same payload → 1 payment", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const key = `conc-same-${randomUUID()}`;
    const payload = {
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "40000.00" as const,
      idempotencyKey: key,
    };
    const beforeBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );

    const [a, b] = await Promise.all([
      ctx.paymentService.create(payload),
      ctx.paymentService.create(payload),
    ]);

    assert.equal(a.payment.id, b.payment.id);
    assert.equal(a.payment.amount, "40000.00");
    assert.equal(b.payment.amount, "40000.00");
    assert.equal(
      [a.created, b.created].filter(Boolean).length,
      1,
      "exactly one caller should observe created=true"
    );

    const payments = await ctx.prisma.transaction.findMany({
      where: {
        userId: ctx.user.id,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
      },
    });
    assert.equal(payments.length, 1);
    const links = await ctx.prisma.creditCardPaymentLink.findMany({
      where: { userId: ctx.user.id, idempotencyKey: key },
    });
    assert.equal(links.length, 1);
    assert.equal(links[0]?.transactionId, payments[0]?.id);

    const afterBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    assert.equal(
      afterBal.balance,
      (
        Number(beforeBal.balance) - 40000
      ).toFixed(2)
    );
    const debt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    assert.equal(debt.currentCardDebt, "60000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 guardrail B — concurrent same key + different payload → conflict, never 2", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00");
    const key = `conc-diff-${randomUUID()}`;
    const results = await Promise.allSettled([
      ctx.paymentService.create({
        userId: ctx.user.id,
        creditCardId: ctx.card.id,
        accountId: ctx.account.id,
        amount: "30000.00",
        idempotencyKey: key,
      }),
      ctx.paymentService.create({
        userId: ctx.user.id,
        creditCardId: ctx.card.id,
        accountId: ctx.account.id,
        amount: "50000.00",
        idempotencyKey: key,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof AppError);
    assert.equal(err.code, "IDEMPOTENCY_CONFLICT");

    const payments = await ctx.prisma.transaction.count({
      where: {
        userId: ctx.user.id,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
      },
    });
    assert.equal(payments, 1);
    const links = await ctx.prisma.creditCardPaymentLink.count({
      where: { userId: ctx.user.id, idempotencyKey: key },
    });
    assert.equal(links, 1);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 W/X — actualAmount > debt discrepancy; retroactive after PAID no reopen", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "100000.00", new Date("2026-09-05T12:00:00.000Z"));
    const projected = await ctx.statementService.getOrCreateProjected(
      ctx.user.id,
      ctx.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    const closed = await ctx.statementService.close(
      ctx.user.id,
      ctx.card.id,
      projected.statement.id,
      "150000.00"
    );
    assert.equal(closed.targetAmount, "150000.00");
    assert.equal(closed.difference, "50000.00");

    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "100000.00",
      statementId: closed.statement.id,
      idempotencyKey: `cov-${randomUUID()}`,
    });
    const paid = await ctx.statementService.getById(
      ctx.user.id,
      ctx.card.id,
      closed.statement.id
    );
    assert.equal(paid.statement.status, "PARTIALLY_PAID");
    assert.equal(paid.paidAmount, "100000.00");
    assert.equal(paid.remainingAmount, "50000.00");

    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "50000.00",
          statementId: closed.statement.id,
          idempotencyKey: `gap-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof Error && /deuda actual/i.test(err.message)
    );

    // Separate path: pay full target when debt matches, then retroactive
    await cleanup(ctx.user.id);
  } finally {
    try {
      await cleanup(ctx.user.id);
    } catch {
      /* already cleaned */
    }
  }

  const ctx2 = await seedBase();
  try {
    await addCardExpense(ctx2, "150000.00", new Date("2026-09-05T12:00:00.000Z"));
    const projected = await ctx2.statementService.getOrCreateProjected(
      ctx2.user.id,
      ctx2.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    const closed = await ctx2.statementService.close(
      ctx2.user.id,
      ctx2.card.id,
      projected.statement.id,
      null
    );
    await ctx2.paymentService.create({
      userId: ctx2.user.id,
      creditCardId: ctx2.card.id,
      accountId: ctx2.account.id,
      amount: "150000.00",
      statementId: closed.statement.id,
      idempotencyKey: `paid-${randomUUID()}`,
    });
    let view = await ctx2.statementService.getById(
      ctx2.user.id,
      ctx2.card.id,
      closed.statement.id
    );
    assert.equal(view.statement.status, "PAID");

    await addCardExpense(ctx2, "10000.00", new Date("2026-09-06T12:00:00.000Z"));
    view = await ctx2.statementService.getById(
      ctx2.user.id,
      ctx2.card.id,
      closed.statement.id
    );
    assert.equal(view.statement.status, "PAID");
    assert.equal(view.statement.closedProjectedAmount, "150000.00");
    assert.equal(view.currentDerivedAmount, "160000.00");
    assert.equal(view.hasReconciliationDifference, true);
    assert.equal(view.hasPaymentCoverageGap, true);
    assert.equal(view.paidAmount, "150000.00");
    const debt = await ctx2.cardService.getCurrentCardDebt(
      ctx2.user.id,
      ctx2.card.id
    );
    assert.equal(debt.currentCardDebt, "10000.00");
  } finally {
    await cleanup(ctx2.user.id);
  }
});

test("P0.10 Y/AA — user isolation + HTTP API payments", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "25000.00");
    const paymentRepo = new PrismaCreditCardPaymentRepository(ctx.prisma);
    const cardRepo = new PrismaCreditCardRepository(ctx.prisma);
    const txRepo = new PrismaTransactionRepository(ctx.prisma);
    const statementRepo = new PrismaCreditCardStatementRepository(ctx.prisma);
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { auth?: AuthContext }).auth = {
        userId: ctx.user.id,
        sessionId: randomUUID(),
      };
      next();
    });
    app.use(express.json());
    app.use(
      "/api/credit-cards",
      createCreditCardRouter(
        new CreditCardController(
          new CreditCardService(
            cardRepo,
            txRepo,
            new PrismaCreditCardPurchaseRepository(ctx.prisma)
          )
        ),
        new CreditCardStatementController(
          new CreditCardStatementService(
            statementRepo,
            cardRepo,
            txRepo,
            paymentRepo
          )
        ),
        new CreditCardPaymentController(
          new CreditCardPaymentService(paymentRepo, cardRepo, txRepo)
        )
      )
    );
    app.use(errorHandler);

    const created = await request(app)
      .post(`/api/credit-cards/${ctx.card.id}/payments`)
      .send({
        accountId: ctx.account.id,
        amount: "5000.00",
        idempotencyKey: `http-${randomUUID()}`,
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.amount, "5000.00");
    assert.equal(created.body.status, "ACTIVE");

    const listed = await request(app).get(
      `/api/credit-cards/${ctx.card.id}/payments`
    );
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);

    const detail = await request(app).get(
      `/api/credit-cards/${ctx.card.id}/payments/${created.body.id}`
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.id, created.body.id);

    const otherApp = express();
    otherApp.use((req, _res, next) => {
      (req as express.Request & { auth?: AuthContext }).auth = {
        userId: randomUUID(),
        sessionId: randomUUID(),
      };
      next();
    });
    otherApp.use(express.json());
    otherApp.use(
      "/api/credit-cards",
      createCreditCardRouter(
        new CreditCardController(new CreditCardService(cardRepo, txRepo)),
        new CreditCardStatementController(
          new CreditCardStatementService(
            statementRepo,
            cardRepo,
            txRepo,
            paymentRepo
          )
        ),
        new CreditCardPaymentController(
          new CreditCardPaymentService(paymentRepo, cardRepo, txRepo)
        )
      )
    );
    otherApp.use(errorHandler);
    const isolated = await request(otherApp).get(
      `/api/credit-cards/${ctx.card.id}/payments`
    );
    assert.equal(isolated.status, 404);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 Z — CSV labels CREDIT_CARD_PAYMENT as PAGO_TARJETA", () => {
  const csv = buildTransactionsCsv(
    [
      {
        id: "p1",
        userId: "u",
        accountId: "acc-1",
        creditCardId: "card-1",
        categoryId: null,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "1000.00",
        currency: "ARS",
        description: "Pago de tarjeta",
        occurredAt: new Date("2026-09-09T12:00:00.000Z"),
        paymentMethod: null,
        isFixed: false,
        reimbursementStatus: "NONE",
        relatedTransactionId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    {
      accountNameById: { "acc-1": "BBVA" },
      categoryNameById: {},
      timeZone: DEFAULT_USER_TIMEZONE,
    }
  );
  assert.match(csv, /PAGO_TARJETA/);
  assert.match(csv, /BBVA/);
  assert.ok(!csv.includes("Gasto;"));
});

test("P0.10 bank balance can go negative (MVP1 parity)", async () => {
  const ctx = await seedBase();
  try {
    await ctx.prisma.account.update({
      where: { id: ctx.account.id },
      data: { initialBalance: "50.00" },
    });
    await addCardExpense(ctx, "100.00");
    await ctx.paymentService.create({
      userId: ctx.user.id,
      creditCardId: ctx.card.id,
      accountId: ctx.account.id,
      amount: "100.00",
      idempotencyKey: `neg-${randomUUID()}`,
    });
    const bal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    assert.equal(bal.balance, "-50.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.10 edge A — target 0 rejects associated payment; close → PAID", async () => {
  const ctx = await seedBase();
  try {
    const projected = await ctx.statementService.getOrCreateProjected(
      ctx.user.id,
      ctx.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    const closed = await ctx.statementService.close(
      ctx.user.id,
      ctx.card.id,
      projected.statement.id,
      null
    );
    assert.equal(closed.statement.status, "PAID");
    assert.equal(closed.targetAmount, "0.00");
    await addCardExpense(ctx, "1000.00");
    await assert.rejects(
      () =>
        ctx.paymentService.create({
          userId: ctx.user.id,
          creditCardId: ctx.card.id,
          accountId: ctx.account.id,
          amount: "1.00",
          statementId: closed.statement.id,
          idempotencyKey: `zero-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof Error &&
        (/objetivo pagable|CLOSED o PARTIALLY_PAID|completamente pagado/i.test(
          err.message
        ))
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});
