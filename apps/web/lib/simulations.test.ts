import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ApiClientError } from "./api";
import {
  depletedCopy,
  formatExpenseChangePercent,
  fundStopsConsuming,
  parseNonNegativeIntInput,
  parsePositiveIntInput,
  percentToExpenseFraction,
  simulationFormError,
  toExchangeRate,
} from "./simulations";

describe("simulation helpers", () => {
  it("converts a human expense percent to a backend fraction without float", () => {
    assert.equal(percentToExpenseFraction("0"), "0.000000");
    assert.equal(percentToExpenseFraction("-10"), "-0.100000");
    assert.equal(percentToExpenseFraction("20"), "0.200000");
    assert.equal(percentToExpenseFraction("-10,5"), "-0.105000");
    assert.equal(percentToExpenseFraction("8.5"), "0.085000");
    assert.equal(percentToExpenseFraction("-100"), "-1.000000");
    assert.equal(percentToExpenseFraction(""), null);
    assert.equal(percentToExpenseFraction("abc"), null);
  });

  it("formats an expense fraction as a human percent", () => {
    assert.equal(formatExpenseChangePercent("-0.100000"), "-10%");
    assert.equal(formatExpenseChangePercent("0.200000"), "20%");
    assert.equal(formatExpenseChangePercent("0.000000"), "0%");
  });

  it("normalizes FX without float and rejects zero", () => {
    assert.equal(toExchangeRate("1500"), "1500.000000");
    assert.equal(toExchangeRate("1500,5"), "1500.500000");
    assert.equal(toExchangeRate("0"), null);
    assert.equal(toExchangeRate("-1500"), null);
    assert.equal(toExchangeRate(""), null);
  });

  it("parses positive and non-negative integer inputs", () => {
    assert.equal(parsePositiveIntInput("6"), 6);
    assert.equal(parsePositiveIntInput("0"), null);
    assert.equal(parsePositiveIntInput("1.5"), null);
    assert.equal(parseNonNegativeIntInput("0"), 0);
    assert.equal(parseNonNegativeIntInput("3"), 3);
    assert.equal(parseNonNegativeIntInput("-1"), null);
  });

  it("maps API codes to Spanish copy without exposing raw codes", () => {
    assert.equal(
      simulationFormError(new ApiClientError(400, "UNSUPPORTED_SCENARIO", "x")),
      "Este escenario sólo admite obligaciones de vivienda en USD."
    );
    assert.equal(
      simulationFormError(new ApiClientError(400, "INVALID_MONTHS", "INVALID_MONTHS")),
      "La cantidad de meses debe ser un entero mayor que 0."
    );
    assert.equal(
      simulationFormError(new ApiClientError(400, "INVALID_TARGET_INSTALLMENTS", "x")),
      "Las cuotas objetivo deben ser un entero mayor que 0."
    );
    assert.equal(
      simulationFormError(new ApiClientError(400, "INVALID_EXCHANGE_RATE", "x")),
      "La cotización ARS por USD debe ser mayor que 0."
    );
    assert.equal(
      simulationFormError(new ApiClientError(400, "INSUFFICIENT_BASELINE", "x")),
      "Todavía no hay suficiente historial para calcular este escenario."
    );
    assert.equal(
      simulationFormError(new ApiClientError(400, "VALIDATION_ERROR", "months debe ser mayor que 0.")),
      "months debe ser mayor que 0."
    );
    assert.equal(
      simulationFormError(new Error("boom")),
      "No pudimos simular el escenario. Probá de nuevo."
    );
  });

  it("translates depletion and draw-zero semantics", () => {
    assert.equal(depletedCopy(null, "months"), null);
    assert.equal(depletedCopy(0, "job"), "El escenario comienza sin capital ARS disponible.");
    assert.equal(depletedCopy(3, "months"), "El fondo se agotaría durante el mes 3.");
    assert.equal(
      depletedCopy(4, "job"),
      "El fondo se agotaría durante el mes 4 del escenario."
    );
    assert.equal(fundStopsConsuming("0.00", null), true);
    assert.equal(fundStopsConsuming("200000.00", "12.00"), false);
  });
});
