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
import { CreditCardPurchaseService } from "../credit-card-purchases/credit-card-purchase.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { CreditCardStatementService } from "../credit-card-statements/credit-card-statement.service.js";
import { PrismaCreditCardStatementRepository } from "../credit-card-statements/credit-card-statement.repository.js";
import { PrismaCreditCardPaymentRepository } from "../credit-card-payments/credit-card-payment.repository.js";
import { computeCurrentCardDebt } from "../credit-cards/credit-card-debt.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import { balanceDirection } from "../transactions/transaction-balance.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { AppError } from "../../shared/errors/app-error.js";
import { CreditCardRefundController } from "./credit-card-refund.controller.js";
import { PrismaCreditCardRefundRepository } from "./credit-card-refund.repository.js";
import { createCreditCardRefundRouter } from "./credit-card-refund.routes.js";
import { CreditCardRefundService } from "./credit-card-refund.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Refund",
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

  const refundRepo = new PrismaCreditCardRefundRepository(prisma);
  const cardRepo = new PrismaCreditCardRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const categoryRepo = new PrismaCategoryRepository(prisma);
  const purchaseRepo = new PrismaCreditCardPurchaseRepository(prisma);
  const refundService = new CreditCardRefundService(refundRepo);
  const cardService = new CreditCardService(cardRepo, txRepo, purchaseRepo);
  const accountService = new AccountService(accountRepo, txRepo);
  const financial = new FinancialService(txRepo, accountRepo);
  const budgetService = new BudgetService(
    new PrismaBudgetRepository(prisma),
    txRepo,
    new PrismaUserRepository(prisma),
    categoryRepo
  );
  const purchaseService = new CreditCardPurchaseService(
    purchaseRepo,
    cardRepo,
    categoryRepo
  );
  const statementService = new CreditCardStatementService(
    new PrismaCreditCardStatementRepository(prisma),
    cardRepo,
    txRepo,
    new PrismaCreditCardPaymentRepository(prisma)
  );
  const txService = new TransactionService(
    txRepo,
    accountRepo,
    categoryRepo,
    cardRepo
  );

  return {
    prisma,
    user,
    category,
    account,
    card,
    refundService,
    cardService,
    accountService,
    financial,
    budgetService,
    purchaseService,
    statementService,
    txService,
    txRepo,
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.creditCardRefundAccreditation.deleteMany({ where: { userId } });
  await prisma.creditCardRefundExpectation.deleteMany({ where: { userId } });
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

test("P0.11 AC — debt formula subtracts card REIMBURSEMENT; balanceDirection null without account", () => {
  assert.equal(
    balanceDirection({
      type: "REIMBURSEMENT",
      metadata: null,
      accountId: null,
      creditCardId: "card",
    }),
    null
  );
  assert.equal(
    balanceDirection({
      type: "REIMBURSEMENT",
      metadata: null,
      accountId: "acc",
      creditCardId: null,
    }),
    "credit"
  );
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
        amount: "40000.00",
        creditCardId: "c",
      },
      {
        type: "REIMBURSEMENT",
        status: "ACTIVE",
        amount: "30000.00",
        creditCardId: "c",
      },
    ]),
    "80000.00"
  );
});

