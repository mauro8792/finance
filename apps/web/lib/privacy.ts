export const PRIVACY_KEY = "pf.privacy.hideAmounts";

const MASK = "••••••";

export function maskFormattedMoney(formatted: string, hidden: boolean): string {
  if (!hidden) {
    return formatted;
  }
  return formatted.startsWith("USD") ? `USD ${MASK}` : `$ ${MASK}`;
}

export function readHideAmounts(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(PRIVACY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeHideAmounts(hidden: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(PRIVACY_KEY, hidden ? "1" : "0");
  } catch {
    // localStorage puede no estar disponible (modo privado): ignoramos.
  }
}
