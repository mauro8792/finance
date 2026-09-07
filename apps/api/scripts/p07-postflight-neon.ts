/**
 * Postflight read-only after P0.7 migrate deploy on Neon.
 * Usage: npx tsx scripts/p07-postflight-neon.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const parsed = new URL(url);
  const prisma = new PrismaClient();

  try {
    const migration = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null }>
    >(
      `SELECT migration_name, finished_at FROM "_prisma_migrations"
       WHERE migration_name = '20260907180000_credit_card_installment_schedule'`
    );

    const col = await prisma.$queryRawUnsafe<
      Array<{
        column_name: string;
        is_nullable: string;
        data_type: string;
      }>
    >(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'credit_card_installments'
         AND column_name = 'scheduled_for'`
    );

    const indexes = await prisma.$queryRawUnsafe<
      Array<{ indexname: string }>
    >(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'credit_card_installments'
         AND indexname IN (
           'credit_card_installments_scheduled_for_idx',
           'credit_card_installments_purchase_id_installment_number_key'
         )
       ORDER BY indexname`
    );

    const checks = await prisma.$queryRawUnsafe<
      Array<{ conname: string }>
    >(
      `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname = 'public'
         AND rel.relname = 'credit_card_installments'
         AND con.contype = 'c'
         AND con.conname = 'credit_card_installments_recognition_consistency'`
    );

    const [purchases, installments, cards, accounts, transactions] =
      await Promise.all([
        prisma.creditCardPurchase.count(),
        prisma.creditCardInstallment.count(),
        prisma.creditCard.count(),
        prisma.account.count(),
        prisma.transaction.count(),
      ]);

    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          migrationApplied:
            migration[0]?.finished_at !== null && migration[0] !== undefined,
          scheduled_for: col[0] ?? null,
          indexes: indexes.map((row) => row.indexname),
          recognitionCheck: checks[0]?.conname ?? null,
          counts: {
            credit_card_purchases: purchases,
            credit_card_installments: installments,
            credit_cards: cards,
            accounts,
            transactions,
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
  process.exit(1);
});
