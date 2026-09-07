/**
 * P0.2 — Inventario READ-ONLY de movimientos legacy CREDIT_CARD en producción.
 *
 * - Solo SELECT / introspection de schema.
 * - No INSERT/UPDATE/DELETE/migrate/seed.
 * - No imprime DATABASE_URL, passwords ni PII (emails).
 *
 * Uso: npx tsx scripts/inventory-credit-card-legacy-readonly.ts
 * (cwd: apps/api o monorepo root con dotenv en apps/api/.env)
 */
import { PrismaClient } from "@prisma/client";
import { databaseNameFromUrl, getDatabaseUrl } from "../src/config/index.js";

const FORBIDDEN = process.argv.some((arg) =>
  ["--write", "--apply", "--migrate", "--seed"].includes(arg)
);

function safeTarget(url: string): { name: string; host: string } {
  const host = new URL(url).hostname;
  const name = databaseNameFromUrl(url);
  return { name, host };
}

async function main(): Promise<void> {
  if (FORBIDDEN) {
    throw new Error("Este script es READ-ONLY. No admite --write/--apply/--migrate/--seed.");
  }

  const url = getDatabaseUrl();
  const target = safeTarget(url);
  console.log(`READ-ONLY inventory`);
  console.log(`DB target: ${target.name} @ ${target.host}`);

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;

    const mvp2Tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%credit_card%'
          OR table_name IN (
            'credit_cards',
            'credit_card_purchases',
            'credit_card_installments',
            'credit_card_statements',
            'expected_refunds',
            'promotions'
          )
        )
      ORDER BY table_name
    `;

    const creditCardIdColumn = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name IN ('credit_card_id', 'credit_card_purchase_id', 'credit_card_installment_id')
      ORDER BY column_name
    `;

    const activeTotal = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM transactions
      WHERE status = 'ACTIVE'
    `;

    const activeByTypeMethod = await prisma.$queryRaw<
      Array<{ type: string; payment_method: string | null; count: bigint }>
    >`
      SELECT
        type::text AS type,
        payment_method::text AS payment_method,
        COUNT(*)::bigint AS count
      FROM transactions
      WHERE status = 'ACTIVE'
      GROUP BY type, payment_method
      ORDER BY type, payment_method
    `;

    const creditCardTotal = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM transactions
      WHERE status = 'ACTIVE'
        AND payment_method = 'CREDIT_CARD'
    `;

    const byMonth = await prisma.$queryRaw<
      Array<{ year_month: string; count: bigint; amount_sum: string }>
    >`
      SELECT
        to_char(
          (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
          'YYYY-MM'
        ) AS year_month,
        COUNT(*)::bigint AS count,
        SUM(amount)::text AS amount_sum
      FROM transactions
      WHERE status = 'ACTIVE'
        AND payment_method = 'CREDIT_CARD'
      GROUP BY 1
      ORDER BY 1
    `;

    const byAccount = await prisma.$queryRaw<
      Array<{
        account_id: string;
        account_name: string;
        account_type: string;
        currency: string;
        count: bigint;
        amount_sum: string;
      }>
    >`
      SELECT
        a.id AS account_id,
        a.name AS account_name,
        a.type::text AS account_type,
        a.currency::text AS currency,
        COUNT(t.id)::bigint AS count,
        SUM(t.amount)::text AS amount_sum
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.status = 'ACTIVE'
        AND t.payment_method = 'CREDIT_CARD'
      GROUP BY a.id, a.name, a.type, a.currency
      ORDER BY SUM(t.amount) DESC
    `;

    const byCategory = await prisma.$queryRaw<
      Array<{
        category_id: string | null;
        category_name: string | null;
        count: bigint;
        amount_sum: string;
      }>
    >`
      SELECT
        c.id AS category_id,
        c.name AS category_name,
        COUNT(t.id)::bigint AS count,
        SUM(t.amount)::text AS amount_sum
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.status = 'ACTIVE'
        AND t.payment_method = 'CREDIT_CARD'
      GROUP BY c.id, c.name
      ORDER BY SUM(t.amount) DESC
    `;

    const dateRange = await prisma.$queryRaw<
      Array<{ min_occurred_at: Date | null; max_occurred_at: Date | null }>
    >`
      SELECT
        MIN(occurred_at) AS min_occurred_at,
        MAX(occurred_at) AS max_occurred_at
      FROM transactions
      WHERE status = 'ACTIVE'
        AND payment_method = 'CREDIT_CARD'
    `;

    const typeBreakdown = await prisma.$queryRaw<
      Array<{ type: string; count: bigint }>
    >`
      SELECT type::text AS type, COUNT(*)::bigint AS count
      FROM transactions
      WHERE status = 'ACTIVE'
        AND payment_method = 'CREDIT_CARD'
      GROUP BY type
      ORDER BY count DESC
    `;

    // Candidatos a "pago de resumen" como EXPENSE — heurística, no certeza.
    const paymentCandidates = await prisma.$queryRaw<
      Array<{
        id_prefix: string;
        type: string;
        payment_method: string | null;
        amount: string;
        year_month: string;
        description_preview: string | null;
        account_name: string;
      }>
    >`
      SELECT
        LEFT(t.id::text, 8) AS id_prefix,
        t.type::text AS type,
        t.payment_method::text AS payment_method,
        t.amount::text AS amount,
        to_char(
          (t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
          'YYYY-MM'
        ) AS year_month,
        LEFT(COALESCE(t.description, ''), 80) AS description_preview,
        a.name AS account_name
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.status = 'ACTIVE'
        AND t.type = 'EXPENSE'
        AND (
          t.description ILIKE '%resumen%'
          OR t.description ILIKE '%pago%tarjeta%'
          OR t.description ILIKE '%pago de tarjeta%'
          OR t.description ILIKE '%pago tarjeta%'
          OR t.description ILIKE '%visa%'
          OR t.description ILIKE '%mastercard%'
          OR t.description ILIKE '%master card%'
          OR t.description ILIKE '%amex%'
          OR t.description ILIKE '%american express%'
          OR t.description ILIKE '%liquidaci%'
          OR t.description ILIKE '%cerrar tarjeta%'
          OR t.description ILIKE '%pago %visa%'
          OR t.description ILIKE '%pago %amex%'
        )
      ORDER BY t.occurred_at DESC
      LIMIT 50
    `;

    const reimbursementsLinked = await prisma.$queryRaw<
      Array<{ count: bigint; amount_sum: string | null }>
    >`
      SELECT
        COUNT(r.id)::bigint AS count,
        COALESCE(SUM(r.amount), 0)::text AS amount_sum
      FROM transactions r
      JOIN transactions e ON e.id = r.related_transaction_id
      WHERE r.status = 'ACTIVE'
        AND r.type = 'REIMBURSEMENT'
        AND e.status = 'ACTIVE'
        AND e.payment_method = 'CREDIT_CARD'
    `;

    const sampleLegacy = await prisma.$queryRaw<
      Array<{
        id_prefix: string;
        year_month: string;
        amount: string;
        category_name: string | null;
        account_name: string;
        description_preview: string | null;
      }>
    >`
      SELECT
        LEFT(t.id::text, 8) AS id_prefix,
        to_char(
          (t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires'),
          'YYYY-MM'
        ) AS year_month,
        t.amount::text AS amount,
        c.name AS category_name,
        a.name AS account_name,
        LEFT(COALESCE(t.description, ''), 60) AS description_preview
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.status = 'ACTIVE'
        AND t.payment_method = 'CREDIT_CARD'
      ORDER BY t.occurred_at DESC
      LIMIT 5
    `;

    const report = {
      readOnly: true,
      writesPerformed: false,
      inventoryDate: "2026-09-06",
      dbTarget: `${target.name} @ ${target.host}`,
      timezoneForMonths: "America/Argentina/Buenos_Aires",
      mvp2TablesFound: mvp2Tables.map((row) => row.table_name),
      creditCardColumnsOnTransactions: creditCardIdColumn.map(
        (row) => row.column_name
      ),
      activeTransactionsTotal: Number(activeTotal[0]?.count ?? 0),
      activeByTypeAndPaymentMethod: activeByTypeMethod.map((row) => ({
        type: row.type,
        paymentMethod: row.payment_method,
        count: Number(row.count),
      })),
      activeCreditCardLegacyTotal: Number(creditCardTotal[0]?.count ?? 0),
      creditCardTypeBreakdown: typeBreakdown.map((row) => ({
        type: row.type,
        count: Number(row.count),
      })),
      byMonth: byMonth.map((row) => ({
        yearMonth: row.year_month,
        count: Number(row.count),
        amountSum: row.amount_sum,
      })),
      byAccount: byAccount.map((row) => ({
        accountIdPrefix: row.account_id.slice(0, 8),
        accountName: row.account_name,
        accountType: row.account_type,
        currency: row.currency,
        count: Number(row.count),
        amountSum: row.amount_sum,
      })),
      byCategory: byCategory.map((row) => ({
        categoryIdPrefix: row.category_id ? row.category_id.slice(0, 8) : null,
        categoryName: row.category_name,
        count: Number(row.count),
        amountSum: row.amount_sum,
      })),
      dateRange: {
        minOccurredAt: dateRange[0]?.min_occurred_at?.toISOString() ?? null,
        maxOccurredAt: dateRange[0]?.max_occurred_at?.toISOString() ?? null,
      },
      statementPaymentExpenseCandidates: paymentCandidates.map((row) => ({
        idPrefix: row.id_prefix,
        type: row.type,
        paymentMethod: row.payment_method,
        amount: row.amount,
        yearMonth: row.year_month,
        accountName: row.account_name,
        descriptionPreview: row.description_preview,
        certainty: "candidate_only",
      })),
      reimbursementsLinkedToLegacyCreditCard: {
        count: Number(reimbursementsLinked[0]?.count ?? 0),
        amountSum: reimbursementsLinked[0]?.amount_sum ?? "0",
      },
      anonymizedSampleLegacy: sampleLegacy.map((row) => ({
        idPrefix: row.id_prefix,
        yearMonth: row.year_month,
        amount: row.amount,
        categoryName: row.category_name,
        accountName: row.account_name,
        descriptionPreview: row.description_preview,
      })),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
