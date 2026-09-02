import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Account } from "./types";
import {
  canExchangeBetween,
  canTransferBetween,
  destinationAccountsForExchange,
  destinationAccountsForTransfer,
  moveFormError,
  previewExchangeToAmount,
} from "./transfers";

const fondo: Account = {
  id: "acc-fondo",
  name: "Fondo indemnización prueba",
  currency: "ARS",
  type: "FUND",
  isActive: true,
};

const caja: Account = {
  id: "acc-caja",
  name: "Caja ARS",
  currency: "ARS",
  type: "CASH",
  isActive: true,
};

const reserva: Account = {
  id: "acc-reserva",
  name: "Reserva vivienda",
  currency: "USD",
  type: "HOUSING_RESERVE",
  isActive: true,
};

const inactiva: Account = {
  id: "acc-old",
  name: "Vieja USD",
  currency: "USD",
  type: "CASH",
  isActive: false,
};

describe("transfers helpers", () => {
  it("allows same-currency transfer and rejects same account", () => {
    assert.equal(canTransferBetween(fondo, caja), true);
    assert.equal(canTransferBetween(fondo, fondo), false);
    assert.equal(canTransferBetween(fondo, reserva), false);
    assert.deepEqual(
      destinationAccountsForTransfer([fondo, caja, reserva, inactiva], fondo.id).map(
        (item) => item.id
      ),
      [caja.id]
    );
  });

  it("allows ARS/USD exchange and hides inactive or same-currency destinations", () => {
    assert.equal(canExchangeBetween(fondo, reserva), true);
    assert.equal(canExchangeBetween(reserva, fondo), true);
    assert.equal(canExchangeBetween(fondo, caja), false);
    assert.equal(canExchangeBetween(fondo, inactiva), false);
    assert.deepEqual(
      destinationAccountsForExchange([fondo, caja, reserva, inactiva], fondo.id).map(
        (item) => item.id
      ),
      [reserva.id]
    );
  });

  it("previews 13.200.000 ARS at 1.500 as USD 8.800 without float math", () => {
    assert.equal(
      previewExchangeToAmount("ARS", "USD", "13200000.00", "1500.000000"),
      "8800.00"
    );
    assert.equal(
      previewExchangeToAmount("USD", "ARS", "8800.00", "1500.000000"),
      "13200000.00"
    );
    assert.equal(previewExchangeToAmount("ARS", "ARS", "100.00", "1500.000000"), null);
  });

  it("maps backend codes to Spanish without exposing raw codes", () => {
    const insufficient = Object.assign(new Error("INSUFFICIENT_BALANCE"), {
      code: "INSUFFICIENT_BALANCE",
    });
    const mismatch = Object.assign(new Error("CURRENCY_MISMATCH"), {
      code: "CURRENCY_MISMATCH",
    });
    assert.equal(moveFormError(insufficient), "La cuenta origen no tiene saldo suficiente.");
    assert.equal(moveFormError(mismatch), "Las monedas de las cuentas no permiten esta operación.");
  });
});
