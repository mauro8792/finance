import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { computeBalance } from "../src/modules/transactions/transaction-balance.js";

config({ path: resolve(process.cwd(), ".env") });

const FIRST = "80efad77-c3a5-432c-afd5-158f4e096bc5";
const SECOND = "774fcb87-f995-4135-8cb6-eb91c13dd4e1";
const BULL = "2ea2701b-157f-404b-9cb8-eceacc424287";

async function main() {
  const url = process.env.DATABASE_URL!;
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished: boolean }>
    >(
      `SELECT migration_name, finished_at IS NOT NULL AS finished
       FROM "_prisma_migrations" ORDER BY started_at`
    );
    const applied = rows.filter((r) => r.finished).map((r) => r.migration_name);

    const schema = await prisma.$queryRawUnsafe<
      Array<{ table_name: string }>
    >(`SELECT table_name FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN (
           'credit_card_refund_expectations',
           'credit_card_refund_accreditations'
         )
       ORDER BY table_name`);

    const cols = await prisma.$queryRawUnsafe<
      Array<{ column_name: string; is_nullable: string; data_type: string }>
    >(`SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name='credit_card_refund_expectations'
       ORDER BY ordinal_position`);

    const checks = await prisma.$queryRawUnsafe<
      Array<{ conname: string; definition: string }>
    >(`SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'credit_card_refund_expectations'
         AND c.contype = 'c'`);

    const uniques = await prisma.$queryRawUnsafe<
      Array<{ indexname: string; indexdef: string }>
    >(`SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'credit_card_refund_accreditations'
         AND indexdef ILIKE '%UNIQUE%'`);

    const enums = await prisma.$queryRawUnsafe<
      Array<{ typname: string; enumlabel: string }>
    >(`SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname IN (
         'credit_card_refund_expectation_status_enum',
         'credit_card_refund_destination_type_enum'
       )
       ORDER BY t.typname, e.enumsortorder`);

    const [
      transactions,
      accounts,
      creditCards,
      purchases,
      installments,
      statements,
      paymentLinks,
      investments,
      reimbursementsActive,
      expectations,
      accreditations,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.account.count(),
      prisma.creditCard.count(),
      prisma.creditCardPurchase.count(),
      prisma.creditCardInstallment.count(),
      prisma.creditCardStatement.count(),
      prisma.creditCardPaymentLink.count(),
      prisma.investment.count(),
      prisma.transaction.count({
        where: { type: "REIMBURSEMENT", status: "ACTIVE" },
      }),
      prisma.creditCardRefundExpectation.count(),
      prisma.creditCardRefundAccreditation.count(),
    ]);

    const first = await prisma.investment.findUnique({ where: { id: FIRST } });
    const second = await prisma.investment.findUnique({ where: { id: SECOND } });
    const bull = await prisma.account.findUniqueOrThrow({ where: { id: BULL } });
    const bullTx = await prisma.transaction.findMany({
      where: { accountId: BULL, status: "ACTIVE" },
      select: { type: true, amount: true, metadata: true, accountId: true },
    });
    const bullBalance = computeBalance(
      bull.initialBalance.toFixed(2),
      bullTx.map((m) => ({
        type: m.type,
        amount: m.amount.toFixed(2),
        metadata: m.metadata,
        accountId: m.accountId,
      }))
    );

    console.log(
      JSON.stringify(
        {
          host: new URL(url).hostname,
          lastApplied: applied.slice(-3),
          pending: applied.includes(
            "20260909230000_add_credit_card_refund_expectation"
          )
            ? []
            : ["20260909230000_add_credit_card_refund_expectation"],
          tables: schema.map((t) => t.table_name),
          expectationColumns: cols,
          xorChecks: checks,
          accreditationUniques: uniques,
          enums,
          counts: {
            transactions,
            accounts,
            credit_cards: creditCards,
            credit_card_purchases: purchases,
            credit_card_installments: installments,
            credit_card_statements: statements,
            credit_card_payment_links: paymentLinks,
            investments,
            reimbursements_active: reimbursementsActive,
            refund_expectations: expectations,
            refund_accreditations: accreditations,
          },
          cauciones: {
            first: first && {
              status: first.status,
              principal: first.principal.toFixed(2),
              actualReturn: first.actualReturn?.toFixed(2) ?? null,
            },
            second: second && {
              status: second.status,
              principal: second.principal.toFixed(2),
              annualRate: second.annualRate?.toFixed(6) ?? null,
              startDate: second.startDate.toISOString(),
              maturityDate: second.maturityDate?.toISOString() ?? null,
              actualReturn: second.actualReturn?.toFixed(2) ?? null,
            },
            bullBalance,
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
