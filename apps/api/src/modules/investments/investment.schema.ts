import { CURRENCIES } from "shared";
import { z } from "zod";

export const CreateCaucionSchema = z
  .object({
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    currency: z.enum(CURRENCIES, { error: "La moneda debe ser ARS o USD." }),
    principal: z.string().min(1, "El capital es obligatorio."),
    annualRate: z.string().min(1, "La TNA es obligatoria."),
    startDate: z.iso.datetime({ error: "startDate debe ser un datetime ISO." }),
    maturityDate: z.iso.datetime({ error: "maturityDate debe ser un datetime ISO." }),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const InvestmentIdParamsSchema = z.object({
  id: z.string().uuid("El id debe ser un UUID."),
});

export const MatureCaucionSchema = z
  .object({
    destinationAccountId: z.string().uuid("El destinationAccountId debe ser un UUID."),
    capitalReturned: z.string().min(1, "El capital retornado es obligatorio."),
    actualReturn: z.string().min(1, "El rendimiento real es obligatorio."),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }),
  })
  .strict();

export const RenewCaucionSchema = z
  .object({
    accountId: z.string().uuid("El accountId debe ser un UUID."),
    renewalPrincipal: z.string().min(1, "El capital renovado es obligatorio."),
    actualReturn: z.string().min(1, "El rendimiento real es obligatorio."),
    annualRate: z.string().min(1, "La TNA es obligatoria."),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }),
    maturityDate: z.iso.datetime({ error: "maturityDate debe ser un datetime ISO." }),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const UpdateActiveCaucionSchema = z
  .object({
    principal: z.string().min(1, "El capital es obligatorio."),
    annualRate: z.string().min(1, "La TNA es obligatoria."),
    startDate: z.iso.datetime({ error: "startDate debe ser un datetime ISO." }),
    maturityDate: z.iso.datetime({ error: "maturityDate debe ser un datetime ISO." }),
    notes: z.string().nullable().optional(),
  })
  .strict();
