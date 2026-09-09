import { z } from "zod";

const AmountSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    ctx.addIssue({
      code: "custom",
      message: "amount debe ser un monto positivo con hasta 2 decimales.",
    });
    return z.NEVER;
  }
  const normalized = raw.includes(".") ? raw : `${raw}.00`;
  const [whole, fraction = "00"] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n) {
    ctx.addIssue({
      code: "custom",
      message: "amount debe ser mayor a 0.",
    });
    return z.NEVER;
  }
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
});

export const CreditCardIdParamsSchema = z.object({
  id: z.string().uuid({ error: "creditCardId inválido." }),
});

export const CreditCardPaymentIdParamsSchema = z.object({
  id: z.string().uuid({ error: "creditCardId inválido." }),
  paymentId: z.string().uuid({ error: "paymentId inválido." }),
});

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
