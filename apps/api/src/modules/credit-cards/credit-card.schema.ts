import { CURRENCIES } from "shared";
import { z } from "zod";
import { OptionalNullablePositiveMoneyAmountSchema } from "../../shared/money/amount-schema.js";
import { CREDIT_CARD_FEE_STATUSES } from "./credit-card.types.js";

export const CurrencySchema = z.enum(CURRENCIES, {
  error: "La moneda debe ser ARS o USD.",
});

export const CreditCardFeeStatusSchema = z.enum(CREDIT_CARD_FEE_STATUSES, {
  error:
    "El estado de comisión debe ser HAS_FEE, WAIVED, POTENTIALLY_WAIVED o UNKNOWN.",
});

const DayOfMonthSchema = z
  .number({ error: "El día debe ser un número entre 1 y 31." })
  .int("El día debe ser un entero.")
  .min(1, "El día debe estar entre 1 y 31.")
  .max(31, "El día debe estar entre 1 y 31.");

const NullableDayOfMonthSchema = z.union([DayOfMonthSchema, z.null()]);

const FeeExpectedAmountSchema = OptionalNullablePositiveMoneyAmountSchema;

export const CreateCreditCardSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  issuer: z.string().trim().min(1, "El banco/emisor es obligatorio.").max(120),
  brand: z.string().trim().min(1, "La marca es obligatoria.").max(40),
  currency: CurrencySchema,
  closingDay: NullableDayOfMonthSchema.optional(),
  dueDay: NullableDayOfMonthSchema.optional(),
  feeStatus: CreditCardFeeStatusSchema.optional(),
  feeExpectedAmount: FeeExpectedAmountSchema,
  feeNotes: z.string().max(500).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const UpdateCreditCardSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio.").max(120).optional(),
    issuer: z
      .string()
      .trim()
      .min(1, "El banco/emisor es obligatorio.")
      .max(120)
      .optional(),
    brand: z.string().trim().min(1, "La marca es obligatoria.").max(40).optional(),
    currency: CurrencySchema.optional(),
    closingDay: NullableDayOfMonthSchema.optional(),
    dueDay: NullableDayOfMonthSchema.optional(),
    feeStatus: CreditCardFeeStatusSchema.optional(),
    feeExpectedAmount: FeeExpectedAmountSchema,
    feeNotes: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.issuer !== undefined ||
      value.brand !== undefined ||
      value.currency !== undefined ||
      value.closingDay !== undefined ||
      value.dueDay !== undefined ||
      value.feeStatus !== undefined ||
      value.feeExpectedAmount !== undefined ||
      value.feeNotes !== undefined ||
      value.isActive !== undefined,
    { message: "Debe enviarse al menos un campo para actualizar." }
  );

export const CreditCardIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});
