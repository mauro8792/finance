import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatRequestSchema,
  ParseTransactionRequestSchema,
} from "./ai.schema.js";

test("parse-transaction accepts text up to 2000 characters", () => {
  const parsed = ParseTransactionRequestSchema.parse({ text: "a".repeat(2000) });
  assert.equal(parsed.text.length, 2000);
});

test("parse-transaction rejects text longer than 2000 characters", () => {
  const parsed = ParseTransactionRequestSchema.safeParse({ text: "a".repeat(2001) });
  assert.equal(parsed.success, false);
});

test("chat accepts message up to 4000 characters", () => {
  const parsed = ChatRequestSchema.parse({ message: "b".repeat(4000) });
  assert.equal(parsed.message.length, 4000);
});

test("chat rejects message longer than 4000 characters", () => {
  const parsed = ChatRequestSchema.safeParse({ message: "b".repeat(4001) });
  assert.equal(parsed.success, false);
});
