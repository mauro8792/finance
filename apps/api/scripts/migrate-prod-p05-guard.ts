/**
 * READ-ONLY preflight / postflight for Neon P0.5 migrate deploy.
 * Usage:
 *   npx tsx scripts/migrate-prod-p05-guard.ts preflight
 *   npx tsx scripts/migrate-prod-p05-guard.ts postflight
 */
import { PrismaClient } from "@prisma/client";
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";

const EXPECTED_NAME = "neondb";
const EXPECTED_HOST =
  "ep-bitter-night-arfo4mnj-pooler.c-4.us-west-2.aws.neon.tech";
const EXPECTED_MIGRATION = "20260907140000_transaction_account_id_nullable";

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

  const columns = await prisma.$queryRaw<
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

  const counts = await prisma.$queryRaw<
    Array<{
      transactions_total: bigint;
      transactions_active: bigint;
      account_id_null: bigint;
      credit_card_id_not_null: bigint;
      accounts_total: bigint;
      credit_cards_total: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::bigint FROM transactions) AS transactions_total,
      (SELECT COUNT(*)::bigint FROM transactions WHERE status = 'ACTIVE') AS transactions_active,
      (SELECT COUNT(*)::bigint FROM transactions WHERE account_id IS NULL) AS account_id_null,
      (SELECT COUNT(*)::bigint FROM transactions WHERE credit_card_id IS NOT NULL) AS credit_card_id_not_null,
      (SELECT COUNT(*)::bigint FROM accounts) AS accounts_total,
      (SELECT COUNT(*)::bigint FROM credit_cards) AS credit_cards_total
  `;

  const sampleAccountIds = await prisma.$queryRaw<
    Array<{ id: string; account_id: string | null; credit_card_id: string | null }>
  >`
    SELECT id::text, account_id::text, credit_card_id::text
    FROM transactions
    ORDER BY created_at
    LIMIT 5
  `;

  console.log(
    JSON.stringify(
      {
        mode: "postflight",
        migration,
        columns,
        counts: {
          transactionsTotal: Number(counts[0]?.transactions_total ?? 0),
          transactionsActive: Number(counts[0]?.transactions_active ?? 0),
          accountIdNull: Number(counts[0]?.account_id_null ?? 0),
          creditCardIdNotNull: Number(counts[0]?.credit_card_id_not_null ?? 0),
          accountsTotal: Number(counts[0]?.accounts_total ?? 0),
          creditCardsTotal: Number(counts[0]?.credit_cards_total ?? 0),
        },
        sampleRows: sampleAccountIds,
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
