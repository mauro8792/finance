import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { app } from "./app.js";

test("GET /health returns 200", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
});

test("GET /health response contains status ok", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.body.status, "ok");
});

test("unknown route returns 404 JSON", async () => {
  const response = await request(app).get("/does-not-exist");

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("CORS allows the configured web origin", async () => {
  const response = await request(app)
    .get("/health")
    .set("Origin", "http://localhost:3000");

  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
});

test("CORS preflight answers OPTIONS without wildcard origin", async () => {
  const allowed = await request(app)
    .options("/api/transactions")
    .set("Origin", "http://localhost:3000")
    .set("Access-Control-Request-Method", "POST");

  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.notEqual(allowed.headers["access-control-allow-origin"], "*");

  const foreign = await request(app)
    .options("/api/transactions")
    .set("Origin", "https://evil.example")
    .set("Access-Control-Request-Method", "POST");

  assert.equal(foreign.headers["access-control-allow-origin"], undefined);

  const foreignGet = await request(app)
    .get("/api/accounts")
    .set("Origin", "https://evil.example");

  assert.equal(foreignGet.headers["access-control-allow-origin"], undefined);
  assert.notEqual(foreignGet.headers["access-control-allow-origin"], "*");
});

test("Helmet sets nosniff and cross-origin CORP for localhost web", async () => {
  const response = await request(app)
    .get("/health")
    .set("Origin", "http://localhost:3000");

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["cross-origin-resource-policy"], "cross-origin");
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
});

test("GET /health is not stored by caches and exposes a request id", async () => {
  const response = await request(app)
    .get("/health")
    .set("X-Request-Id", "health-qa-1");

  assert.equal(response.status, 200);
  assert.match(String(response.headers["cache-control"]), /no-store/i);
  assert.equal(response.headers["x-request-id"], "health-qa-1");
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, undefined);
  assert.equal(response.body.version, undefined);
});
