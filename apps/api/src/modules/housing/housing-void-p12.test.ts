/**
 * P1.2 — housing prepaid period + void: reverses HOUSING_PAYMENT (no income),
 * restores remainingInstallments and reserve ACTIVE balance, keeps history row.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { AccountService } from "../accounts/account.service.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { PrismaHousingObligationRepository } from "./housing.repository.js";
import { HousingService } from "./housing.service.js";

async function seedBase() {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Housing Void P1.2",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const reserve = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Reserva P1.2",
      currency: "USD",
      type: "HOUSING_RESERVE",
      initialBalance: "2000.00",
    },
  });

  const housingRepo = new PrismaHousingObligationRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const txRepo = new PrismaTransactionRepository(prisma);
  const housing = new HousingService(housingRepo, accountRepo, txRepo);
  const accounts = new AccountService(accountRepo, txRepo);
  const txService = new TransactionService(txRepo, accountRepo, {
    async create() {
      throw new Error("unused");
    },
    async findById() {
      return null;
    },
    async findByUserId() {
      return [];
    },
    async findByUserIdAndName() {
      return null;
    },
    async update() {
      throw new Error("unused");
    },
  });

  const obligation = await housing.create(user.id, {
    name: "Alquiler QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });

  return {
    prisma,
    user,
    reserve,
    obligation,
    housing,
    accounts,
    txService,
  };
}

async function cleanup(userId: string) {
  const prisma = getPrismaClient();
  await prisma.correctionOperation.deleteMany({ where: { userId } });
  await prisma.housingPayment.deleteMany({
    where: { housingObligation: { userId } },
  });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.housingObligation.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

test("P1.2 — void restores reserve balance and remainingInstallments +1", async () => {
  const ctx = await seedBase();
  try {
    const paid = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      amount: "500.00",
    });
    assert.equal(paid.remainingInstallments, 11);
    assert.equal(
      (await ctx.accounts.getBalance(ctx.user.id, ctx.reserve.id)).balance,
      "1500.00"
    );

    const result = await ctx.housing.voidPayment(
      ctx.user.id,
      ctx.obligation.id,
      paid.payment.id,
      { idempotencyKey: `void-${randomUUID()}` }
    );

    assert.equal(result.created, true);
    assert.equal(result.transaction.status, "REVERSED");
    assert.ok(result.payment.voidedAt);
    assert.equal(result.obligation.remainingInstallments, 12);
    assert.equal(
      (await ctx.accounts.getBalance(ctx.user.id, ctx.reserve.id)).balance,
      "2000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — double void with different key → 409 HOUSING_PAYMENT_ALREADY_VOIDED", async () => {
  const ctx = await seedBase();
  try {
    const paid = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
    });
    await ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, paid.payment.id, {
      idempotencyKey: `void-${randomUUID()}`,
    });

    await assert.rejects(
      () =>
        ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, paid.payment.id, {
          idempotencyKey: `other-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "HOUSING_PAYMENT_ALREADY_VOIDED"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — concurrent void same key → one effect", async () => {
  const ctx = await seedBase();
  try {
    const paid = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
    });
    const key = `void-c-${randomUUID()}`;

    const results = await Promise.allSettled([
      ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, paid.payment.id, {
        idempotencyKey: key,
      }),
      ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, paid.payment.id, {
        idempotencyKey: key,
      }),
    ]);

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    assert.equal(fulfilled.length, 2);
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "HOUSING_PAYMENT_VOID" },
      }),
      1
    );
    assert.equal(
      (await ctx.housing.getById(ctx.user.id, ctx.obligation.id)).remainingInstallments,
      12
    );
    assert.equal(
      (await ctx.accounts.getBalance(ctx.user.id, ctx.reserve.id)).balance,
      "2000.00"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — idempotency replay same key same result", async () => {
  const ctx = await seedBase();
  try {
    const paid = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
    });
    const key = `void-${randomUUID()}`;

    const first = await ctx.housing.voidPayment(
      ctx.user.id,
      ctx.obligation.id,
      paid.payment.id,
      { idempotencyKey: key }
    );
    const replay = await ctx.housing.voidPayment(
      ctx.user.id,
      ctx.obligation.id,
      paid.payment.id,
      { idempotencyKey: key }
    );

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.payment.id, first.payment.id);
    assert.equal(replay.transaction.status, "REVERSED");
    assert.equal(
      await ctx.prisma.correctionOperation.count({
        where: { userId: ctx.user.id, kind: "HOUSING_PAYMENT_VOID" },
      }),
      1
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — idempotency conflict different target", async () => {
  const ctx = await seedBase();
  try {
    const first = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      periodYear: 2026,
      periodMonth: 7,
    });
    const second = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      periodYear: 2026,
      periodMonth: 8,
    });
    const key = `void-shared-${randomUUID()}`;

    await ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, first.payment.id, {
      idempotencyKey: key,
    });

    await assert.rejects(
      () =>
        ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, second.payment.id, {
          idempotencyKey: key,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — same paidAt, different periods allowed", async () => {
  const ctx = await seedBase();
  try {
    const paidAt = new Date("2026-06-15T12:00:00.000Z");
    const a = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      occurredAt: paidAt,
      periodYear: 2026,
      periodMonth: 7,
    });
    const b = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      occurredAt: paidAt,
      periodYear: 2026,
      periodMonth: 8,
    });

    assert.equal(a.payment.periodYear, 2026);
    assert.equal(a.payment.periodMonth, 7);
    assert.equal(b.payment.periodYear, 2026);
    assert.equal(b.payment.periodMonth, 8);
    assert.equal(a.payment.paidAt.toISOString(), b.payment.paidAt.toISOString());
    assert.equal(
      (await ctx.housing.getById(ctx.user.id, ctx.obligation.id)).remainingInstallments,
      10
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});

test("P1.2 — void creates no income and keeps payment in history", async () => {
  const ctx = await seedBase();
  try {
    const paid = await ctx.housing.registerPayment(ctx.user.id, ctx.obligation.id, {
      accountId: ctx.reserve.id,
      periodYear: 2026,
      periodMonth: 9,
    });

    await ctx.housing.voidPayment(ctx.user.id, ctx.obligation.id, paid.payment.id, {
      idempotencyKey: `void-${randomUUID()}`,
    });

    assert.equal(
      await ctx.prisma.transaction.count({
        where: { userId: ctx.user.id, type: "INCOME" },
      }),
      0
    );
    assert.equal(
      await ctx.prisma.transaction.count({
        where: { userId: ctx.user.id, type: "EXPENSE" },
      }),
      0
    );
    assert.equal(
      await ctx.prisma.housingPayment.count({
        where: { housingObligationId: ctx.obligation.id },
      }),
      1
    );

    const listed = await ctx.housing.listPayments(ctx.user.id, ctx.obligation.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, paid.payment.id);
    assert.ok(listed[0]?.voidedAt);

    await assert.rejects(
      () =>
        ctx.txService.void(ctx.user.id, paid.transaction.id, {
          idempotencyKey: `generic-${randomUUID()}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "HOUSING_PAYMENT_IMMUTABLE"
    );
  } finally {
    await cleanup(ctx.user.id);
  }
});
