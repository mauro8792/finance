/**
 * One-shot admin correction: first Bull Market caución capital mis-init.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/fix-first-caucion-capital.ts --dry-run
 *   npx tsx scripts/fix-first-caucion-capital.ts --apply
 *
 * Does NOT register maturity. Does NOT create a new caución.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  FirstCaucionCorrectionError,
  PROD_FIRST_CAUCION_CORRECTION_TARGETS,
  correctFirstCaucionCapital,
  parseFixFirstCaucionCliArgs,
} from "../src/modules/investments/fix-first-caucion-capital.js";

config({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseFixFirstCaucionCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    console.log(`Usage:
  npx tsx scripts/fix-first-caucion-capital.ts --dry-run
  npx tsx scripts/fix-first-caucion-capital.ts --apply

  --dry-run  Validate preconditions and print BEFORE/AFTER; zero writes.
  --apply    Atomic correction of INCOME + Investment.principal + OUTFLOW.
`);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const report = await correctFirstCaucionCapital(prisma, {
      dryRun: parsed.dryRun,
      targets: {
        ...PROD_FIRST_CAUCION_CORRECTION_TARGETS,
        startDate: new Date(PROD_FIRST_CAUCION_CORRECTION_TARGETS.startDate),
        maturityDate: new Date(PROD_FIRST_CAUCION_CORRECTION_TARGETS.maturityDate),
      },
    });

    console.log(
      JSON.stringify(
        {
          host: new URL(url).hostname,
          database: new URL(url).pathname.replace(/^\//, ""),
          mode: report.dryRun ? "dry-run" : "apply",
          ...report,
        },
        null,
        2
      )
    );
  } catch (error) {
    if (error instanceof FirstCaucionCorrectionError) {
      console.error(
        JSON.stringify(
          { ok: false, code: error.code, message: error.message },
          null,
          2
        )
      );
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
