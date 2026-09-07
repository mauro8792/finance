import type { Currency } from "shared";
import type { CreateTransactionInput } from "../transactions/transaction.types.js";

export const CREDIT_CARD_PURCHASE_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type CreditCardPurchaseStatus =
  (typeof CREDIT_CARD_PURCHASE_STATUSES)[number];

export const CREDIT_CARD_INSTALLMENT_STATUSES = [
  "PENDING",
  "RECOGNIZED",
  "CANCELLED",
] as const;
export type CreditCardInstallmentStatus =
  (typeof CREDIT_CARD_INSTALLMENT_STATUSES)[number];

export type CreditCardPurchase = {
  id: string;
  userId: string;
  creditCardId: string;
  categoryId: string;
  description: string | null;
  currency: Currency;
  totalAmount: string;
  /** Nominal/base per-installment; last installment may differ by rounding. */
  installmentAmount: string;
  installmentsCount: number;
  purchasedAt: Date;
  status: CreditCardPurchaseStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditCardInstallment = {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  amount: string;
  status: CreditCardInstallmentStatus;
  scheduledFor: Date;
  recognizedTransactionId: string | null;
  recognizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseWithInstallments = {
  purchase: CreditCardPurchase;
  installments: CreditCardInstallment[];
  /** First RECOGNIZED installment's transaction id (P0.7 create always sets #1). */
  recognizedTransactionId: string | null;
};

/** @deprecated Use PurchaseWithInstallments */
export type PurchaseWithInstallment = PurchaseWithInstallments;

export type CreatePurchaseAtomicInput = {
  purchase: {
    id: string;
    userId: string;
    creditCardId: string;
    categoryId: string;
    description: string | null;
    currency: Currency;
    totalAmount: string;
    installmentAmount: string;
    installmentsCount: number;
    purchasedAt: Date;
    status: CreditCardPurchaseStatus;
  };
  installments: Array<{
    id: string;
    purchaseId: string;
    installmentNumber: number;
    amount: string;
    status: CreditCardInstallmentStatus;
    scheduledFor: Date;
    recognizedTransactionId: string | null;
    recognizedAt: Date | null;
  }>;
  /** Transaction for the initially recognized installment (#1 in P0.7). */
  transaction: CreateTransactionInput;
};

export interface CreditCardPurchaseRepository {
  createPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallments>;
  findById(id: string): Promise<PurchaseWithInstallments | null>;
  findByUserId(userId: string): Promise<PurchaseWithInstallments[]>;
  findPendingInstallmentAmountsByCreditCardId(
    userId: string,
    creditCardId: string
  ): Promise<Array<{ amount: string; status: CreditCardInstallmentStatus }>>;
}
