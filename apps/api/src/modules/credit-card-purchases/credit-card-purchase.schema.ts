import { CURRENCIES, type Currency } from "shared";
import { z } from "zod";

const amountSchema = z.union([
  z.string().min(1, "El importe es obligatorio."),
  z.number({ error: "El importe es obligatorio." }),
]);

export const CreateCreditCardPurchaseSchema = z
  .object({
    creditCardId: z.string().uuid("El creditCardId debe ser un UUID."),
    categoryId: z.string().uuid("El categoryId debe ser un UUID."),
    description: z.string().max(255).optional(),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    totalAmount: amountSchema,
    purchaseDate: z
      .string()
      .min(1, "purchaseDate es obligatorio.")
      .refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isNaN(Date.parse(value)),
        "purchaseDate debe ser una fecha ISO (YYYY-MM-DD o datetime)."
      ),
    installmentsCount: z.number().int().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.installmentsCount !== undefined && value.installmentsCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentsCount"],
        message: "En P0.6 installmentsCount debe ser 1.",
      });
    }
  });

export const CreditCardPurchaseIdParamsSchema = z
  .object({
    id: z.string().uuid("El id debe ser un UUID."),
  })
  .strict();

export type CreateCreditCardPurchaseBody = z.infer<
  typeof CreateCreditCardPurchaseSchema
> & { currency: Currency };
