import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const parsed = new URL(url);
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished: boolean }>
    >(
      `SELECT migration_name, finished_at IS NOT NULL AS finished
       FROM "_prisma_migrations" ORDER BY started_at`
    );
    const applied = rows
      .filter((r) => r.finished)
      .map((r) => r.migration_name);
    const expected = "20260909120000_add_credit_card_payment";
    const pending = applied.includes(expected) ? [] : [expected];

    const [
      accounts,
      transactions,
      cards,
      purchases,
      installments,
      statements,
      paymentLinks,
    ] = await Promise.all([
      prisma.account.count(),
      prisma.transaction.count(),
      prisma.creditCard.count(),
      prisma.creditCardPurchase.count(),
      prisma.creditCardInstallment.count(),
      prisma.creditCardStatement.count().catch(() => -1),
      prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='credit_card_payment_links'
         ) AS exists`
      ).then(async (t) => {
        if (!t[0]?.exists) return 0;
        return prisma.creditCardPaymentLink.count();
      }),
    ]);

    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          appliedCount: applied.length,
          pending,
          lastApplied: applied.slice(-3),
          counts: {
            accounts,
            transactions,
            credit_cards: cards,
            credit_card_purchases: purchases,
            credit_card_installments: installments,
            credit_card_statements: statements,
            credit_card_payment_links: paymentLinks,
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
