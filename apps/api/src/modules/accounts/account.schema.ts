import { CURRENCIES } from "shared";
import { z } from "zod";
import { ACCOUNT_TYPES } from "./account.types.js";

export const CurrencySchema = z.enum(CURRENCIES, {
  error: "La moneda debe ser ARS o USD.",
});

export const AccountTypeSchema = z.enum(ACCOUNT_TYPES, {
  error: "El tipo de cuenta debe ser CASH, BANK, FUND, INVESTMENT, HOUSING_RESERVE u OTHER.",
});

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(120),
  currency: CurrencySchema,
  type: AccountTypeSchema,
});

export const UpdateAccountSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio.").max(120).optional(),
    currency: CurrencySchema.optional(),
    type: AccountTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.currency !== undefined ||
      value.type !== undefined ||
      value.isActive !== undefined,
    { message: "Debe enviarse al menos un campo para actualizar." }
  );

export const AccountIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});
