/**
 * P1.2.1 — account balance reconciliation + housing acceptance fixture.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaAccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";
import { PrismaAccountBalanceReconciliationRepository } from "./account-balance-reconciliation.repository.js";
import { AccountBalanceReconciliationService } from "./account-balance-reconciliation.service.js";
import { PrismaHousingObligationRepository } from "../housing/housing.repository.js";
import { HousingService } from "../housing/housing.service.js";
import { computeBalance } from "../transactions/transaction-balance.js";

async function seedUser() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Recon P1.2.1",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  return { prisma, user };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.accountBalanceReconciliation.deleteMany({ where: { userId } });
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.housingPayment.deleteMany({
    where: { housingObligation: { userId } },
  });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.housingObligation.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

function services() {
  const prisma = getPrismaClient();
  const accounts = new PrismaAccountRepository(prisma);
  const transactions = new PrismaTransactionRepository(prisma);
  const housingRepo = new PrismaHousingObligationRepository(prisma);
  return {
    accounts: new AccountService(accounts, transactions),
    reconciliations: new AccountBalanceReconciliationService(
      new PrismaAccountBalanceReconciliationRepository(prisma),
      accounts,
      transactions
    ),
    housing: new HousingService(housingRepo, accounts, transactions),
    transactions,
  };
}

test("P1.2.1 — reconcile lower balance exact decimal; no expense/income", async () => {
  const { user } = await seedUser();
  const svc = services();
  try {
    const account = await svc.accounts.create(user.id, {
      name: "Reserva",
      currency: "USD",
      type: "HOUSING_RESERVE",
    });
    await getPrismaClient().account.update({
      where: { id: account.id },
      data: { initialBalance: "5199.92" },
    });

    const key = `recon-${randomUUID()}`;
    const result = await svc.reconciliations.reconcile(user.id, {
      accountId: account.id,
      observedBalance: "4099.93",
      reason: "Corrección de saldo inicial / conciliación con banco",
      occurredAt: new Date("2026-09-11T15:00:00.000Z"),
      idempotencyKey: key,
    });

    assert.equal(result.created, true);
    assert.equal(result.balance, "4099.93");
    assert.equal(result.reconciliation.previousCalculatedBalance, "5199.92");
    assert.equal(result.reconciliation.adjustmentAmount, "-1099.99");
    assert.equal(result.transaction.type, "ADJUSTMENT");
    assert.equal(result.transaction.amount, "1099.99");

    const balance = await svc.accounts.getBalance(user.id, account.id);
    assert.equal(balance.balance, "4099.93");

    const txs = await svc.transactions.findByUserId(user.id, {
      accountId: account.id,
      status: "ACTIVE",
    });
    assert.equal(txs.filter((t) => t.type === "EXPENSE").length, 0);
    assert.equal(txs.filter((t) => t.type === "INCOME").length, 0);
    assert.equal(txs.filter((t) => t.type === "ADJUSTMENT").length, 1);

    const replay = await svc.reconciliations.reconcile(user.id, {
      accountId: account.id,
      observedBalance: "4099.93",
      reason: "Corrección de saldo inicial / conciliación con banco",
      occurredAt: new Date("2026-09-11T15:00:00.000Z"),
      idempotencyKey: key,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.reconciliation.id, result.reconciliation.id);

    await assert.rejects(
      () =>
        svc.reconciliations.reconcile(user.id, {
          accountId: account.id,
          observedBalance: "4000.00",
          reason: "otro",
          occurredAt: new Date("2026-09-11T15:00:00.000Z"),
          idempotencyKey: key,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await cleanup(user.id);
  }
});

test("P1.2.1 — reconcile higher balance", async () => {
  const { user } = await seedUser();
  const svc = services();
  try {
    const account = await svc.accounts.create(user.id, {
      name: "Caja",
      currency: "ARS",
      type: "BANK",
    });
    await getPrismaClient().account.update({
      where: { id: account.id },
      data: { initialBalance: "100.00" },
    });
    const result = await svc.reconciliations.reconcile(user.id, {
      accountId: account.id,
      observedBalance: "250.50",
      reason: "Ajuste al alza",
      idempotencyKey: `up-${randomUUID()}`,
    });
    assert.equal(result.reconciliation.adjustmentAmount, "150.50");
    assert.equal(
      (await svc.accounts.getBalance(user.id, account.id)).balance,
      "250.50"
    );
  } finally {
    await cleanup(user.id);
  }
});

test("P1.2.1 — acceptance: housing periods + recon + next due Jan 2027", async () => {
  const { user } = await seedUser();
  const svc = services();
  const prisma = getPrismaClient();
  try {
    const reserve = await svc.accounts.create(user.id, {
      name: "Reserva vivienda USD",
      currency: "USD",
      type: "HOUSING_RESERVE",
    });
    await prisma.account.update({
      where: { id: reserve.id },
      data: { initialBalance: "0.00" },
    });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: reserve.id,
        type: "INCOME",
        status: "ACTIVE",
        amount: "8499.92",
        currency: "USD",
        occurredAt: new Date("2026-09-03T19:16:00.000Z"),
        metadata: { incomeKind: "CAPITAL" },
      },
    });

    const obligation = await svc.housing.create(user.id, {
      name: "Nuestra casa",
      currency: "USD",
      installmentAmount: "1100.00",
      remainingInstallments: 36,
      dueDay: 10,
      reserveAccountId: reserve.id,
    });

    const paidAt = new Date("2026-09-10T16:22:00.000Z");
    const p24 = await svc.housing.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      installmentNumber: 24,
      periodYear: 2026,
      periodMonth: 10,
      occurredAt: paidAt,
    });
    const p25 = await svc.housing.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      installmentNumber: 25,
      periodYear: 2026,
      periodMonth: 11,
      occurredAt: paidAt,
    });
    const p26 = await svc.housing.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      installmentNumber: 26,
      periodYear: 2026,
      periodMonth: 12,
      occurredAt: paidAt,
    });
    const p27 = await svc.housing.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      installmentNumber: 27,
      periodYear: 2027,
      periodMonth: 1,
      occurredAt: paidAt,
    });
    await svc.housing.voidPayment(user.id, obligation.id, p27.payment.id, {
      idempotencyKey: `void27-${randomUUID()}`,
    });

    assert.equal(
      (await svc.accounts.getBalance(user.id, reserve.id)).balance,
      "5199.92"
    );

    const pendingBefore = (
      await svc.housing.getById(user.id, obligation.id)
    ).remainingInstallments;
    assert.equal(pendingBefore, 33);

    await svc.reconciliations.reconcile(user.id, {
      accountId: reserve.id,
      observedBalance: "4099.93",
      reason: "Corrección de saldo inicial / conciliación con banco",
      idempotencyKey: `housing-recon-${randomUUID()}`,
    });

    const coverage = await svc.housing.getCoverage(user.id, obligation.id);
    assert.equal(coverage.reserveBalance, "4099.93");
    assert.equal(coverage.coveredInstallments, "3.73");
    assert.equal(coverage.remainingInstallments, 33);
    assert.equal(coverage.nextInstallmentNumber, 27);
    assert.equal(coverage.nextPeriodYear, 2027);
    assert.equal(coverage.nextPeriodMonth, 1);
    assert.equal(coverage.nextDueDateLabel, "10 ene 2027");

    // Period correction has no financial impact
    const balanceBefore = (
      await svc.accounts.getBalance(user.id, reserve.id)
    ).balance;
    await svc.housing.updatePaymentPeriod(user.id, obligation.id, p24.payment.id, {
      periodYear: 2026,
      periodMonth: 10,
    });
    assert.equal(
      (await svc.accounts.getBalance(user.id, reserve.id)).balance,
      balanceBefore
    );

    void p25;
    void p26;
    const movements = await svc.transactions.findByUserId(user.id, {
      accountId: reserve.id,
      status: "ACTIVE",
    });
    assert.equal(
      computeBalance("0.00", movements),
      "4099.93"
    );
  } finally {
    await cleanup(user.id);
  }
});

test("P1.2.1 — concurrent reconcile same key yields one adjustment", async () => {
  const { user } = await seedUser();
  const svc = services();
  try {
    const account = await svc.accounts.create(user.id, {
      name: "Concurrent",
      currency: "USD",
      type: "BANK",
    });
    await getPrismaClient().account.update({
      where: { id: account.id },
      data: { initialBalance: "1000.00" },
    });
    const key = `conc-${randomUUID()}`;
    const payload = {
      accountId: account.id,
      observedBalance: "900.00",
      reason: "concurrent",
      occurredAt: new Date("2026-09-11T12:00:00.000Z"),
      idempotencyKey: key,
    };
    const [a, b] = await Promise.all([
      svc.reconciliations.reconcile(user.id, payload),
      svc.reconciliations.reconcile(user.id, payload),
    ]);
    assert.equal(a.reconciliation.id, b.reconciliation.id);
    const txs = await svc.transactions.findByUserId(user.id, {
      accountId: account.id,
      status: "ACTIVE",
    });
    assert.equal(txs.filter((t) => t.type === "ADJUSTMENT").length, 1);
    assert.equal(
      (await svc.accounts.getBalance(user.id, account.id)).balance,
      "900.00"
    );
  } finally {
    await cleanup(user.id);
  }
});
