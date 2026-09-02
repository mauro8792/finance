import { amountToCents } from "./format-money";
import { filterActiveAccounts, normalizeAmountInput } from "./quick-add";
import type { Account, Currency } from "./types";

const RATE_MICRO = BigInt(1_000_000);
const RATE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export type MoveKind = "TRANSFER" | "CURRENCY_EXCHANGE";

export function destinationAccountsForTransfer(
  accounts: Account[],
  sourceId: string
): Account[] {
  const source = accounts.find((item) => item.id === sourceId);
  if (!source) {
    return [];
  }
  return filterActiveAccounts(accounts).filter(
    (item) => item.id !== source.id && item.currency === source.currency
  );
}

export function destinationAccountsForExchange(
  accounts: Account[],
  sourceId: string
): Account[] {
  const source = accounts.find((item) => item.id === sourceId);
  if (!source) {
    return [];
  }
  return filterActiveAccounts(accounts).filter(
    (item) => item.id !== source.id && item.currency !== source.currency
  );
}

export function canTransferBetween(source: Account, destination: Account): boolean {
  return (
    source.id !== destination.id &&
    source.isActive &&
    destination.isActive &&
    source.currency === destination.currency
  );
}

export function canExchangeBetween(source: Account, destination: Account): boolean {
  return (
    source.id !== destination.id &&
    source.isActive &&
    destination.isActive &&
    source.currency !== destination.currency &&
    isSupportedPair(source.currency, destination.currency)
  );
}

export function isSupportedPair(from: Currency, to: Currency): boolean {
  return (from === "ARS" && to === "USD") || (from === "USD" && to === "ARS");
}

export function isValidExchangeRate(raw: string): boolean {
  const value = normalizeAmountInput(raw);
  if (!RATE_PATTERN.test(value)) {
    return false;
  }
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
  return scaled > BigInt(0);
}

export function toApiExchangeRate(raw: string): string {
  const value = normalizeAmountInput(raw);
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export function previewExchangeToAmount(
  fromCurrency: Currency,
  toCurrency: Currency,
  fromAmount: string,
  exchangeRate: string
): string | null {
  if (!isSupportedPair(fromCurrency, toCurrency)) {
    return null;
  }
  try {
    const fromCents = amountToCents(fromAmount);
    if (fromCents <= BigInt(0)) {
      return null;
    }
    const rateMicro = toRateMicro(exchangeRate);
    if (rateMicro <= BigInt(0)) {
      return null;
    }
    const toCents =
      fromCurrency === "ARS"
        ? divideRoundHalfUp(fromCents * RATE_MICRO, rateMicro)
        : divideRoundHalfUp(fromCents * rateMicro, RATE_MICRO);
    if (toCents <= BigInt(0)) {
      return null;
    }
    return fromCentsToAmount(toCents);
  } catch {
    return null;
  }
}

function toRateMicro(rate: string): bigint {
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) {
    return quotient + BigInt(1);
  }
  return quotient;
}

function fromCentsToAmount(cents: bigint): string {
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

const MOVE_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  NOT_FOUND: "No encontramos esa cuenta.",
  USER_NOT_CONFIGURED: "No hay un usuario configurado.",
  CURRENCY_MISMATCH: "Las monedas de las cuentas no permiten esta operación.",
  INSUFFICIENT_BALANCE: "La cuenta origen no tiene saldo suficiente.",
};

function isRawErrorCode(message: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(message);
}

export function moveFormError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (
      code === "VALIDATION_ERROR" &&
      error.message.trim() &&
      !isRawErrorCode(error.message)
    ) {
      return error.message;
    }
    if (code && MOVE_ERRORS[code]) {
      return MOVE_ERRORS[code];
    }
    if (error.message.trim() && !isRawErrorCode(error.message)) {
      return error.message;
    }
  }
  return "No pudimos completar la operación. Probá de nuevo.";
}
