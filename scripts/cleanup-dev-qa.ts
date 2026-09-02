import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npx",
  ["tsx", "scripts/cleanup-dev-qa.ts", ...process.argv.slice(2)],
  {
    cwd: path.join(root, "apps", "api"),
    stdio: "inherit",
    shell: true,
  }
);

process.exit(result.status ?? 1);
