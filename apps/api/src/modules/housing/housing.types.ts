import type { Currency } from "shared";
import type { CreateTransactionInput, Transaction } from "../transactions/transaction.types.js";

export type HousingObligation = {
  id: string;
  userId: string;
  reserveAccountId: string | null;
  name: string;
  currency: Currency;
  installmentAmount: string;
  remainingInstallments: number;
  dueDay: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateHousingObligationInput = {
  userId: string;
  reserveAccountId?: string | null;
  name: string;
  currency: Currency;
  installmentAmount: string;
  remainingInstallments: number;
  dueDay?: number | null;
  isActive?: boolean;
};

export type UpdateHousingObligationRecord = {
  reserveAccountId?: string | null;
  name?: string;
  installmentAmount?: string;
  remainingInstallments?: number;
  dueDay?: number | null;
  isActive?: boolean;
};

export type HousingPayment = {
  id: string;
  housingObligationId: string;
  transactionId: string;
  accountId: string;
  amount: string;
  currency: Currency;
  installmentNumber: number | null;
  paidAt: Date;
  createdAt: Date;
};

export type CreateHousingPaymentRecord = {
  id: string;
  housingObligationId: string;
  transactionId: string;
  accountId: string;
  amount: string;
  currency: Currency;
  installmentNumber: number | null;
  paidAt: Date;
};

export class RemainingInstallmentsConflictError extends Error {
  constructor() {
    super("NO_REMAINING_INSTALLMENTS");
    this.name = "RemainingInstallmentsConflictError";
  }
}

export type HousingObligationRepository = {
  create(input: CreateHousingObligationInput): Promise<HousingObligation>;
  findById(id: string): Promise<HousingObligation | null>;
  findByUserId(userId: string): Promise<HousingObligation[]>;
  update(id: string, input: UpdateHousingObligationRecord): Promise<HousingObligation>;
  findPaymentsByObligationId(obligationId: string): Promise<HousingPayment[]>;
  registerPaymentAtomic(
    payment: CreateHousingPaymentRecord,
    transaction: CreateTransactionInput & { id: string },
    obligationId: string
  ): Promise<{
    payment: HousingPayment;
    transaction: Transaction;
    obligation: HousingObligation;
  }>;
};
