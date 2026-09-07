/**
 * P0.8 CLI: recognize due credit-card installments (no cron).
 *
 * Usage:
 *   npm run installments:recognize-due -- --dry-run
 *   npm run installments:recognize-due -- --as-of=2027-01-15
 *   npm run installments:recognize-due -- --as-of=2027-01-15T12:00:00.000Z --user-id=<uuid>
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaCategoryRepository } from "../src/modules/categories/category.repository.js";
import { PrismaCreditCardRepository } from "../src/modules/credit-cards/credit-card.repository.js";
import { PrismaCreditCardPurchaseRepository } from "../src/modules/credit-card-purchases/credit-card-purchase.repository.js";
import { CreditCardPurchaseService } from "../src/modules/credit-card-purchases/credit-card-purchase.service.js";
import {
  parseAsOfArgument,
  parseRecognizeDueCliArgs,
  exitCodeForRecognizeDueResult,
} from "../src/modules/credit-card-purchases/recognize-due-cli.js";

config({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseRecognizeDueCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    console.log(`Usage:
  npm run installments:recognize-due -- [--as-of=ISO] [--dry-run] [--user-id=UUID]

  --as-of   Instant UTC (or YYYY-MM-DD => end of that UTC day). Default: server now once.
  --dry-run List eligible aggregates only; zero writes.
  --user-id Optional scope to one user.
`);
    return;
  }

  const now = new Date();
  let asOf: Date;
  try {
    asOf = parseAsOfArgument(parsed.asOf, now);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const service = new CreditCardPurchaseService(
    new PrismaCreditCardPurchaseRepository(),
    new PrismaCreditCardRepository(),
    new PrismaCategoryRepository(),
    { now: () => now }
  );

  const result = await service.recognizeDueInstallments({
    asOf,
    dryRun: parsed.dryRun,
    userId: parsed.userId,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = exitCodeForRecognizeDueResult(result);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
