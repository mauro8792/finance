import { z } from "zod";
import { CURRENCIES } from "shared";

export const ALLOWED_TOOL_NAMES = [
  "get_financial_summary",
  "get_month_summary",
  "get_transactions",
  "get_housing_summary",
  "get_accounts_summary",
  "simulate_no_income",
  "simulate_new_job",
  "simulate_housing_reserve",
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number];

export const MAX_TRANSACTION_TOOL_LIMIT = 50;
export const DEFAULT_TRANSACTION_TOOL_LIMIT = 20;

const yearMonth = {
  year: z.number({ error: "year es obligatorio." }).int("year debe ser un entero."),
  month: z
    .number({ error: "month es obligatorio." })
    .int("month debe ser un entero.")
    .min(1, "month debe estar entre 1 y 12.")
    .max(12, "month debe estar entre 1 y 12."),
};

export const GetFinancialSummaryArgsSchema = z
  .object(yearMonth)
  .strict();

export const GetMonthSummaryArgsSchema = z
  .object(yearMonth)
  .strict();

export const GetTransactionsArgsSchema = z
  .object({
    year: z.number().int("year debe ser un entero.").optional(),
    month: z
      .number()
      .int("month debe ser un entero.")
      .min(1, "month debe estar entre 1 y 12.")
      .max(12, "month debe estar entre 1 y 12.")
      .optional(),
    type: z.enum(["EXPENSE", "INCOME"]).optional(),
    currency: z.enum(CURRENCIES).optional(),
    categoryName: z.string().trim().min(1).max(120).optional(),
    limit: z
      .number()
      .int("limit debe ser un entero.")
      .min(1, "limit debe ser al menos 1.")
      .max(MAX_TRANSACTION_TOOL_LIMIT, `limit no puede superar ${MAX_TRANSACTION_TOOL_LIMIT}.`)
      .optional(),
  })
  .strict()
  .refine((value) => value.year === undefined || value.month !== undefined, {
    message: "year requiere month.",
  });

export const GetHousingSummaryArgsSchema = z.object({}).strict();

export const GetAccountsSummaryArgsSchema = z.object({}).strict();

const moneyARS = z
  .string({ error: "El importe es obligatorio." })
  .regex(
    /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
    "El importe debe ser un decimal mayor o igual a 0 con hasta 2 decimales."
  );

const expenseFraction = z
  .string({ error: "La variación de gastos es inválida." })
  .regex(
    /^-?(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/,
    "La variación debe ser una fracción con hasta 6 decimales."
  );

const exchangeRate = z
  .string({ error: "El tipo de cambio es obligatorio." })
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/,
    "El tipo de cambio debe ser un decimal positivo con hasta 6 decimales."
  )
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), {
    message: "El tipo de cambio debe ser mayor que 0.",
  });

export const SimulateNoIncomeArgsSchema = z
  .object({
    ...yearMonth,
    months: z
      .number({ error: "months es obligatorio." })
      .int("months debe ser un entero.")
      .gt(0, "months debe ser mayor que 0."),
  })
  .strict();

export const SimulateNewJobArgsSchema = z
  .object({
    ...yearMonth,
    monthsUntilJob: z
      .number({ error: "monthsUntilJob es obligatorio." })
      .int("monthsUntilJob debe ser un entero.")
      .min(0, "monthsUntilJob debe ser mayor o igual a 0."),
    totalMonths: z
      .number({ error: "totalMonths es obligatorio." })
      .int("totalMonths debe ser un entero.")
      .gt(0, "totalMonths debe ser mayor que 0."),
    newMonthlyIncomeARS: moneyARS,
    expenseChangeFraction: expenseFraction.optional(),
  })
  .strict();

export const SimulateHousingReserveArgsSchema = z
  .object({
    ...yearMonth,
    targetInstallments: z
      .number({ error: "targetInstallments es obligatorio." })
      .int("targetInstallments debe ser un entero.")
      .gt(0, "targetInstallments debe ser mayor que 0."),
    exchangeRateARSPerUSD: exchangeRate,
    housingName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const TOOL_ARG_SCHEMAS = {
  get_financial_summary: GetFinancialSummaryArgsSchema,
  get_month_summary: GetMonthSummaryArgsSchema,
  get_transactions: GetTransactionsArgsSchema,
  get_housing_summary: GetHousingSummaryArgsSchema,
  get_accounts_summary: GetAccountsSummaryArgsSchema,
  simulate_no_income: SimulateNoIncomeArgsSchema,
  simulate_new_job: SimulateNewJobArgsSchema,
  simulate_housing_reserve: SimulateHousingReserveArgsSchema,
} as const;
