import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  ConfirmRecurringChargeSchema,
  CreateCreditCardRecurringChargeSchema,
  ListRecurringChargesQuerySchema,
  OutlookQuerySchema,
  RecurringChargeIdParamsSchema,
  UpdateCreditCardRecurringChargeSchema,
} from "./credit-card-recurring-charge.schema.js";
import type { CreditCardRecurringChargeService } from "./credit-card-recurring-charge.service.js";
import type {
  CreditCardRecurringChargeOccurrenceView,
  CreditCardRecurringChargeRecord,
  RecurringChargeOutlookResult,
} from "./credit-card-recurring-charge.types.js";

export class CreditCardRecurringChargeController {
  constructor(
    private readonly recurringCharges: CreditCardRecurringChargeService
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCreditCardRecurringChargeSchema, req.body);
    const item = await this.recurringCharges.create({
      userId,
      creditCardId: body.creditCardId,
      kind: body.kind,
      categoryId: body.categoryId,
      description: body.description,
      expectedAmount: body.expectedAmount,
      dayOfMonthHint: body.dayOfMonthHint,
      notes: body.notes,
      isActive: body.isActive,
    });
    res.status(201).json(toTemplateResponse(item));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const query = parseBody(ListRecurringChargesQuerySchema, req.query);
    const items = await this.recurringCharges.list(userId, query.creditCardId);
    res.status(200).json(items.map(toTemplateResponse));
  };

  outlook = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const query = parseBody(OutlookQuerySchema, req.query);
    const result = await this.recurringCharges.outlook(
      userId,
      query.creditCardId,
      query.year,
      query.month
    );
    res.status(200).json(toOutlookResponse(result));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RecurringChargeIdParamsSchema, req.params);
    const item = await this.recurringCharges.get(userId, id);
    res.status(200).json(toTemplateResponse(item));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RecurringChargeIdParamsSchema, req.params);
    const body = parseBody(UpdateCreditCardRecurringChargeSchema, req.body);
    const item = await this.recurringCharges.update({
      userId,
      id,
      kind: body.kind,
      categoryId: body.categoryId,
      description: body.description,
      expectedAmount: body.expectedAmount,
      dayOfMonthHint: body.dayOfMonthHint,
      notes: body.notes,
    });
    res.status(200).json(toTemplateResponse(item));
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RecurringChargeIdParamsSchema, req.params);
    const item = await this.recurringCharges.activate(userId, id);
    res.status(200).json(toTemplateResponse(item));
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RecurringChargeIdParamsSchema, req.params);
    const item = await this.recurringCharges.deactivate(userId, id);
    res.status(200).json(toTemplateResponse(item));
  };

  confirm = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RecurringChargeIdParamsSchema, req.params);
    const body = parseBody(ConfirmRecurringChargeSchema, req.body);
    const result = await this.recurringCharges.confirm({
      userId,
      recurringChargeId: id,
      occurrenceKey: body.occurrenceKey,
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
      occurredAt:
        body.occurredAt === undefined ? undefined : new Date(body.occurredAt),
      description: body.description,
    });
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      occurrence: toOccurrenceResponse(result.occurrence),
    });
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

function toTemplateResponse(item: CreditCardRecurringChargeRecord) {
  return {
    id: item.id,
    creditCardId: item.creditCardId,
    kind: item.kind,
    categoryId: item.categoryId,
    description: item.description,
    expectedAmount: item.expectedAmount,
    currency: item.currency,
    frequency: item.frequency,
    dayOfMonthHint: item.dayOfMonthHint,
    isActive: item.isActive,
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toOccurrenceResponse(item: CreditCardRecurringChargeOccurrenceView) {
  return {
    id: item.id,
    recurringChargeId: item.recurringChargeId,
    occurrenceKey: item.occurrenceKey,
    transactionId: item.transactionId,
    amount: item.amount,
    currency: item.currency,
    occurredAt: item.occurredAt.toISOString(),
    description: item.description,
    idempotencyKey: item.idempotencyKey,
  };
}

function toOutlookResponse(result: RecurringChargeOutlookResult) {
  return {
    creditCardId: result.creditCardId,
    occurrenceKey: result.occurrenceKey,
    year: result.year,
    month: result.month,
    expectedSumFixed: result.expectedSumFixed,
    variableCountPending: result.variableCountPending,
    items: result.items.map((item) => ({
      template: toTemplateResponse(item.template),
      occurrenceKey: item.occurrenceKey,
      hasOccurrence: item.hasOccurrence,
      occurrence: item.occurrence
        ? toOccurrenceResponse(item.occurrence)
        : null,
    })),
  };
}
