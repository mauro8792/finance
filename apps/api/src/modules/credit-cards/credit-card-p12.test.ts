import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaCreditCardRecurringChargeRepository } from "../credit-card-recurring-charges/credit-card-recurring-charge.repository.js";
import { CreditCardRecurringChargeService } from "../credit-card-recurring-charges/credit-card-recurring-charge.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { CreditCardService } from "./credit-card.service.js";
import { PrismaCreditCardRepository } from "./credit-card.repository.js";
import {
  computeCurrentCardDebt,
  computeCurrentCardDebtByCurrency,
} from "./credit-card-debt.js";

async function setup() {
  const prisma = getPrismaClient();
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `p12-${suffix}@example.com`,
      passwordHash: "x",
      name: "P12",
    },
  });
  const category = await prisma.category.create({
    data: {
      userId: user.id,
      name: `Cat ${suffix}`,
      type: "EXPENSE",
    },
  });
  const arsAccount = await prisma.account.create({
    data: {
      userId: user.id,
      name: `ARS ${suffix}`,
      type: "BANK",
      currency: "ARS",
      initialBalance: "0.00",
    },
  });
  const usdAccount = await prisma.account.create({
    data: {
      userId: user.id,
      name: `USD ${suffix}`,
      type: "BANK",
      currency: "USD",
      initialBalance: "0.00",
    },
  });
  const cards = new PrismaCreditCardRepository();
  const transactions = new PrismaTransactionRepository();
  const purchases = new PrismaCreditCardPurchaseRepository();
  const cardService = new CreditCardService(cards, transactions, purchases);
  const txService = new TransactionService(
    transactions,
    new PrismaAccountRepository(),
    new PrismaCategoryRepository(),
    cards
  );
  const recurring = new CreditCardRecurringChargeService(
    new PrismaCreditCardRecurringChargeRepository()
  );
  const card = await cardService.create(user.id, {
    name: "Visa Santander",
    issuer: "Santander",
    brand: "Visa",
    currency: "ARS",
    closingDay: 5,
    dueDay: 15,
  });
  return {
    prisma,
    user,
    category,
    arsAccount,
    usdAccount,
    card,
    cardService,
    txService,
    recurring,
  };
}

test("P1.2 debt helper never aggregates ARS+USD", () => {
  assert.equal(
    computeCurrentCardDebt([
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "100.00",
        creditCardId: "c",
        currency: "ARS",
      },
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "20.00",
        creditCardId: "c",
        currency: "USD",
      },
    ]),
    "0.00"
  );
  assert.deepEqual(
    computeCurrentCardDebtByCurrency([
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "100.00",
        creditCardId: "c",
        currency: "ARS",
      },
      {
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "20.00",
        creditCardId: "c",
        currency: "USD",
      },
    ]),
    [
      { currency: "ARS", amount: "100.00" },
      { currency: "USD", amount: "20.00" },
    ]
  );
});

test("P1.2 brand selector rejects bare Otra", async () => {
  const ctx = await setup();
  await assert.rejects(
    () =>
      ctx.cardService.create(ctx.user.id, {
        name: "Mystery",
        issuer: "Bank",
        brand: "Otra",
        currency: "ARS",
      }),
    (e: unknown) =>
      e instanceof Error && /marca/i.test((e as Error).message)
  );
  const custom = await ctx.cardService.create(ctx.user.id, {
    name: "Cabal Bank",
    issuer: "Bank",
    brand: "Cabal",
    currency: "ARS",
  });
  assert.equal(custom.brand, "Cabal");
});

test("P1.2 ARS + USD card expenses keep bank at 0 and debt per currency", async () => {
  const ctx = await setup();
  await ctx.txService.createExpense(ctx.user.id, {
    amount: "150000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    paymentMethod: "CREDIT_CARD",
  });
  await ctx.txService.createExpense(ctx.user.id, {
    amount: "20.00",
    currency: "USD",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    paymentMethod: "CREDIT_CARD",
  });

  const arsBal = await ctx.prisma.transaction.findMany({
    where: { accountId: ctx.arsAccount.id, status: "ACTIVE" },
  });
  assert.equal(arsBal.length, 0);

  const commitments = await ctx.cardService.getCommitments(
    ctx.user.id,
    ctx.card.id
  );
  assert.equal(commitments.currentCardDebt, "150000.00");
  assert.deepEqual(commitments.currentCardDebtByCurrency, [
    { currency: "ARS", amount: "150000.00" },
    { currency: "USD", amount: "20.00" },
  ]);
});

test("P1.2 recurring USD template has no financial impact until confirm", async () => {
  const ctx = await setup();
  const template = await ctx.recurring.create({
    userId: ctx.user.id,
    creditCardId: ctx.card.id,
    kind: "RECURRING_SERVICE",
    categoryId: ctx.category.id,
    description: "Cursor",
    currency: "USD",
    expectedAmount: "20.00",
  });
  assert.equal(template.currency, "USD");
  const before = await ctx.cardService.getCommitments(ctx.user.id, ctx.card.id);
  assert.deepEqual(before.currentCardDebtByCurrency, []);

  const confirmed = await ctx.recurring.confirm({
    userId: ctx.user.id,
    recurringChargeId: template.id,
    occurrenceKey: "2026-09",
    amount: "20.00",
    idempotencyKey: `p12-rec-${randomUUID()}`,
  });
  assert.equal(confirmed.created, true);
  assert.equal(confirmed.occurrence.currency, "USD");
  assert.equal(confirmed.occurrence.amount, "20.00");

  const after = await ctx.cardService.getCommitments(ctx.user.id, ctx.card.id);
  assert.deepEqual(after.currentCardDebtByCurrency, [
    { currency: "USD", amount: "20.00" },
  ]);
  assert.equal(after.currentCardDebt, "0.00");
});

test("P1.2 edit card updates schedule fields", async () => {
  const ctx = await setup();
  const updated = await ctx.cardService.update(ctx.user.id, ctx.card.id, {
    name: "Visa Santander Black",
    closingDay: 10,
    dueDay: 20,
    feeStatus: "WAIVED",
  });
  assert.equal(updated.name, "Visa Santander Black");
  assert.equal(updated.closingDay, 10);
  assert.equal(updated.dueDay, 20);
  assert.equal(updated.feeStatus, "WAIVED");
});
