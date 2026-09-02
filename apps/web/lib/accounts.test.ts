import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ApiClientError } from "./api";
import { ACCOUNT_TYPE_LABELS, accountFormError, accountTypeLabel } from "./accounts";

describe("account helpers", () => {
  it("maps account types to Spanish labels", () => {
    assert.equal(ACCOUNT_TYPE_LABELS.CASH, "Efectivo");
    assert.equal(ACCOUNT_TYPE_LABELS.BANK, "Banco");
    assert.equal(ACCOUNT_TYPE_LABELS.FUND, "Fondo");
    assert.equal(ACCOUNT_TYPE_LABELS.INVESTMENT, "Inversión");
    assert.equal(ACCOUNT_TYPE_LABELS.HOUSING_RESERVE, "Reserva vivienda");
    assert.equal(ACCOUNT_TYPE_LABELS.OTHER, "Otra");
    assert.equal(accountTypeLabel("FUND"), "Fondo");
    assert.equal(accountTypeLabel(undefined), "—");
  });

  it("maps API codes to Spanish without exposing raw codes", () => {
    assert.equal(
      accountFormError(new ApiClientError(404, "NOT_FOUND", "NOT_FOUND")),
      "No encontramos esa cuenta."
    );
    assert.equal(
      accountFormError(new ApiClientError(400, "VALIDATION_ERROR", "El nombre es obligatorio.")),
      "El nombre es obligatorio."
    );
    assert.equal(
      accountFormError(new Error("boom")),
      "No pudimos completar la operación. Probá de nuevo."
    );
  });
});
