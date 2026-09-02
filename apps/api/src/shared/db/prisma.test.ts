import assert from "node:assert/strict";
import { test } from "node:test";

test("Prisma Client can initialize when DATABASE_URL is set", async () => {
  process.env.DATABASE_URL =
    "postgresql://user:password@localhost:5432/personal_finance_test";

  const { getPrismaClient } = await import("./prisma.js");
  const client = getPrismaClient();

  assert.equal(typeof client.$connect, "function");
  assert.equal(typeof client.$queryRaw, "function");
  assert.equal(typeof client.transaction.create, "function");
  assert.equal(getPrismaClient(), client);
});
