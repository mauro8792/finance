/**
 * Production smoke (no writes): health + auth + MVP1 GETs + credit-card purchases.
 * Usage: npx tsx scripts/smoke-prod-p06.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

const API = process.env.SMOKE_API_URL?.trim() || "https://finance-2gxt.onrender.com";
const ORIGIN =
  process.env.SMOKE_WEB_ORIGIN?.trim() ||
  "https://finance-web-eta-ruby.vercel.app";
const email = process.env.BOOTSTRAP_EMAIL?.trim();
const password = process.env.BOOTSTRAP_PASSWORD?.trim();

if (!email || !password) {
  console.error("Faltan BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD en .env");
  process.exit(1);
}

type Result = { name: string; ok: boolean; detail: string };

async function main(): Promise<void> {
  const results: Result[] = [];

  const health = await fetch(`${API}/health`);
  const healthBody = await health.text();
  results.push({
    name: "GET /health",
    ok: health.ok && healthBody.includes('"ok"'),
    detail: `${health.status} ${healthBody.slice(0, 80)}`,
  });

  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
    },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = login.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.length > 0
      ? setCookie.map((c) => c.split(";")[0]).join("; ")
      : login.headers.get("set-cookie")?.split(",")[0]?.split(";")[0] ?? "";
  const loginBody = await login.text();
  results.push({
    name: "POST /api/auth/login",
    ok: login.ok && cookieHeader.length > 0,
    detail: `${login.status} cookie=${cookieHeader ? "yes" : "no"} body=${loginBody.slice(0, 60)}`,
  });

  async function get(path: string, name: string, expectOk = true): Promise<void> {
    const res = await fetch(`${API}${path}`, {
      headers: {
        cookie: cookieHeader,
        origin: ORIGIN,
      },
    });
    const text = await res.text();
    const ok = expectOk ? res.ok : res.status === 404;
    results.push({
      name,
      ok,
      detail: `${res.status} ${text.slice(0, 140)}`,
    });
  }

  if (cookieHeader) {
    await get("/api/accounts", "GET /api/accounts");
    await get("/api/transactions", "GET /api/transactions");
    await get("/api/financial/summary?year=2026&month=9", "GET /api/financial/summary");
    await get("/api/credit-cards", "GET /api/credit-cards");
    await get("/api/credit-card-purchases", "GET /api/credit-card-purchases");
    await get(
      "/api/credit-card-purchases/00000000-0000-0000-0000-000000000000",
      "GET purchase missing",
      false
    );
    await get(
      "/api/credit-cards/00000000-0000-0000-0000-000000000000/current-debt",
      "GET current-debt missing card",
      false
    );
  }

  console.log(JSON.stringify({ api: API, results }, null, 2));
  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
