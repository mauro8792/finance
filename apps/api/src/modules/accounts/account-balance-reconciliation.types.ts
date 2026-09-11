import type { Currency } from "shared";
import type { CreateTransactionInput, Transaction } from "../transactions/transaction.types.js";

export type AccountBalanceReconciliation = {
  id: string;
  userId: string;
  accountId: string;
  transactionId: string;
  observedBalance: string;
  previousCalculatedBalance: string;
  adjustmentAmount: string;
  currency: Currency;
  reason: string;
  occurredAt: Date;
  idempotencyKey: string;
  createdAt: Date;
};

export type ReconcileAccountBalanceInput = {
  accountId: string;
  observedBalance: string;
  reason: string;
  occurredAt?: Date;
  idempotencyKey: string;
};

export type ReconcileAccountBalanceResult = {
  created: boolean;
  reconciliation: AccountBalanceReconciliation;
  transaction: Transaction;
  balance: string;
};

export type CreateReconciliationAtomicInput = {
  reconciliation: {
    id: string;
    userId: string;
    accountId: string;
    transactionId: string;
    observedBalance: string;
    previousCalculatedBalance: string;
    adjustmentAmount: string;
    currency: Currency;
    reason: string;
    occurredAt: Date;
    idempotencyKey: string;
  };
  transaction: CreateTransactionInput & { id: string };
};

/** Canonical payload bound to an idempotency key. */
export type ReconciliationIdempotencyPayload = {
  accountId: string;
  observedBalance: string;
  reason: string;
  occurredAt: string;
};

export type AccountBalanceReconciliationRepository = {
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<AccountBalanceReconciliation | null>;
  findById(id: string): Promise<AccountBalanceReconciliation | null>;
  createAtomic(
    input: CreateReconciliationAtomicInput
  ): Promise<{
    reconciliation: AccountBalanceReconciliation;
    transaction: Transaction;
  }>;
};
