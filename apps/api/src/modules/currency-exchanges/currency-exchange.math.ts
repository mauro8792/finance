import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";

const RATE_MICRO = 1_000_000n;
const RATE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export function parsePositiveRate(raw: string): string {
  const value = raw.trim();

  if (!RATE_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El tipo de cambio debe ser un decimal positivo con hasta 6 decimales.",
      400
    );
  }

  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));

  if (scaled <= 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El tipo de cambio debe ser mayor que 0.",
      400
    );
  }

  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El tipo de cambio debe ser mayor que 0.",
      400
    );
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (remainder * 2n >= denominator) {
    return quotient + 1n;
  }

  return quotient;
}

export function calculateToAmount(
  fromCurrency: Currency,
  toCurrency: Currency,
  fromAmount: string,
  exchangeRate: string
): string {
  const fromAmountCents = toCents(fromAmount);
  const rateMicro = toRateMicro(exchangeRate);
  let toAmountCents: bigint;

  if (fromCurrency === "ARS" && toCurrency === "USD") {
    toAmountCents = divideRoundHalfUp(fromAmountCents * RATE_MICRO, rateMicro);
  } else if (fromCurrency === "USD" && toCurrency === "ARS") {
    toAmountCents = divideRoundHalfUp(fromAmountCents * rateMicro, RATE_MICRO);
  } else {
    throw new AppError(
      "CURRENCY_MISMATCH",
      "El cambio de moneda sólo admite ARS → USD o USD → ARS.",
      400
    );
  }

  if (toAmountCents <= 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El importe destino debe ser mayor que 0.",
      400
    );
  }

  return fromCents(toAmountCents);
}

function toRateMicro(rate: string): bigint {
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
}
