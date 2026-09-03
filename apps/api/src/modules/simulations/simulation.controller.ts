import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { UserRepository } from "../users/user.types.js";
import { SimulationRequestSchema } from "./simulation.schema.js";
import type { SimulationService } from "./simulation.service.js";

export class SimulationController {
  constructor(
    private readonly simulations: SimulationService,
    private readonly users: UserRepository
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseValue(SimulationRequestSchema, req.body);

    if (body.type === "MONTHS_WITHOUT_INCOME") {
      const result = await this.simulations.simulateMonthsWithoutIncome({
        userId,
        year: body.year,
        month: body.month,
        months: body.months,
        timeZone: body.timeZone,
      });
      res.status(200).json({ type: body.type, result });
      return;
    }

    if (body.type === "NEW_JOB") {
      const result = await this.simulations.simulateNewJobScenario({
        userId,
        year: body.year,
        month: body.month,
        monthsUntilJob: body.monthsUntilJob,
        totalMonths: body.totalMonths,
        newMonthlyIncomeARS: body.newMonthlyIncomeARS,
        expenseChangeFraction: body.expenseChangeFraction,
        timeZone: body.timeZone,
      });
      res.status(200).json({ type: body.type, result });
      return;
    }

    const result = await this.simulations.simulateHousingReserve({
      userId,
      housingObligationId: body.housingObligationId,
      targetInstallments: body.targetInstallments,
      exchangeRateARSPerUSD: body.exchangeRateARSPerUSD,
      year: body.year,
      month: body.month,
      timeZone: body.timeZone,
    });
    res.status(200).json({ type: body.type, result });
  };
}

function parseValue<T>(schema: ZodType<T>, data: unknown): T {
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
