import type { Currency } from "shared";

export const CREDIT_CARD_FEE_STATUSES = [
  "HAS_FEE",
  "WAIVED",
  "POTENTIALLY_WAIVED",
  "UNKNOWN",
] as const;

export type CreditCardFeeStatus = (typeof CREDIT_CARD_FEE_STATUSES)[number];

/** UX selector options. Custom brands are stored as free text (max 40). */
export const CREDIT_CARD_BRANDS = [
  "Visa",
  "Mastercard",
  "American Express",
  "Otra",
] as const;

export type CreditCardBrandOption = (typeof CREDIT_CARD_BRANDS)[number];

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
  feeExpectedAmount: string | null;
  feeNotes: string | null;
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
  feeExpectedAmount?: string | null;
  feeNotes?: string | null;
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
  feeExpectedAmount?: string | null;
  feeNotes?: string | null;
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
