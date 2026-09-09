/**
 * One-shot: mature first Bull Market caución via InvestmentService (domain path).
 * Usage: npx tsx scripts/mature-first-caucion.ts [--precheck-only | --apply]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaAccountRepository } from "../src/modules/accounts/account.repository.js";
import { FinancialService } from "../src/modules/financial/financial.service.js";
import { PrismaInvestmentRepository } from "../src/modules/investments/investment.repository.js";
import { InvestmentService } from "../src/modules/investments/investment.service.js";
import { PrismaTransactionRepository } from "../src/modules/transactions/transaction.repository.js";
import { computeBalance } from "../src/modules/transactions/transaction-balance.js";

config({ path: resolve(process.cwd(), ".env") });

const INVESTMENT_ID = "80efad77-c3a5-432c-afd5-158f4e096bc5";
const ACCOUNT_ID = "2ea2701b-157f-404b-9cb8-eceacc424287";
const USER_ID = "bb34e81c-ddf8-46d9-bae4-b0561ff059cf";
const CAPITAL = "25400000.00";
const EXPECTED = "102783.01";
const ACTUAL_RETURN = "95784.34";
const OCCURRED_AT = new Date("2026-09-09T15:00:00.000Z");
const TZ = "America/Argentina/Buenos_Aires";
const YEAR = 2026;
const MONTH = 9;

function money(value: { toFixed(digits: number): string }): string {
  return value.toFixed(2);
}

async function snapshot(prisma: PrismaClient, label: string) {
  const accounts = new PrismaAccountRepository(prisma);
  const transactions = new PrismaTransactionRepository(prisma);
  const financial = new FinancialService(transactions, accounts);

  const [investment, account, linked, allOnAccount, txCount, budgets] =
    await Promise.all([
      prisma.investment.findUniqueOrThrow({ where: { id: INVESTMENT_ID } }),
      prisma.account.findUniqueOrThrow({ where: { id: ACCOUNT_ID } }),
      prisma.transaction.findMany({
        where: {
          metadata: { path: ["investmentId"], equals: INVESTMENT_ID },
        },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.transaction.findMany({
        where: { accountId: ACCOUNT_ID, status: "ACTIVE" },
        select: {
          id: true,
          type: true,
          amount: true,
          metadata: true,
          accountId: true,
        },
      }),
      prisma.transaction.count(),
      prisma.budget.findMany({
        where: { userId: USER_ID },
        select: { id: true, amount: true, categoryId: true, year: true, month: true },
      }),
    ]);

  const balance = computeBalance(
    money(account.initialBalance),
    allOnAccount.map((m) => ({
      type: m.type,
      amount: money(m.amount),
      metadata: m.metadata,
      accountId: m.accountId,
    }))
  );

  const [gross, net, operating, fund, available] = await Promise.all([
    financial.getMonthlyGrossExpenses(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyNetExpenses(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyOperatingIncome(USER_ID, YEAR, MONTH, TZ),
    financial.getMonthlyFundConsumption(USER_ID, YEAR, MONTH, TZ),
    financial.getTotalAvailableARS(USER_ID),
  ]);

  const maturityLinked = linked.filter(
    (t) =>
      t.type === "INVESTMENT_PRINCIPAL_RETURN" || t.type === "INVESTMENT_RETURN"
  );

  return {
    label,
    investment: {
      id: investment.id,
      status: investment.status,
      principal: money(investment.principal),
      annualRate: investment.annualRate?.toFixed(6) ?? null,
      expectedReturn: investment.expectedReturn
        ? money(investment.expectedReturn)
        : null,
      actualReturn: investment.actualReturn
        ? money(investment.actualReturn)
        : null,
      startDate: investment.startDate.toISOString(),
      maturityDate: investment.maturityDate?.toISOString() ?? null,
    },
    derivedBalance: balance,
    linkedTransactions: linked.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: money(t.amount),
      occurredAt: t.occurredAt.toISOString(),
    })),
    maturityLinkedCount: maturityLinked.length,
    transactionCountTotal: txCount,
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

function assertPreconditions(before: Awaited<ReturnType<typeof snapshot>>): void {
  const inv = before.investment;
  if (inv.status !== "ACTIVE") {
    throw new Error(`ABORT: status=${inv.status}`);
  }
  if (inv.principal !== CAPITAL) {
    throw new Error(`ABORT: principal=${inv.principal}`);
  }
  if (inv.expectedReturn !== EXPECTED) {
    throw new Error(`ABORT: expectedReturn=${inv.expectedReturn}`);
  }
  if (inv.actualReturn !== null) {
    throw new Error(`ABORT: actualReturn=${inv.actualReturn}`);
  }
  if (before.derivedBalance !== "0.00") {
    throw new Error(`ABORT: balance=${before.derivedBalance}`);
  }
  if (before.maturityLinkedCount !== 0) {
    throw new Error(`ABORT: maturity txs=${before.maturityLinkedCount}`);
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
    assertPreconditions(before);

    const contract = {
      endpoint: "POST /api/investments/:id/mature",
      service: "InvestmentService.mature",
      body: {
        destinationAccountId: ACCOUNT_ID,
        capitalReturned: CAPITAL,
        actualReturn: ACTUAL_RETURN,
        occurredAt: OCCURRED_AT.toISOString(),
      },
      notes: [
        "capitalReturned must equal Investment.principal (not total credited).",
        "actualReturn is yield only (95784.34), not total 25495784.34.",
        "UI sends capitalReturned=investment.principal + form interés real.",
      ],
      simulation: {
        INVESTMENT_PRINCIPAL_RETURN: CAPITAL,
        INVESTMENT_RETURN: ACTUAL_RETURN,
        NOT: "INVESTMENT_RETURN 25495784.34",
        projectedBalance: "25495784.34",
      },
    };

    if (mode === "precheck") {
      console.log(JSON.stringify({ mode, contract, before }, null, 2));
      return;
    }

    const investments = new PrismaInvestmentRepository(prisma);
    const accounts = new PrismaAccountRepository(prisma);
    const transactions = new PrismaTransactionRepository(prisma);
    const service = new InvestmentService(investments, accounts, transactions);

    const result = await service.mature(USER_ID, INVESTMENT_ID, {
      destinationAccountId: ACCOUNT_ID,
      capitalReturned: CAPITAL,
      actualReturn: ACTUAL_RETURN,
      occurredAt: OCCURRED_AT,
    });

    const after = await snapshot(prisma, "AFTER");

    console.log(
      JSON.stringify(
        {
          mode,
          contract,
          before,
          result: {
            status: result.investment.status,
            principal: result.investment.principal,
            expectedReturn: result.investment.expectedReturn,
            actualReturn: result.investment.actualReturn,
            destinationAccountId: result.destinationAccountId,
            occurredAt: result.occurredAt.toISOString(),
            principalReturn: {
              id: result.principalReturn.id,
              type: result.principalReturn.type,
              amount: result.principalReturn.amount,
            },
            investmentReturn: result.investmentReturn
              ? {
                  id: result.investmentReturn.id,
                  type: result.investmentReturn.type,
                  amount: result.investmentReturn.amount,
                }
              : null,
          },
          after,
          invariants: {
            grossUnchanged:
              before.metrics.monthlyGrossExpenses ===
              after.metrics.monthlyGrossExpenses,
            netUnchanged:
              before.metrics.monthlyNetExpenses ===
              after.metrics.monthlyNetExpenses,
            operatingIncomeUnchanged:
              before.metrics.monthlyOperatingIncome ===
              after.metrics.monthlyOperatingIncome,
            fundConsumptionUnchanged:
              before.metrics.monthlyFundConsumption ===
              after.metrics.monthlyFundConsumption,
            budgetsUnchanged:
              JSON.stringify(before.budgets) === JSON.stringify(after.budgets),
            transactionCountDelta:
              after.transactionCountTotal - before.transactionCountTotal,
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
