import type { AccountType } from "./types";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Efectivo",
  BANK: "Banco",
  FUND: "Fondo",
  INVESTMENT: "Inversión",
  HOUSING_RESERVE: "Reserva vivienda",
  OTHER: "Otra",
};

export const ACCOUNT_TYPES: AccountType[] = [
  "CASH",
  "BANK",
  "FUND",
  "INVESTMENT",
  "HOUSING_RESERVE",
  "OTHER",
];

const ACCOUNT_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  NOT_FOUND: "No encontramos esa cuenta.",
  USER_NOT_CONFIGURED: "No hay un usuario configurado.",
};

export function accountTypeLabel(type: AccountType | undefined): string {
  if (!type) {
    return "—";
  }
  return ACCOUNT_TYPE_LABELS[type];
}

export function accountFormError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (
      code === "VALIDATION_ERROR" &&
      error.message.trim() &&
      !isRawErrorCode(error.message)
    ) {
      return error.message;
    }
    if (code && ACCOUNT_ERRORS[code]) {
      return ACCOUNT_ERRORS[code];
    }
    if (error.message.trim() && !isRawErrorCode(error.message)) {
      return error.message;
    }
  }

  return "No pudimos completar la operación. Probá de nuevo.";
}

function isRawErrorCode(message: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(message.trim());
}
