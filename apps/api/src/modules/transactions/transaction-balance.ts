import { AppError } from "../../shared/errors/app-error.js";
import type { Transaction, TransactionType } from "./transaction.types.js";

export type BalanceDirection = "credit" | "debit";

export const TRANSFER_DIRECTIONS = ["OUT", "IN"] as const;

export type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number];

export type TransferMetadata = {
  transferId: string;
  direction: TransferDirection;
};

export type CurrencyExchangeMetadata = {
  currencyExchangeId: string;
  direction: TransferDirection;
};

export type HousingPaymentMetadata = {
  housingPaymentId: string;
  housingObligationId: string;
};

export type InvestmentOutflowMetadata = {
  investmentId: string;
};

export type InvestmentPrincipalReturnMetadata = {
  investmentId: string;
};

export type InvestmentReturnMetadata = {
  investmentId: string;
};

export function isTransferMetadata(value: unknown): value is TransferMetadata {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as { transferId?: unknown; direction?: unknown };
  return (
    typeof record.transferId === "string" &&
    record.transferId.length > 0 &&
    (record.direction === "OUT" || record.direction === "IN")
  );
}

export function requireTransferDirection(metadata: unknown): TransferDirection {
  if (!isTransferMetadata(metadata)) {
    throw new AppError(
      "INVALID_TRANSFER_METADATA",
      "Un movimiento TRANSFER debe tener metadata.direction OUT o IN.",
      500
    );
  }

  return metadata.direction;
}

export function isCurrencyExchangeMetadata(
  value: unknown
): value is CurrencyExchangeMetadata {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as {
    currencyExchangeId?: unknown;
    direction?: unknown;
  };
  return (
    typeof record.currencyExchangeId === "string" &&
    record.currencyExchangeId.length > 0 &&
    (record.direction === "OUT" || record.direction === "IN")
  );
}

export function requireCurrencyExchangeDirection(
  metadata: unknown
): TransferDirection {
  if (!isCurrencyExchangeMetadata(metadata)) {
    throw new AppError(
      "INVALID_CURRENCY_EXCHANGE_METADATA",
      "Un movimiento CURRENCY_EXCHANGE debe tener metadata.currencyExchangeId y metadata.direction OUT o IN.",
      500
    );
  }

  return metadata.direction;
}

export function balanceDirection(movement: {
  type: TransactionType;
  metadata: unknown;
}): BalanceDirection {
  if (movement.type === "INCOME" || movement.type === "REIMBURSEMENT") {
    return "credit";
  }

  if (movement.type === "EXPENSE") {
    return "debit";
  }

  if (movement.type === "TRANSFER") {
    return requireTransferDirection(movement.metadata) === "IN"
      ? "credit"
      : "debit";
  }

  if (movement.type === "CURRENCY_EXCHANGE") {
    return requireCurrencyExchangeDirection(movement.metadata) === "IN"
      ? "credit"
      : "debit";
  }

  if (movement.type === "HOUSING_PAYMENT" || movement.type === "INVESTMENT_OUTFLOW") {
    return "debit";
  }

  if (
    movement.type === "INVESTMENT_PRINCIPAL_RETURN" ||
    movement.type === "INVESTMENT_RETURN"
  ) {
    return "credit";
  }

  throw new AppError(
    "UNSUPPORTED_TRANSACTION_TYPE",
    "El tipo de movimiento no tiene signo de saldo definido.",
    500
  );
}

export function toCents(amount: string): bigint {
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const cents = BigInt(whole ?? "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount.startsWith("-") ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function computeBalance(
  initialBalance: string,
  movements: Pick<Transaction, "type" | "metadata" | "amount">[]
): string {
  let cents = toCents(initialBalance);

  for (const movement of movements) {
    const amount = toCents(movement.amount);
    cents =
      balanceDirection(movement) === "credit" ? cents + amount : cents - amount;
  }

  return fromCents(cents);
}
