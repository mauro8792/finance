import { AppError } from "../../../shared/errors/app-error.js";
import type { FinancialSummary } from "../../financial/financial.types.js";
import type { Category } from "../../categories/category.types.js";
import type { Transaction } from "../../transactions/transaction.types.js";
import type { Account } from "../../accounts/account.types.js";
import type { HousingObligation } from "../../housing/housing.types.js";
import type {
  HousingReserveSimulationResult,
  MonthsWithoutIncomeResult,
  NewJobScenarioResult,
} from "../../simulations/simulation.types.js";
import {
  ALLOWED_TOOL_NAMES,
  DEFAULT_TRANSACTION_TOOL_LIMIT,
  TOOL_ARG_SCHEMAS,
  type AllowedToolName,
} from "./ai-tool.schemas.js";
import type {
  AiToolContext,
  AiToolDefinition,
  AiToolResult,
  AiToolServices,
} from "./ai-tool.types.js";

const WRITE_TOOL_NAMES = [
  "createTransaction",
  "updateTransaction",
  "voidTransaction",
  "transfer",
  "currencyExchange",
  "createInvestment",
  "matureInvestment",
  "renewInvestment",
  "housingPayment",
  "createAccount",
  "updateAccount",
  "simulateMonthsWithoutIncome",
  "simulateNewJobScenario",
  "simulateHousingReserve",
] as const;

const TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    type: "function",
    name: "get_financial_summary",
    description:
      "Resumen financiero del mes: disponible ARS, consumo de fondo, runway y totales mensuales. Requiere year y month.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["year", "month"],
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
  },
  {
    type: "function",
    name: "get_month_summary",
    description:
      "Métricas del mes: gasto bruto, gasto neto, ingreso operativo y consumo de fondo. Requiere year y month.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["year", "month"],
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
  },
  {
    type: "function",
    name: "get_transactions",
    description:
      "Lista acotada de movimientos ACTIVE. Filtrá por year/month, type EXPENSE|INCOME, currency o categoryName. No envía IDs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
        type: { type: "string", enum: ["EXPENSE", "INCOME"] },
        currency: { type: "string", enum: ["ARS", "USD"] },
        categoryName: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    type: "function",
    name: "get_housing_summary",
    description:
      "Cobertura de vivienda: cuotas cubiertas y datos de cada obligación activa. Sin IDs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: "function",
    name: "get_accounts_summary",
    description:
      "Cuentas del usuario: nombre, tipo, moneda, balance actual y si está activa. Sin IDs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: "function",
    name: "simulate_no_income",
    description:
      "Escenario read-only: proyecta capital y runway si no hay ingresos durante `months` meses. Requiere year, month y months. No modifica datos. Distinguí baseline (actual) de projection (simulado).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["year", "month", "months"],
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
        months: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    type: "function",
    name: "simulate_new_job",
    description:
      "Escenario read-only de nuevo empleo. Requiere year, month, monthsUntilJob, totalMonths y newMonthlyIncomeARS (string decimal). No inventes el salario. expenseChangeFraction es opcional (fracción, default 0 = sin cambio de gastos). No modifica datos.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["year", "month", "monthsUntilJob", "totalMonths", "newMonthlyIncomeARS"],
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
        monthsUntilJob: { type: "integer", minimum: 0 },
        totalMonths: { type: "integer", minimum: 1 },
        newMonthlyIncomeARS: { type: "string" },
        expenseChangeFraction: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "simulate_housing_reserve",
    description:
      "Escenario read-only: capital ARS restante si se reserva targetInstallments de vivienda. Requiere year, month, targetInstallments y exchangeRateARSPerUSD. No inventes el FX. housingName opcional si hay una sola obligación. No modifica datos ni compra USD.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["year", "month", "targetInstallments", "exchangeRateARSPerUSD"],
      properties: {
        year: { type: "integer" },
        month: { type: "integer", minimum: 1, maximum: 12 },
        targetInstallments: { type: "integer", minimum: 1 },
        exchangeRateARSPerUSD: { type: "string" },
        housingName: { type: "string" },
      },
    },
  },
];

export class AiToolRegistry {
  constructor(
    private readonly services: AiToolServices,
    private readonly context: AiToolContext
  ) {}

  listNames(): readonly AllowedToolName[] {
    return ALLOWED_TOOL_NAMES;
  }

  listDefinitions(): AiToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  async execute(name: string, args: unknown): Promise<AiToolResult> {
    if (!isAllowedToolName(name)) {
      return { ok: false, error: "Tool no permitida." };
    }
    if (hasUserId(args)) {
      return { ok: false, error: "Argumentos inválidos." };
    }

    const parsed = TOOL_ARG_SCHEMAS[name].safeParse(args ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Argumentos inválidos.",
      };
    }

