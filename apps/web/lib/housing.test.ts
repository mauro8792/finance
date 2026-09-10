import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  accountsForHousingCurrency,
  coverageBarWidth,
  firstActiveHousing,
  housingPaymentError,
  nextDueDateLabel,
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

  it("caps the coverage bar at 100% without rounding the covered value", () => {
    assert.equal(coverageBarWidth(null, 12), "0%");
    assert.equal(coverageBarWidth("0.00", 12), "0%");
    assert.equal(coverageBarWidth("-1.00", 12), "0%");
    assert.equal(coverageBarWidth("7.73", 12), "64.41%");
    assert.equal(coverageBarWidth("6.00", 12), "50%");
    assert.equal(coverageBarWidth("40.00", 12), "100%");
    assert.equal(coverageBarWidth("3.00", 0), "100%");
  });

  it("resolves the next due date from the configured day of month", () => {
    assert.equal(nextDueDateLabel(null), null);
    assert.equal(nextDueDateLabel(10, new Date(2026, 8, 3, 12)), "10 sep 2026");
    assert.equal(nextDueDateLabel(10, new Date(2026, 8, 10, 12)), "10 sep 2026");
    assert.equal(nextDueDateLabel(10, new Date(2026, 8, 11, 12)), "10 oct 2026");
    assert.equal(nextDueDateLabel(31, new Date(2026, 1, 15, 12)), "28 feb 2026");
    assert.equal(nextDueDateLabel(5, new Date(2026, 11, 20, 12)), "5 ene 2027");
  });

  it("maps payment backend codes to readable copy", () => {
    const error = Object.assign(new Error("technical"), { code: "INSUFFICIENT_BALANCE" });
    assert.equal(housingPaymentError(error), "La cuenta no tiene saldo suficiente.");
  });
});
