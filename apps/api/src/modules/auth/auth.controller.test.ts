import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../../app.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { hashPassword } from "./password.js";
import { hashSessionToken } from "./session-token.js";
import { SessionService } from "./session.service.js";

const WEB = "http://localhost:3000";
const PASSWORD = "correct-horse-battery-staple";
const ORIGIN = { Origin: WEB };

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const session = list.find((item) => String(item).startsWith("pf_sid="));
  assert.ok(session, "missing pf_sid cookie");
  return String(session).split(";")[0]!;
}

async function createUserWithPassword(email = `qa-${randomUUID()}@example.test`) {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA Auth",
      email,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  return user;
}

test("login valid sets cookie and me returns public user without passwordHash", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, user.id);
  assert.equal(login.body.user.email, user.email);
  assert.equal(login.body.user.passwordHash, undefined);
  assert.doesNotMatch(JSON.stringify(login.body), /passwordHash|\$argon2/i);
  const cookie = cookieFrom(login);
  assert.match(cookie, /^pf_sid=/);
  const setCookie = String(login.headers["set-cookie"]);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);

  const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, user.id);
  assert.equal(me.body.user.passwordHash, undefined);
});

test("unknown email and wrong password return the same 401 body", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const unknown = await request(app)
    .post("/api/auth/login")
    .send({ email: `missing-${randomUUID()}@example.test`, password: PASSWORD });
  const wrong = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: "wrong-password-12" });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(unknown.body.error.message, "Email o contraseña incorrectos.");
});

test("financial CSV AI and simulations require auth", async () => {
  const app = createApp({ rateLimit: false });
  const financial = await request(app)
    .get("/api/financial/summary?year=2026&month=8")
    .set("X-Request-Id", "auth-qa-1");
  const csv = await request(app).get("/api/transactions/export");
  const ai = await request(app).post("/api/ai/chat").send({ message: "hola" });
  const simulations = await request(app)
    .post("/api/simulations")
    .send({ type: "MONTHS_WITHOUT_INCOME", months: 1, year: 2026, month: 8 });
  const me = await request(app).get("/api/auth/me");
  for (const response of [financial, csv, ai, simulations, me]) {
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, "UNAUTHENTICATED");
  }
  assert.equal(financial.headers["x-request-id"], "auth-qa-1");
  assert.match(String(financial.headers["cache-control"]), /no-store/i);
  assert.match(String(financial.headers["x-content-type-options"] ?? ""), /nosniff/i);
});

test("invalid expired and revoked cookies are unauthenticated", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const prisma = getPrismaClient();
  const sessions = new SessionService();

  const invalid = await request(app).get("/api/auth/me").set("Cookie", "pf_sid=not-a-real-token");
  assert.equal(invalid.status, 401);

  const expired = await sessions.create(user.id, new Date("2000-01-01T00:00:00.000Z"));
  const expiredRes = await request(app)
    .get("/api/auth/me")
    .set("Cookie", `pf_sid=${expired.token}`);
  assert.equal(expiredRes.status, 401);

  const live = await sessions.create(user.id);
  await prisma.session.update({
    where: { id: live.session.id },
    data: { revokedAt: new Date() },
  });
  const revoked = await request(app).get("/api/auth/me").set("Cookie", `pf_sid=${live.token}`);
  assert.equal(revoked.status, 401);
});

test("logout revokes session expires cookie and is idempotent", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  const cookie = cookieFrom(login);
  const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie).set(ORIGIN);
  assert.equal(logout.status, 204);
  const setCookie = String(logout.headers["set-cookie"] ?? "");
  assert.match(setCookie, /pf_sid=/);
  assert.match(setCookie, /Max-Age=0/);

  const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
  assert.equal(me.status, 401);

  const again = await request(app).post("/api/auth/logout");
  assert.equal(again.status, 204);
});

test("second user cannot be selected via findFirst", async () => {
  const first = await createUserWithPassword(`first-${randomUUID()}@example.test`);
  const second = await createUserWithPassword(`second-${randomUUID()}@example.test`);
  const app = createApp({ rateLimit: false });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: second.email, password: PASSWORD });
  const me = await request(app).get("/api/auth/me").set("Cookie", cookieFrom(login));
  assert.equal(me.body.user.id, second.id);
  assert.notEqual(me.body.user.id, first.id);
});

test("wrong Origin on authenticated mutation is CSRF_REJECTED", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  const cookie = cookieFrom(login);
  const blocked = await request(app)
    .post("/api/accounts")
    .set("Cookie", cookie)
    .set("Origin", "https://evil.example")
    .send({ name: "Caja", currency: "ARS", type: "CASH" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, "CSRF_REJECTED");

  const allowed = await request(app)
    .post("/api/accounts")
    .set("Cookie", cookie)
    .set(ORIGIN)
    .send({ name: "Caja", currency: "ARS", type: "CASH" });
  assert.equal(allowed.status, 201);
});

test("health stays public", async () => {
  const app = createApp({ rateLimit: false });
  const response = await request(app).get("/health").set("X-Request-Id", "auth-health-1");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.headers["x-request-id"], "auth-health-1");
  assert.match(String(response.headers["cache-control"]), /no-store/i);
});

test("login limiter returns 429 JSON", async () => {
  const app = createApp({
    rateLimit: {
      windowMs: 60_000,
      globalMax: 50,
      aiMax: 20,
      loginMax: 2,
      trustProxy: false,
    },
  });
  const payload = { email: "a@b.co", password: "wrong-password-12" };
  await request(app).post("/api/auth/login").send(payload);
  await request(app).post("/api/auth/login").send(payload);
  const blocked = await request(app).post("/api/auth/login").send(payload);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "RATE_LIMIT");
});

test("session token is not stored raw in the database", async () => {
  const user = await createUserWithPassword();
  const app = createApp({ rateLimit: false });
  const login = await request(app)
    .post("/api/auth/login")
    .set(ORIGIN)
    .send({ email: user.email, password: PASSWORD });
  const cookie = cookieFrom(login);
  const token = decodeURIComponent(cookie.slice("pf_sid=".length));
  const prisma = getPrismaClient();
  const stored = await prisma.session.findMany({ where: { userId: user.id } });
  assert.ok(stored.length >= 1);
  for (const session of stored) {
    assert.notEqual(session.tokenHash, token);
    assert.equal(session.tokenHash, hashSessionToken(token));
  }
});
