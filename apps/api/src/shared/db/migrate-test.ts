import { spawnSync } from "node:child_process";
import { applyTestDatabaseUrl, databaseNameFromUrl } from "../../config/index.js";

const url = applyTestDatabaseUrl();
const name = databaseNameFromUrl(url);
console.log(`Migrating test database: ${name}`);

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
