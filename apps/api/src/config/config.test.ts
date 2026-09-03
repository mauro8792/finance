import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertProductionWebOrigin,
  assertSafeTestDatabaseUrl,
  databaseNameFromUrl,
  getDatabaseUrl,
  getSessionSecret,
  getSessionSecure,
  getTestDatabaseUrl,
  getTrustProxy,
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

test("assertProductionWebOrigin fails fast without WEB_ORIGIN in production", () => {
  assert.throws(
    () => assertProductionWebOrigin({ NODE_ENV: "production" }),
    /WEB_ORIGIN/
  );
  assert.doesNotThrow(() =>
    assertProductionWebOrigin({
      NODE_ENV: "production",
      WEB_ORIGIN: "https://app.example",
    })
  );
  assert.doesNotThrow(() => assertProductionWebOrigin({ NODE_ENV: "development" }));
});

test("getTrustProxy is explicit and never inferred from NODE_ENV", () => {
  assert.equal(getTrustProxy({}), false);
  assert.equal(getTrustProxy({ NODE_ENV: "production" }), false);
  assert.equal(getTrustProxy({ TRUST_PROXY: "1" }), true);
  assert.equal(getTrustProxy({ TRUST_PROXY: "true" }), false);
});

test("getSessionSecret requires 32+ characters", () => {
  assert.throws(() => getSessionSecret({}), /SESSION_SECRET/);
  assert.throws(() => getSessionSecret({ SESSION_SECRET: "short" }), /SESSION_SECRET/);
  assert.equal(
    getSessionSecret({ SESSION_SECRET: "test-only-session-secret-32bytes-min!!" }),
    "test-only-session-secret-32bytes-min!!"
  );
});

test("getSessionSecure is true in production unless SESSION_SECURE=0", () => {
  assert.equal(getSessionSecure({ NODE_ENV: "production" }), true);
  assert.equal(getSessionSecure({ NODE_ENV: "production", SESSION_SECURE: "0" }), false);
  assert.equal(getSessionSecure({ NODE_ENV: "development" }), false);
  assert.equal(getSessionSecure({ NODE_ENV: "development", SESSION_SECURE: "1" }), true);
});
