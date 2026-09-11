import { sumAmounts } from "../transactions/net-expense.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type { Transaction } from "../transactions/transaction.types.js";
import type { Currency } from "shared";

type DebtMovement = Pick<
  Transaction,
  "type" | "status" | "amount" | "creditCardId"
> & { currency?: Currency | string | null };

function isDebtLaneMovement(item: DebtMovement): boolean {
  return (
    item.status === "ACTIVE" &&
    item.creditCardId != null &&
    (item.type === "EXPENSE" ||
      item.type === "CREDIT_CARD_PAYMENT" ||
      item.type === "REIMBURSEMENT")
  );
}

function debtFromParts(
  charges: ReadonlyArray<{ amount: string }>,
  payments: ReadonlyArray<{ amount: string }>,
  reimbursements: ReadonlyArray<{ amount: string }>
): string {
  const chargeTotal =
    charges.length === 0 ? 0n : toCents(sumAmounts(charges.map((c) => c.amount)));
  const paymentTotal =
    payments.length === 0
      ? 0n
      : toCents(sumAmounts(payments.map((p) => p.amount)));
  const reimbursementTotal =
    reimbursements.length === 0
      ? 0n
      : toCents(sumAmounts(reimbursements.map((r) => r.amount)));
  const debt = chargeTotal - paymentTotal - reimbursementTotal;
  return fromCents(debt < 0n ? 0n : debt);
}

/**
 * P0.11 / P1.2 currentCardDebt (derived, not persisted).
 *
 * Prefer computeCurrentCardDebtByCurrency / ForCurrency. The legacy helper:
 * - sums a single currency lane when currencies are present and homogeneous;
 * - refuses silent ARS+USD aggregation (returns 0.00);
 * - tolerates fixtures that omit currency (legacy unit tests).
 */
export function computeCurrentCardDebt(
  movements: ReadonlyArray<DebtMovement>
): string {
  const relevant = movements.filter(isDebtLaneMovement);
  if (relevant.length === 0) {
    return "0.00";
  }

  const tagged = relevant.filter(
    (item) => item.currency != null && item.currency !== ""
  );
  if (tagged.length === 0) {
    return debtFromParts(
      relevant.filter((item) => item.type === "EXPENSE"),
      relevant.filter((item) => item.type === "CREDIT_CARD_PAYMENT"),
      relevant.filter((item) => item.type === "REIMBURSEMENT")
    );
  }

  const currencies = new Set(tagged.map((item) => item.currency as string));
  if (currencies.size > 1) {
    return "0.00";
  }
  return computeCurrentCardDebtForCurrency(movements, [...currencies][0]!);
}

export function computeCurrentCardDebtForCurrency(
  movements: ReadonlyArray<DebtMovement>,
  currency: Currency | string
): string {
  const inLane = movements.filter(
    (item) => isDebtLaneMovement(item) && item.currency === currency
  );
  return debtFromParts(
    inLane.filter((item) => item.type === "EXPENSE"),
    inLane.filter((item) => item.type === "CREDIT_CARD_PAYMENT"),
    inLane.filter((item) => item.type === "REIMBURSEMENT")
  );
}

export type CurrencyAmount = { currency: Currency; amount: string };

export function computeCurrentCardDebtByCurrency(
  movements: ReadonlyArray<DebtMovement>
): CurrencyAmount[] {
  const currencies = new Set<Currency>();
  for (const item of movements) {
    if (isDebtLaneMovement(item) && item.currency) {
      currencies.add(item.currency as Currency);
    }
  }

  const result: CurrencyAmount[] = [];
  for (const currency of [...currencies].sort()) {
    const amount = computeCurrentCardDebtForCurrency(movements, currency);
    if (toCents(amount) > 0n) {
      result.push({ currency, amount });
    }
  }
  return result;
}

export function statementTargetAmount(statement: {
  actualAmount: string | null;
  closedProjectedAmount: string | null;
}): string | null {
  if (statement.actualAmount != null) {
    return statement.actualAmount;
  }
  if (statement.closedProjectedAmount != null) {
    return statement.closedProjectedAmount;
  }
  return null;
}

export function deriveStatementPaymentStatus(input: {
  paidAmount: string;
  targetAmount: string;
}): "CLOSED" | "PARTIALLY_PAID" | "PAID" {
  const paid = toCents(input.paidAmount);
  const target = toCents(input.targetAmount);
  if (paid <= 0n) {
    return "CLOSED";
  }
  if (paid >= target) {
    return "PAID";
  }
  return "PARTIALLY_PAID";
}
