import type { Account, Currency, HousingObligation } from "./types";

const PAYMENT_ERRORS: Record<string, string> = {
  INSUFFICIENT_BALANCE: "La cuenta no tiene saldo suficiente.",
  CURRENCY_MISMATCH: "La moneda de la cuenta debe coincidir con la de la obligación.",
  HOUSING_OBLIGATION_INACTIVE: "No se puede registrar un pago sobre una obligación inactiva.",
  NO_REMAINING_INSTALLMENTS: "La obligación no tiene cuotas pendientes.",
  ACCOUNT_INACTIVE: "No se puede registrar un movimiento sobre una cuenta inactiva.",
  NOT_FOUND: "No encontramos esa vivienda o cuenta.",
};

export function firstActiveHousing(
  obligations: HousingObligation[]
): HousingObligation | null {
  return obligations.find((item) => item.isActive) ?? null;
}

export function accountsForHousingCurrency(
  accounts: Account[],
  currency: Currency,
  currentId: string | null = null
): Account[] {
  return accounts.filter(
    (account) =>
      account.currency === currency && (account.isActive || account.id === currentId)
  );
}

export function paymentAccountsForHousing(
  accounts: Account[],
  currency: Currency
): Account[] {
  return accounts.filter((account) => account.isActive && account.currency === currency);
}

export function parseOptionalInteger(
  raw: string,
  min: number,
  max?: number
): number | null | "invalid" {
  const value = raw.trim();
  if (value === "") {
    return null;
  }
  if (!/^-?\d+$/.test(value)) {
    return "invalid";
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    return "invalid";
  }
  return parsed;
}

export function parseRequiredInteger(
  raw: string,
  min: number
): number | "invalid" {
  const parsed = parseOptionalInteger(raw, min);
  if (parsed === null || parsed === "invalid") {
    return "invalid";
  }
  return parsed;
}

export function housingFormError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "No pudimos guardar la vivienda. Probá de nuevo.";
}

export function housingPaymentError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code && PAYMENT_ERRORS[code]) {
      return PAYMENT_ERRORS[code];
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "No pudimos registrar el pago. Probá de nuevo.";
}
