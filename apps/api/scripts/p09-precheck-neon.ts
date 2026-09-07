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
    const applied = rows.filter((r) => r.finished).map((r) => r.migration_name);
    const expected = "20260907190000_create_credit_card_statement";
    const pending = applied.includes(expected) ? [] : [expected];
    const [cards, purchases, installments, transactions, statements] =
      await Promise.all([
        prisma.creditCard.count(),
        prisma.creditCardPurchase.count(),
        prisma.creditCardInstallment.count(),
        prisma.transaction.count(),
        prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT COUNT(*)::bigint AS n FROM information_schema.tables
           WHERE table_schema='public' AND table_name='credit_card_statements'`
        ).then(async (tableExists) => {
          if (Number(tableExists[0]?.n ?? 0) === 0) return 0;
          return prisma.creditCardStatement.count();
        }).catch(() => -1),
      ]);
    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          appliedCount: applied.length,
          pending,
          lastApplied: applied.slice(-3),
          counts: { cards, purchases, installments, transactions, statements },
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
