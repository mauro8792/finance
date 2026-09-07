import { sumAmounts } from "../transactions/net-expense.js";
import type { Transaction } from "../transactions/transaction.types.js";

/**
 * P0.5 minimal currentCardDebt:
 * sum of ACTIVE EXPENSE linked to the card.
 * Extensible later with CREDIT_CARD_PAYMENT and card REIMBURSEMENT.
 */
export function computeCurrentCardDebt(
  movements: ReadonlyArray<Pick<Transaction, "type" | "status" | "amount" | "creditCardId">>
): string {
  const recognized = movements.filter(
    (item) =>
      item.type === "EXPENSE" &&
      item.status === "ACTIVE" &&
      item.creditCardId != null
  );
  return sumAmounts(recognized.map((item) => item.amount));
}
