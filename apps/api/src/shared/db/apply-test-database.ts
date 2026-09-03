import { applyTestDatabaseUrl } from "../../config/index.js";

applyTestDatabaseUrl();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32) {
  process.env.SESSION_SECRET = "test-only-session-secret-32bytes-min!!";
}
process.env.SESSION_SECURE ??= "0";
