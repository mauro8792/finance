import type { Currency } from "shared";
import type { TransactionStatus } from "../transactions/transaction.types.js";

export type CreditCardPaymentView = {
  id: string;
  creditCardId: string;
  statementId: string | null;
  accountId: string;
  amount: string;
  currency: Currency;
  occurredAt: Date;
  description: string | null;
  status: TransactionStatus;
  idempotencyKey: string;
  /** P0.15: set once the CREDIT_CARD_PAYMENT leg was reversed. */
  voidedAt: Date | null;
};

export type CreateCreditCardPaymentInput = {
  userId: string;
  creditCardId: string;
  accountId: string;
  amount: string;
  statementId?: string | null;
  occurredAt?: Date;
  description?: string | null;
  idempotencyKey: string;
};

export type CreditCardPaymentLinkRecord = {
  id: string;
  userId: string;
  transactionId: string;
  creditCardId: string;
  statementId: string | null;
  idempotencyKey: string;
  voidedAt: Date | null;
  voidIdempotencyKey: string | null;
  createdAt: Date;
};

export type CreatePaymentAtomicResult = {
  created: boolean;
  payment: CreditCardPaymentView;
};

export type VoidCreditCardPaymentInput = {
  userId: string;
  creditCardId: string;
  paymentId: string;
  idempotencyKey: string;
};

export type VoidPaymentAtomicResult = {
  created: boolean;
  payment: CreditCardPaymentView;
  /** Statement status after recomputing from remaining ACTIVE payments. */
  statementStatus: string | null;
};

export interface CreditCardPaymentRepository {
  findByTransactionId(
    transactionId: string
  ): Promise<CreditCardPaymentLinkRecord | null>;
  findByUserAndIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CreditCardPaymentLinkRecord | null>;
  findByCreditCardId(
    creditCardId: string
  ): Promise<CreditCardPaymentLinkRecord[]>;
  findByStatementId(
    statementId: string
  ): Promise<CreditCardPaymentLinkRecord[]>;
  /**
   * Serializes payments per card via SELECT … FOR UPDATE on credit_cards,
   * creates CREDIT_CARD_PAYMENT + link, updates statement status when applicable.
   */
  createPaymentAtomic(
    input: CreateCreditCardPaymentInput
  ): Promise<CreatePaymentAtomicResult>;
  /**
   * P0.15: reverses the CREDIT_CARD_PAYMENT leg, marks the link voided and
   * recomputes the statement payment status. Bank balance and card debt are
   * derived from ACTIVE movements, so both restore without compensating rows.
   */
  voidPaymentAtomic(
    input: VoidCreditCardPaymentInput
  ): Promise<VoidPaymentAtomicResult>;
}
