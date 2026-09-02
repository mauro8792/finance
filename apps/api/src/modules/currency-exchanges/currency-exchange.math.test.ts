import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import {
  calculateToAmount,
  divideRoundHalfUp,
  parsePositiveRate,
} from "./currency-exchange.math.js";

test("parsePositiveRate normalizes six decimal places", () => {
  assert.equal(parsePositiveRate("1500"), "1500.000000");
  assert.equal(parsePositiveRate("1500.5"), "1500.500000");
});

test("parsePositiveRate rejects 0, negative and extra decimals", () => {
  assert.throws(
    () => parsePositiveRate("0"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => parsePositiveRate("-1500"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => parsePositiveRate("1500.0000001"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("calculateToAmount buys USD with ROUND_HALF_UP", () => {
  assert.equal(calculateToAmount("ARS", "USD", "1500000.00", "1500.000000"), "1000.00");
  assert.equal(calculateToAmount("ARS", "USD", "1.00", "8.000000"), "0.13");
});

test("calculateToAmount sells USD", () => {
  assert.equal(calculateToAmount("USD", "ARS", "1000.00", "1500.000000"), "1500000.00");
});

test("divideRoundHalfUp rounds .5 away from zero", () => {
  assert.equal(divideRoundHalfUp(5n, 2n), 3n);
  assert.equal(divideRoundHalfUp(4n, 2n), 2n);
  assert.equal(divideRoundHalfUp(1n, 3n), 0n);
});
