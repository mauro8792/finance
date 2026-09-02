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
});
