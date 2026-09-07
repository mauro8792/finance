import type { Currency } from "shared";

export const CREDIT_CARD_FEE_STATUSES = [
  "HAS_FEE",
  "WAIVED",
  "POTENTIALLY_WAIVED",
  "UNKNOWN",
] as const;

export type CreditCardFeeStatus = (typeof CREDIT_CARD_FEE_STATUSES)[number];

export type CreditCard = {
  id: string;
  userId: string;
  name: string;
  issuer: string;
  brand: string;
  currency: Currency;
  isActive: boolean;
  isPrimary: boolean;
  closingDay: number | null;
  dueDay: number | null;
  feeStatus: CreditCardFeeStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCreditCardInput = {
  userId: string;
  name: string;
  issuer: string;
  brand: string;
  currency: Currency;
  isActive?: boolean;
  isPrimary?: boolean;
  closingDay?: number | null;
  dueDay?: number | null;
  feeStatus?: CreditCardFeeStatus;
};

export type UpdateCreditCardInput = {
  name?: string;
  issuer?: string;
  brand?: string;
  currency?: Currency;
  isActive?: boolean;
  isPrimary?: boolean;
  closingDay?: number | null;
  dueDay?: number | null;
  feeStatus?: CreditCardFeeStatus;
};

export type CreditCardRepository = {
  create(input: CreateCreditCardInput): Promise<CreditCard>;
  findById(id: string): Promise<CreditCard | null>;
  findByUserId(userId: string): Promise<CreditCard[]>;
  update(id: string, input: UpdateCreditCardInput): Promise<CreditCard>;
  setPrimary(userId: string, id: string): Promise<CreditCard>;
};

export function isConfigComplete(card: Pick<CreditCard, "closingDay" | "dueDay">): boolean {
  return card.closingDay != null && card.dueDay != null;
}
