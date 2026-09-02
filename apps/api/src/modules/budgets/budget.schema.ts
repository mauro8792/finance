import { CURRENCIES } from "shared";
import { z } from "zod";

const requiredInt = (field: string) =>
  z
    .string({ error: `${field} es obligatorio.` })
    .regex(/^-?\d+$/, `${field} debe ser un entero.`)
    .transform(Number);

export const CreateBudgetSchema = z
  .object({
    categoryId: z.string().uuid("El categoryId debe ser un UUID."),
    amount: z.string().min(1, "El importe es obligatorio."),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    year: z.number({ error: "year debe ser un entero." }).int("year debe ser un entero."),
    month: z
      .number({ error: "month debe ser un entero." })
      .int("month debe ser un entero.")
      .min(1, "month debe estar entre 1 y 12.")
      .max(12, "month debe estar entre 1 y 12."),
  })
  .strict();

export const UpdateBudgetSchema = z
  .object({
    amount: z.string().min(1, "El importe es obligatorio."),
  })
  .strict();

export const BudgetIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});

export const ListBudgetsQuerySchema = z
  .object({
    year: requiredInt("year"),
    month: requiredInt("month").refine(
      (value) => value >= 1 && value <= 12,
      "month debe estar entre 1 y 12."
    ),
  })
  .strict();
