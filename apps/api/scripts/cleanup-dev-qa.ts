import { PrismaClient } from "@prisma/client";
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";
import { zonedDateParts } from "../src/shared/time/month-range.js";

const KEEP_ACCOUNT_NAME = "Fondo indemnización prueba";
const USER_TZ = "America/Argentina/Buenos_Aires";
const APPLY = process.argv.includes("--apply");

function amountOf(value: { toFixed(digits: number): string }): string {
  return value.toFixed(2);
}

function isPreservedTransaction(input: {
  type: string;
  amount: string;
  occurredAt: Date;
  metadata: unknown;
}): boolean {
  const { year, month, day } = zonedDateParts(input.occurredAt, USER_TZ);
  if (
    input.type === "INCOME" &&
    input.amount === "40000000.00" &&
    year === 2026 &&
    month === 9
  ) {
    const metadata = input.metadata as { incomeKind?: string } | null;
    return metadata?.incomeKind === "CAPITAL";
  }
  return (
    input.type === "EXPENSE" &&
    input.amount === "2000000.00" &&
    year === 2026 &&
    day === 15 &&
    (month === 6 || month === 7 || month === 8)
  );
}

function assertDevOnly(url: string): { name: string; host: string } {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("El cleanup DEV-only no puede correr en production.");
  }
  const name = databaseNameFromUrl(url);
  const host = new URL(url).hostname;
  if (name.endsWith("_test")) {
    throw new Error("El cleanup no puede correr contra la DB de tests.");
  }
  if (name !== "personal_finance") {
    throw new Error("El cleanup sólo admite la DB local personal_finance.");
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("El cleanup sólo admite host local.");
  }
  return { name, host };
}

async function main(): Promise<void> {
  const url = getDatabaseUrl();
  const { name, host } = assertDevOnly(url);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const [users, accounts, categories, transactions, housing, payments, budgets, exchanges, investments] =
      await Promise.all([
        prisma.user.findMany(),
        prisma.account.findMany(),
        prisma.category.findMany(),
        prisma.transaction.findMany(),
        prisma.housingObligation.findMany(),
        prisma.housingPayment.findMany(),
        prisma.budget.findMany(),
        prisma.currencyExchange.findMany(),
        prisma.investment.findMany(),
      ]);

    const keepAccountIds = new Set(
      accounts.filter((item) => item.name === KEEP_ACCOUNT_NAME).map((item) => item.id)
    );
    const keepTransactions = transactions.filter((item) => {
      const account = accounts.find((account) => account.id === item.accountId);
      return (
        account !== undefined &&
        keepAccountIds.has(account.id) &&
        isPreservedTransaction({
          type: item.type,
          amount: amountOf(item.amount),
          occurredAt: item.occurredAt,
          metadata: item.metadata,
        })
      );
    });
    const keepTransactionIds = new Set(keepTransactions.map((item) => item.id));
    if (keepAccountIds.size !== 1 || keepTransactions.length !== 4) {
      throw new Error(
        `No se encontró exactamente la prueba manual a conservar (cuentas=${keepAccountIds.size}, movimientos=${keepTransactions.length}). Abortando.`
      );
    }
    const keepCategoryIds = new Set(
      categories
        .filter(
          (item) =>
            item.isSystem ||
            item.name === "Otros" ||
            keepTransactions.some((tx) => tx.categoryId === item.id)
        )
        .map((item) => item.id)
    );

    const removeAccounts = accounts.filter((item) => !keepAccountIds.has(item.id));
    const removeTransactions = transactions.filter((item) => !keepTransactionIds.has(item.id));
    const removeCategories = categories.filter((item) => !keepCategoryIds.has(item.id));

    console.log(`DB: ${name} @ ${host}`);
    console.log(APPLY ? "Modo: APPLY" : "Modo: dry-run (pasar --apply para borrar)");
    console.log("Conservar:");
    for (const user of users) {
      console.log(`- User ${user.name}`);
    }
    for (const account of accounts.filter((item) => keepAccountIds.has(item.id))) {
      console.log(`- Account ${account.name}`);
    }
    for (const tx of keepTransactions) {
      const { year, month, day } = zonedDateParts(tx.occurredAt, USER_TZ);
      console.log(
        `- Transaction ${tx.type} ${amountOf(tx.amount)} ${tx.currency} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
      );
    }
    for (const category of categories.filter((item) => keepCategoryIds.has(item.id))) {
      console.log(`- Category ${category.name}`);
    }

    console.log("Eliminar:");
    console.log(`- housing_payments: ${payments.length}`);
    console.log(`- currency_exchanges: ${exchanges.length}`);
    console.log(`- budgets: ${budgets.length}`);
    console.log(`- investments: ${investments.length}`);
    console.log(`- housing_obligations: ${housing.length}`);
    console.log(`- transactions: ${removeTransactions.length}`);
    for (const account of removeAccounts) {
      console.log(`- account ${account.name}`);
    }
    for (const category of removeCategories) {
      console.log(`- category ${category.name}`);
    }

    if (!APPLY) {
      console.log("Nada se borró. Reejecutar con --apply para confirmar.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.housingPayment.deleteMany();
      await tx.currencyExchange.deleteMany();
      await tx.budget.deleteMany();
      await tx.investment.deleteMany();
      await tx.transaction.deleteMany({
        where: { id: { notIn: [...keepTransactionIds] } },
      });
      await tx.housingObligation.deleteMany();
      await tx.account.deleteMany({
        where: { id: { notIn: [...keepAccountIds] } },
      });
      await tx.category.deleteMany({
        where: { id: { notIn: [...keepCategoryIds] } },
      });
    });

    console.log("Cleanup aplicado.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Cleanup falló.");
  process.exitCode = 1;
});
