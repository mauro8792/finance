import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  AccreditCreditCardRefundSchema,
  CreateCreditCardRefundExpectationSchema,
  RefundExpectationIdParamsSchema,
} from "./credit-card-refund.schema.js";
import type { CreditCardRefundService } from "./credit-card-refund.service.js";
import type {
  CreditCardRefundAccreditationView,
  CreditCardRefundExpectationView,
} from "./credit-card-refund.types.js";

export class CreditCardRefundController {
  constructor(private readonly refunds: CreditCardRefundService) {}

  createExpected = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCreditCardRefundExpectationSchema, req.body);
    const item = await this.refunds.createExpected({
      userId,
      purchaseId: body.purchaseId ?? null,
      originalExpenseTransactionId: body.originalExpenseTransactionId ?? null,
      expectedAmount: body.expectedAmount,
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : body.expectedDate === null ? null : undefined,
      description: body.description,
    });
    res.status(201).json(toExpectationResponse(item));
  };

  listExpected = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.refunds.listExpected(userId);
    res.status(200).json(items.map(toExpectationResponse));
  };

  getExpected = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RefundExpectationIdParamsSchema, req.params);
    const item = await this.refunds.getExpected(userId, id);
    res.status(200).json(toExpectationResponse(item));
  };

  cancelExpected = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(RefundExpectationIdParamsSchema, req.params);
    const item = await this.refunds.cancelExpected(userId, id);
    res.status(200).json(toExpectationResponse(item));
  };

  accredit = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(AccreditCreditCardRefundSchema, req.body);
    const occurredAt =
      body.occurredAt === undefined
        ? undefined
        : parseOccurredAt(body.occurredAt);

    const result = await this.refunds.accredit({
      userId,
      expectationId: body.expectationId ?? null,
      purchaseId: body.purchaseId ?? null,
      originalExpenseTransactionId: body.originalExpenseTransactionId ?? null,
      amount: body.amount,
      destinationType: body.destinationType,
      accountId: body.accountId ?? null,
      occurredAt,
      description: body.description,
      idempotencyKey: body.idempotencyKey,
    });

    res.status(result.created ? 201 : 200).json({
      accreditation: toAccreditationResponse(result.accreditation),
      expectation: result.expectation
        ? toExpectationResponse(result.expectation)
        : null,
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

function toExpectationResponse(item: CreditCardRefundExpectationView) {
  return {
    id: item.id,
    creditCardId: item.creditCardId,
    purchaseId: item.purchaseId,
    originalExpenseTransactionId: item.originalExpenseTransactionId,
    expectedAmount: item.expectedAmount,
    accreditedAmount: item.accreditedAmount,
    remainingExpected: item.remainingExpected,
    currency: item.currency,
    status: item.status,
    expectedDate: item.expectedDate ? item.expectedDate.toISOString() : null,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toAccreditationResponse(item: CreditCardRefundAccreditationView) {
  return {
    id: item.id,
    transactionId: item.transactionId,
    expectationId: item.expectationId,
    originalExpenseTransactionId: item.originalExpenseTransactionId,
    purchaseId: item.purchaseId,
    creditCardId: item.creditCardId,
    destinationType: item.destinationType,
    accountId: item.accountId,
    amount: item.amount,
    currency: item.currency,
    occurredAt: item.occurredAt.toISOString(),
    description: item.description,
    status: item.status,
    idempotencyKey: item.idempotencyKey,
  };
}
