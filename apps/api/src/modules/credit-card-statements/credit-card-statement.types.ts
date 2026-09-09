import type { Currency } from "shared";

export const CREDIT_CARD_STATEMENT_STATUSES = [
  "PROJECTED",
  "CLOSED",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type CreditCardStatementStatus =
  (typeof CREDIT_CARD_STATEMENT_STATUSES)[number];

export type CreditCardStatement = {
  id: string;
  userId: string;
  creditCardId: string;
  currency: Currency;
  periodStart: Date;
  periodEnd: Date;
  closingDate: Date;
  dueDate: Date | null;
  status: CreditCardStatementStatus;
  closedProjectedAmount: string | null;
  actualAmount: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateStatementRecord = {
  id: string;
  userId: string;
  creditCardId: string;
  currency: Currency;
  periodStart: Date;
  periodEnd: Date;
  closingDate: Date;
  dueDate: Date | null;
  status: "PROJECTED";
};

export type CloseStatementRecord = {
  closedProjectedAmount: string;
  actualAmount: string | null;
  closedAt: Date;
  status: "CLOSED" | "PAID";
};

export type StatementTransactionSummary = {
  id: string;
  amount: string;
  currency: Currency;
  description: string | null;
  occurredAt: Date;
};

export type StatementPaymentSummary = {
  id: string;
  amount: string;
  accountId: string;
  occurredAt: Date;
  status: string;
};

export type StatementView = {
  statement: CreditCardStatement;
  /** Live derived sum for PROJECTED; equals closedProjectedAmount for CLOSED display field projectedAmount. */
  projectedAmount: string;
  /** Always live derived from current Transactions in the cycle. */
  currentDerivedAmount: string;
  difference: string | null;
  hasReconciliationDifference: boolean;
  /** Null while PROJECTED. */
  targetAmount: string | null;
  paidAmount: string | null;
  remainingAmount: string | null;
  /** target vs live derived after close; informative only (F9). */
  hasPaymentCoverageGap: boolean;
  transactions?: StatementTransactionSummary[];
  payments?: StatementPaymentSummary[];
};

export interface CreditCardStatementRepository {
  createProjected(input: CreateStatementRecord): Promise<CreditCardStatement>;
  findById(id: string): Promise<CreditCardStatement | null>;
  findByCreditCardAndClosingDate(
    creditCardId: string,
    closingDate: Date
  ): Promise<CreditCardStatement | null>;
  findByCreditCardId(creditCardId: string): Promise<CreditCardStatement[]>;
  close(
    id: string,
    input: CloseStatementRecord
  ): Promise<CreditCardStatement>;
}
