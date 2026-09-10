import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ACCOUNT_KEY,
  getDefaultAccountId,
  setDefaultAccountId,
} from "./default-account";
import { LAST_ACCOUNT_KEY } from "./quick-add";

describe("default account", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reuses the quick-add storage key", () => {
    expect(DEFAULT_ACCOUNT_KEY).toBe(LAST_ACCOUNT_KEY);
  });

  it("returns null when nothing is stored", () => {
    expect(getDefaultAccountId()).toBeNull();
  });

  it("stores and reads the account id", () => {
    setDefaultAccountId("account-1");
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe("account-1");
    expect(getDefaultAccountId()).toBe("account-1");
  });

  it("clears the account id with null or empty values", () => {
    setDefaultAccountId("account-1");
    setDefaultAccountId(null);
    expect(getDefaultAccountId()).toBeNull();

    setDefaultAccountId("account-2");
    setDefaultAccountId("");
    expect(getDefaultAccountId()).toBeNull();
  });
});
