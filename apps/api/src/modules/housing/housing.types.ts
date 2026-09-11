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
  periodYear: number | null;
  periodMonth: number | null;
  paidAt: Date;
  voidedAt: Date | null;
  voidIdempotencyKey: string | null;
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
  periodYear: number | null;
  periodMonth: number | null;
  paidAt: Date;
};

export type VoidHousingPaymentInput = {
  userId: string;
  obligationId: string;
  paymentId: string;
  idempotencyKey: string;
};

export type VoidHousingPaymentAtomicResult = {
  created: boolean;
  payment: HousingPayment;
  transaction: Transaction;
  obligation: HousingObligation;
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
  /**
   * P1.2: reverses the HOUSING_PAYMENT leg, marks the payment voided and
   * restores remainingInstallments. Reserve balance restores from ACTIVE txs.
   */
  voidPaymentAtomic(
    input: VoidHousingPaymentInput
  ): Promise<VoidHousingPaymentAtomicResult>;
};
