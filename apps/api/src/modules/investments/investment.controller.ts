import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import {
  CreateCaucionSchema,
  InvestmentIdParamsSchema,
  MatureCaucionSchema,
  RenewCaucionSchema,
} from "./investment.schema.js";
import type {
  InvestmentService,
  MatureCaucionResult,
  RenewCaucionResult,
} from "./investment.service.js";
import type { Investment } from "./investment.types.js";

export class InvestmentController {
  constructor(
    private readonly investments: InvestmentService,
    private readonly users: UserRepository
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const items = await this.investments.list(userId);
    res.status(200).json(items.map(toInvestmentResponse));
  };

  createCaucion = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const body = parseValue(CreateCaucionSchema, req.body);
    const result = await this.investments.createCaucion(userId, {
      accountId: body.accountId,
      currency: body.currency,
      principal: body.principal,
      annualRate: body.annualRate,
      startDate: new Date(body.startDate),
      maturityDate: new Date(body.maturityDate),
      notes: body.notes,
    });
    res.status(201).json(toInvestmentResponse(result.investment));
  };

  mature = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(InvestmentIdParamsSchema, req.params);
    const body = parseValue(MatureCaucionSchema, req.body);
    const result = await this.investments.mature(userId, id, {
      destinationAccountId: body.destinationAccountId,
      capitalReturned: body.capitalReturned,
      actualReturn: body.actualReturn,
      occurredAt: new Date(body.occurredAt),
    });
    res.status(200).json(toMatureResponse(result));
  };

  renew = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(InvestmentIdParamsSchema, req.params);
    const body = parseValue(RenewCaucionSchema, req.body);
    const result = await this.investments.renew(userId, id, {
      accountId: body.accountId,
      renewalPrincipal: body.renewalPrincipal,
      actualReturn: body.actualReturn,
      annualRate: body.annualRate,
      occurredAt: new Date(body.occurredAt),
      maturityDate: new Date(body.maturityDate),
      notes: body.notes,
    });
    res.status(201).json(toRenewResponse(result));
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

function toInvestmentResponse(item: Investment) {
  return {
    id: item.id,
    accountId: item.accountId,
    type: item.type,
    status: item.status,
    currency: item.currency,
    principal: item.principal,
    annualRate: item.annualRate,
    startDate: item.startDate.toISOString(),
    maturityDate: item.maturityDate ? item.maturityDate.toISOString() : null,
    expectedReturn: item.expectedReturn,
    notes: item.notes,
    renewedFromInvestmentId: item.renewedFromInvestmentId,
    actualReturn: item.actualReturn,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toMatureResponse(result: MatureCaucionResult) {
  return {
    ...toInvestmentResponse(result.investment),
    destinationAccountId: result.destinationAccountId,
    occurredAt: result.occurredAt.toISOString(),
  };
}

function toRenewResponse(result: RenewCaucionResult) {
  return {
    original: toInvestmentResponse(result.original),
    investment: toInvestmentResponse(result.investment),
    occurredAt: result.occurredAt.toISOString(),
  };
}
