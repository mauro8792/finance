import { z } from "zod";

export const ProjectStatementSchema = z
  .object({
    closingDate: z
      .string()
      .min(1, "closingDate es obligatorio.")
      .refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isNaN(Date.parse(value)),
        "closingDate debe ser una fecha ISO (YYYY-MM-DD o datetime)."
      ),
  })
  .strict();

export const CloseStatementSchema = z
  .object({
    actualAmount: z
      .union([z.string().min(1), z.number(), z.null()])
      .optional(),
  })
  .strict();

export const CreditCardStatementIdParamsSchema = z
  .object({
    id: z.string().uuid("El id de tarjeta debe ser un UUID."),
    statementId: z.string().uuid("El statementId debe ser un UUID."),
  })
  .strict();

export const CreditCardIdOnlyParamsSchema = z
  .object({
    id: z.string().uuid("El id de tarjeta debe ser un UUID."),
  })
  .strict();
