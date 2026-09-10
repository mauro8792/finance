import type { Currency } from "shared";
import type { TransactionStatus } from "../transactions/transaction.types.js";

export const CREDIT_CARD_REFUND_EXPECTATION_STATUSES = [
  "EXPECTED",
  "PARTIALLY_ACCREDITED",
  "ACCREDITED",
  "CANCELLED",
] as const;

export type CreditCardRefundExpectationStatus =
  (typeof CREDIT_CARD_REFUND_EXPECTATION_STATUSES)[number];

export const CREDIT_CARD_REFUND_DESTINATION_TYPES = [
  "BANK_ACCOUNT",
  "CREDIT_CARD",
] as const;

export type CreditCardRefundDestinationType =
  (typeof CREDIT_CARD_REFUND_DESTINATION_TYPES)[number];

export type CreditCardRefundExpectationView = {
  id: string;
  userId: string;
  creditCardId: string;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  expectedAmount: string;
  cancelledRemainingAmount: string;
  accreditedAmount: string;
  remainingExpected: string;
  currency: Currency;
  status: CreditCardRefundExpectationStatus;
  expectedDate: Date | null;
  description: string | null;
  promotionId: string | null;
  calculationEligibleBase: string | null;
  calculationRawBenefit: string | null;
  calculationCapApplied: string | null;
  calculationLimitedBy: string | null;
  calculationPercentage: string | null;
  calculationFixedAmount: string | null;
  calculationPromotionName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditCardRefundAccreditationView = {
  id: string;
  transactionId: string;
  expectationId: string | null;
  originalExpenseTransactionId: string;
  purchaseId: string | null;
  creditCardId: string;
  destinationType: CreditCardRefundDestinationType;
  accountId: string | null;
  amount: string;
  currency: Currency;
  occurredAt: Date;
  description: string | null;
  status: TransactionStatus;
  idempotencyKey: string;
};

export type CreateCreditCardRefundExpectationInput = {
  userId: string;
  purchaseId?: string | null;
  originalExpenseTransactionId?: string | null;
  expectedAmount: string;
  expectedDate?: Date | null;
  description?: string | null;
};

export type AccreditCreditCardRefundInput = {
  userId: string;
  expectationId?: string | null;
  purchaseId?: string | null;
  originalExpenseTransactionId?: string | null;
  amount: string;
  destinationType: CreditCardRefundDestinationType;
  accountId?: string | null;
  occurredAt?: Date;
  description?: string | null;
  idempotencyKey: string;
};

export type CreditCardRefundExpectationRecord = {
  id: string;
  userId: string;
  creditCardId: string;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  expectedAmount: string;
  cancelledRemainingAmount: string;
  currency: Currency;
  status: CreditCardRefundExpectationStatus;
  expectedDate: Date | null;
  description: string | null;
  promotionId: string | null;
  calculationEligibleBase: string | null;
  calculationRawBenefit: string | null;
  calculationCapApplied: string | null;
  calculationLimitedBy: string | null;
  calculationPercentage: string | null;
  calculationFixedAmount: string | null;
  calculationPromotionName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditCardRefundAccreditationRecord = {
  id: string;
  userId: string;
  transactionId: string;
  expectationId: string | null;
  originalExpenseTransactionId: string;
  purchaseId: string | null;
  creditCardId: string;
  destinationType: CreditCardRefundDestinationType;
  idempotencyKey: string;
  createdAt: Date;
};

export type CreateExpectationAtomicResult = {
  expectation: CreditCardRefundExpectationView;
};

export type AccreditAtomicResult = {
  created: boolean;
  accreditation: CreditCardRefundAccreditationView;
  expectation: CreditCardRefundExpectationView | null;
};

export type CancelExpectationAtomicResult = {
  expectation: CreditCardRefundExpectationView;
};

export interface CreditCardRefundRepository {
  findExpectationById(
    id: string
  ): Promise<CreditCardRefundExpectationRecord | null>;
  findExpectationsByUserId(
    userId: string
  ): Promise<CreditCardRefundExpectationRecord[]>;
  findAccreditationByUserAndIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CreditCardRefundAccreditationRecord | null>;
  createExpectationAtomic(
    input: CreateCreditCardRefundExpectationInput
  ): Promise<CreateExpectationAtomicResult>;
  cancelExpectationAtomic(
    userId: string,
    expectationId: string
  ): Promise<CancelExpectationAtomicResult>;
  accreditAtomic(
    input: AccreditCreditCardRefundInput
  ): Promise<AccreditAtomicResult>;
  buildExpectationView(
    record: CreditCardRefundExpectationRecord
  ): Promise<CreditCardRefundExpectationView>;
}
