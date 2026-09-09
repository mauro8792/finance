import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  calculateExpectedReturn,
  calendarDaysBetween,
} from "./investment.math.js";
import {
  FirstCaucionCorrectionError,
  correctFirstCaucionCapital,
  parseFixFirstCaucionCliArgs,
  type FirstCaucionCorrectionTargets,
} from "./fix-first-caucion-capital.js";

const BEFORE = "25495784.34";
const AFTER = "25400000.00";
const RATE = "0.211000";
const START = new Date("2026-09-02T15:00:00.000Z");
const MATURITY = new Date("2026-09-09T15:00:00.000Z");
const PROJECTED_RETURN = "95784.34";

async function seedFixture(overrides?: {
  incomeAmount?: string;
  outflowAmount?: string;
  principal?: string;
  status?: "ACTIVE" | "MATURED" | "CANCELLED";
  accountIdForOutflow?: "same" | "other";
  duplicateOutflow?: boolean;
}) {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Fix First Caucion",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: `QA Bull ${Date.now()}`,
      currency: "ARS",
      type: "BANK",
      initialBalance: "0.00",
    },
  });
  const otherAccount = await prisma.account.create({
    data: {
      userId: user.id,
      name: `QA Other ${Date.now()}`,
      currency: "ARS",
      type: "BANK",
      initialBalance: "0.00",
    },
  });

  const days = calendarDaysBetween(START, MATURITY);
  const principal = overrides?.principal ?? BEFORE;
  const expectedReturn = calculateExpectedReturn(principal, RATE, days);

  const investment = await prisma.investment.create({
    data: {
      userId: user.id,
      accountId: account.id,
      type: "CAUCION",
      status: overrides?.status ?? "ACTIVE",
      currency: "ARS",
      principal,
      annualRate: RATE,
      startDate: START,
      maturityDate: MATURITY,
      expectedReturn,
      notes: "QA first caucion correction",
    },
  });

  const income = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: account.id,
      type: "INCOME",
      status: "ACTIVE",
      amount: overrides?.incomeAmount ?? BEFORE,
      currency: "ARS",
      occurredAt: new Date("2026-09-03T19:16:00.000Z"),
      metadata: { incomeKind: "CAPITAL" },
    },
  });

  const outflowAccountId =
    overrides?.accountIdForOutflow === "other" ? otherAccount.id : account.id;
  const outflow = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: outflowAccountId,
      type: "INVESTMENT_OUTFLOW",
      status: "ACTIVE",
      amount: overrides?.outflowAmount ?? BEFORE,
      currency: "ARS",
      occurredAt: START,
      metadata: { investmentId: investment.id },
    },
  });

  let duplicateOutflowId: string | null = null;
  if (overrides?.duplicateOutflow) {
    const dup = await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "INVESTMENT_OUTFLOW",
        status: "ACTIVE",
        amount: "1.00",
        currency: "ARS",
        occurredAt: START,
        metadata: { investmentId: investment.id },
      },
    });
    duplicateOutflowId = dup.id;
  }

  const targets: FirstCaucionCorrectionTargets = {
    investmentId: investment.id,
    incomeTransactionId: income.id,
    outflowTransactionId: outflow.id,
    accountId: account.id,
    userId: user.id,
    beforeAmount: BEFORE,
    afterAmount: AFTER,
    annualRate: RATE,
    startDate: START,
    maturityDate: MATURITY,
    projectedActualReturn: PROJECTED_RETURN,
  };

  return {
    prisma,
    user,
    account,
    otherAccount,
    investment,
    income,
    outflow,
    duplicateOutflowId,
    targets,
    async cleanup() {
      await prisma.transaction.deleteMany({ where: { userId: user.id } });
      await prisma.investment.deleteMany({ where: { userId: user.id } });
      await prisma.account.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    },
  };
}

test("parseFixFirstCaucionCliArgs requires exactly one of dry-run/apply", () => {
  assert.throws(() => parseFixFirstCaucionCliArgs([]), /exactamente uno/);
  assert.throws(
    () => parseFixFirstCaucionCliArgs(["--dry-run", "--apply"]),
    /exactamente uno/
  );
  assert.deepEqual(parseFixFirstCaucionCliArgs(["--dry-run"]), {
    dryRun: true,
    apply: false,
    help: false,
  });
});

test("A) dry-run does not write amounts", async () => {
  const fx = await seedFixture();
  try {
    const beforeIncome = fx.income.updatedAt;
    const beforeInv = fx.investment.updatedAt;
    const beforeOut = fx.outflow.updatedAt;

    const report = await correctFirstCaucionCapital(fx.prisma, {
      dryRun: true,
      targets: fx.targets,
    });

    assert.equal(report.applied, false);
    assert.equal(report.dryRun, true);
    assert.equal(report.before.incomeAmount, BEFORE);
    assert.equal(report.before.outflowAmount, BEFORE);
    assert.equal(report.before.principal, BEFORE);
    assert.equal(report.before.derivedBalance, "0.00");
    assert.equal(report.after.incomeAmount, AFTER);
    assert.equal(report.after.outflowAmount, AFTER);
    assert.equal(report.after.principal, AFTER);
    assert.equal(report.after.derivedBalance, "0.00");
    assert.equal(report.updated.income, false);

    const income = await fx.prisma.transaction.findUniqueOrThrow({
      where: { id: fx.income.id },
    });
    const investment = await fx.prisma.investment.findUniqueOrThrow({
      where: { id: fx.investment.id },
    });
    const outflow = await fx.prisma.transaction.findUniqueOrThrow({
      where: { id: fx.outflow.id },
    });
    assert.equal(income.amount.toFixed(2), BEFORE);
    assert.equal(investment.principal.toFixed(2), BEFORE);
    assert.equal(outflow.amount.toFixed(2), BEFORE);
    assert.equal(income.updatedAt.toISOString(), beforeIncome.toISOString());
    assert.equal(investment.updatedAt.toISOString(), beforeInv.toISOString());
    assert.equal(outflow.updatedAt.toISOString(), beforeOut.toISOString());
  } finally {
    await fx.cleanup();
  }
});

