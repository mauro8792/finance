import { AppError } from "../../shared/errors/app-error.js";
import { divideRoundHalfUp } from "../currency-exchanges/currency-exchange.math.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type {
  CalculationLimitedBy,
  CreditCardPromotionBenefitType,
  CreditCardPromotionCapPeriod,
} from "./credit-card-promotion.types.js";

export const RATE_MICRO = 1_000_000n;

export type PromotionCalcInput = {
  benefitType: CreditCardPromotionBenefitType;
  percentage: string | null;
  fixedAmount: string | null;
  minimumPurchaseAmount: string | null;
  capAmount: string | null;
  capPeriod: CreditCardPromotionCapPeriod;
  eligibleBaseCents: bigint;
  sourceRemainingCents: bigint;
  sharedCapRemainingCents: bigint | null;
  promotionName: string;
};

export type PromotionCalcOutput = {
  eligible: boolean;
  expectedCents: bigint;
  eligibleBaseCents: bigint;
  rawBenefitCents: bigint;
  capAppliedCents: bigint | null;
  limitedBy: CalculationLimitedBy;
  percentage: string | null;
  fixedAmount: string | null;
  promotionName: string;
};

/** Percentage fraction e.g. 0.300000 → micro units. */
export function toRateMicro(rate: string): bigint {
  const [whole, fraction = ""] = rate.split(".");
  return BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
}

export function percentageBenefitCents(
  eligibleCents: bigint,
  percentage: string
): bigint {
  return divideRoundHalfUp(eligibleCents * toRateMicro(percentage), RATE_MICRO);
}

export function consumedCapCents(
  expectedAmount: string,
  cancelledRemainingAmount: string
): bigint {
  const consumed =
    toCents(expectedAmount) - toCents(cancelledRemainingAmount);
  return consumed < 0n ? 0n : consumed;
}

export function calculatePromotionBenefit(
  input: PromotionCalcInput
): PromotionCalcOutput {
  const eligibleBaseCents = input.eligibleBaseCents;
  const percentage =
    input.benefitType === "PERCENTAGE" ? input.percentage : null;
  const fixedAmount =
    input.benefitType === "FIXED_AMOUNT" ? input.fixedAmount : null;

  if (
    input.minimumPurchaseAmount != null &&
    eligibleBaseCents < toCents(input.minimumPurchaseAmount)
  ) {
    return {
      eligible: false,
      expectedCents: 0n,
      eligibleBaseCents,
      rawBenefitCents: 0n,
      capAppliedCents: null,
      limitedBy: "MINIMUM_PURCHASE",
      percentage,
      fixedAmount,
      promotionName: input.promotionName,
    };
  }

  let rawBenefitCents: bigint;
  if (input.benefitType === "PERCENTAGE") {
    if (percentage == null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "percentage es obligatorio para PERCENTAGE.",
        400
      );
    }
    rawBenefitCents = percentageBenefitCents(eligibleBaseCents, percentage);
  } else {
    if (fixedAmount == null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "fixedAmount es obligatorio para FIXED_AMOUNT.",
        400
      );
    }
    rawBenefitCents = toCents(fixedAmount);
  }

  type Candidate = { by: CalculationLimitedBy; cents: bigint };
  const candidates: Candidate[] = [{ by: "NONE", cents: rawBenefitCents }];

  if (input.capPeriod === "PER_PURCHASE" && input.capAmount != null) {
    candidates.push({ by: "CAP", cents: toCents(input.capAmount) });
  }
  if (
    (input.capPeriod === "MONTHLY" ||
      input.capPeriod === "PROMOTION_PERIOD") &&
    input.sharedCapRemainingCents != null
  ) {
    candidates.push({ by: "CAP", cents: input.sharedCapRemainingCents });
  }

  candidates.push({ by: "SOURCE_REMAINING", cents: input.sourceRemainingCents });
  candidates.push({ by: "SOURCE_REMAINING", cents: eligibleBaseCents });

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.cents < best.cents) {
      best = candidate;
    }
  }

  const expectedCents = best.cents < 0n ? 0n : best.cents;
  let capAppliedCents: bigint | null = null;
  if (best.by === "CAP") {
    capAppliedCents = expectedCents;
  }

  return {
    eligible: expectedCents > 0n,
    expectedCents,
    eligibleBaseCents,
    rawBenefitCents,
    capAppliedCents,
    limitedBy: best.by,
    percentage,
    fixedAmount,
    promotionName: input.promotionName,
  };
}

export function formatCalcMoney(cents: bigint): string {
  return fromCents(cents);
}
