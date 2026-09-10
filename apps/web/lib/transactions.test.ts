import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { Transaction } from "./types";
import {
  canCorrectTransaction,
  canEditTransaction,
  canVoidTransaction,
  canVoidTransfer,
  filterYearOptions,
  isActiveTransaction,
  toCorrectionInitialValues,
  VOID_HISTORY_NOTICE,
  formatTransactionDate,
  groupTransactionsForDisplay,
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
    assert.equal(transactionStatusLabel("REVERSED"), "Reversado");
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

  it("treats REVERSED like VOIDED: out of the numbers, still in history", () => {
    assert.equal(isActiveTransaction(tx({ type: "EXPENSE" })), true);
    assert.equal(isActiveTransaction(tx({ type: "EXPENSE", status: "VOIDED" })), false);
    assert.equal(
      isActiveTransaction(tx({ type: "EXPENSE", status: "REVERSED" })),
      false
    );
    assert.equal(canEditTransaction(tx({ type: "EXPENSE", status: "REVERSED" })), false);
    assert.equal(canVoidTransaction(tx({ type: "EXPENSE", status: "REVERSED" })), false);
  });

  it("voids a transfer as a whole, never a single leg", () => {
    const out = tx({
      id: "tx-out",
      type: "TRANSFER",
      categoryId: null,
      metadata: { transferId: "tr-1", direction: "OUT" },
    });
    const incoming = tx({
      id: "tx-in",
      type: "TRANSFER",
      categoryId: null,
      metadata: { transferId: "tr-1", direction: "IN" },
    });

    assert.equal(canVoidTransfer(out, incoming), true);
    // Las patas individuales siguen siendo inmutables.
    assert.equal(canVoidTransaction(out), false);
    assert.equal(canVoidTransaction(incoming), false);
    assert.equal(
      canVoidTransfer({ ...out, status: "REVERSED" }, { ...incoming, status: "REVERSED" }),
      false
    );
    assert.equal(canVoidTransfer(out, { ...incoming, status: "REVERSED" }), false);
    assert.equal(
      VOID_HISTORY_NOTICE,
      "El movimiento original se conserva por historial."
    );
  });

  it("offers Corregir only for simple EXPENSE/INCOME movements", () => {
    assert.equal(canCorrectTransaction(tx({ type: "EXPENSE" })), true);
    assert.equal(canCorrectTransaction(tx({ type: "INCOME" })), true);
    assert.equal(canCorrectTransaction(tx({ type: "ADJUSTMENT" })), false);
    assert.equal(canCorrectTransaction(tx({ type: "REIMBURSEMENT" })), false);
    assert.equal(canCorrectTransaction(tx({ type: "TRANSFER" })), false);
    assert.equal(
      canCorrectTransaction(tx({ type: "EXPENSE", status: "VOIDED" })),
      false
    );
    assert.deepEqual(
      toCorrectionInitialValues(
        tx({
          type: "EXPENSE",
          amount: "1234.50",
          accountId: "acc-9",
          categoryId: "cat-9",
          description: "Súper",
          paymentMethod: "CASH",
        })
      ),
      {
        kind: "EXPENSE",
        amount: "1234.50",
        accountId: "acc-9",
        categoryId: "cat-9",
        description: "Súper",
        paymentMethod: "CASH",
        incomeKind: null,
      }
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

  it("groups transfer legs into a single movement item", () => {
    const expense = tx({
      id: "tx-exp",
      type: "EXPENSE",
      occurredAt: "2026-08-10T15:00:00.000Z",
    });
    const out = tx({
      id: "tx-out",
      type: "TRANSFER",
      accountId: "acc-source",
      categoryId: null,
      amount: "500.00",
      occurredAt: "2026-08-20T15:00:00.000Z",
      metadata: { transferId: "tr-1", direction: "OUT" },
    });
    const inTx = tx({
      id: "tx-in",
      type: "TRANSFER",
      accountId: "acc-dest",
      categoryId: null,
      amount: "500.00",
      occurredAt: "2026-08-20T15:00:00.000Z",
      metadata: { transferId: "tr-1", direction: "IN" },
    });

    const grouped = groupTransactionsForDisplay([expense, out, inTx]);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0]?.kind, "transaction");
    assert.equal(grouped[1]?.kind, "transfer");
    if (grouped[1]?.kind === "transfer") {
      assert.equal(grouped[1].transferId, "tr-1");
      assert.equal(grouped[1].out.id, "tx-out");
      assert.equal(grouped[1].in.id, "tx-in");
    }
  });

  it("keeps incomplete transfer legs as individual transactions", () => {
    const legacy = tx({
      id: "tx-legacy",
      type: "TRANSFER",
      categoryId: null,
      metadata: { direction: "OUT" },
    });
    const orphanOut = tx({
      id: "tx-orphan",
      type: "TRANSFER",
      categoryId: null,
      metadata: { transferId: "tr-missing", direction: "OUT" },
    });

    const grouped = groupTransactionsForDisplay([legacy, orphanOut]);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0]?.kind, "transaction");
    assert.equal(grouped[1]?.kind, "transaction");
    if (grouped[0]?.kind === "transaction") {
      assert.equal(grouped[0].transaction.id, "tx-legacy");
    }
  });
});
