/**
 * BLOCK A prod smoke — READ-ONLY routing + parser.
 * Does NOT void real data or create financial movements.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseMoney } from "shared";
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

async function main() {
  const results: Result[] = [];
  const missing = randomUUID();

  // Parser smoke (shared)
  const cases: Array<[string, string]> = [
    ["95.784,34", "95784.34"],
    ["95,784.34", "95784.34"],
    ["95784,34", "95784.34"],
    ["95784.34", "95784.34"],
    ["1.000", "1000.00"],
    ["1,000", "1000.00"],
  ];
  for (const [input, expected] of cases) {
    const parsed = parseMoney(input);
    results.push({
      name: `parseMoney ${input}`,
      ok: parsed.ok && parsed.ok && parsed.canonical === expected,
      detail: parsed.ok ? parsed.canonical : parsed.reason,
    });
  }

  const health = await fetch(`${API}/health`);
  results.push({ name: "GET /health", ok: health.ok, detail: `${health.status}` });

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

  async function post(
    path: string,
    name: string,
    body: unknown,
    expectStatuses: number[],
    notRouteMiss = true
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
      expectStatuses.includes(res.status) &&
      (!notRouteMiss || !text.includes("Ruta no encontrada"));
    results.push({
      name,
      ok,
      detail: `${res.status} ${text.slice(0, 180)}`,
    });
  }

  await post(
    `/api/transactions/${missing}/void`,
    "POST transaction void missing → domain",
    { idempotencyKey: `smoke-${randomUUID()}` },
    [404]
  );
  await post(
    `/api/transactions/${missing}/void`,
    "POST transaction void invalid body → validation",
    {},
    [400]
  );
  await post(
    `/api/transfers/${missing}/void`,
    "POST transfer void missing → domain",
    { idempotencyKey: `smoke-${randomUUID()}` },
    [404]
  );
  await post(
    `/api/credit-cards/${missing}/payments/${missing}/void`,
    "POST payment void missing → domain",
    { idempotencyKey: `smoke-${randomUUID()}` },
    [404]
  );
  await post(
    `/api/credit-card-purchases/${missing}/void`,
    "POST purchase void missing → domain",
    { idempotencyKey: `smoke-${randomUUID()}` },
    [404]
  );
  await post(
    `/api/credit-card-refunds/accreditations/${missing}/void`,
    "POST refund accreditation void missing → domain",
    { idempotencyKey: `smoke-${randomUUID()}` },
    [404]
  );

  const prisma = new PrismaClient();
  try {
    const [tx, inv, corr, links] = await Promise.all([
      prisma.transaction.count(),
      prisma.investment.count(),
      prisma.correctionOperation.count(),
      prisma.transferLink.count(),
    ]);
    results.push({
      name: "Neon counts unchanged after smoke",
      ok: tx === 24 && inv === 2 && corr === 0 && links === 1,
      detail: `tx=${tx} inv=${inv} corr=${corr} links=${links}`,
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
