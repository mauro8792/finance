import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSafeTestDatabaseUrl,
  databaseNameFromUrl,
  getDatabaseUrl,
  getTestDatabaseUrl,
} from "./index.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.DATABASE_URL_TEST;

test.after(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (originalTestDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL_TEST;
  } else {
    process.env.DATABASE_URL_TEST = originalTestDatabaseUrl;
  }
});

test("getDatabaseUrl throws when DATABASE_URL is missing", () => {
  delete process.env.DATABASE_URL;
  assert.throws(() => getDatabaseUrl(), /DATABASE_URL/);
});

test("getDatabaseUrl returns DATABASE_URL when set", () => {
  process.env.DATABASE_URL =
    "postgresql://user:password@localhost:5432/personal_finance";
  assert.equal(getDatabaseUrl(), process.env.DATABASE_URL);
});

test("getTestDatabaseUrl throws when DATABASE_URL_TEST is missing", () => {
  delete process.env.DATABASE_URL_TEST;
  process.env.DATABASE_URL =
    "postgresql://user:password@localhost:5432/personal_finance";
  assert.throws(() => getTestDatabaseUrl(), /DATABASE_URL_TEST/);
});

test("getTestDatabaseUrl rejects the development database name", () => {
  process.env.DATABASE_URL_TEST =
    "postgresql://user:password@localhost:5432/personal_finance";
  assert.throws(() => getTestDatabaseUrl(), /_test/);
});

test("getTestDatabaseUrl accepts a dedicated test database", () => {
  process.env.DATABASE_URL_TEST =
    "postgresql://user:password@localhost:5432/personal_finance_test";
  assert.equal(databaseNameFromUrl(getTestDatabaseUrl()), "personal_finance_test");
});

test("assertSafeTestDatabaseUrl rejects development and accepts _test", () => {
  assert.throws(
    () =>
      assertSafeTestDatabaseUrl(
        "postgresql://user:password@localhost:5432/personal_finance"
      ),
    /_test/
  );
  assert.doesNotThrow(() =>
    assertSafeTestDatabaseUrl(
      "postgresql://user:password@localhost:5432/personal_finance_test"
    )
  );
});
