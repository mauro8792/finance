import { z } from "zod";

export const CreateCurrencyExchangeSchema = z
  .object({
    fromAccountId: z.string().uuid("El fromAccountId debe ser un UUID."),
    toAccountId: z.string().uuid("El toAccountId debe ser un UUID."),
    fromAmount: z.string().min(1, "El importe es obligatorio."),
    exchangeRate: z.string().min(1, "El tipo de cambio es obligatorio."),
    description: z.string().max(255).optional(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).optional(),
  })
  .strict();
