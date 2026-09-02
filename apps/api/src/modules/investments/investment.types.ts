import type { Currency } from "shared";
import type { CreateTransactionInput, Transaction } from "../transactions/transaction.types.js";

export const INVESTMENT_TYPES = ["CAUCION", "OTHER"] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export const INVESTMENT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "MATURED",
  "RENEWED",
  "CANCELLED",
] as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number];

export type Investment = {
  id: string;
  userId: string;
  accountId: string;
  renewedFromInvestmentId: string | null;
  type: InvestmentType;
  status: InvestmentStatus;
  currency: Currency;
  principal: string;
  annualRate: string | null;
  startDate: Date;
  maturityDate: Date | null;
  expectedReturn: string | null;
  actualReturn: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInvestmentRecord = {
  id: string;
  userId: string;
  accountId: string;
  type: InvestmentType;
  status: InvestmentStatus;
  currency: Currency;
  principal: string;
  annualRate: string | null;
  startDate: Date;
  maturityDate: Date | null;
  expectedReturn: string | null;
  notes: string | null;
  renewedFromInvestmentId?: string | null;
};

export type RenewAtomicInput = {
  originalId: string;
  originalPatch: { status: "RENEWED"; actualReturn: string };
  newInvestment: CreateInvestmentRecord & { renewedFromInvestmentId: string };
  principalReturn: CreateTransactionInput & { id: string };
  investmentReturn: (CreateTransactionInput & { id: string }) | null;
  outflow: CreateTransactionInput & { id: string };
};

export type InvestmentRepository = {
  createCaucionAtomic(
    investment: CreateInvestmentRecord,
    transaction: CreateTransactionInput & { id: string }
  ): Promise<{ investment: Investment; transaction: Transaction }>;
  matureAtomic(
    investmentId: string,
    patch: { status: "MATURED"; actualReturn: string },
    principalReturn: CreateTransactionInput & { id: string },
    investmentReturn: (CreateTransactionInput & { id: string }) | null
  ): Promise<{
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
  }>;
  renewAtomic(input: RenewAtomicInput): Promise<{
    original: Investment;
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
    outflow: Transaction;
  }>;
  findById(id: string): Promise<Investment | null>;
  findByUserId(userId: string): Promise<Investment[]>;
};
