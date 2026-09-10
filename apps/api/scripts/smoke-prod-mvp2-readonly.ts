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
  await get(
    "/api/financial/summary?year=2026&month=9",
    "GET /api/financial/summary"
  );
  await get("/api/credit-cards", "GET /api/credit-cards");
  await get("/api/credit-card-purchases", "GET /api/credit-card-purchases");
  await get("/api/investments", "GET /api/investments");
  await get("/api/credit-card-refunds/expected", "GET refunds/expected");
  await get("/api/transfers", "GET /api/transfers");
  {
    const list = await get(
      "/api/credit-card-recurring-charges",
      "GET /api/credit-card-recurring-charges"
    );
    try {
      const parsed = JSON.parse(list.text) as unknown;
      results.push({
        name: "recurring charges list empty array",
        ok: Array.isArray(parsed) && parsed.length === 0,
        detail: Array.isArray(parsed) ? `len=${parsed.length}` : "not-array",
      });
    } catch {
      results.push({
        name: "recurring charges list empty array",
        ok: false,
        detail: "invalid json",
      });
    }
  }
  {
    const { res, text } = await get(
      `/api/credit-card-recurring-charges/${missing}`,
      "GET recurring missing id → controlled",
      404
    );
    results.push({
      name: "GET recurring missing → domain NOT_FOUND (not route miss)",
      ok:
        res.status === 404 &&
        text.includes("Cargo recurrente no encontrado") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }
  await get(
    `/api/credit-card-recurring-charges/outlook?creditCardId=${missing}`,
    "GET outlook incomplete query → VALIDATION_ERROR",
    400
  );
  {
    const { res, text } = await get(
      `/api/credit-card-recurring-charges/outlook?creditCardId=${missing}&year=2026&month=9`,
      "GET outlook missing card → controlled",
      404
    );
    results.push({
      name: "GET outlook missing card → domain NOT_FOUND",
      ok:
        res.status === 404 &&
        text.includes("Tarjeta no encontrada") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }
  await post(
    "/api/credit-card-recurring-charges",
    "POST recurring invalid → VALIDATION_ERROR",
    { name: "" },
    [400]
  );
  {
    const { res, text } = await get(
      `/api/transfers/${missing}`,
      "GET transfer missing id → controlled",
      404
    );
    results.push({
      name: "GET transfer missing → domain NOT_FOUND (not route miss)",
      ok:
        res.status === 404 &&
        text.includes("Transferencia no encontrada") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }
  await post(
    "/api/transfers",
    "POST transfer invalid → controlled",
    { amount: "0" },
    [400]
  );
  const promoList = await get(
    "/api/credit-card-promotions",
    "GET /api/credit-card-promotions"
  );
  try {
    const parsed = JSON.parse(promoList.text) as unknown;
    results.push({
      name: "promotions list empty array",
      ok: Array.isArray(parsed) && parsed.length === 0,
      detail: Array.isArray(parsed) ? `len=${parsed.length}` : "not-array",
    });
  } catch {
    results.push({
      name: "promotions list empty array",
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
  {
    const { res, text } = await get(
      `/api/credit-card-promotions/${missing}`,
      "GET promotion missing id → controlled",
      404
    );
    results.push({
      name: "GET promotion missing → domain NOT_FOUND (not route miss)",
      ok:
        res.status === 404 &&
        text.includes("Promoción no encontrada") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }
  {
    const { res, text } = await post(
      `/api/credit-card-promotions/${missing}/preview`,
      "POST preview missing promo → controlled",
      { originalExpenseTransactionId: missing },
      [404]
    );
    results.push({
      name: "POST preview missing → domain NOT_FOUND (not route miss)",
      ok:
        res.status === 404 &&
        text.includes("Promoción no encontrada") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }
  {
    const { res, text } = await post(
      `/api/credit-card-promotions/${missing}/apply`,
      "POST apply missing promo → controlled (no create)",
      {
        originalExpenseTransactionId: missing,
        idempotencyKey: `smoke-p12-${randomUUID()}`,
      },
      [404]
    );
    results.push({
      name: "POST apply missing → domain NOT_FOUND (no writes)",
      ok:
        res.status === 404 &&
        text.includes("Promoción no encontrada") &&
        !text.includes("Ruta no encontrada"),
      detail: `${res.status} ${text.slice(0, 160)}`,
    });
  }

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
    const [tx, inv, promo, app, exp, acc, links, charges, occs, cards] =
      await Promise.all([
        prisma.transaction.count(),
        prisma.investment.count(),
        prisma.creditCardPromotion.count(),
        prisma.creditCardPromotionApplication.count(),
        prisma.creditCardRefundExpectation.count(),
        prisma.creditCardRefundAccreditation.count(),
        prisma.transferLink.count(),
        prisma.creditCardRecurringCharge.count(),
        prisma.creditCardRecurringChargeOccurrence.count(),
        prisma.creditCard.count(),
      ]);
    results.push({
      name: "Neon counts after smoke (no fictitious writes)",
      ok:
        tx === 24 &&
        inv === 2 &&
        promo === 0 &&
        app === 0 &&
        exp === 0 &&
        acc === 0 &&
        links === 1 &&
        charges === 0 &&
        occs === 0 &&
        cards === 0,
      detail: `tx=${tx} inv=${inv} promo=${promo} app=${app} exp=${exp} acc=${acc} links=${links} charges=${charges} occs=${occs} cards=${cards}`,
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
