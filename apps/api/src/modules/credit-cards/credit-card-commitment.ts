import { sumAmounts } from "../transactions/net-expense.js";
import type { CreditCardInstallmentStatus } from "../credit-card-purchases/credit-card-purchase.types.js";

/**
 * P0.7 futureInstallmentCommitment:
 * SUM(amount) of PENDING installments on ACTIVE purchases.
 * CANCELLED and RECOGNIZED do not contribute.
 */
export function computeFutureInstallmentCommitment(
  installments: ReadonlyArray<{
    amount: string;
    status: CreditCardInstallmentStatus | string;
  }>
): string {
  const pending = installments.filter((item) => item.status === "PENDING");
  if (pending.length === 0) {
    return "0.00";
  }
  return sumAmounts(pending.map((item) => item.amount));
}

export function computeTotalOutstandingCommitment(
  currentCardDebt: string,
  futureInstallmentCommitment: string
): string {
  return sumAmounts([currentCardDebt, futureInstallmentCommitment]);
}
