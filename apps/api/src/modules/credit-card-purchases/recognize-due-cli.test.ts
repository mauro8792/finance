import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  exitCodeForRecognizeDueResult,
  parseAsOfArgument,
  parseRecognizeDueCliArgs,
} from "./recognize-due-cli.js";

test("parseRecognizeDueCliArgs: dry-run and as-of equals form", () => {
  const parsed = parseRecognizeDueCliArgs([
    "--dry-run",
    "--as-of=2027-01-15T12:00:00.000Z",
  ]);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.asOf, "2027-01-15T12:00:00.000Z");
  assert.equal(parsed.help, false);
});

test("parseRecognizeDueCliArgs: as-of and user-id space form", () => {
  const userId = randomUUID();
  const parsed = parseRecognizeDueCliArgs([
    "--as-of",
    "2027-01-15",
    "--user-id",
    userId,
  ]);
  assert.equal(parsed.asOf, "2027-01-15");
  assert.equal(parsed.userId, userId);
});

test("parseRecognizeDueCliArgs: rejects unknown flag", () => {
  assert.throws(() => parseRecognizeDueCliArgs(["--cron"]), /desconocido/);
});

test("parseAsOfArgument: date-only uses end of UTC day", () => {
  const asOf = parseAsOfArgument("2027-01-15", new Date("2020-01-01T00:00:00.000Z"));
  assert.equal(asOf.toISOString(), "2027-01-15T23:59:59.999Z");
});

test("parseAsOfArgument: default is provided now", () => {
  const now = new Date("2026-09-07T12:00:00.000Z");
  assert.equal(parseAsOfArgument(undefined, now).toISOString(), now.toISOString());
});

test("exitCodeForRecognizeDueResult: failed>0 => 1; failed=0 => 0", () => {
  assert.equal(exitCodeForRecognizeDueResult({ failed: 0 }), 0);
  assert.equal(exitCodeForRecognizeDueResult({ failed: 1 }), 1);
  assert.equal(exitCodeForRecognizeDueResult({ failed: 3 }), 1);
});
