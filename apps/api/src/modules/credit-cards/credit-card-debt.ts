import { sumAmounts } from "../transactions/net-expense.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type { Transaction } from "../transactions/transaction.types.js";

/**
 * P0.11 currentCardDebt (derived, not persisted):
 *   SUM ACTIVE EXPENSE WHERE creditCardId
 * − SUM ACTIVE CREDIT_CARD_PAYMENT WHERE creditCardId
 * − SUM ACTIVE REIMBURSEMENT WHERE creditCardId
 *
 * Never negative under valid operations; defensive floor at 0.
 */
export function computeCurrentCardDebt(
  movements: ReadonlyArray<
    Pick<Transaction, "type" | "status" | "amount" | "creditCardId">
  >
): string {
  const charges = movements.filter(
    (item) =>
      item.type === "EXPENSE" &&
      item.status === "ACTIVE" &&
      item.creditCardId != null
  );
  const payments = movements.filter(
    (item) =>
      item.type === "CREDIT_CARD_PAYMENT" &&
      item.status === "ACTIVE" &&
      item.creditCardId != null
  );
  const cardReimbursements = movements.filter(
    (item) =>
      item.type === "REIMBURSEMENT" &&
      item.status === "ACTIVE" &&
      item.creditCardId != null
  );

  const chargeTotal =
    charges.length === 0 ? 0n : toCents(sumAmounts(charges.map((c) => c.amount)));
  const paymentTotal =
    payments.length === 0
      ? 0n
      : toCents(sumAmounts(payments.map((p) => p.amount)));
  const reimbursementTotal =
    cardReimbursements.length === 0
      ? 0n
      : toCents(sumAmounts(cardReimbursements.map((r) => r.amount)));
  const debt = chargeTotal - paymentTotal - reimbursementTotal;
  return fromCents(debt < 0n ? 0n : debt);
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
