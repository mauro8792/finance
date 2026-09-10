import type { Currency } from "shared";
import type {
  TransferMetadata,
  CurrencyExchangeMetadata,
  HousingPaymentMetadata,
  InvestmentOutflowMetadata,
  InvestmentPrincipalReturnMetadata,
  InvestmentReturnMetadata,
} from "./transaction-balance.js";

export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REIMBURSEMENT",
  "ADJUSTMENT",
  "INVESTMENT_OUTFLOW",
  "INVESTMENT_PRINCIPAL_RETURN",
  "INVESTMENT_RETURN",
  "CURRENCY_EXCHANGE",
  "HOUSING_PAYMENT",
  "CREDIT_CARD_PAYMENT",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * P0.15: VOIDED = plain single-movement void.
 * REVERSED = leg voided as part of a compound correction (transfer, card
 * payment, recognized installment expense, refund accreditation).
 * Read models must treat both as excluded: only ACTIVE counts.
 */
export const TRANSACTION_STATUSES = ["ACTIVE", "VOIDED", "REVERSED"] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export function isActiveStatus(status: TransactionStatus): boolean {
  return status === "ACTIVE";
}

export const PAYMENT_METHODS = [
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "DIGITAL_WALLET",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REIMBURSEMENT_STATUSES = [
  "NONE",
  "PENDING",
  "PARTIAL",
  "COMPLETED",
] as const;

export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

export const EXPENSE_CATEGORY_TYPES = ["EXPENSE", "BOTH"] as const;

export const INCOME_CATEGORY_TYPES = ["INCOME", "BOTH"] as const;

export const INCOME_KINDS = ["OPERATING", "CAPITAL"] as const;

export type IncomeKind = (typeof INCOME_KINDS)[number];

export type Transaction = {
  id: string;
  userId: string;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  currency: Currency;
  description: string | null;
  occurredAt: Date;
  paymentMethod: PaymentMethod | null;
  isFixed: boolean;
  reimbursementStatus: ReimbursementStatus;
  relatedTransactionId: string | null;
  metadata: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTransactionInput = {
  id?: string;
  userId: string;
  accountId: string | null;
  creditCardId?: string | null;
  categoryId?: string | null;
  type: TransactionType;
  status?: TransactionStatus;
  amount: string;
  currency: Currency;
  description?: string | null;
  occurredAt: Date;
  paymentMethod?: PaymentMethod | null;
  isFixed?: boolean;
  reimbursementStatus?: ReimbursementStatus;
  relatedTransactionId?: string | null;
  metadata?:
    | { incomeKind: IncomeKind }
    | TransferMetadata
    | CurrencyExchangeMetadata
    | HousingPaymentMetadata
    | InvestmentOutflowMetadata
    | InvestmentPrincipalReturnMetadata
    | InvestmentReturnMetadata
    | null;
};

export type CreateTransferInput = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  description?: string;
  occurredAt?: Date;
  idempotencyKey: string;
};

export type TransferView = {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: Currency;
  description: string | null;
  occurredAt: Date;
  outTransactionId: string;
  inTransactionId: string;
  /** P0.15: set once both legs were atomically reversed. */
  voidedAt: Date | null;
  createdAt: Date;
};

export type TransferCreateResult = {
  created: boolean;
  transferId: string;
  out: Transaction;
  in: Transaction;
};

export type CreateTransferAtomicInput = {
  userId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  description: string | null;
  occurredAt: Date;
  clientSentOccurredAt: boolean;
  idempotencyKey: string;
};

export type VoidTransactionInput = {
  idempotencyKey: string;
};

export type VoidTransactionAtomicInput = {
  userId: string;
  transactionId: string;
  idempotencyKey: string;
};

export type VoidTransactionResult = {
  created: boolean;
  transaction: Transaction;
  /** REVERSED when the EXPENSE was a recognized card installment, else VOIDED. */
  resultStatus: Extract<TransactionStatus, "VOIDED" | "REVERSED">;
  /** Installment returned to PENDING, when the void unwound one. */
  installmentId: string | null;
  purchaseId: string | null;
};

export type VoidTransferAtomicInput = {
  userId: string;
  transferId: string;
  idempotencyKey: string;
};

export type VoidTransferResult = {
  created: boolean;
  transfer: TransferView;
  out: Transaction;
  in: Transaction;
};

export type CreateReimbursementInput = {
  amount: string;
  accountId: string;
  description?: string;
  occurredAt?: Date;
};

export type CreateExpenseInput = {
  amount: string;
  currency: Currency;
  accountId?: string;
  creditCardId?: string;
  categoryId: string;
  description?: string;
  occurredAt?: Date;
  paymentMethod?: PaymentMethod;
  isFixed?: boolean;
};

export type CreateIncomeInput = {
  amount: string;
  currency: Currency;
  accountId: string;
  categoryId?: string;
  incomeKind: IncomeKind;
  description?: string;
  occurredAt?: Date;
};

export type ListTransactionsInput = {
  year?: number;
  month?: number;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  status?: TransactionStatus;
  currency?: Currency;
};

export type UpdateTransactionInput = {
  amount?: string;
  categoryId?: string;
  description?: string | null;
  occurredAt?: Date;
  paymentMethod?: PaymentMethod | null;
  isFixed?: boolean;
};

export type UpdateTransactionRecord = {
  amount?: string;
  categoryId?: string | null;
  description?: string | null;
  occurredAt?: Date;
  paymentMethod?: PaymentMethod | null;
  isFixed?: boolean;
  status?: TransactionStatus;
  reimbursementStatus?: ReimbursementStatus;
};

export type FindTransactionsQuery = {
  occurredAtGte?: Date;
  occurredAtLt?: Date;
  occurredAtRanges?: Array<{ gte: Date; lt: Date }>;
  type?: TransactionType;
  categoryId?: string;
  currency?: Currency;
  accountId?: string;
  creditCardId?: string;
  status?: TransactionStatus;
  relatedTransactionId?: string;
};

export type TransactionRepository = {
  create(input: CreateTransactionInput): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  findByUserId(userId: string, query?: FindTransactionsQuery): Promise<Transaction[]>;
  update(id: string, input: UpdateTransactionRecord): Promise<Transaction>;
  createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: ReimbursementStatus }
  ): Promise<Transaction>;
  createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]>;
  createTransferAtomic(
    input: CreateTransferAtomicInput
  ): Promise<TransferCreateResult>;
  listTransfers(userId: string): Promise<TransferView[]>;
  findTransferById(
    userId: string,
    transferId: string
  ): Promise<TransferView | null>;
  /**
   * P0.15: locks the movement, re-checks it is still ACTIVE, unwinds a
   * recognized installment when present and records the CorrectionOperation.
   */
  voidTransactionAtomic(
    input: VoidTransactionAtomicInput
  ): Promise<VoidTransactionResult>;
  /**
   * P0.15: reverses BOTH transfer legs or neither. A single leg is never
   * voidable (TRANSFER_IMMUTABLE).
   */
  voidTransferAtomic(
    input: VoidTransferAtomicInput
  ): Promise<VoidTransferResult>;
};
