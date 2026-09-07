/**
 * Production smoke P0.9 (no fictitious cards/statements).
 * Missing-card GETs/POSTs must 404 and leave statements count unchanged.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

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

async function main(): Promise<void> {
  const results: Result[] = [];
  const missingCard = randomUUID();
  const missingStatement = randomUUID();

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
      detail: `${res.status} ${text.slice(0, 120)}`,
    });
  }

  async function post(path: string, name: string, body: unknown, expectStatus: number) {
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
    results.push({
      name,
      ok: res.status === expectStatus,
      detail: `${res.status} ${text.slice(0, 120)}`,
    });
  }

  if (cookieHeader) {
    await get("/api/accounts", "GET /api/accounts");
    await get("/api/transactions", "GET /api/transactions");
    await get("/api/financial/summary?year=2026&month=9", "GET financial summary");
    await get("/api/credit-cards", "GET /api/credit-cards");
    await get("/api/credit-card-purchases", "GET purchases");
    await get(
      `/api/credit-cards/${missingCard}/statements`,
      "GET statements missing card → 404",
      404
    );
    await get(
      `/api/credit-cards/${missingCard}/statements/${missingStatement}`,
      "GET statement detail missing → 404",
      404
    );
    await post(
      `/api/credit-cards/${missingCard}/statements/project`,
      "POST project missing card → 404",
      { closingDate: "2026-09-20" },
      404
    );
    await post(
      `/api/credit-cards/${missingCard}/statements/${missingStatement}/close`,
      "POST close missing card → 404",
      {},
      404
    );
  }

  const web = await fetch(ORIGIN, { redirect: "follow" });
  results.push({
    name: "GET dashboard web",
    ok: web.ok,
    detail: `${web.status}`,
  });

  console.log(JSON.stringify({ api: API, results }, null, 2));
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