test("P0.11 A/B/C/D/E — EXPECTED/cancel: no bank, debt, spending, budget impact", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "100000.00");
    await ctx.budgetService.create(ctx.user.id, {
      categoryId: ctx.category.id,
      currency: "ARS",
      amount: "200000.00",
      year: 2026,
      month: 9,
    });

    const beforeBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    const beforeDebt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    const beforeNet = await ctx.financial.getMonthlyNetExpenses(
      ctx.user.id,
      2026,
      9,
      DEFAULT_USER_TIMEZONE
    );
    const budgetsBefore = await ctx.budgetService.listByPeriod(
      ctx.user.id,
      2026,
      9
    );
    const consumptionBefore = budgetsBefore[0]?.consumption;

    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "20000.00",
      description: "Promo 20%",
    });
    assert.equal(expected.status, "EXPECTED");
    assert.equal(expected.accreditedAmount, "0.00");
    assert.equal(expected.remainingExpected, "20000.00");

    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id))
        .balance,
      beforeBal.balance
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      beforeDebt.currentCardDebt
    );
    assert.equal(
      await ctx.financial.getMonthlyNetExpenses(
        ctx.user.id,
        2026,
        9,
        DEFAULT_USER_TIMEZONE
      ),
      beforeNet
    );
    const budgetsMid = await ctx.budgetService.listByPeriod(
      ctx.user.id,
      2026,
      9
    );
    assert.equal(budgetsMid[0]?.consumption, consumptionBefore);

    const cancelled = await ctx.refundService.cancelExpected(
      ctx.user.id,
      expected.id
    );
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.remainingExpected, "0.00");
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id))
        .balance,
      beforeBal.balance
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      beforeDebt.currentCardDebt
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 F/G/J/AA — accredit CARD: debt↓ net↓ bank same gross same budget↓", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "100000.00");
    await ctx.budgetService.create(ctx.user.id, {
      categoryId: ctx.category.id,
      currency: "ARS",
      amount: "200000.00",
      year: 2026,
      month: 9,
    });
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "20000.00",
    });

    const beforeBal = await ctx.accountService.getBalance(
      ctx.user.id,
      ctx.account.id
    );
    const result = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "20000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `card-${randomUUID()}`,
    });
    assert.equal(result.created, true);
    assert.equal(result.accreditation.destinationType, "CREDIT_CARD");
    assert.equal(result.accreditation.accountId, null);
    assert.equal(result.expectation?.status, "ACCREDITED");

    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id))
        .balance,
      beforeBal.balance
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "80000.00"
    );
    const summary = await ctx.financial.getFinancialSummary(
      ctx.user.id,
      2026,
      9,
      DEFAULT_USER_TIMEZONE
    );
    assert.equal(summary.monthlyGrossExpenses, "100000.00");
    assert.equal(summary.monthlyNetExpenses, "80000.00");
    const budgets = await ctx.budgetService.listByPeriod(ctx.user.id, 2026, 9);
    assert.equal(budgets[0]?.consumption, "80000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 H/I — accredit BANK: bank+ debt unchanged", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "100000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "15000.00",
    });
    const beforeDebt = await ctx.cardService.getCurrentCardDebt(
      ctx.user.id,
      ctx.card.id
    );
    const result = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "15000.00",
      destinationType: "BANK_ACCOUNT",
      accountId: ctx.account.id,
      idempotencyKey: `bank-${randomUUID()}`,
    });
    assert.equal(result.created, true);
    assert.equal(result.accreditation.accountId, ctx.account.id);
    assert.equal(
      (await ctx.accountService.getBalance(ctx.user.id, ctx.account.id))
        .balance,
      "515000.00"
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      beforeDebt.currentCardDebt
    );
    assert.equal(
      await ctx.financial.getMonthlyNetExpenses(
        ctx.user.id,
        2026,
        9,
        DEFAULT_USER_TIMEZONE
      ),
      "85000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 K/L — partial then complete accreditation", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "100000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "30000.00",
    });
    const partial = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p1-${randomUUID()}`,
    });
    assert.equal(partial.expectation?.status, "PARTIALLY_ACCREDITED");
    assert.equal(partial.expectation?.accreditedAmount, "10000.00");
    assert.equal(partial.expectation?.remainingExpected, "20000.00");

    const complete = await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: expected.id,
      amount: "20000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p2-${randomUUID()}`,
    });
    assert.equal(complete.expectation?.status, "ACCREDITED");
    assert.equal(complete.expectation?.accreditedAmount, "30000.00");
    assert.equal(complete.expectation?.remainingExpected, "0.00");

    const cancelledPartial = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "5000.00",
    });
    await ctx.refundService.accredit({
      userId: ctx.user.id,
      expectationId: cancelledPartial.id,
      amount: "2000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `p3-${randomUUID()}`,
    });
    const closed = await ctx.refundService.cancelExpected(
      ctx.user.id,
      cancelledPartial.id
    );
    assert.equal(closed.status, "ACCREDITED");
    assert.equal(closed.remainingExpected, "0.00");
    assert.equal(closed.accreditedAmount, "2000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 M/S — over-accredit / over eligible reject", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "20000.00",
    });
    await assert.rejects(
      () =>
        ctx.refundService.accredit({
          userId: ctx.user.id,
          expectationId: expected.id,
          amount: "25000.00",
          destinationType: "CREDIT_CARD",
          idempotencyKey: `over-exp-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );
    await assert.rejects(
      () =>
        ctx.refundService.accredit({
          userId: ctx.user.id,
          originalExpenseTransactionId: expense.id,
          amount: "60000.00",
          destinationType: "CREDIT_CARD",
          idempotencyKey: `over-el-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 N — direct accredit without expectation", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "40000.00");
    const result = await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "10000.00",
      destinationType: "BANK_ACCOUNT",
      accountId: ctx.account.id,
      idempotencyKey: `direct-${randomUUID()}`,
    });
    assert.equal(result.created, true);
    assert.equal(result.expectation, null);
    assert.equal(result.accreditation.expectationId, null);
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "40000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 O — wrong user isolation", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "10000.00");
    const expected = await ctx.refundService.createExpected({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      expectedAmount: "5000.00",
    });
    await assert.rejects(
      () => ctx.refundService.getExpected(randomUUID(), expected.id),
      (err: unknown) =>
        err instanceof AppError && err.code === "NOT_FOUND"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 R — currency mismatch bank destination", async () => {
  const ctx = await seedBase();
  try {
    const usdAccount = await ctx.prisma.account.create({
      data: {
        userId: ctx.user.id,
        name: "USD",
        currency: "USD",
        type: "BANK",
        initialBalance: "1000.00",
      },
    });
    const expense = await addCardExpense(ctx, "10000.00");
    await assert.rejects(
      () =>
        ctx.refundService.accredit({
          userId: ctx.user.id,
          originalExpenseTransactionId: expense.id,
          amount: "1000.00",
          destinationType: "BANK_ACCOUNT",
          accountId: usdAccount.id,
          idempotencyKey: `fx-${randomUUID()}`,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "CURRENCY_MISMATCH"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 T — card refund > debt reject", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "10000.00");
    await ctx.prisma.transaction.create({
      data: {
        userId: ctx.user.id,
        accountId: ctx.account.id,
        creditCardId: ctx.card.id,
        type: "CREDIT_CARD_PAYMENT",
        status: "ACTIVE",
        amount: "10000.00",
        currency: "ARS",
        occurredAt: new Date("2026-09-11T12:00:00.000Z"),
        reimbursementStatus: "NONE",
      },
    });
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "0.00"
    );
    await assert.rejects(
      () =>
        ctx.refundService.accredit({
          userId: ctx.user.id,
          originalExpenseTransactionId: expense.id,
          amount: "1000.00",
          destinationType: "CREDIT_CARD",
          idempotencyKey: `debt0-${randomUUID()}`,
        }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 U — pending installments unchanged on purchase refund", async () => {
  const ctx = await seedBase();
  try {
    const purchase = await ctx.purchaseService.create(ctx.user.id, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      description: "TV",
      currency: "ARS",
      totalAmount: "300000.00",
      purchaseDate: "2026-09-07",
      installmentsCount: 3,
    });
    const result = await ctx.refundService.accredit({
      userId: ctx.user.id,
      purchaseId: purchase.purchase.id,
      amount: "50000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `inst-${randomUUID()}`,
    });
    assert.equal(result.created, true);
    const installments = await ctx.prisma.creditCardInstallment.findMany({
      where: { purchaseId: purchase.purchase.id },
      orderBy: { installmentNumber: "asc" },
    });
    assert.equal(installments[0]?.status, "RECOGNIZED");
    assert.equal(installments[1]?.status, "PENDING");
    assert.equal(installments[2]?.status, "PENDING");
    assert.equal(
      (await ctx.cardService.getCommitments(ctx.user.id, ctx.card.id))
        .futureInstallmentCommitment,
      "200000.00"
    );
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "50000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 V — closed statement snapshot unchanged after accredit", async () => {
  const ctx = await seedBase();
  try {
    await addCardExpense(ctx, "150000.00", new Date("2026-09-05T12:00:00.000Z"));
    const projected = await ctx.statementService.getOrCreateProjected(
      ctx.user.id,
      ctx.card.id,
      new Date("2026-09-20T12:00:00.000Z")
    );
    const closed = await ctx.statementService.close(
      ctx.user.id,
      ctx.card.id,
      projected.statement.id
    );
    assert.equal(closed.statement.closedProjectedAmount, "150000.00");
    const expense = await ctx.prisma.transaction.findFirstOrThrow({
      where: { userId: ctx.user.id, type: "EXPENSE" },
    });
    await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "20000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: `stmt-${randomUUID()}`,
    });
    const view = await ctx.statementService.getById(
      ctx.user.id,
      ctx.card.id,
      closed.statement.id
    );
    assert.equal(view.statement.closedProjectedAmount, "150000.00");
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 W/X — idempotency replay + conflict", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "50000.00");
    const key = `idem-${randomUUID()}`;
    const first = await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: key,
    });
    const second = await ctx.refundService.accredit({
      userId: ctx.user.id,
      originalExpenseTransactionId: expense.id,
      amount: "10000.00",
      destinationType: "CREDIT_CARD",
      idempotencyKey: key,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(
      second.accreditation.transactionId,
      first.accreditation.transactionId
    );
    await assert.rejects(
      () =>
        ctx.refundService.accredit({
          userId: ctx.user.id,
          originalExpenseTransactionId: expense.id,
          amount: "20000.00",
          destinationType: "CREDIT_CARD",
          idempotencyKey: key,
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 Y — concurrent over-refund protected by locks", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "100000.00");
    const results = await Promise.allSettled([
      ctx.refundService.accredit({
        userId: ctx.user.id,
        originalExpenseTransactionId: expense.id,
        amount: "70000.00",
        destinationType: "CREDIT_CARD",
        idempotencyKey: `c1-${randomUUID()}`,
      }),
      ctx.refundService.accredit({
        userId: ctx.user.id,
        originalExpenseTransactionId: expense.id,
        amount: "70000.00",
        destinationType: "CREDIT_CARD",
        idempotencyKey: `c2-${randomUUID()}`,
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(
      (await ctx.cardService.getCurrentCardDebt(ctx.user.id, ctx.card.id))
        .currentCardDebt,
      "30000.00"
    );
    const count = await ctx.prisma.transaction.count({
      where: {
        userId: ctx.user.id,
        type: "REIMBURSEMENT",
        status: "ACTIVE",
      },
    });
    assert.equal(count, 1);
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P0.11 HTTP + MVP1 bank reimbursement regression", async () => {
  const ctx = await seedBase();
  try {
    const expense = await addCardExpense(ctx, "30000.00");
    const mvp1 = await ctx.txService.registerReimbursement(ctx.user.id, expense.id, {
      amount: "5000.00",
      accountId: ctx.account.id,
      description: "MVP1 path",
    });
    assert.equal(mvp1.type, "REIMBURSEMENT");
    assert.equal(mvp1.accountId, ctx.account.id);

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
      "/api/credit-card-refunds",
      createCreditCardRefundRouter(
        new CreditCardRefundController(
          new CreditCardRefundService(
            new PrismaCreditCardRefundRepository(ctx.prisma)
          )
        )
      )
    );
    app.use(errorHandler);

    const created = await request(app).post("/api/credit-card-refunds/expected").send({
      originalExpenseTransactionId: expense.id,
      expectedAmount: "8000.00",
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "EXPECTED");

    const listed = await request(app).get("/api/credit-card-refunds/expected");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);

    const detail = await request(app).get(
      `/api/credit-card-refunds/expected/${created.body.id}`
    );
    assert.equal(detail.status, 200);

    const accredited = await request(app)
      .post("/api/credit-card-refunds/accredit")
      .send({
        expectationId: created.body.id,
        amount: "8000.00",
        destinationType: "CREDIT_CARD",
        idempotencyKey: `http-${randomUUID()}`,
      });
    assert.equal(accredited.status, 201);
    assert.equal(accredited.body.expectation.status, "ACCREDITED");

    const cancelled = await request(app)
      .post(`/api/credit-card-refunds/expected/${created.body.id}/cancel`)
      .send({});
    assert.equal(cancelled.status, 400);
  } finally {
    await cleanup(ctx.user.id);
  }
});
