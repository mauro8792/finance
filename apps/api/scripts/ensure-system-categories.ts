import {
  disconnectEnsureSystemCategories,
  ensureSystemExpenseCategories,
  formatEnsureSystemCategoriesReport,
} from "../src/modules/categories/ensure-system-categories.js";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await ensureSystemExpenseCategories({ dryRun });
  console.log(formatEnsureSystemCategoriesReport(result));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectEnsureSystemCategories();
  });
