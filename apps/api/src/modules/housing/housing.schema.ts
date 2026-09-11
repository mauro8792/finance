import { CURRENCIES } from "shared";
import { z } from "zod";

export const CreateHousingObligationSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio."),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    installmentAmount: z.string().min(1, "El importe de la cuota es obligatorio."),
    remainingInstallments: z
      .number({ error: "remainingInstallments debe ser un entero." })
      .int("remainingInstallments debe ser un entero."),
    dueDay: z
      .number({ error: "dueDay debe ser un entero." })
      .int("dueDay debe ser un entero.")
      .nullable()
      .optional(),
    reserveAccountId: z
      .string()
      .uuid("El reserveAccountId debe ser un UUID.")
      .nullable()
      .optional(),
  })
  .strict();

export const UpdateHousingObligationSchema = z
  .object({
    name: z.string().min(1, "El nombre es obligatorio.").optional(),
    installmentAmount: z.string().min(1, "El importe de la cuota es obligatorio.").optional(),
    remainingInstallments: z
      .number({ error: "remainingInstallments debe ser un entero." })
      .int("remainingInstallments debe ser un entero.")
      .optional(),
    dueDay: z
      .number({ error: "dueDay debe ser un entero." })
      .int("dueDay debe ser un entero.")
      .nullable()
      .optional(),
    reserveAccountId: z
      .string()
      .uuid("El reserveAccountId debe ser un UUID.")
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const HousingIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});

export const HousingPaymentIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
  paymentId: z.string().uuid("El paymentId debe ser un UUID."),
});

export const VoidHousingPaymentSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { error: "idempotencyKey debe tener al menos 8 caracteres." })
      .max(128, { error: "idempotencyKey demasiado largo." }),
  })
  .strict();

export const RegisterHousingPaymentSchema = z
  .object({
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    amount: z.string().min(1, "El importe es obligatorio.").optional(),
    occurredAt: z
      .iso.datetime({ error: "occurredAt debe ser un datetime ISO." })
      .optional(),
    installmentNumber: z
      .number({ error: "installmentNumber debe ser un entero." })
      .int("installmentNumber debe ser un entero.")
      .nullable()
      .optional(),
    periodYear: z
      .number({ error: "periodYear debe ser un entero." })
      .int("periodYear debe ser un entero.")
      .nullable()
      .optional(),
    periodMonth: z
      .number({ error: "periodMonth debe ser un entero." })
      .int("periodMonth debe ser un entero.")
      .nullable()
      .optional(),
  })
  .strict();
