import type { Currency } from "shared";
import type { CreditCardRefundExpectationView } from "../credit-card-refunds/credit-card-refund.types.js";

export const CREDIT_CARD_PROMOTION_BENEFIT_TYPES = [
  "PERCENTAGE",
  "FIXED_AMOUNT",
] as const;

export type CreditCardPromotionBenefitType =
  (typeof CREDIT_CARD_PROMOTION_BENEFIT_TYPES)[number];

export const CREDIT_CARD_PROMOTION_CAP_PERIODS = [
  "NONE",
  "PER_PURCHASE",
  "MONTHLY",
  "PROMOTION_PERIOD",
] as const;

export type CreditCardPromotionCapPeriod =
  (typeof CREDIT_CARD_PROMOTION_CAP_PERIODS)[number];

export const CALCULATION_LIMITED_BY = [
  "NONE",
  "MINIMUM_PURCHASE",
  "CAP",
  "SOURCE_REMAINING",
] as const;

export type CalculationLimitedBy = (typeof CALCULATION_LIMITED_BY)[number];

export type CreditCardPromotionView = {
  id: string;
  userId: string;
  creditCardId: string;
  name: string;
  currency: Currency;
  benefitType: CreditCardPromotionBenefitType;
  percentage: string | null;
  fixedAmount: string | null;
  minimumPurchaseAmount: string | null;
  capAmount: string | null;
  capPeriod: CreditCardPromotionCapPeriod;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCreditCardPromotionInput = {
  userId: string;
  creditCardId: string;
  name: string;
  currency: Currency;
  benefitType: CreditCardPromotionBenefitType;
  percentage?: string | null;
  fixedAmount?: string | null;
  minimumPurchaseAmount?: string | null;
  capAmount?: string | null;
  capPeriod: CreditCardPromotionCapPeriod;
  validFrom: Date;
  validUntil: Date;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateCreditCardPromotionInput = {
  userId: string;
  id: string;
  name?: string;
  benefitType?: CreditCardPromotionBenefitType;
  percentage?: string | null;
  fixedAmount?: string | null;
  minimumPurchaseAmount?: string | null;
  capAmount?: string | null;
  capPeriod?: CreditCardPromotionCapPeriod;
  validFrom?: Date;
  validUntil?: Date;
  description?: string | null;
};

export type PromotionApplySourceInput = {
  userId: string;
  promotionId: string;
  purchaseId?: string | null;
  originalExpenseTransactionId?: string | null;
  idempotencyKey?: string;
  description?: string | null;
};

export type PromotionCalculationResult = {
  eligible: boolean;
  expectedAmount: string;
  eligibleBase: string;
  rawBenefit: string;
  capApplied: string | null;
  limitedBy: CalculationLimitedBy;
  percentage: string | null;
  fixedAmount: string | null;
  promotionName: string;
  sharedCapRemaining: string | null;
  sourceRemaining: string;
  currency: Currency;
  creditCardId: string;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  sourceOccurredAt: Date;
};

export type PromotionPreviewResult = {
  calculation: PromotionCalculationResult;
};

export type PromotionApplyResult = {
  created: boolean;
  expectation: CreditCardRefundExpectationView;
  calculation: PromotionCalculationResult;
};

export type CreditCardPromotionRecord = CreditCardPromotionView;

export interface CreditCardPromotionRepository {
  findById(id: string): Promise<CreditCardPromotionRecord | null>;
  findByUserId(userId: string): Promise<CreditCardPromotionRecord[]>;
  create(input: CreateCreditCardPromotionInput): Promise<CreditCardPromotionRecord>;
  update(input: UpdateCreditCardPromotionInput): Promise<CreditCardPromotionRecord>;
  setActive(
    userId: string,
    id: string,
    isActive: boolean
  ): Promise<CreditCardPromotionRecord>;
  preview(input: PromotionApplySourceInput): Promise<PromotionPreviewResult>;
  apply(input: PromotionApplySourceInput): Promise<PromotionApplyResult>;
}
