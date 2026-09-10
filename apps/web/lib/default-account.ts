import { LAST_ACCOUNT_KEY } from "./quick-add";

export const DEFAULT_ACCOUNT_KEY = LAST_ACCOUNT_KEY;

export function getDefaultAccountId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(DEFAULT_ACCOUNT_KEY);
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function setDefaultAccountId(accountId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (accountId && accountId.length > 0) {
      localStorage.setItem(DEFAULT_ACCOUNT_KEY, accountId);
    } else {
      localStorage.removeItem(DEFAULT_ACCOUNT_KEY);
    }
  } catch {
    // localStorage puede no estar disponible (modo privado): ignoramos.
  }
}
