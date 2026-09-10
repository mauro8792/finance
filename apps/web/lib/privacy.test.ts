import { beforeEach, describe, expect, it } from "vitest";
import {
  PRIVACY_KEY,
  maskFormattedMoney,
  readHideAmounts,
  writeHideAmounts,
} from "./privacy";

describe("maskFormattedMoney", () => {
  it("returns the formatted value when privacy mode is off", () => {
    expect(maskFormattedMoney("$ 12.500,00", false)).toBe("$ 12.500,00");
    expect(maskFormattedMoney("USD 1.200,00", false)).toBe("USD 1.200,00");
  });

  it("masks ARS amounts with the peso sign", () => {
    expect(maskFormattedMoney("$ 12.500,00", true)).toBe("$ ••••••");
    expect(maskFormattedMoney("-$ 900,00", true)).toBe("$ ••••••");
  });

  it("masks USD amounts keeping the USD prefix", () => {
    expect(maskFormattedMoney("USD 1.200,00", true)).toBe("USD ••••••");
  });
});

describe("privacy storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to visible amounts", () => {
    expect(readHideAmounts()).toBe(false);
  });

  it("persists the preference", () => {
    writeHideAmounts(true);
    expect(localStorage.getItem(PRIVACY_KEY)).toBe("1");
    expect(readHideAmounts()).toBe(true);

    writeHideAmounts(false);
    expect(readHideAmounts()).toBe(false);
  });
});
