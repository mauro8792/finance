import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRequestId } from "./request-id.js";

test("resolveRequestId keeps a sanitized incoming id", () => {
  assert.equal(resolveRequestId("qa-run_1.2"), "qa-run_1.2");
});

test("resolveRequestId rejects unsafe incoming ids", () => {
  const generated = resolveRequestId("../secrets");
  assert.match(generated, /^[0-9a-f-]{36}$/i);
  assert.notEqual(resolveRequestId("<script>"), "<script>");
  assert.notEqual(resolveRequestId("x".repeat(65)), "x".repeat(65));
});
