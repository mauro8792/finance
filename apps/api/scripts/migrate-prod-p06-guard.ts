/**
 * READ-ONLY preflight / postflight for Neon P0.6 migrate deploy.
 * Usage:
 *   npx tsx scripts/migrate-prod-p06-guard.ts preflight
 *   npx tsx scripts/migrate-prod-p06-guard.ts postflight
 */
import { PrismaClient } from "@prisma/client";
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";

const EXPECTED_NAME = "neondb";
const EXPECTED_HOST =
  "ep-bitter-night-arfo4mnj-pooler.c-4.us-west-2.aws.neon.tech";
const EXPECTED_MIGRATION = "20260907160000_create_credit_card_purchase";

function assertTarget(url: string): { name: string; host: string } {
  const host = new URL(url).hostname;
  const name = databaseNameFromUrl(url);
  if (name !== EXPECTED_NAME || host !== EXPECTED_HOST) {
    throw new Error(
      `Target mismatch. Got ${name} @ ${host}; expected ${EXPECTED_NAME} @ ${EXPECTED_HOST}. STOP.`
    );
  }
  return { name, host };
}

async function preflight(prisma: PrismaClient): Promise<void> {
  const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL
    ORDER BY migration_name
  `;
  const appliedNames = new Set(applied.map((row) => row.migration_name));

  const fs = await import("node:fs");
  const path = await import("node:path");
  const migrationsDir = path.resolve("prisma/migrations");
  const folders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const pending = folders.filter((name) => !appliedNames.has(name));
  console.log(JSON.stringify({ mode: "preflight", pending }, null, 2));

  if (pending.length === 0) {
    throw new Error("No hay migraciones pendientes. STOP.");
  }
  if (pending.length !== 1 || pending[0] !== EXPECTED_MIGRATION) {
    throw new Error(
      `Migraciones pendientes inesperadas: ${pending.join(", ")}. STOP.`
    );
  }
  console.log(`OK: única pendiente = ${EXPECTED_MIGRATION}`);
}

async function postflight(prisma: PrismaClient): Promise<void> {
  const migration = await prisma.$queryRaw<
    Array<{ migration_name: string; finished: boolean }>
  >`
    SELECT migration_name, (finished_at IS NOT NULL) AS finished
    FROM _prisma_migrations
    WHERE migration_name = ${EXPECTED_MIGRATION}
  `;

  const tables = await prisma.$queryRawUnsafe<
    Array<{ purchases: string | null; installments: string | null }>
  >(
    `SELECT to_regclass('public.credit_card_purchases')::text AS purchases,
            to_regclass('public.credit_card_installments')::text AS installments`
  );

  const enums = await prisma.$queryRawUnsafe<Array<{ typname: string }>>(
    `SELECT typname FROM pg_type
     WHERE typname IN (
       'credit_card_purchase_status_enum',
       'credit_card_installment_status_enum'
     )
     ORDER BY typname`
  );

  const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename IN ('credit_card_purchases', 'credit_card_installments')
     ORDER BY indexname`
  );

  const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'
       AND rel.relname IN ('credit_card_purchases', 'credit_card_installments')
       AND c.contype = 'f'
     ORDER BY c.conname`
  );

  const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'
       AND rel.relname IN ('credit_card_purchases', 'credit_card_installments')
       AND c.contype = 'c'
     ORDER BY c.conname`
  );

  const uniqueOnTx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'credit_card_installments_recognized_transaction_id_key'`
  );

  const counts = await prisma.$queryRawUnsafe<
    Array<{
      purchases: bigint;
      installments: bigint;
      transactions: bigint;
      accounts: bigint;
      credit_cards: bigint;
    }>
  >(
    `SELECT
      (SELECT COUNT(*)::bigint FROM credit_card_purchases) AS purchases,
      (SELECT COUNT(*)::bigint FROM credit_card_installments) AS installments,
      (SELECT COUNT(*)::bigint FROM transactions) AS transactions,
      (SELECT COUNT(*)::bigint FROM accounts) AS accounts,
      (SELECT COUNT(*)::bigint FROM credit_cards) AS credit_cards`
  );

  console.log(
    JSON.stringify(
      {
        mode: "postflight",
        migration,
        tables,
        enums: enums.map((row) => row.typname),
        indexes: indexes.map((row) => row.indexname),
        foreignKeys: fks.map((row) => row.conname),
        checks: checks.map((row) => row.conname),
        recognizedTransactionIdUnique: uniqueOnTx.map((row) => row.indexname),
        counts: {
          purchases: Number(counts[0]?.purchases ?? 0),
          installments: Number(counts[0]?.installments ?? 0),
          transactions: Number(counts[0]?.transactions ?? 0),
          accounts: Number(counts[0]?.accounts ?? 0),
          creditCards: Number(counts[0]?.credit_cards ?? 0),
        },
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "preflight" && mode !== "postflight") {
    throw new Error("Usá: preflight | postflight");
  }

  const url = getDatabaseUrl();
  const target = assertTarget(url);
  console.log(`DB target: ${target.name} @ ${target.host}`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    if (mode === "preflight") {
      await preflight(prisma);
    } else {
      await postflight(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
