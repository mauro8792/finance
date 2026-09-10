import { z } from "zod";
import { PositiveMoneyAmountSchema } from "../../shared/money/amount-schema.js";

const AmountSchema = PositiveMoneyAmountSchema;

export const CreditCardIdParamsSchema = z.object({
  id: z.string().uuid({ error: "creditCardId inválido." }),
});

export const CreditCardPaymentIdParamsSchema = z.object({
  id: z.string().uuid({ error: "creditCardId inválido." }),
  paymentId: z.string().uuid({ error: "paymentId inválido." }),
});

/** P0.15: dedicated payment void, idempotent. */
export const VoidCreditCardPaymentSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { error: "idempotencyKey debe tener al menos 8 caracteres." })
      .max(128, { error: "idempotencyKey demasiado largo." }),
  })
  .strict();

export const CreateCreditCardPaymentSchema = z.object({
  accountId: z.string().uuid({ error: "accountId inválido." }),
  amount: AmountSchema,
  statementId: z
    .string()
    .uuid({ error: "statementId inválido." })
    .nullable()
    .optional(),
  occurredAt: z.union([z.string(), z.date()]).optional(),
  description: z.string().max(255).nullable().optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8, { error: "idempotencyKey debe tener al menos 8 caracteres." })
    .max(128, { error: "idempotencyKey demasiado largo." }),
});
