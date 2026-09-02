import { z } from "zod";

const requiredInt = (field: string) =>
  z
    .string({ error: `${field} es obligatorio.` })
    .regex(/^-?\d+$/, `${field} debe ser un entero.`)
    .transform(Number);

export const FinancialSummaryQuerySchema = z
  .object({
    year: requiredInt("year"),
    month: requiredInt("month").refine(
      (value) => value >= 1 && value <= 12,
      "month debe estar entre 1 y 12."
    ),
  })
  .strict();
