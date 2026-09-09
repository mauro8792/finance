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

export const TRANSACTION_STATUSES = ["ACTIVE", "VOIDED"] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

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
};
