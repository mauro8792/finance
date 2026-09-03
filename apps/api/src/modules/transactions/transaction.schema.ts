import { CURRENCIES } from "shared";
import { z } from "zod";
import {
  INCOME_KINDS,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "./transaction.types.js";

export const CreateExpenseSchema = z
  .object({
    type: z.literal("EXPENSE").optional(),
    amount: z.string().min(1, "El importe es obligatorio."),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    categoryId: z.string().uuid("El categoryId debe ser un UUID."),
    description: z.string().max(255).optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    isFixed: z.boolean().optional(),
  })
  .strict();

export const CreateIncomeSchema = z
  .object({
    type: z.literal("INCOME"),
    amount: z.string().min(1, "El importe es obligatorio."),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    categoryId: z.string().uuid("El categoryId debe ser un UUID.").optional(),
    incomeKind: z.enum(INCOME_KINDS, {
      error: "incomeKind debe ser OPERATING o CAPITAL.",
    }),
    description: z.string().max(255).optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.incomeKind === "OPERATING" && !value.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "El categoryId es obligatorio para un ingreso operativo.",
      });
    }
  });

export const ListTransactionsQuerySchema = z
  .object({
    year: z.coerce.number().int("year debe ser un entero.").optional(),
    month: z.coerce
      .number()
      .int("month debe ser un entero.")
      .min(1, "month debe estar entre 1 y 12.")
      .max(12, "month debe estar entre 1 y 12.")
      .optional(),
    type: z.enum(TRANSACTION_TYPES, { error: "Tipo de movimiento inválido." }).optional(),
    accountId: z.string().uuid("El accountId debe ser un UUID.").optional(),
    categoryId: z.string().uuid("El categoryId debe ser un UUID.").optional(),
    status: z.enum(TRANSACTION_STATUSES, { error: "Estado de movimiento inválido." }).optional(),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }).optional(),
  })
  .strict()
  .refine((value) => value.year === undefined || value.month !== undefined, {
    message: "year requiere month.",
  });

export const TransactionIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});

export const CreateReimbursementSchema = z
  .object({
    amount: z.string().min(1, "El importe es obligatorio."),
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    description: z.string().max(255).optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
  })
  .strict();

export const CreateTransferSchema = z
  .object({
    sourceAccountId: z.string().uuid("El sourceAccountId debe ser un UUID."),
    destinationAccountId: z.string().uuid("El destinationAccountId debe ser un UUID."),
    amount: z.string().min(1, "El importe es obligatorio."),
    description: z.string().max(255).optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
  })
  .strict();

export const UpdateTransactionSchema = z
  .object({
    amount: z.string().min(1, "El importe es obligatorio.").optional(),
    categoryId: z.string().uuid("El categoryId debe ser un UUID.").optional(),
    description: z.string().max(255).nullable().optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
    isFixed: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.categoryId !== undefined ||
      value.description !== undefined ||
      value.occurredAt !== undefined ||
      value.paymentMethod !== undefined ||
      value.isFixed !== undefined,
    { message: "Debe enviarse al menos un campo para actualizar." }
  );
