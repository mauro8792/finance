import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculatePromotionBenefit,
  consumedCapCents,
  percentageBenefitCents,
  toRateMicro,
} from "./credit-card-promotion.math.js";

test("P0.12 math — percentage 30% of 80000 → 24000 cents path via rate micro", () => {
  assert.equal(toRateMicro("0.300000"), 300_000n);
  assert.equal(percentageBenefitCents(8_000_000n, "0.200000"), 1_600_000n);
  assert.equal(percentageBenefitCents(100_000_00n, "0.200000"), 2_000_000n);
});

test("P0.12 math — percentage no cap", () => {
  const result = calculatePromotionBenefit({
    benefitType: "PERCENTAGE",
    percentage: "0.200000",
    fixedAmount: null,
    minimumPurchaseAmount: null,
    capAmount: null,
    capPeriod: "NONE",
    eligibleBaseCents: 8_000_000n,
    sourceRemainingCents: 8_000_000n,
    sharedCapRemainingCents: null,
    promotionName: "Promo 20%",
  });
  assert.equal(result.eligible, true);
  assert.equal(result.expectedCents, 1_600_000n);
  assert.equal(result.limitedBy, "NONE");
  assert.equal(result.rawBenefitCents, 1_600_000n);
});

test("P0.12 math — per-purchase cap limits raw benefit", () => {
  const result = calculatePromotionBenefit({
    benefitType: "PERCENTAGE",
    percentage: "0.200000",
    fixedAmount: null,
    minimumPurchaseAmount: null,
    capAmount: "10000.00",
    capPeriod: "PER_PURCHASE",
    eligibleBaseCents: 80_000_00n,
    sourceRemainingCents: 80_000_00n,
    sharedCapRemainingCents: null,
    promotionName: "Cap per purchase",
  });
  assert.equal(result.expectedCents, 1_000_000n);
  assert.equal(result.limitedBy, "CAP");
  assert.equal(result.capAppliedCents, 1_000_000n);
});

test("P0.12 math — fixed amount and fixed > purchase", () => {
  const ok = calculatePromotionBenefit({
    benefitType: "FIXED_AMOUNT",
    percentage: null,
    fixedAmount: "5000.00",
    minimumPurchaseAmount: null,
    capAmount: null,
    capPeriod: "NONE",
    eligibleBaseCents: 20_000_00n,
    sourceRemainingCents: 20_000_00n,
    sharedCapRemainingCents: null,
    promotionName: "Fixed",
  });
  assert.equal(ok.expectedCents, 500_000n);
  assert.equal(ok.limitedBy, "NONE");

  const capped = calculatePromotionBenefit({
    benefitType: "FIXED_AMOUNT",
    percentage: null,
    fixedAmount: "50000.00",
    minimumPurchaseAmount: null,
    capAmount: null,
    capPeriod: "NONE",
    eligibleBaseCents: 20_000_00n,
    sourceRemainingCents: 20_000_00n,
    sharedCapRemainingCents: null,
    promotionName: "Fixed big",
  });
  assert.equal(capped.expectedCents, 2_000_000n);
  assert.equal(capped.limitedBy, "SOURCE_REMAINING");
});

test("P0.12 math — minimum purchase fail", () => {
  const result = calculatePromotionBenefit({
    benefitType: "PERCENTAGE",
    percentage: "0.100000",
    fixedAmount: null,
    minimumPurchaseAmount: "10000.00",
    capAmount: null,
    capPeriod: "NONE",
    eligibleBaseCents: 5_000_00n,
    sourceRemainingCents: 5_000_00n,
    sharedCapRemainingCents: null,
    promotionName: "Min",
  });
  assert.equal(result.eligible, false);
  assert.equal(result.expectedCents, 0n);
  assert.equal(result.limitedBy, "MINIMUM_PURCHASE");
});

test("P0.12 math — monthly shared cap remaining", () => {
  const result = calculatePromotionBenefit({
    benefitType: "PERCENTAGE",
    percentage: "0.200000",
    fixedAmount: null,
    minimumPurchaseAmount: null,
    capAmount: "25000.00",
    capPeriod: "MONTHLY",
    eligibleBaseCents: 100_000_00n,
    sourceRemainingCents: 100_000_00n,
    sharedCapRemainingCents: 900_000n,
    promotionName: "Monthly",
  });
  assert.equal(result.rawBenefitCents, 2_000_000n);
  assert.equal(result.expectedCents, 900_000n);
  assert.equal(result.limitedBy, "CAP");
});

test("P0.12 math — consumedCapCents cancel semantics", () => {
  assert.equal(consumedCapCents("16000.00", "0.00"), 1_600_000n);
  assert.equal(consumedCapCents("16000.00", "16000.00"), 0n);
  assert.equal(consumedCapCents("16000.00", "6000.00"), 1_000_000n);
});
