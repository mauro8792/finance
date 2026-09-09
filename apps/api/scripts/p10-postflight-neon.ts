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
       WHERE migration_name = '20260909120000_add_credit_card_payment'`
    );

    const enumExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'transaction_type_enum'
           AND e.enumlabel = 'CREDIT_CARD_PAYMENT'
       ) AS exists`
    );

    const tableExists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='credit_card_payment_links'
       ) AS exists`
    );

    const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND tablename='credit_card_payment_links'
       ORDER BY indexname`
    );

    const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname='public' AND rel.relname='credit_card_payment_links'
         AND con.contype='f'
       ORDER BY con.conname`
    );

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
      prisma.creditCardStatement.count(),
      prisma.creditCardPaymentLink.count(),
    ]);

    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          migrationApplied:
            migration[0]?.finished_at !== null && migration[0] !== undefined,
          enumCreditCardPayment: enumExists[0]?.exists === true,
          tableExists: tableExists[0]?.exists === true,
          indexes: indexes.map((r) => r.indexname),
          fks: fks.map((r) => r.conname),
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
