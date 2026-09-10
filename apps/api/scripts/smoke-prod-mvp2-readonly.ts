/**
 * Production smoke MVP2 (cards / refunds / promotions) — READ-ONLY.
 *
 * Purpose:
 * - Verify /health + auth session
 * - List accounts, transactions, cards, purchases, investments, refunds, promotions
 * - Invalid UUIDs must return controlled domain/API JSON errors (not Express HTML 404)
 * - Confirm Neon counts unchanged (no fictitious create/apply)
 *
 * Does NOT:
 * - create promotions / apply / accredit / payments
 * - mutate investments or invent financial data
 *
 * Usage (from apps/api):
 *   npx tsx scripts/smoke-prod-mvp2-readonly.ts
 *
 * Requires BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD in .env.
 * Optional: SMOKE_API_URL, SMOKE_WEB_ORIGIN.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env") });

const API = process.env.SMOKE_API_URL?.trim() || "https://finance-2gxt.onrender.com";
const ORIGIN =
  process.env.SMOKE_WEB_ORIGIN?.trim() ||
  "https://finance-web-eta-ruby.vercel.app";
const email = process.env.BOOTSTRAP_EMAIL?.trim();
const password = process.env.BOOTSTRAP_PASSWORD?.trim();

if (!email || !password) {
  console.error("Faltan BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD");
  process.exit(1);
}

type Result = { name: string; ok: boolean; detail: string };

function isApiJsonError(status: number, text: string): boolean {
  if (status < 400) return false;
  try {
    const body = JSON.parse(text) as { error?: { code?: string } | string };
    return typeof body === "object" && body !== null && "error" in body;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const results: Result[] = [];
  const missing = randomUUID();

  const health = await fetch(`${API}/health`);
  results.push({
    name: "GET /health",
    ok: health.ok,
    detail: `${health.status}`,
  });

  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = login.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.length > 0
      ? setCookie.map((c) => c.split(";")[0]).join("; ")
      : login.headers.get("set-cookie")?.split(",")[0]?.split(";")[0] ?? "";
  results.push({
    name: "POST /api/auth/login",
    ok: login.ok && cookieHeader.length > 0,
    detail: `${login.status}`,
  });

  async function get(path: string, name: string, expectStatus = 200) {
    const res = await fetch(`${API}${path}`, {
      headers: { cookie: cookieHeader, origin: ORIGIN },
    });
    const text = await res.text();
    results.push({
      name,
      ok: res.status === expectStatus,
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
    return { res, text };
  }

  async function post(
    path: string,
    name: string,
    body: unknown,
    expectStatuses: number[]
  ) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        origin: ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const ok =
      expectStatuses.includes(res.status) && isApiJsonError(res.status, text);
    results.push({
      name,
      ok,
      detail: `${res.status} ${text.slice(0, 180)}`,
    });
    return { res, text };
  }

  await get("/api/accounts", "GET /api/accounts");
  await get("/api/transactions", "GET /api/transactions");
  await get("/api/financial/summary", "GET /api/financial/summary");
  await get("/api/credit-cards", "GET /api/credit-cards");
  await get("/api/credit-card-purchases", "GET /api/credit-card-purchases");
  await get("/api/investments", "GET /api/investments");
  await get("/api/credit-card-refunds/expected", "GET refunds/expected");
  const promoList = await get(
    "/api/credit-card-promotions",
    "GET /api/credit-card-promotions"
  );
  try {
    const parsed = JSON.parse(promoList.text) as unknown;
    results.push({
      name: "promotions list empty or array",
      ok: Array.isArray(parsed),
      detail: Array.isArray(parsed) ? `len=${parsed.length}` : "not-array",
    });
  } catch {
    results.push({
      name: "promotions list empty or array",
      ok: false,
      detail: "invalid json",
    });
  }

  await get(
    `/api/credit-cards/${missing}/statements`,
    "GET statements missing card → controlled",
    404
  );
  await get(
    `/api/credit-cards/${missing}/payments`,
    "GET payments missing card → controlled",
    404
  );
  await get(
    `/api/credit-card-promotions/${missing}`,
    "GET promotion missing id → controlled",
    404
  );
  await post(
    `/api/credit-card-promotions/${missing}/preview`,
    "POST preview missing promo → controlled",
    { originalExpenseTransactionId: missing },
    [404, 400]
  );
  await post(
    `/api/credit-card-promotions/${missing}/apply`,
    "POST apply missing promo → controlled (no create)",
    {
      originalExpenseTransactionId: missing,
      idempotencyKey: `smoke-p12-${randomUUID()}`,
    },
    [404, 400]
  );

  await get(
    `/api/credit-card-refunds/expected/${missing}`,
    "GET expected missing id → controlled",
    404
  );
  await post(
    "/api/credit-card-refunds/expected",
    "POST expected missing source → controlled",
    { expectedAmount: "1000.00" },
    [400]
  );

  const prisma = new PrismaClient();
  try {
    const [tx, inv, promo, app, exp, acc] = await Promise.all([
      prisma.transaction.count(),
      prisma.investment.count(),
      prisma.creditCardPromotion.count(),
      prisma.creditCardPromotionApplication.count(),
      prisma.creditCardRefundExpectation.count(),
      prisma.creditCardRefundAccreditation.count(),
    ]);
    results.push({
      name: "Neon counts after smoke (no fictitious writes)",
      ok:
        tx === 21 &&
        inv === 2 &&
        promo === 0 &&
        app === 0 &&
        exp === 0 &&
        acc === 0,
      detail: `tx=${tx} inv=${inv} promo=${promo} app=${app} exp=${exp} acc=${acc}`,
    });
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ api: API, results }, null, 2));
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
