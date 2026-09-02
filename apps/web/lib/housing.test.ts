import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  accountsForHousingCurrency,
  firstActiveHousing,
  housingPaymentError,
  parseOptionalInteger,
  parseRequiredInteger,
  paymentAccountsForHousing,
} from "./housing";
import type { Account, HousingObligation } from "./types";

const usd: Account = { id: "acc-usd", name: "Reserva USD", currency: "USD", isActive: true };
const ars: Account = { id: "acc-ars", name: "Caja ARS", currency: "ARS", isActive: true };
const inactiveUsd: Account = {
  id: "acc-old",
  name: "Vieja USD",
  currency: "USD",
  isActive: false,
};

const casa: HousingObligation = {
  id: "h-casa",
  reserveAccountId: "acc-usd",
  name: "casa",
  currency: "USD",
  installmentAmount: "1100.00",
  remainingInstallments: 37,
  dueDay: null,
  isActive: true,
};

describe("housing helpers", () => {
  it("picks the first ACTIVE housing in backend list order", () => {
    const garage: HousingObligation = { ...casa, id: "h-garage", name: "garage" };
    const inactive: HousingObligation = { ...casa, id: "h-old", name: "aaa", isActive: false };
    assert.equal(firstActiveHousing([inactive, casa, garage])?.id, "h-casa");
    assert.equal(firstActiveHousing([{ ...casa, isActive: false }]), null);
    assert.equal(firstActiveHousing([]), null);
  });

  it("filters reserve accounts by currency and keeps the current inactive one", () => {
    const options = accountsForHousingCurrency([usd, ars, inactiveUsd], "USD", "acc-old");
    assert.deepEqual(
      options.map((account) => account.id),
      ["acc-usd", "acc-old"]
    );
  });

  it("lists only active same-currency accounts for payment", () => {
    const options = paymentAccountsForHousing([usd, ars, inactiveUsd], "USD");
    assert.deepEqual(
      options.map((account) => account.id),
      ["acc-usd"]
    );
  });

  it("parses optional due day and required remaining installments", () => {
    assert.equal(parseOptionalInteger("", 1, 31), null);
    assert.equal(parseOptionalInteger("10", 1, 31), 10);
    assert.equal(parseOptionalInteger("32", 1, 31), "invalid");
    assert.equal(parseRequiredInteger("12", 0), 12);
    assert.equal(parseRequiredInteger("", 0), "invalid");
    assert.equal(parseRequiredInteger("-1", 0), "invalid");
  });

  it("maps payment backend codes to readable copy", () => {
    const error = Object.assign(new Error("technical"), { code: "INSUFFICIENT_BALANCE" });
    assert.equal(housingPaymentError(error), "La cuenta no tiene saldo suficiente.");
  });
});
