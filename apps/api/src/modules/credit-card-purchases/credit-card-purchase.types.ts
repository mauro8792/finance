import type { Currency } from "shared";

export const CREDIT_CARD_PURCHASE_STATUSES = ["ACTIVE", "VOIDED"] as const;
export type CreditCardPurchaseStatus = (typeof CREDIT_CARD_PURCHASE_STATUSES)[number];

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
  recognizedTransactionId: string | null;
  recognizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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
  installment: {
    id: string;
    purchaseId: string;
    installmentNumber: number;
    amount: string;
    status: CreditCardInstallmentStatus;
    recognizedTransactionId: string;
    recognizedAt: Date;
  };
  transaction: {
    id: string;
    userId: string;
    accountId: null;
    creditCardId: string;
    categoryId: string;
    type: "EXPENSE";
    status: "ACTIVE";
    amount: string;
    currency: Currency;
    description: string | null;
    occurredAt: Date;
    paymentMethod: null;
    isFixed: false;
    reimbursementStatus: "NONE";
  };
};

export type PurchaseWithInstallment = {
  purchase: CreditCardPurchase;
  installment: CreditCardInstallment;
  transactionId: string;
};

export type CreditCardPurchaseRepository = {
  createCashPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallment>;
  findById(id: string): Promise<PurchaseWithInstallment | null>;
  findByUserId(userId: string): Promise<PurchaseWithInstallment[]>;
};
