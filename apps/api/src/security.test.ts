import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { createApp } from "./app.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { requestIdMiddleware } from "./middlewares/request-id.js";
import { hashPassword } from "./modules/auth/password.js";
import { getPrismaClient } from "./shared/db/prisma.js";

const ORIGIN = { Origin: "http://localhost:3000" };
const PASSWORD = "correct-horse-battery-staple";

const tightLimits = {
  windowMs: 60_000,
  globalMax: 2,
  aiMax: 1,
  loginMax: 20,
  trustProxy: false,
};

async function sessionCookie(app: ReturnType<typeof createApp>): Promise<string> {
  const user = await getPrismaClient().user.create({
    data: {
      name: "QA Security",
      email: `sec-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  const raw = login.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const session = list.find((item) => String(item).startsWith("pf_sid="));
  assert.ok(session);
  return String(session).split(";")[0]!;
}

test("unexpected 500 never exposes stack or internal details", async () => {
  const boom = express();
  boom.use(requestIdMiddleware);
  boom.get("/boom", () => {
    throw new Error("Prisma P2022 postgresql://user:secret@localhost/db sk-abc");
  });
  boom.use(errorHandler);

  const logs: string[] = [];
  const original = console.error;
  console.error = (message?: unknown) => {
    if (typeof message === "string") {
      logs.push(message);
    }
  };
  try {
    const response = await request(boom).get("/boom").set("X-Request-Id", "err-corr-1");
    const body = JSON.stringify(response.body);
    assert.equal(response.status, 500);
    assert.equal(response.body.error.code, "INTERNAL_ERROR");
    assert.equal(response.body.error.message, "Error interno del servidor.");
    assert.equal(response.body.error.stack, undefined);
    assert.equal(response.headers["x-request-id"], "err-corr-1");
    assert.doesNotMatch(body, /Prisma|postgresql|secret|sk-abc|stack/i);
  } finally {
    console.error = original;
  }
  const logged = logs.find((line) => line.includes("err-corr-1"));
  assert.ok(logged);
  const parsed = JSON.parse(logged) as { requestId: string; name: string };
  assert.equal(parsed.requestId, "err-corr-1");
  assert.doesNotMatch(logged, /postgresql|secret|sk-abc/i);
});

test("JSON over 32kb returns a controlled payload error", async () => {
  const app = createApp({ rateLimit: false });
  const response = await request(app)
    .post("/api/transactions")
    .set("Content-Type", "application/json")
    .send({ pad: "x".repeat(40_000) });

  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(response.body.error.stack, undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /stack|Prisma/i);
});

test("financial endpoints send Cache-Control no-store", async () => {
  const app = createApp({ rateLimit: false });
  const response = await request(app).get("/api/financial/summary");
  assert.match(String(response.headers["cache-control"]), /no-store/i);
});

test("CSV export sends Cache-Control no-store", async () => {
  const app = createApp({ rateLimit: false });
  const response = await request(app).get("/api/transactions/export");
  assert.match(String(response.headers["cache-control"]), /no-store/i);
});

test("request log omits query string and body", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (message?: unknown) => {
    if (typeof message === "string") {
      lines.push(message);
    }
  };
  try {
    const app = createApp({ rateLimit: false });
    await request(app)
      .get("/api/transactions?year=2026&month=8")
      .send();
  } finally {
    console.info = original;
  }

  const logged = lines.find((line) => line.includes('"path":"/api/transactions"'));
  assert.ok(logged);
  const parsed = JSON.parse(logged) as { path: string; requestId: string };
  assert.equal(parsed.path, "/api/transactions");
  assert.ok(parsed.requestId);
  assert.doesNotMatch(logged, /year=2026|month=8|body|OPENAI|DATABASE/i);
});

test("health is exempt from the global API rate limit", async () => {
  const app = createApp({
    rateLimit: { windowMs: 60_000, globalMax: 1, aiMax: 1, loginMax: 20, trustProxy: false },
  });

  assert.equal((await request(app).get("/health")).status, 200);
  assert.equal((await request(app).get("/health")).status, 200);
  assert.equal((await request(app).get("/health")).status, 200);

  const firstApi = await request(app).get("/api/accounts");
  const secondApi = await request(app).get("/api/accounts");
  assert.notEqual(firstApi.status, 429);
  assert.equal(secondApi.status, 429);
  assert.equal(secondApi.body.error.code, "RATE_LIMIT");
  assert.equal(typeof secondApi.body.error.message, "string");
  assert.equal(secondApi.body.error.stack, undefined);
  assert.doesNotMatch(JSON.stringify(secondApi.body), /<html/i);
});

test("global limiter returns API JSON 429", async () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (message?: unknown) => {
    if (typeof message === "string") {
      lines.push(message);
    }
  };
  try {
    const app = createApp({ rateLimit: { ...tightLimits, aiMax: 20 } });
    await request(app).get("/api/accounts");
    await request(app).get("/api/accounts");
    const blocked = await request(app).get("/api/budgets");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, "RATE_LIMIT");
    assert.ok(blocked.headers["x-request-id"]);
  } finally {
    console.info = original;
  }

  const limited = lines.find((line) => line.includes('"status":429'));
  assert.ok(limited);
  const parsed = JSON.parse(limited) as { path: string; requestId: string };
  assert.equal(parsed.path, "/api/budgets");
  assert.ok(parsed.requestId);
});

test("AI limiter is additional and returns API JSON 429", async () => {
  const app = createApp({
    rateLimit: { windowMs: 60_000, globalMax: 50, aiMax: 1, trustProxy: false, loginMax: 20 },
  });

  const first = await request(app).post("/api/ai/chat").send({ message: "hola" });
  const second = await request(app).post("/api/ai/chat").send({ message: "hola" });
  const otherApi = await request(app).get("/api/accounts");

  assert.notEqual(first.status, 429);
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, "RATE_LIMIT");
  assert.notEqual(otherApi.status, 429);
});

test("AI parse text over 2000 characters is a validation error", async () => {
  const app = createApp({ rateLimit: false });
  const cookie = await sessionCookie(app);
  const response = await request(app)
    .post("/api/ai/parse-transaction")
    .set("Cookie", cookie)
    .set(ORIGIN)
    .send({ text: "a".repeat(2001) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error.message), /2000/);
});

test("AI chat message over 4000 characters is a validation error", async () => {
  const app = createApp({ rateLimit: false });
  const cookie = await sessionCookie(app);
  const response = await request(app)
    .post("/api/ai/chat")
    .set("Cookie", cookie)
    .set(ORIGIN)
    .send({ message: "b".repeat(4001) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error.message), /4000/);
});
