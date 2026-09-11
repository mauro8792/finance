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

export type AdjustmentMetadata = {
  reconciliationId: string;
  direction: TransferDirection;
  observedBalance: string;
  previousCalculatedBalance: string;
  reason: string;
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

export function isAdjustmentMetadata(value: unknown): value is AdjustmentMetadata {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as {
    reconciliationId?: unknown;
    direction?: unknown;
    observedBalance?: unknown;
    previousCalculatedBalance?: unknown;
    reason?: unknown;
  };
  return (
    typeof record.reconciliationId === "string" &&
    record.reconciliationId.length > 0 &&
    (record.direction === "OUT" || record.direction === "IN") &&
    typeof record.observedBalance === "string" &&
    typeof record.previousCalculatedBalance === "string" &&
    typeof record.reason === "string"
  );
}

export function requireAdjustmentDirection(metadata: unknown): TransferDirection {
  if (!isAdjustmentMetadata(metadata)) {
    throw new AppError(
      "INVALID_ADJUSTMENT_METADATA",
      "Un movimiento ADJUSTMENT debe tener metadata de conciliación con direction OUT o IN.",
      500
    );
  }

  return metadata.direction;
}

export function balanceDirection(movement: {
  type: TransactionType;
  metadata: unknown;
  accountId?: string | null;
  creditCardId?: string | null;
}): BalanceDirection | null {
  if (movement.type === "INCOME") {
    return "credit";
  }

  if (movement.type === "REIMBURSEMENT") {
    // F6-A bank: credit account. F6-B card: accountId null → no bank impact.
    if (movement.accountId == null) {
      return null;
    }
    return "credit";
  }

  if (movement.type === "EXPENSE") {
    // P0.5 F1: card-funded EXPENSE is recognized spending, not a bank debit.
    if (movement.accountId == null) {
      return null;
    }
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

  if (movement.type === "CREDIT_CARD_PAYMENT") {
    // F3: bank outflow; not period spending / budget.
    if (movement.accountId == null) {
      throw new AppError(
        "INVALID_CREDIT_CARD_PAYMENT",
        "CREDIT_CARD_PAYMENT requiere accountId.",
        500
      );
    }
    return "debit";
  }

  if (
    movement.type === "INVESTMENT_PRINCIPAL_RETURN" ||
    movement.type === "INVESTMENT_RETURN"
  ) {
    return "credit";
  }

  if (movement.type === "ADJUSTMENT") {
    // P1.2.1: technical balance reconciliation. amount > 0; sign via direction.
    return requireAdjustmentDirection(movement.metadata) === "IN"
      ? "credit"
      : "debit";
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
  movements: Pick<Transaction, "type" | "metadata" | "amount" | "accountId">[]
): string {
  let cents = toCents(initialBalance);

  for (const movement of movements) {
    const direction = balanceDirection(movement);
    if (direction === null) {
      continue;
    }
    const amount = toCents(movement.amount);
    cents = direction === "credit" ? cents + amount : cents - amount;
  }

  return fromCents(cents);
}