test("B+C) apply updates exactly 3 logical values and balance stays 0", async () => {
  const fx = await seedFixture();
  try {
    const expected = calculateExpectedReturn(
      AFTER,
      RATE,
      calendarDaysBetween(START, MATURITY)
    );
    const report = await correctFirstCaucionCapital(fx.prisma, {
      dryRun: false,
      targets: fx.targets,
    });

    assert.equal(report.applied, true);
    assert.deepEqual(report.updated, {
      income: true,
      investment: true,
      outflow: true,
    });
    assert.equal(report.after.incomeAmount, AFTER);
    assert.equal(report.after.outflowAmount, AFTER);
    assert.equal(report.after.principal, AFTER);
    assert.equal(report.after.expectedReturn, expected);
    assert.equal(report.after.actualReturn, null);
    assert.equal(report.after.investmentStatus, "ACTIVE");
    assert.equal(report.after.derivedBalance, "0.00");
    assert.equal(report.maturityProjection.principalReturn, AFTER);
    assert.equal(report.maturityProjection.investmentReturn, PROJECTED_RETURN);
    assert.equal(
      report.maturityProjection.derivedBalanceAfterMaturity,
      "25495784.34"
    );

    const returns = await fx.prisma.transaction.count({
      where: {
        type: { in: ["INVESTMENT_PRINCIPAL_RETURN", "INVESTMENT_RETURN"] },
        userId: fx.user.id,
      },
    });
    assert.equal(returns, 0);
  } finally {
    await fx.cleanup();
  }
});

test("D) wrong Income amount aborts", async () => {
  const fx = await seedFixture({ incomeAmount: "25000000.00" });
  try {
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) =>
        error instanceof FirstCaucionCorrectionError &&
        error.code === "PRECONDITION_MISMATCH"
    );
    const income = await fx.prisma.transaction.findUniqueOrThrow({
      where: { id: fx.income.id },
    });
    assert.equal(income.amount.toFixed(2), "25000000.00");
  } finally {
    await fx.cleanup();
  }
});

test("E) wrong Outflow amount aborts", async () => {
  const fx = await seedFixture({ outflowAmount: "25000000.00" });
  try {
    // Balance no longer 0 with mismatched amounts — abort on outflow or balance.
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) => error instanceof FirstCaucionCorrectionError
    );
  } finally {
    await fx.cleanup();
  }
});

test("F) investment not ACTIVE aborts", async () => {
  const fx = await seedFixture({ status: "MATURED" });
  try {
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) =>
        error instanceof FirstCaucionCorrectionError &&
        error.code === "INVESTMENT_NOT_ACTIVE"
    );
  } finally {
    await fx.cleanup();
  }
});

test("G) duplicate linked outflow aborts", async () => {
  const fx = await seedFixture({ duplicateOutflow: true });
  try {
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) =>
        error instanceof FirstCaucionCorrectionError &&
        error.code === "DUPLICATE_OUTFLOW"
    );
  } finally {
    await fx.cleanup();
  }
});

test("H) wrong account on outflow aborts", async () => {
  const fx = await seedFixture({ accountIdForOutflow: "other" });
  try {
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) =>
        error instanceof FirstCaucionCorrectionError &&
        (error.code === "WRONG_ACCOUNT" ||
          error.code === "PRECONDITION_MISMATCH")
    );
  } finally {
    await fx.cleanup();
  }
});

test("I) injected failure rolls everything back", async () => {
  const fx = await seedFixture();
  try {
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
          __testThrowAfter: "income",
        }),
      /TEST_INJECTED_FAILURE_AFTER_INCOME/
    );

    const income = await fx.prisma.transaction.findUniqueOrThrow({
      where: { id: fx.income.id },
    });
    const investment = await fx.prisma.investment.findUniqueOrThrow({
      where: { id: fx.investment.id },
    });
    const outflow = await fx.prisma.transaction.findUniqueOrThrow({
      where: { id: fx.outflow.id },
    });
    assert.equal(income.amount.toFixed(2), BEFORE);
    assert.equal(investment.principal.toFixed(2), BEFORE);
    assert.equal(outflow.amount.toFixed(2), BEFORE);
  } finally {
    await fx.cleanup();
  }
});

test("J) retry after successful correction aborts (already corrected)", async () => {
  const fx = await seedFixture();
  try {
    await correctFirstCaucionCapital(fx.prisma, {
      dryRun: false,
      targets: fx.targets,
    });
    await assert.rejects(
      () =>
        correctFirstCaucionCapital(fx.prisma, {
          dryRun: false,
          targets: fx.targets,
        }),
      (error: unknown) =>
        error instanceof FirstCaucionCorrectionError &&
        error.code === "PRECONDITION_MISMATCH" &&
        /ya corregido/i.test(error.message)
    );
  } finally {
    await fx.cleanup();
  }
});
