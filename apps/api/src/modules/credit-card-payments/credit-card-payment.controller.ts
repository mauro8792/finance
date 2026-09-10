import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  CreateCreditCardPaymentSchema,
  CreditCardIdParamsSchema,
  CreditCardPaymentIdParamsSchema,
  VoidCreditCardPaymentSchema,
} from "./credit-card-payment.schema.js";
import type { CreditCardPaymentService } from "./credit-card-payment.service.js";
import type { CreditCardPaymentView } from "./credit-card-payment.types.js";

export class CreditCardPaymentController {
  constructor(private readonly payments: CreditCardPaymentService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const items = await this.payments.list(userId, id);
    res.status(200).json(items.map(toPaymentResponse));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id, paymentId } = parseBody(
      CreditCardPaymentIdParamsSchema,
      req.params
    );
    const item = await this.payments.getById(userId, id, paymentId);
    res.status(200).json(toPaymentResponse(item));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const body = parseBody(CreateCreditCardPaymentSchema, req.body);
    const occurredAt =
      body.occurredAt === undefined
        ? undefined
        : parseOccurredAt(body.occurredAt);

    const result = await this.payments.create({
      userId,
      creditCardId: id,
      accountId: body.accountId,
      amount: body.amount,
      statementId: body.statementId ?? null,
      occurredAt,
      description: body.description,
      idempotencyKey: body.idempotencyKey,
    });

    res
      .status(result.created ? 201 : 200)
      .json(toPaymentResponse(result.payment));
  };

  void = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id, paymentId } = parseBody(
      CreditCardPaymentIdParamsSchema,
      req.params
    );
    const body = parseBody(VoidCreditCardPaymentSchema, req.body);
    const result = await this.payments.void(userId, id, paymentId, {
      idempotencyKey: body.idempotencyKey,
    });
    res.status(200).json({
      ...toPaymentResponse(result.payment),
      statementStatus: result.statementStatus,
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

function parseOccurredAt(raw: string | Date): Date {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new AppError("VALIDATION_ERROR", "occurredAt inválido.", 400);
    }
    return raw;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", "occurredAt inválido.", 400);
  }
  return parsed;
}

function toPaymentResponse(item: CreditCardPaymentView) {
  return {
    id: item.id,
    creditCardId: item.creditCardId,
    statementId: item.statementId,
    accountId: item.accountId,
    amount: item.amount,
    currency: item.currency,
    occurredAt: item.occurredAt.toISOString(),
    description: item.description,
    status: item.status,
    idempotencyKey: item.idempotencyKey,
    voidedAt: item.voidedAt ? item.voidedAt.toISOString() : null,
  };
}
