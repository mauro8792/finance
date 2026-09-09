/**
 * Create second real Bull Market caución via InvestmentService.
 * Usage: npx tsx scripts/create-second-caucion.ts [--precheck-only | --apply]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaAccountRepository } from "../src/modules/accounts/account.repository.js";
import { FinancialService } from "../src/modules/financial/financial.service.js";
import {
  calculateExpectedReturn,
  calendarDaysBetween,
} from "../src/modules/investments/investment.math.js";
import { PrismaInvestmentRepository } from "../src/modules/investments/investment.repository.js";
import { InvestmentService } from "../src/modules/investments/investment.service.js";
import { PrismaTransactionRepository } from "../src/modules/transactions/transaction.repository.js";
import { computeBalance } from "../src/modules/transactions/transaction-balance.js";

config({ path: resolve(process.cwd(), ".env") });

const FIRST_INVESTMENT_ID = "80efad77-c3a5-432c-afd5-158f4e096bc5";
const ACCOUNT_ID = "2ea2701b-157f-404b-9cb8-eceacc424287";
const USER_ID = "bb34e81c-ddf8-46d9-bae4-b0561ff059cf";
const PRINCIPAL = "25400000.00";
const ANNUAL_RATE = "0.214000"; // 21,40%
const START = new Date("2026-09-09T15:00:00.000Z");
const MATURITY = new Date("2026-09-16T15:00:00.000Z");
const NOTES = "Caución colocadora 7 días - operada 21,40% TNA";
const TZ = "America/Argentina/Buenos_Aires";
const YEAR = 2026;
const MONTH = 9;

function money(value: { toFixed(digits: number): string }): string {
  return value.toFixed(2);
}

function sameDay(iso: string, expected: Date): boolean {
  return new Date(iso).getTime() === expected.getTime();
}

async function bullBalance(prisma: PrismaClient): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: ACCOUNT_ID },
  });
  const movements = await prisma.transaction.findMany({
    where: { accountId: ACCOUNT_ID, status: "ACTIVE" },
    select: { type: true, amount: true, metadata: true, accountId: true },
  });
  return computeBalance(
    money(account.initialBalance),
    movements.map((m) => ({
      type: m.type,
      amount: money(m.amount),
      metadata: m.metadata,
      accountId: m.accountId,
    }))
  );
}

async function snapshot(prisma: PrismaClient, label: string) {
  const accounts = new PrismaAccountRepository(prisma);
  const transactions = new PrismaTransactionRepository(prisma);
  const financial = new FinancialService(transactions, accounts);

  const [
    first,
    allInvestments,
    firstLinked,
    txCount,
    invCount,
    budgets,
    balance,
    gross,
    net,
    operating,
    fund,
    available,
  ] = await Promise.all([
    prisma.investment.findUniqueOrThrow({ where: { id: FIRST_INVESTMENT_ID } }),
    prisma.investment.findMany({
      where: { userId: USER_ID, type: "CAUCION" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        metadata: { path: ["investmentId"], equals: FIRST_INVESTMENT_ID },
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.transaction.count(),
    prisma.investment.count({ where: { userId: USER_ID } }),
    prisma.budget.findMany({
      where: { userId: USER_ID },
      select: { id: true, amount: true, categoryId: true, year: true, month: true },
    }),
    bullBalance(prisma),
    financial.getMonthlyGrossExpenses(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyNetExpenses(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyOperatingIncome(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyFundConsumption(USER_ID, YEAR, MONTH, TZ),
    financial.getTotalAvailableARS(USER_ID),
  ]);

  const duplicateActive = allInvestments.filter((inv) => {
    if (inv.status !== "ACTIVE") return false;
    if (money(inv.principal) !== PRINCIPAL) return false;
    if (!inv.startDate || !sameDay(inv.startDate.toISOString(), START)) return false;
    if (!inv.maturityDate || !sameDay(inv.maturityDate.toISOString(), MATURITY)) {
      return false;
    }
    return true;
  });

  const days = calendarDaysBetween(START, MATURITY);
  const expectedReturnComputed = calculateExpectedReturn(
    PRINCIPAL,
    ANNUAL_RATE,
    days
  );

  return {
    label,
    firstInvestment: {
      id: first.id,
      status: first.status,
      principal: money(first.principal),
      expectedReturn: first.expectedReturn ? money(first.expectedReturn) : null,
      actualReturn: first.actualReturn ? money(first.actualReturn) : null,
    },
    firstLinked: firstLinked.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: money(t.amount),
      occurredAt: t.occurredAt.toISOString(),
    })),
    bullMarketBalance: balance,
    duplicateActiveMatchingSecond: duplicateActive.map((inv) => ({
      id: inv.id,
      status: inv.status,
      principal: money(inv.principal),
      startDate: inv.startDate.toISOString(),
      maturityDate: inv.maturityDate?.toISOString() ?? null,
    })),
    computedExpectedReturn: expectedReturnComputed,
    days,
    transactionCountTotal: txCount,
    investmentCountUser: invCount,
    budgets: budgets.map((b) => ({
      id: b.id,
      year: b.year,
      month: b.month,
      amount: money(b.amount),
      categoryId: b.categoryId,
    })),
    metrics: {
      monthlyGrossExpenses: gross,
      monthlyNetExpenses: net,
      monthlyOperatingIncome: operating,
      monthlyFundConsumption: fund,
      totalAvailableARS: available,
    },
  };
}

function assertPreflight(before: Awaited<ReturnType<typeof snapshot>>): void {
  if (before.firstInvestment.status !== "MATURED") {
    throw new Error(`ABORT: primera caución status=${before.firstInvestment.status}`);
  }
  if (before.firstInvestment.principal !== PRINCIPAL) {
    throw new Error(`ABORT: primera principal=${before.firstInvestment.principal}`);
  }
  if (before.firstInvestment.actualReturn !== "95784.34") {
    throw new Error(`ABORT: primera actualReturn=${before.firstInvestment.actualReturn}`);
  }
  if (before.bullMarketBalance !== "25495784.34") {
    throw new Error(`ABORT: balance=${before.bullMarketBalance}`);
  }
  if (before.duplicateActiveMatchingSecond.length > 0) {
    throw new Error(
      `ABORT: ya existe caución ACTIVE duplicada: ${before.duplicateActiveMatchingSecond
        .map((d) => d.id)
        .join(",")}`
    );
  }
  if (before.days !== 7) {
    throw new Error(`ABORT: days=${before.days}`);
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--precheck-only")
      ? "precheck"
      : null;
  if (!mode) {
    console.error("Indicar --precheck-only o --apply");
    process.exitCode = 1;
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const before = await snapshot(prisma, "BEFORE");
    assertPreflight(before);

    const payload = {
      accountId: ACCOUNT_ID,
      currency: "ARS" as const,
      principal: PRINCIPAL,
      annualRate: ANNUAL_RATE,
      startDate: START,
      maturityDate: MATURITY,
      notes: NOTES,
    };

    if (mode === "precheck") {
      console.log(
        JSON.stringify(
          {
            mode,
            payload,
            expectedReturnFromAppFormula: before.computedExpectedReturn,
            before,
          },
          null,
          2
        )
      );
      return;
    }

    const service = new InvestmentService(
      new PrismaInvestmentRepository(prisma),
      new PrismaAccountRepository(prisma),
      new PrismaTransactionRepository(prisma)
    );

    const created = await service.createCaucion(USER_ID, payload);
    const after = await snapshot(prisma, "AFTER");

    const secondLinked = await prisma.transaction.findMany({
      where: {
        metadata: {
          path: ["investmentId"],
          equals: created.investment.id,
        },
      },
    });

    const firstLinkedUnchanged =
      JSON.stringify(before.firstLinked) === JSON.stringify(after.firstLinked);

    console.log(
      JSON.stringify(
        {
          mode,
          payload,
          expectedReturnFromAppFormula: before.computedExpectedReturn,
          before,
          created: {
            investment: {
              id: created.investment.id,
              status: created.investment.status,
              principal: created.investment.principal,
              annualRate: created.investment.annualRate,
              expectedReturn: created.investment.expectedReturn,
              actualReturn: created.investment.actualReturn,
              startDate: created.investment.startDate.toISOString(),
              maturityDate: created.investment.maturityDate?.toISOString() ?? null,
              notes: created.investment.notes,
            },
            transaction: {
              id: created.transaction.id,
              type: created.transaction.type,
              status: created.transaction.status,
              amount: created.transaction.amount,
              accountId: created.transaction.accountId,
              metadata: created.transaction.metadata,
              occurredAt: created.transaction.occurredAt.toISOString(),
            },
          },
          secondLinked: secondLinked.map((t) => ({
            id: t.id,
            type: t.type,
            status: t.status,
            amount: money(t.amount),
            accountId: t.accountId,
            metadata: t.metadata,
          })),
          after,
          invariants: {
            firstCaucionIntact:
              after.firstInvestment.status === "MATURED" &&
              after.firstInvestment.principal === PRINCIPAL &&
              after.firstInvestment.actualReturn === "95784.34" &&
              firstLinkedUnchanged,
            firstLinkedUnchanged,
            grossUnchanged:
              before.metrics.monthlyGrossExpenses ===
              after.metrics.monthlyGrossExpenses,
            netUnchanged:
              before.metrics.monthlyNetExpenses === after.metrics.monthlyNetExpenses,
            operatingIncomeUnchanged:
              before.metrics.monthlyOperatingIncome ===
              after.metrics.monthlyOperatingIncome,
            fundConsumptionUnchanged:
              before.metrics.monthlyFundConsumption ===
              after.metrics.monthlyFundConsumption,
            budgetsUnchanged:
              JSON.stringify(before.budgets) === JSON.stringify(after.budgets),
            availableArsUnchanged:
              before.metrics.totalAvailableARS === after.metrics.totalAvailableARS,
            transactionCountDelta:
              after.transactionCountTotal - before.transactionCountTotal,
            investmentCountDelta:
              after.investmentCountUser - before.investmentCountUser,
            balanceAfterMatchesInterestCash:
              after.bullMarketBalance === "95784.34",
          },
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
