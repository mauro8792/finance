import { z } from "zod";

const yearMonth = {
  year: z.number({ error: "year debe ser un entero." }).int("year debe ser un entero."),
  month: z
    .number({ error: "month debe ser un entero." })
    .int("month debe ser un entero.")
    .min(1, "month debe estar entre 1 y 12.")
    .max(12, "month debe estar entre 1 y 12."),
  timeZone: z.string().min(1, "timeZone es obligatorio."),
};

export const MonthsWithoutIncomeRequestSchema = z
  .object({
    type: z.literal("MONTHS_WITHOUT_INCOME"),
    ...yearMonth,
    months: z
      .number({ error: "months debe ser un entero." })
      .int("months debe ser un entero.")
      .gt(0, "months debe ser mayor que 0."),
  })
  .strict();

export const NewJobRequestSchema = z
  .object({
    type: z.literal("NEW_JOB"),
    ...yearMonth,
    monthsUntilJob: z
      .number({ error: "monthsUntilJob debe ser un entero." })
      .int("monthsUntilJob debe ser un entero.")
      .min(0, "monthsUntilJob debe ser mayor o igual a 0."),
    totalMonths: z
      .number({ error: "totalMonths debe ser un entero." })
      .int("totalMonths debe ser un entero.")
      .gt(0, "totalMonths debe ser mayor que 0."),
    newMonthlyIncomeARS: z.string().min(1, "El ingreso mensual nuevo es obligatorio."),
    expenseChangeFraction: z.string().min(1, "La variación de gastos es obligatoria."),
  })
  .strict();

export const HousingReserveRequestSchema = z
  .object({
    type: z.literal("HOUSING_RESERVE"),
    ...yearMonth,
    housingObligationId: z.string().uuid("El housingObligationId debe ser un UUID."),
    targetInstallments: z
      .number({ error: "targetInstallments debe ser un entero." })
      .int("targetInstallments debe ser un entero.")
      .gt(0, "targetInstallments debe ser mayor que 0."),
    exchangeRateARSPerUSD: z.string().min(1, "El tipo de cambio es obligatorio."),
  })
  .strict();

export const SimulationRequestSchema = z.discriminatedUnion("type", [
  MonthsWithoutIncomeRequestSchema,
  NewJobRequestSchema,
  HousingReserveRequestSchema,
]);

export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;
