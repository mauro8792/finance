import { app } from "./app.js";
import { config, getDatabaseUrl } from "./config/index.js";

try {
  getDatabaseUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