    try {
      const data = await this.run(name, parsed.data);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: sanitizeToolError(error) };
    }
  }

  private async run(name: AllowedToolName, args: unknown): Promise<unknown> {
    switch (name) {
      case "get_financial_summary":
        return this.financialSummary(args as { year: number; month: number });
      case "get_month_summary":
        return this.monthSummary(args as { year: number; month: number });
      case "get_transactions":
        return this.transactions(
          args as {
            year?: number;
            month?: number;
            type?: "EXPENSE" | "INCOME";
            currency?: "ARS" | "USD";
            categoryName?: string;
            limit?: number;
          }
        );
      case "get_housing_summary":
        return this.housingSummary();
      case "get_accounts_summary":
        return this.accountsSummary();
      case "simulate_no_income":
        return this.simulateNoIncome(args as { year: number; month: number; months: number });
      case "simulate_new_job":
        return this.simulateNewJob(
          args as {
            year: number;
            month: number;
            monthsUntilJob: number;
            totalMonths: number;
            newMonthlyIncomeARS: string;
            expenseChangeFraction?: string;
          }
        );
      case "simulate_housing_reserve":
        return this.simulateHousingReserve(
          args as {
            year: number;
            month: number;
            targetInstallments: number;
            exchangeRateARSPerUSD: string;
            housingName?: string;
          }
        );
    }
  }

  private async financialSummary(args: { year: number; month: number }) {
    const summary = await this.services.financial.getFinancialSummary(
      this.context.userId,
      args.year,
      args.month,
      this.context.timeZone
    );
    return toFinancialSummaryDto(summary);
  }

  private async monthSummary(args: { year: number; month: number }) {
    const summary = await this.services.financial.getFinancialSummary(
      this.context.userId,
      args.year,
      args.month,
      this.context.timeZone
    );
    return {
      year: summary.year,
      month: summary.month,
      currency: summary.currency,
      monthlyGrossExpenses: summary.monthlyGrossExpenses,
      monthlyNetExpenses: summary.monthlyNetExpenses,
      monthlyOperatingIncome: summary.monthlyOperatingIncome,
      monthlyFundConsumption: summary.monthlyFundConsumption,
      monthlySurplus: summary.monthlySurplus,
    };
  }

  private async transactions(args: {
    year?: number;
    month?: number;
    type?: "EXPENSE" | "INCOME";
    currency?: "ARS" | "USD";
    categoryName?: string;
    limit?: number;
  }) {
    const limit = args.limit ?? DEFAULT_TRANSACTION_TOOL_LIMIT;
    const categories = await this.services.categories.list(this.context.userId);
    const accounts = await this.services.accounts.list(this.context.userId);
    let categoryId: string | undefined;
    if (args.categoryName) {
      const match = uniqueByName(categories, args.categoryName);
      if (!match) {
        throw new AppError(
          "VALIDATION_ERROR",
          "categoría no reconocida",
          400
        );
      }
      categoryId = match.id;
    }

    const items = await this.services.transactions.list(
      this.context.userId,
      {
        year: args.year,
        month: args.month,
        type: args.type,
        currency: args.currency,
        categoryId,
        status: "ACTIVE",
      },
      this.context.timeZone
    );

    const sliced = items.slice(0, limit);
    return {
      limit,
      returned: sliced.length,
      truncated: items.length > limit,
      transactions: sliced.map((item) =>
        toTransactionDto(item, categories, accounts)
      ),
    };
  }

  private async housingSummary() {
    const obligations = await this.services.housing.list(this.context.userId);
    const items = [];
    for (const obligation of obligations) {
      const coverage = await this.services.housing.getCoverage(
        this.context.userId,
        obligation.id
      );
      items.push({
        name: obligation.name,
        currency: coverage.currency,
        installmentAmount: coverage.installmentAmount,
        remainingInstallments: coverage.remainingInstallments,
        coveredInstallments: coverage.coveredInstallments,
        isActive: obligation.isActive,
      });
    }
    return { obligations: items };
  }

  private async accountsSummary() {
    const accounts = await this.services.accounts.list(this.context.userId);
    const items = [];
    for (const account of accounts) {
      const balance = await this.services.accounts.getBalance(
        this.context.userId,
        account.id
      );
      items.push({
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: balance.balance,
        isActive: account.isActive,
      });
    }
    return { accounts: items };
  }

  private async simulateNoIncome(args: { year: number; month: number; months: number }) {
    const result = await this.services.simulations.simulateMonthsWithoutIncome({
      userId: this.context.userId,
      year: args.year,
      month: args.month,
      months: args.months,
      timeZone: this.context.timeZone,
    });
    return toNoIncomeScenarioDto(result);
  }

  private async simulateNewJob(args: {
    year: number;
    month: number;
    monthsUntilJob: number;
    totalMonths: number;
    newMonthlyIncomeARS: string;
    expenseChangeFraction?: string;
  }) {
    const result = await this.services.simulations.simulateNewJobScenario({
      userId: this.context.userId,
      year: args.year,
      month: args.month,
      monthsUntilJob: args.monthsUntilJob,
      totalMonths: args.totalMonths,
      newMonthlyIncomeARS: args.newMonthlyIncomeARS,
      expenseChangeFraction: args.expenseChangeFraction ?? "0.000000",
      timeZone: this.context.timeZone,
    });
    return toNewJobScenarioDto(result);
  }

  private async simulateHousingReserve(args: {
    year: number;
    month: number;
    targetInstallments: number;
    exchangeRateARSPerUSD: string;
    housingName?: string;
  }) {
    const obligation = await this.resolveHousingObligation(args.housingName);
    const result = await this.services.simulations.simulateHousingReserve({
      userId: this.context.userId,
      housingObligationId: obligation.id,
      targetInstallments: args.targetInstallments,
      exchangeRateARSPerUSD: args.exchangeRateARSPerUSD,
      year: args.year,
      month: args.month,
      timeZone: this.context.timeZone,
    });
    return toHousingReserveScenarioDto(result, obligation.name);
  }

  private async resolveHousingObligation(housingName?: string): Promise<HousingObligation> {
    const obligations = await this.services.housing.list(this.context.userId);
    const active = obligations.filter((item) => item.isActive);
    if (housingName) {
      const match = uniqueByName(active, housingName);
      if (!match) {
        throw new AppError(
          "VALIDATION_ERROR",
          "obligación de vivienda no reconocida",
          400
        );
      }
      return match;
    }
    if (active.length === 1) {
      return active[0]!;
    }
    if (active.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "No hay una obligación de vivienda activa.",
        400
      );
    }
    throw new AppError(
      "VALIDATION_ERROR",
      "Indicá el nombre de la obligación de vivienda.",
      400
    );
  }
}

