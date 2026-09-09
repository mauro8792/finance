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
    const expected = "20260909230000_add_credit_card_refund_expectation";
    const pending = applied.includes(expected) ? [] : [expected];

    const [
      transactions,
      creditCards,
      purchases,
      installments,
      statements,
      paymentLinks,
      investments,
      reimbursementsActive,
      accounts,
    ] = await Promise.all([
      prisma.transaction.count(),
      prisma.creditCard.count(),
      prisma.creditCardPurchase.count(),
      prisma.creditCardInstallment.count(),
      prisma.creditCardStatement.count().catch(() => -1),
      prisma.creditCardPaymentLink.count().catch(() => -1),
      prisma.investment.count(),
      prisma.transaction.count({
        where: { type: "REIMBURSEMENT", status: "ACTIVE" },
      }),
      prisma.account.count(),
    ]);

    // New tables may not exist yet
    let expectations = -1;
    let accreditations = -1;
    try {
      expectations = await prisma.creditCardRefundExpectation.count();
      accreditations = await prisma.creditCardRefundAccreditation.count();
    } catch {
      expectations = -1;
      accreditations = -1;
    }

    console.log(
      JSON.stringify(
        {
          host: parsed.hostname,
          database: parsed.pathname.replace(/^\//, ""),
          appliedCount: applied.length,
          lastApplied: applied.slice(-5),
          pending,
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
