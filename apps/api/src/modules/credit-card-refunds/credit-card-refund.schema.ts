import { z } from "zod";
import { CREDIT_CARD_REFUND_DESTINATION_TYPES } from "./credit-card-refund.types.js";

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

export const RefundExpectationIdParamsSchema = z.object({
  id: z.string().uuid({ error: "expectationId inválido." }),
});

export const CreateCreditCardRefundExpectationSchema = z
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
    expectedAmount: AmountSchema,
    expectedDate: z.iso.datetime({ error: "expectedDate debe ser un datetime ISO." }).nullable().optional(),
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

export const AccreditCreditCardRefundSchema = z
  .object({
    expectationId: z
      .string()
      .uuid({ error: "expectationId inválido." })
      .nullable()
      .optional(),
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
    amount: AmountSchema,
    destinationType: z.enum(CREDIT_CARD_REFUND_DESTINATION_TYPES, {
      error: "destinationType debe ser BANK_ACCOUNT o CREDIT_CARD.",
    }),
    accountId: z
      .string()
      .uuid({ error: "accountId inválido." })
      .nullable()
      .optional(),
    occurredAt: z.union([z.string(), z.date()]).optional(),
    description: z.string().max(255).nullable().optional(),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { error: "idempotencyKey debe tener al menos 8 caracteres." })
      .max(128, { error: "idempotencyKey demasiado largo." }),
  })
  .superRefine((value, ctx) => {
    if (value.destinationType === "BANK_ACCOUNT") {
      if (value.accountId == null || value.accountId.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "accountId es obligatorio para destino BANK_ACCOUNT.",
        });
      }
    } else if (value.accountId != null) {
      ctx.addIssue({
        code: "custom",
        message: "accountId no aplica para destino CREDIT_CARD.",
      });
    }

    const hasExpectation =
      value.expectationId != null && value.expectationId.length > 0;
    if (hasExpectation) {
      return;
    }
    const hasPurchase = value.purchaseId != null && value.purchaseId.length > 0;
    const hasExpense =
      value.originalExpenseTransactionId != null &&
      value.originalExpenseTransactionId.length > 0;
    if (hasPurchase === hasExpense) {
      ctx.addIssue({
        code: "custom",
        message:
          "Sin expectationId debe indicar exactamente uno de purchaseId u originalExpenseTransactionId.",
      });
    }
  });
