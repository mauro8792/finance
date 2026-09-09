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
  createdAt: Date;
};

export type CreatePaymentAtomicResult = {
  created: boolean;
  payment: CreditCardPaymentView;
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
}
