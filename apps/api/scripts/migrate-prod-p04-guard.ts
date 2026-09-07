/**
 * READ-ONLY preflight / postflight for Neon P0.4 migrate deploy.
 * Usage:
 *   npx tsx scripts/migrate-prod-p04-guard.ts preflight
 *   npx tsx scripts/migrate-prod-p04-guard.ts postflight
 */
import { PrismaClient } from "@prisma/client";
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";

const EXPECTED_NAME = "neondb";
const EXPECTED_HOST =
  "ep-bitter-night-arfo4mnj-pooler.c-4.us-west-2.aws.neon.tech";
const EXPECTED_MIGRATION = "20260907120000_add_transaction_credit_card_id";

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

  const column = await prisma.$queryRaw<
    Array<{
      column_name: string;
      is_nullable: string;
      data_type: string;
      udt_name: string;
    }>
  >`
    SELECT column_name, is_nullable, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name IN ('credit_card_id', 'account_id')
    ORDER BY column_name
  `;

  const fk = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'transactions'
      AND c.conname = 'transactions_credit_card_id_fkey'
  `;

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND indexname = 'transactions_credit_card_id_idx'
  `;

  const counts = await prisma.$queryRaw<
    Array<{
      transactions_total: bigint;
      transactions_active: bigint;
      credit_card_id_not_null: bigint;
      accounts_total: bigint;
      credit_cards_total: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::bigint FROM transactions) AS transactions_total,
      (SELECT COUNT(*)::bigint FROM transactions WHERE status = 'ACTIVE') AS transactions_active,
      (SELECT COUNT(*)::bigint FROM transactions WHERE credit_card_id IS NOT NULL) AS credit_card_id_not_null,
      (SELECT COUNT(*)::bigint FROM accounts) AS accounts_total,
      (SELECT COUNT(*)::bigint FROM credit_cards) AS credit_cards_total
  `;

  console.log(
    JSON.stringify(
      {
        mode: "postflight",
        migration,
        columns: column,
        foreignKey: fk.map((row) => row.conname),
        indexes: indexes.map((row) => row.indexname),
        counts: {
          transactionsTotal: Number(counts[0]?.transactions_total ?? 0),
          transactionsActive: Number(counts[0]?.transactions_active ?? 0),
          creditCardIdNotNull: Number(counts[0]?.credit_card_id_not_null ?? 0),
          accountsTotal: Number(counts[0]?.accounts_total ?? 0),
          creditCardsTotal: Number(counts[0]?.credit_cards_total ?? 0),
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
