import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import { FinancialSummaryQuerySchema } from "./financial.schema.js";
import type { FinancialService } from "./financial.service.js";
import type { FinancialSummary } from "./financial.types.js";

export class FinancialController {
  constructor(
    private readonly financial: FinancialService,
    private readonly users: UserRepository
  ) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    const user = await this.requireUser();
    const query = parseQuery(FinancialSummaryQuerySchema, req.query);
    const summary = await this.financial.getFinancialSummary(
      user.id,
      query.year,
      query.month,
      user.timezone
    );
    res.status(200).json(toFinancialSummaryResponse(summary));
  };

  private async requireUser() {
    const user = await this.users.findFirst();

    if (!user) {
      throw new AppError(
        "USER_NOT_CONFIGURED",
        "No hay un usuario configurado.",
        500
      );
    }

    return user;
  }
}

function parseQuery<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Solicitud inválida.",
      400
    );
  }

  return parsed.data;
}

function toFinancialSummaryResponse(summary: FinancialSummary): FinancialSummary {
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
