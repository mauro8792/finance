import { app } from "./app.js";
import { assertProductionSessionSecret, assertProductionWebOrigin, config, getDatabaseUrl } from "./config/index.js";
import { getPrismaClient } from "./shared/db/prisma.js";
import { installGracefulShutdown } from "./shutdown.js";

try {
  assertProductionWebOrigin();
  assertProductionSessionSecret();
  getDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

installGracefulShutdown(server, {
  disconnect: () => getPrismaClient().$disconnect(),
});
