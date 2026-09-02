import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import {
  BudgetIdParamsSchema,
  CreateBudgetSchema,
  ListBudgetsQuerySchema,
  UpdateBudgetSchema,
} from "./budget.schema.js";
import type { BudgetService, BudgetView } from "./budget.service.js";

export class BudgetController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly users: UserRepository
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const query = parseValue(ListBudgetsQuerySchema, req.query);
    const items = await this.budgets.listByPeriod(userId, query.year, query.month);
    res.status(200).json(items.map(toBudgetViewResponse));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const body = parseValue(CreateBudgetSchema, req.body);
    const created = await this.budgets.create(userId, body);
    res.status(201).json(toBudgetViewResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(BudgetIdParamsSchema, req.params);
    const body = parseValue(UpdateBudgetSchema, req.body);
    const updated = await this.budgets.updateAmount(userId, id, body.amount);
    res.status(200).json(toBudgetViewResponse(updated));
  };

  private async requireUserId(): Promise<string> {
    const user = await this.users.findFirst();

    if (!user) {
      throw new AppError(
        "USER_NOT_CONFIGURED",
        "No hay un usuario configurado.",
        500
      );
    }

    return user.id;
  }
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

function toBudgetViewResponse(view: BudgetView) {
  return {
    id: view.id,
    category: { id: view.category.id, name: view.category.name },
    currency: view.currency,
    amount: view.amount,
    year: view.year,
    month: view.month,
    consumption: view.consumption,
    available: view.available,
    usedPercent: view.usedPercent,
    spendingPace: {
      elapsedDays: view.spendingPace.elapsedDays,
      totalDays: view.spendingPace.totalDays,
      monthProgress: view.spendingPace.monthProgress,
      budgetProgress: view.spendingPace.budgetProgress,
      aboveExpectedPace: view.spendingPace.aboveExpectedPace,
    },
  };
}
