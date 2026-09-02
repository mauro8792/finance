import { AppError } from "../../shared/errors/app-error.js";
import { fromCents, toCents } from "./transaction-balance.js";
import type { ReimbursementStatus, Transaction } from "./transaction.types.js";

export function sumAmounts(amounts: string[]): string {
  let cents = 0n;
  for (const amount of amounts) {
    cents += toCents(amount);
  }
  return fromCents(cents);
}

export function calculateNetExpense(
  grossAmount: string,
  reimbursementAmounts: string[]
): string {
  const net = toCents(grossAmount) - toCents(sumAmounts(reimbursementAmounts));

  if (net < 0n) {
    throw new AppError(
      "NET_EXPENSE_NEGATIVE",
      "El gasto neto no puede ser negativo.",
      400
    );
  }

  return fromCents(net);
}

export function activeReimbursementsOf(expense: Transaction, related: Transaction[]) {
  return related.filter(
    (item) =>
      item.relatedTransactionId === expense.id &&
      item.type === "REIMBURSEMENT" &&
      item.status === "ACTIVE"
  );
}

export function reimbursementStatusFromTotals(
  expenseAmount: string,
  reimbursedAmount: string
): ReimbursementStatus {
  const expense = toCents(expenseAmount);
  const reimbursed = toCents(reimbursedAmount);

  if (reimbursed === 0n) {
    return "PENDING";
  }

  if (reimbursed < expense) {
    return "PARTIAL";
  }

  if (reimbursed === expense) {
    return "COMPLETED";
  }

  throw new AppError(
    "REIMBURSEMENT_EXCEEDS_PENDING",
    "La suma de reintegros no puede superar el gasto original.",
    400
  );
}
