import { z } from "zod";

export const ReconcileAccountBalanceSchema = z.object({
  observedBalance: z
    .string()
    .trim()
    .min(1, "El saldo real es obligatorio.")
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "El saldo real debe ser un importe >= 0 con hasta 2 decimales."
    ),
  reason: z
    .string()
    .trim()
    .min(1, "El motivo es obligatorio.")
    .max(255, "El motivo no puede superar 255 caracteres."),
  occurredAt: z.string().datetime({ message: "occurredAt debe ser ISO-8601." }).optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "idempotencyKey es obligatorio (mínimo 8 caracteres).")
    .max(128, "idempotencyKey demasiado largo."),
});
