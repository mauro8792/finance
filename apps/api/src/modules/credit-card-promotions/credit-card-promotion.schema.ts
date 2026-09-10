import { z } from "zod";
import { PositiveMoneyAmountSchema } from "../../shared/money/amount-schema.js";
import {
  CREDIT_CARD_PROMOTION_BENEFIT_TYPES,
  CREDIT_CARD_PROMOTION_CAP_PERIODS,
} from "./credit-card-promotion.types.js";

const AmountSchema = PositiveMoneyAmountSchema;

const OptionalPositiveAmountSchema = AmountSchema.nullable().optional();

const PercentageSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const raw = String(value).trim();
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(raw)) {
      ctx.addIssue({
        code: "custom",
        message: "percentage debe ser fracción decimal (ej. 0.300000).",
      });
      return z.NEVER;
    }
    const [whole, fraction = ""] = raw.split(".");
    const micro =
      BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    if (micro <= 0n || micro > 1_000_000n) {
      ctx.addIssue({
        code: "custom",
        message: "percentage debe ser > 0 y ≤ 1.",
      });
      return z.NEVER;
    }
    return `${whole}.${fraction.padEnd(6, "0")}`;
  });

const CurrencySchema = z.enum(["ARS", "USD"], {
  error: "currency debe ser ARS o USD.",
});

function refineBenefitAndCap(
  value: {
    benefitType: "PERCENTAGE" | "FIXED_AMOUNT";
    percentage?: string | null;
    fixedAmount?: string | null;
    capAmount?: string | null;
    capPeriod: "NONE" | "PER_PURCHASE" | "MONTHLY" | "PROMOTION_PERIOD";
    validFrom: string;
    validUntil: string;
  },
  ctx: z.RefinementCtx
): void {
  if (value.benefitType === "PERCENTAGE") {
    if (value.percentage == null) {
      ctx.addIssue({
        code: "custom",
        message: "percentage es obligatorio para PERCENTAGE.",
      });
    }
    if (value.fixedAmount != null) {
      ctx.addIssue({
        code: "custom",
        message: "fixedAmount debe ser null para PERCENTAGE.",
      });
    }
  } else {
    if (value.fixedAmount == null) {
      ctx.addIssue({
        code: "custom",
        message: "fixedAmount es obligatorio para FIXED_AMOUNT.",
      });
    }
    if (value.percentage != null) {
      ctx.addIssue({
        code: "custom",
        message: "percentage debe ser null para FIXED_AMOUNT.",
      });
    }
  }

  const hasCap = value.capAmount != null;
  if (hasCap === (value.capPeriod === "NONE")) {
    ctx.addIssue({
      code: "custom",
      message:
        "capAmount y capPeriod deben ir juntos (capPeriod NONE solo si capAmount es null).",
    });
  }

  const from = new Date(value.validFrom);
  const until = new Date(value.validUntil);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    ctx.addIssue({
      code: "custom",
      message: "validFrom/validUntil inválidos.",
    });
  } else if (from.getTime() > until.getTime()) {
    ctx.addIssue({
      code: "custom",
      message: "validFrom debe ser ≤ validUntil.",
    });
  }
}

export const PromotionIdParamsSchema = z.object({
  id: z.string().uuid({ error: "promotionId inválido." }),
});

export const CreateCreditCardPromotionSchema = z
  .object({
    creditCardId: z.string().uuid({ error: "creditCardId inválido." }),
    name: z.string().trim().min(1).max(120),
    currency: CurrencySchema,
    benefitType: z.enum(CREDIT_CARD_PROMOTION_BENEFIT_TYPES),
    percentage: PercentageSchema.nullable().optional(),
    fixedAmount: OptionalPositiveAmountSchema,
    minimumPurchaseAmount: OptionalPositiveAmountSchema,
    capAmount: OptionalPositiveAmountSchema,
    capPeriod: z.enum(CREDIT_CARD_PROMOTION_CAP_PERIODS),
    validFrom: z.iso.datetime({ error: "validFrom debe ser datetime ISO." }),
    validUntil: z.iso.datetime({ error: "validUntil debe ser datetime ISO." }),
    description: z.string().max(255).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(refineBenefitAndCap);

export const UpdateCreditCardPromotionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    benefitType: z.enum(CREDIT_CARD_PROMOTION_BENEFIT_TYPES).optional(),
    percentage: PercentageSchema.nullable().optional(),
    fixedAmount: OptionalPositiveAmountSchema,
    minimumPurchaseAmount: OptionalPositiveAmountSchema,
    capAmount: OptionalPositiveAmountSchema,
    capPeriod: z.enum(CREDIT_CARD_PROMOTION_CAP_PERIODS).optional(),
    validFrom: z.iso.datetime({ error: "validFrom debe ser datetime ISO." }).optional(),
    validUntil: z.iso.datetime({ error: "validUntil debe ser datetime ISO." }).optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.benefitType == null && value.capPeriod == null) {
      if (value.validFrom != null && value.validUntil != null) {
        const from = new Date(value.validFrom);
        const until = new Date(value.validUntil);
        if (from.getTime() > until.getTime()) {
          ctx.addIssue({
            code: "custom",
            message: "validFrom debe ser ≤ validUntil.",
          });
        }
      }
      return;
    }
    // Full refine when benefit/cap fields present — service merges with existing.
  });

export const PromotionApplySchema = z
  .object({
    purchaseId: z
      .string()
      .uuid({ error: "purchaseId inválido." })
      .nullable()
      .optional(),
    originalExpenseTransactionId: z
      .string()
      .uuid({ error: "originalExpenseTransactionId inválido." })
      .nullable()
      .optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { error: "idempotencyKey debe tener al menos 8 caracteres." })
      .max(128)
      .optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasPurchase = value.purchaseId != null && value.purchaseId.length > 0;
    const hasExpense =
      value.originalExpenseTransactionId != null &&
      value.originalExpenseTransactionId.length > 0;
    if (hasPurchase === hasExpense) {
      ctx.addIssue({
        code: "custom",
        message:
          "Debe indicar exactamente uno de purchaseId u originalExpenseTransactionId.",
      });
    }
  });

export const PromotionPreviewSchema = z
  .object({
    purchaseId: z
      .string()
      .uuid({ error: "purchaseId inválido." })
      .nullable()
      .optional(),
    originalExpenseTransactionId: z
      .string()
      .uuid({ error: "originalExpenseTransactionId inválido." })
      .nullable()
      .optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasPurchase = value.purchaseId != null && value.purchaseId.length > 0;
    const hasExpense =
      value.originalExpenseTransactionId != null &&
      value.originalExpenseTransactionId.length > 0;
    if (hasPurchase === hasExpense) {
      ctx.addIssue({
        code: "custom",
        message:
          "Debe indicar exactamente uno de purchaseId u originalExpenseTransactionId.",
      });
    }
  });
