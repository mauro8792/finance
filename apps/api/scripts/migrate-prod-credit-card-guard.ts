/**
 * READ-ONLY preflight / postflight for Neon migrate deploy.
 * Usage:
 *   npx tsx scripts/migrate-prod-credit-card-guard.ts preflight
 *   npx tsx scripts/migrate-prod-credit-card-guard.ts postflight
 */
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";
import { PrismaClient } from "@prisma/client";

const EXPECTED_NAME = "neondb";
const EXPECTED_HOST =
  "ep-bitter-night-arfo4mnj-pooler.c-4.us-west-2.aws.neon.tech";
const EXPECTED_MIGRATION = "20260906213000_create_credit_card";

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
    throw new Error("No hay migraciones pendientes. STOP (nada que aplicar).");
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

  const table = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'credit_cards'
    ) AS exists
  `;

  const enumExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'credit_card_fee_status_enum'
    ) AS exists
  `;

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'credit_cards'
    ORDER BY indexname
  `;

  const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'credit_cards'
      AND c.contype IN ('c', 'f', 'p', 'u')
    ORDER BY c.conname
  `;

  const cardCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM credit_cards
  `;

  const txActive = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM transactions WHERE status = 'ACTIVE'
  `;

  const txTotal = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM transactions
  `;

  const accountCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM accounts
  `;

  const txCreditCols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name LIKE '%credit%'
  `;

  console.log(
    JSON.stringify(
      {
        mode: "postflight",
        migration,
        creditCardsTableExists: table[0]?.exists === true,
        feeEnumExists: enumExists[0]?.exists === true,
        indexes: indexes.map((row) => row.indexname),
        constraints: checks.map((row) => row.conname),
        creditCardsRowCount: Number(cardCount[0]?.count ?? 0),
        transactionsActive: Number(txActive[0]?.count ?? 0),
        transactionsTotal: Number(txTotal[0]?.count ?? 0),
        accountsTotal: Number(accountCount[0]?.count ?? 0),
        transactionCreditColumns: txCreditCols.map((row) => row.column_name),
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
