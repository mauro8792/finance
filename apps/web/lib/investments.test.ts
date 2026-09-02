import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  accountsForInvestmentCurrency,
  artDateToIso,
  calendarDaysBetweenDateOnly,
  estimateExpectedReturn,
  formatAnnualRatePercent,
  groupInvestments,
  investmentFormError,
  isoToArtDateInput,
  percentToAnnualRate,
} from "./investments";
import type { Account, Investment } from "./types";

const ars: Account = { id: "acc-ars", name: "Caja ARS", currency: "ARS", isActive: true };
const usd: Account = { id: "acc-usd", name: "Caja USD", currency: "USD", isActive: true };
const inactive: Account = {
  id: "acc-old",
  name: "Vieja ARS",
  currency: "ARS",
  isActive: false,
};

function investment(partial: Partial<Investment> & Pick<Investment, "id" | "status">): Investment {
  return {
    accountId: "acc-ars",
    type: "CAUCION",
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: "2026-09-01T15:00:00.000Z",
    maturityDate: "2026-09-08T15:00:00.000Z",
    expectedReturn: "575.34",
    actualReturn: null,
    notes: null,
    renewedFromInvestmentId: null,
    createdAt: "2026-09-01T15:00:00.000Z",
    updatedAt: "2026-09-01T15:00:00.000Z",
    ...partial,
  };
}

describe("investment helpers", () => {
  it("converts human percent to backend fraction without float", () => {
    assert.equal(percentToAnnualRate("30"), "0.300000");
    assert.equal(percentToAnnualRate("8.5"), "0.085000");
    assert.equal(percentToAnnualRate("8,5"), "0.085000");
    assert.equal(percentToAnnualRate("0"), "0.000000");
    assert.equal(percentToAnnualRate("-1"), null);
    assert.equal(percentToAnnualRate(""), null);
  });

  it("formats stored fraction as a human percent", () => {
    assert.equal(formatAnnualRatePercent("0.300000"), "30%");
    assert.equal(formatAnnualRatePercent("0.085000"), "8,5%");
    assert.equal(formatAnnualRatePercent("0.000000"), "0%");
  });

  it("estimates expected return only as a visual helper", () => {
    assert.equal(calendarDaysBetweenDateOnly("2026-09-01", "2026-09-08"), 7);
    assert.equal(calendarDaysBetweenDateOnly("2026-09-01", "2026-09-01"), 0);
    assert.equal(estimateExpectedReturn("100000.00", "0.300000", 7), "575.34");
    assert.equal(estimateExpectedReturn("70000.00", "0.280000", 7), "375.89");
  });

  it("maps ART calendar dates to the API instant used by cauciones", () => {
    assert.equal(artDateToIso("2026-09-08"), "2026-09-08T15:00:00.000Z");
    assert.equal(isoToArtDateInput("2026-09-08T15:00:00.000Z"), "2026-09-08");
  });

  it("filters active same-currency accounts", () => {
    assert.deepEqual(
      accountsForInvestmentCurrency([ars, usd, inactive], "ARS").map((item) => item.id),
      ["acc-ars"]
    );
  });

  it("groups active, upcoming and finished investments", () => {
    const active = investment({ id: "a", status: "ACTIVE" });
    const matured = investment({ id: "m", status: "MATURED", actualReturn: "560.00" });
    const renewed = investment({ id: "r", status: "RENEWED", actualReturn: "560.00" });
    const grouped = groupInvestments([matured, active, renewed]);
    assert.deepEqual(
      grouped.active.map((item) => item.id),
      ["a"]
    );
    assert.deepEqual(
      grouped.upcoming.map((item) => item.id),
      ["a"]
    );
    assert.deepEqual(
      grouped.finished.map((item) => item.id),
      ["m", "r"]
    );
  });

  it("maps backend codes to Spanish copy without exposing raw codes", () => {
    const error = Object.assign(new Error("INVESTMENT_NOT_ACTIVE"), {
      code: "INVESTMENT_NOT_ACTIVE",
    });
    assert.equal(
      investmentFormError(error),
      "Sólo una inversión activa puede usar esta acción."
    );
    const insufficient = Object.assign(new Error("x"), {
      code: "INSUFFICIENT_BALANCE",
    });
    assert.equal(investmentFormError(insufficient), "La cuenta no tiene saldo suficiente.");
  });
});
