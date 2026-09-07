import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  CloseStatementSchema,
  CreditCardIdOnlyParamsSchema,
  CreditCardStatementIdParamsSchema,
  ProjectStatementSchema,
} from "./credit-card-statement.schema.js";
import type { CreditCardStatementService } from "./credit-card-statement.service.js";
import type { StatementView } from "./credit-card-statement.types.js";

export class CreditCardStatementController {
  constructor(private readonly statements: CreditCardStatementService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdOnlyParamsSchema, req.params);
    const items = await this.statements.list(userId, id);
    res.status(200).json(items.map((item) => toStatementListResponse(item)));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id, statementId } = parseBody(
      CreditCardStatementIdParamsSchema,
      req.params
    );
    const item = await this.statements.getById(userId, id, statementId);
    res.status(200).json(toStatementDetailResponse(item));
  };

  project = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdOnlyParamsSchema, req.params);
    const body = parseBody(ProjectStatementSchema, req.body);
    const closingDate = parseClosingDate(body.closingDate);
    const created = await this.statements.getOrCreateProjected(
      userId,
      id,
      closingDate
    );
    res.status(201).json(toStatementDetailResponse(created));
  };

  close = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id, statementId } = parseBody(
      CreditCardStatementIdParamsSchema,
      req.params
    );
    const body = parseBody(CloseStatementSchema, req.body);
    const closed = await this.statements.close(
      userId,
      id,
      statementId,
      body.actualAmount
    );
    res.status(200).json(toStatementDetailResponse(closed));
  };
}

function parseBody<T>(schema: ZodType<T>, data: unknown): T {
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

function parseClosingDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      "VALIDATION_ERROR",
      "closingDate debe ser una fecha ISO válida.",
      400
    );
  }
  return parsed;
}

function baseStatementResponse(item: StatementView) {
  const s = item.statement;
  return {
    id: s.id,
    userId: s.userId,
    creditCardId: s.creditCardId,
    currency: s.currency,
    status: s.status,
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
    closingDate: s.closingDate.toISOString(),
    dueDate: s.dueDate?.toISOString() ?? null,
    projectedAmount: item.projectedAmount,
    closedProjectedAmount: s.closedProjectedAmount,
    actualAmount: s.actualAmount,
    difference: item.difference,
    currentDerivedAmount: item.currentDerivedAmount,
    hasReconciliationDifference: item.hasReconciliationDifference,
    closedAt: s.closedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toStatementListResponse(item: StatementView) {
  return baseStatementResponse(item);
}

export function toStatementDetailResponse(item: StatementView) {
  return {
    ...baseStatementResponse(item),
    transactions: (item.transactions ?? []).map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      description: tx.description,
      occurredAt: tx.occurredAt.toISOString(),
    })),
  };
}
