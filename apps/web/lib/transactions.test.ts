import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Transaction } from "./types";
import {
  canEditTransaction,
  canVoidTransaction,
  filterYearOptions,
  formatTransactionDate,
  incomeKindLabel,
  isImmutableTransactionType,
  reimbursementLabel,
  toTransactionListFilters,
  transactionAmountSign,
  transactionStatusLabel,
  transactionTypeLabel,
} from "./transactions";

function tx(partial: Partial<Transaction> & Pick<Transaction, "type">): Transaction {
  return {
    id: "tx-1",
    accountId: "acc-1",
    categoryId: "cat-1",
    status: "ACTIVE",
    amount: "2000000.00",
    currency: "ARS",
    description: "Prueba",
    occurredAt: "2026-08-15T15:00:00.000Z",
    paymentMethod: null,
    isFixed: false,
    reimbursementStatus: "NONE",
    relatedTransactionId: null,
    metadata: null,
    ...partial,
  };
}

describe("transactions helpers", () => {
  it("maps enums to readable labels", () => {
    assert.equal(transactionTypeLabel("EXPENSE"), "Gasto");
    assert.equal(transactionTypeLabel("INCOME"), "Ingreso");
    assert.equal(transactionTypeLabel("REIMBURSEMENT"), "Reembolso");
    assert.equal(transactionTypeLabel("TRANSFER"), "Transferencia");
    assert.equal(transactionTypeLabel("CURRENCY_EXCHANGE"), "Cambio de moneda");
    assert.equal(transactionTypeLabel("HOUSING_PAYMENT"), "Pago vivienda");
    assert.equal(transactionTypeLabel("INVESTMENT_OUTFLOW"), "Inversión");
    assert.equal(transactionTypeLabel("INVESTMENT_PRINCIPAL_RETURN"), "Retorno de capital");
    assert.equal(transactionTypeLabel("INVESTMENT_RETURN"), "Rendimiento");
    assert.equal(incomeKindLabel("OPERATING"), "Ingreso normal");
    assert.equal(incomeKindLabel("CAPITAL"), "Capital");
    assert.equal(transactionStatusLabel("ACTIVE"), "Activo");
    assert.equal(transactionStatusLabel("VOIDED"), "Anulado");
  });

  it("uses presentation signs without inventing direction", () => {
    assert.equal(transactionAmountSign(tx({ type: "EXPENSE" })), "-");
    assert.equal(transactionAmountSign(tx({ type: "INCOME" })), "+");
    assert.equal(transactionAmountSign(tx({ type: "REIMBURSEMENT" })), "+");
    assert.equal(transactionAmountSign(tx({ type: "HOUSING_PAYMENT" })), "-");
    assert.equal(transactionAmountSign(tx({ type: "INVESTMENT_OUTFLOW" })), "-");
    assert.equal(transactionAmountSign(tx({ type: "INVESTMENT_PRINCIPAL_RETURN" })), "+");
    assert.equal(transactionAmountSign(tx({ type: "INVESTMENT_RETURN" })), "+");
    assert.equal(
      transactionAmountSign(tx({ type: "TRANSFER", metadata: { direction: "OUT" } })),
      "-"
    );
    assert.equal(
      transactionAmountSign(tx({ type: "TRANSFER", metadata: { direction: "IN" } })),
      "+"
    );
    assert.equal(
      transactionAmountSign(
        tx({ type: "CURRENCY_EXCHANGE", metadata: { direction: "IN" } })
      ),
      "+"
    );
    assert.equal(transactionAmountSign(tx({ type: "TRANSFER" })), "");
  });

  it("formats dates in ART as dd/mm/yyyy", () => {
    assert.equal(formatTransactionDate("2026-08-15T15:00:00.000Z"), "15/08/2026");
    assert.equal(formatTransactionDate("2026-06-01T03:00:00.000Z"), "01/06/2026");
  });

  it("shows reimbursement copy from the DTO only", () => {
    assert.equal(reimbursementLabel("COMPLETED"), "Reembolsado");
    assert.equal(reimbursementLabel("PARTIAL"), "Parcialmente reembolsado");
    assert.equal(reimbursementLabel("NONE"), null);
  });

  it("allows edit and void only for mutable ACTIVE movements", () => {
    assert.equal(canEditTransaction(tx({ type: "EXPENSE" })), true);
    assert.equal(canVoidTransaction(tx({ type: "INCOME" })), true);
    assert.equal(canEditTransaction(tx({ type: "EXPENSE", status: "VOIDED" })), false);
    assert.equal(canVoidTransaction(tx({ type: "EXPENSE", status: "VOIDED" })), false);
    assert.equal(isImmutableTransactionType("TRANSFER"), true);
    assert.equal(canEditTransaction(tx({ type: "TRANSFER" })), false);
    assert.equal(canVoidTransaction(tx({ type: "CURRENCY_EXCHANGE" })), false);
    assert.equal(canEditTransaction(tx({ type: "HOUSING_PAYMENT" })), false);
    assert.equal(canVoidTransaction(tx({ type: "INVESTMENT_OUTFLOW" })), false);
    assert.equal(canVoidTransaction(tx({ type: "INVESTMENT_PRINCIPAL_RETURN" })), false);
    assert.equal(canVoidTransaction(tx({ type: "INVESTMENT_RETURN" })), false);
    assert.equal(
      canVoidTransaction(tx({ type: "EXPENSE", relatedTransactionId: "tx-2" })),
      false
    );
  });

  it("keeps 2026 available for QA month filters", () => {
    assert.ok(filterYearOptions(new Date("2026-09-01T12:00:00.000Z")).includes(2026));
  });

  it("sends month even when year is Todos", () => {
    assert.deepEqual(
      toTransactionListFilters({
        year: "",
        month: "6",
        type: "",
        accountId: "",
        categoryId: "",
        status: "",
      }),
      { month: 6 }
    );
    assert.deepEqual(
      toTransactionListFilters({
        year: "2026",
        month: "8",
        type: "",
        accountId: "",
        categoryId: "",
        status: "",
      }),
      { year: 2026, month: 8 }
    );
    assert.deepEqual(
      toTransactionListFilters({
        year: "",
        month: "",
        type: "",
        accountId: "",
        categoryId: "",
        status: "",
      }),
      {}
    );
  });
});