export function isAllowedToolName(name: string): name is AllowedToolName {
  return (ALLOWED_TOOL_NAMES as readonly string[]).includes(name);
}

export function forbiddenWriteToolNames(): readonly string[] {
  return WRITE_TOOL_NAMES;
}

function toFinancialSummaryDto(summary: FinancialSummary) {
  return {
    year: summary.year,
    month: summary.month,
    currency: summary.currency,
    monthlyGrossExpenses: summary.monthlyGrossExpenses,
    monthlyNetExpenses: summary.monthlyNetExpenses,
    monthlyOperatingIncome: summary.monthlyOperatingIncome,
    monthlyFundConsumption: summary.monthlyFundConsumption,
    monthlySurplus: summary.monthlySurplus,
    totalAvailableARS: summary.totalAvailableARS,
    averageMonthlyFundConsumption: summary.averageMonthlyFundConsumption,
    runwayMonths: summary.runwayMonths,
  };
}

function toTransactionDto(
  item: Transaction,
  categories: Category[],
  accounts: Account[]
) {
  return {
    type: item.type,
    amount: item.amount,
    currency: item.currency,
    description: item.description,
    occurredAt: item.occurredAt.toISOString(),
    categoryName: categories.find((category) => category.id === item.categoryId)?.name ?? null,
    accountName: accounts.find((account) => account.id === item.accountId)?.name ?? null,
  };
}

function toNoIncomeScenarioDto(result: MonthsWithoutIncomeResult) {
  return {
    kind: "scenario" as const,
    applied: false,
    scenarioType: "MONTHS_WITHOUT_INCOME" as const,
    year: result.year,
    month: result.month,
    months: result.months,
    baseline: result.baseline,
    projection: result.projection,
  };
}

function toNewJobScenarioDto(result: NewJobScenarioResult) {
  return {
    kind: "scenario" as const,
    applied: false,
    scenarioType: "NEW_JOB" as const,
    year: result.year,
    month: result.month,
    monthsUntilJob: result.monthsUntilJob,
    totalMonths: result.totalMonths,
    assumptions: result.assumptions,
    baseline: result.baseline,
    projection: result.projection,
  };
}

function toHousingReserveScenarioDto(
  result: HousingReserveSimulationResult,
  housingName: string
) {
  return {
    kind: "scenario" as const,
    applied: false,
    scenarioType: "HOUSING_RESERVE" as const,
    housingName,
    targetInstallments: result.targetInstallments,
    housing: {
      installmentAmountUSD: result.housing.installmentAmountUSD,
      remainingInstallments: result.housing.remainingInstallments,
      currentReserveUSD: result.housing.currentReserveUSD,
      effectiveCurrentReserveUSD: result.housing.effectiveCurrentReserveUSD,
      currentCoveredInstallments: result.housing.currentCoveredInstallments,
      targetReserveUSD: result.housing.targetReserveUSD,
      missingReserveUSD: result.housing.missingReserveUSD,
      excessReserveUSD: result.housing.excessReserveUSD,
    },
    fx: result.fx,
    ars: result.ars,
  };
}

function uniqueByName<T extends { name: string }>(items: T[], hint: string): T | null {
  const needle = hint.trim().toLocaleLowerCase("es-AR");
  const matches = items.filter(
    (item) => item.name.trim().toLocaleLowerCase("es-AR") === needle
  );
  return matches.length === 1 ? matches[0] : null;
}

function hasUserId(args: unknown): boolean {
  return Boolean(args && typeof args === "object" && "userId" in args);
}

function sanitizeToolError(error: unknown): string {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      return "No se pudieron obtener los datos.";
    }
    return error.message;
  }
  return "No se pudieron obtener los datos.";
}
