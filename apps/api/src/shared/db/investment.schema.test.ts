import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "./prisma.js";

function isCheckViolation(error: unknown, constraint: string): boolean {
  const haystack = error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(error.meta ?? {});
    return `${haystack} ${meta}`.includes(constraint) || `${meta}`.includes("23514");
  }
  return haystack.includes(constraint) || haystack.includes("23514");
}

function isForeignKeyViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return true;
  }
  const haystack = String(error);
  return haystack.includes("P2003") || haystack.includes("23503");
}

test("Investment schema persists a fictional caución on PostgreSQL", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: { name: "QA Investment M6.1" },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: `QA Origen M6.1 ${Date.now()}`,
      currency: "ARS",
      type: "BANK",
    },
  });

  try {
    const start = new Date("2026-09-01T12:00:00.000Z");
    const maturity = new Date("2026-09-02T12:00:00.000Z");
    const created = await prisma.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "CAUCION",
        status: "DRAFT",
        currency: "ARS",
        principal: "100000.00",
        annualRate: "0.300000",
        startDate: start,
        maturityDate: maturity,
        notes: "QA Caución ficticia",
      },
    });

    assert.equal(created.principal.toFixed(2), "100000.00");
    assert.equal(created.annualRate?.toFixed(6), "0.300000");
    assert.equal(created.expectedReturn, null);
    assert.equal(created.actualReturn, null);
    assert.equal(created.type, "CAUCION");
    assert.equal(created.status, "DRAFT");
    assert.equal(created.renewedFromInvestmentId, null);

    const renewed = await prisma.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        renewedFromInvestmentId: created.id,
        type: "CAUCION",
        status: "ACTIVE",
        currency: "ARS",
        principal: "100000.00",
        annualRate: "0.085000",
        startDate: maturity,
        maturityDate: new Date("2026-09-09T12:00:00.000Z"),
      },
    });
    assert.equal(renewed.renewedFromInvestmentId, created.id);
    assert.equal(renewed.annualRate?.toFixed(6), "0.085000");

    const zeroRate = await prisma.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "OTHER",
        status: "CANCELLED",
        currency: "ARS",
        principal: "1.00",
        annualRate: "0.000000",
        startDate: start,
        maturityDate: start,
      },
    });
    assert.equal(zeroRate.annualRate?.toFixed(6), "0.000000");
    assert.equal(zeroRate.maturityDate?.toISOString(), start.toISOString());

    const withoutRate = await prisma.investment.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "OTHER",
        status: "MATURED",
        currency: "ARS",
        principal: "50.00",
        startDate: start,
      },
    });
    assert.equal(withoutRate.annualRate, null);
    assert.equal(withoutRate.maturityDate, null);
  } finally {
    await prisma.investment.deleteMany({
      where: { userId: user.id, renewedFromInvestmentId: { not: null } },
    });
    await prisma.investment.deleteMany({ where: { userId: user.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Investment schema rejects invalid principal, rate, dates and foreign keys", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: { name: "QA Investment constraints M6.1" },
  });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: `QA Origen constraints ${Date.now()}`,
      currency: "ARS",
      type: "FUND",
    },
  });
  const start = new Date("2026-09-01T12:00:00.000Z");
  const base = {
    userId: user.id,
    accountId: account.id,
    type: "CAUCION" as const,
    status: "DRAFT" as const,
    currency: "ARS" as const,
    startDate: start,
  };

  try {
    await assert.rejects(
      () => prisma.investment.create({ data: { ...base, principal: "0.00" } }),
      (error: unknown) => isCheckViolation(error, "investments_principal_positive")
    );
    await assert.rejects(
      () => prisma.investment.create({ data: { ...base, principal: "-1.00" } }),
      (error: unknown) => isCheckViolation(error, "investments_principal_positive")
    );
    await assert.rejects(
      () =>
        prisma.investment.create({
          data: { ...base, principal: "100.00", annualRate: "-0.010000" },
        }),
      (error: unknown) => isCheckViolation(error, "investments_annual_rate_non_negative")
    );
    await assert.rejects(
      () =>
        prisma.investment.create({
          data: {
            ...base,
            principal: "100.00",
            maturityDate: new Date("2026-08-31T12:00:00.000Z"),
          },
        }),
      (error: unknown) => isCheckViolation(error, "investments_maturity_on_or_after_start")
    );
    await assert.rejects(
      () =>
        prisma.investment.create({
          data: { ...base, principal: "100.00", userId: randomUUID() },
        }),
      isForeignKeyViolation
    );
    await assert.rejects(
      () =>
        prisma.investment.create({
          data: { ...base, principal: "100.00", accountId: randomUUID() },
        }),
      isForeignKeyViolation
    );
    await assert.rejects(
      () =>
        prisma.investment.create({
          data: {
            ...base,
            principal: "100.00",
            renewedFromInvestmentId: randomUUID(),
          },
        }),
      isForeignKeyViolation
    );
  } finally {
    await prisma.investment.deleteMany({ where: { userId: user.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("Investment schema exposes documented enums, checks and indexes", async () => {
  const prisma = getPrismaClient();
  const types = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'investment_type_enum'
    ORDER BY e.enumsortorder
  `;
  const statuses = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'investment_status_enum'
    ORDER BY e.enumsortorder
  `;
  const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'investments'::regclass
      AND contype = 'c'
    ORDER BY conname
  `;
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'investments'
    ORDER BY indexname
  `;
  const columns = await prisma.$queryRaw<
    Array<{
      column_name: string;
      numeric_precision: number | null;
      numeric_scale: number | null;
      is_nullable: string;
    }>
  >`
    SELECT column_name, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'investments'
  `;

  assert.deepEqual(
    types.map((row) => row.enumlabel),
    ["CAUCION", "OTHER"]
  );
  assert.deepEqual(
    statuses.map((row) => row.enumlabel),
    ["DRAFT", "ACTIVE", "MATURED", "RENEWED", "CANCELLED"]
  );
  assert.deepEqual(
    checks.map((row) => row.conname),
    [
      "investments_annual_rate_non_negative",
      "investments_maturity_on_or_after_start",
      "investments_principal_positive",
    ]
  );
  const indexNames = indexes.map((row) => row.indexname);
  assert.ok(indexNames.includes("investments_user_id_status_idx"));
  assert.ok(indexNames.includes("investments_user_id_maturity_date_idx"));
  assert.ok(indexNames.includes("investments_account_id_idx"));
  assert.ok(indexNames.includes("investments_renewed_from_investment_id_idx"));

  const byName = Object.fromEntries(columns.map((column) => [column.column_name, column]));
  assert.equal(Number(byName.principal?.numeric_precision), 18);
  assert.equal(Number(byName.principal?.numeric_scale), 2);
  assert.equal(Number(byName.annual_rate?.numeric_precision), 12);
  assert.equal(Number(byName.annual_rate?.numeric_scale), 6);
  assert.equal(byName.annual_rate?.is_nullable, "YES");
  assert.equal(Number(byName.expected_return?.numeric_precision), 18);
  assert.equal(Number(byName.expected_return?.numeric_scale), 2);
  assert.equal(byName.expected_return?.is_nullable, "YES");
  assert.equal(Number(byName.actual_return?.numeric_precision), 18);
  assert.equal(Number(byName.actual_return?.numeric_scale), 2);
  assert.equal(byName.notes?.is_nullable, "YES");
  assert.equal(byName.maturity_date?.is_nullable, "YES");
  assert.equal(byName.renewed_from_investment_id?.is_nullable, "YES");
  assert.equal(byName.name, undefined);
});
