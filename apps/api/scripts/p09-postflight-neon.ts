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
    const migration = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null }>
    >(
      `SELECT migration_name, finished_at FROM "_prisma_migrations"
       WHERE migration_name = '20260907190000_create_credit_card_statement'`
    );

    const table = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='credit_card_statements'
       ) AS exists`
    );

    const enumExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_type WHERE typname = 'credit_card_statement_status_enum'
       ) AS exists`
    );

    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND tablename='credit_card_statements'
       ORDER BY indexname`
    );

    const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname='public' AND rel.relname='credit_card_statements'
         AND con.contype='c'
       ORDER BY con.conname`
    );

    const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname='public' AND rel.relname='credit_card_statements'
         AND con.contype='f'
       ORDER BY con.conname`
    );

    const [cards, purchases, installments, transactions, statements] =
      await Promise.all([
        prisma.creditCard.count(),
        prisma.creditCardPurchase.count(),
        prisma.creditCardInstallment.count(),
        prisma.transaction.count(),
        prisma.creditCardStatement.count(),
      ]);

    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          migrationApplied:
            migration[0]?.finished_at !== null && migration[0] !== undefined,
          tableExists: table[0]?.exists === true,
          enumExists: enumExists[0]?.exists === true,
          indexes: indexes.map((r) => r.indexname),
          checks: checks.map((r) => r.conname),
          fks: fks.map((r) => r.conname),
          counts: {
            credit_cards: cards,
            credit_card_purchases: purchases,
            credit_card_installments: installments,
            transactions,
            credit_card_statements: statements,
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
