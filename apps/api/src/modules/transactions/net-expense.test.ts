import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import { calculateNetExpense, reimbursementStatusFromTotals } from "./net-expense.js";

test("calculateNetExpense is gross when there are no reimbursements", () => {
  assert.equal(calculateNetExpense("100.00", []), "100.00");
});

test("calculateNetExpense subtracts a partial reimbursement", () => {
  assert.equal(calculateNetExpense("100.00", ["25.00"]), "75.00");
});

test("calculateNetExpense is zero when fully reimbursed", () => {
  assert.equal(calculateNetExpense("100.00", ["100.00"]), "0.00");
});

test("calculateNetExpense subtracts multiple partial reimbursements", () => {
  assert.equal(calculateNetExpense("100.00", ["25.00", "30.00"]), "45.00");
});

test("calculateNetExpense rejects a negative net", () => {
  assert.throws(
    () => calculateNetExpense("100.00", ["100.01"]),
    (error: unknown) =>
      error instanceof AppError && error.code === "NET_EXPENSE_NEGATIVE"
  );
});

test("reimbursementStatusFromTotals maps pending, partial and completed", () => {
  assert.equal(reimbursementStatusFromTotals("100.00", "0.00"), "PENDING");
  assert.equal(reimbursementStatusFromTotals("100.00", "40.00"), "PARTIAL");
  assert.equal(reimbursementStatusFromTotals("100.00", "100.00"), "COMPLETED");
});
