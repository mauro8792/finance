import { z } from "zod";
import {
  CREDIT_CARD_RECURRING_CHARGE_KINDS,
  OCCURRENCE_KEY_PATTERN,
} from "./credit-card-recurring-charge.types.js";

const AmountSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    ctx.addIssue({
      code: "custom",
      message: "Monto inválido: use hasta 2 decimales.",
    });
    return z.NEVER;
  }
  const normalized = raw.includes(".") ? raw : `${raw}.00`;
  const [whole, fraction = "00"] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n) {
    ctx.addIssue({
      code: "custom",
      message: "El monto debe ser mayor a 0.",
    });
    return z.NEVER;
  }
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
});

const OptionalVariableAmountSchema = z
  .union([AmountSchema, z.null()])
  .optional();

const DayOfMonthHintSchema = z
  .number({ error: "dayOfMonthHint debe ser un entero entre 1 y 31." })
  .int()
  .min(1)
  .max(31);

const NullableDayOfMonthHintSchema = z.union([DayOfMonthHintSchema, z.null()]);

export const RecurringChargeIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});

export const ListRecurringChargesQuerySchema = z.object({
  creditCardId: z.string().uuid("creditCardId debe ser un UUID.").optional(),
});

export const OutlookQuerySchema = z.object({
  creditCardId: z.string().uuid("creditCardId es obligatorio."),
  year: z.coerce
    .number()
    .int("year debe ser entero.")
    .min(2000)
    .max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const CreateCreditCardRecurringChargeSchema = z.object({
  creditCardId: z.string().uuid("creditCardId debe ser un UUID."),
  kind: z.enum(CREDIT_CARD_RECURRING_CHARGE_KINDS, {
    error: "kind inválido.",
  }),
  categoryId: z.string().uuid("categoryId debe ser un UUID."),
  description: z
    .string()
    .trim()
    .min(1, "description es obligatoria.")
    .max(255),
  expectedAmount: OptionalVariableAmountSchema,
  dayOfMonthHint: NullableDayOfMonthHintSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UpdateCreditCardRecurringChargeSchema = z
  .object({
    kind: z.enum(CREDIT_CARD_RECURRING_CHARGE_KINDS).optional(),
    categoryId: z.string().uuid().optional(),
    description: z.string().trim().min(1).max(255).optional(),
    expectedAmount: OptionalVariableAmountSchema,
    dayOfMonthHint: NullableDayOfMonthHintSchema.optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(
    (value) =>
      value.kind !== undefined ||
      value.categoryId !== undefined ||
      value.description !== undefined ||
      value.expectedAmount !== undefined ||
      value.dayOfMonthHint !== undefined ||
      value.notes !== undefined,
    { message: "Debe enviarse al menos un campo para actualizar." }
  );

export const ConfirmRecurringChargeSchema = z.object({
  occurrenceKey: z
    .string()
    .trim()
    .regex(OCCURRENCE_KEY_PATTERN, "occurrenceKey debe ser YYYY-MM."),
  amount: AmountSchema,
  idempotencyKey: z
    .string()
    .trim()
    .min(1, "idempotencyKey es obligatorio.")
    .max(128),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  description: z.string().max(255).nullable().optional(),
});
