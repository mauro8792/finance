import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { CreditCardRefundExpectationView } from "../credit-card-refunds/credit-card-refund.types.js";
import {
  CreateCreditCardPromotionSchema,
  PromotionApplySchema,
  PromotionIdParamsSchema,
  PromotionPreviewSchema,
  UpdateCreditCardPromotionSchema,
} from "./credit-card-promotion.schema.js";
import type { CreditCardPromotionService } from "./credit-card-promotion.service.js";
import type {
  CreditCardPromotionRecord,
  PromotionCalculationResult,
} from "./credit-card-promotion.types.js";

export class CreditCardPromotionController {
  constructor(private readonly promotions: CreditCardPromotionService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCreditCardPromotionSchema, req.body);
    const item = await this.promotions.create({
      userId,
      creditCardId: body.creditCardId,
      name: body.name,
      currency: body.currency,
      benefitType: body.benefitType,
      percentage: body.percentage,
      fixedAmount: body.fixedAmount,
      minimumPurchaseAmount: body.minimumPurchaseAmount,
      capAmount: body.capAmount,
      capPeriod: body.capPeriod,
      validFrom: new Date(body.validFrom),
      validUntil: new Date(body.validUntil),
      description: body.description,
      isActive: body.isActive,
    });
    res.status(201).json(toPromotionResponse(item));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.promotions.list(userId);
    res.status(200).json(items.map(toPromotionResponse));
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const item = await this.promotions.get(userId, id);
    res.status(200).json(toPromotionResponse(item));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const body = parseBody(UpdateCreditCardPromotionSchema, req.body);
    const item = await this.promotions.update({
      userId,
      id,
      name: body.name,
      benefitType: body.benefitType,
      percentage: body.percentage,
      fixedAmount: body.fixedAmount,
      minimumPurchaseAmount: body.minimumPurchaseAmount,
      capAmount: body.capAmount,
      capPeriod: body.capPeriod,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      description: body.description,
    });
    res.status(200).json(toPromotionResponse(item));
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const item = await this.promotions.activate(userId, id);
    res.status(200).json(toPromotionResponse(item));
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const item = await this.promotions.deactivate(userId, id);
    res.status(200).json(toPromotionResponse(item));
  };

  preview = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const body = parseBody(PromotionPreviewSchema, req.body);
    const result = await this.promotions.preview({
      userId,
      promotionId: id,
      purchaseId: body.purchaseId ?? null,
      originalExpenseTransactionId: body.originalExpenseTransactionId ?? null,
      description: body.description,
    });
    res.status(200).json({ calculation: toCalculationResponse(result.calculation) });
  };

  apply = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(PromotionIdParamsSchema, req.params);
    const body = parseBody(PromotionApplySchema, req.body);
    if (!body.idempotencyKey) {
      throw new AppError(
        "VALIDATION_ERROR",
        "idempotencyKey es obligatorio para apply.",
        400
      );
    }
    const result = await this.promotions.apply({
      userId,
      promotionId: id,
      purchaseId: body.purchaseId ?? null,
      originalExpenseTransactionId: body.originalExpenseTransactionId ?? null,
      idempotencyKey: body.idempotencyKey,
      description: body.description,
    });
    res.status(result.created ? 201 : 200).json({
      expectation: toExpectationResponse(result.expectation),
      calculation: toCalculationResponse(result.calculation),
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

function toPromotionResponse(item: CreditCardPromotionRecord) {
  return {
    id: item.id,
    creditCardId: item.creditCardId,
    name: item.name,
    currency: item.currency,
    benefitType: item.benefitType,
    percentage: item.percentage,
    fixedAmount: item.fixedAmount,
    minimumPurchaseAmount: item.minimumPurchaseAmount,
    capAmount: item.capAmount,
    capPeriod: item.capPeriod,
    validFrom: item.validFrom.toISOString(),
    validUntil: item.validUntil.toISOString(),
    isActive: item.isActive,
    description: item.description,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toCalculationResponse(item: PromotionCalculationResult) {
  return {
    eligible: item.eligible,
    expectedAmount: item.expectedAmount,
    eligibleBase: item.eligibleBase,
    rawBenefit: item.rawBenefit,
    capApplied: item.capApplied,
    limitedBy: item.limitedBy,
    percentage: item.percentage,
    fixedAmount: item.fixedAmount,
    promotionName: item.promotionName,
    sharedCapRemaining: item.sharedCapRemaining,
    sourceRemaining: item.sourceRemaining,
    currency: item.currency,
    creditCardId: item.creditCardId,
    purchaseId: item.purchaseId,
    originalExpenseTransactionId: item.originalExpenseTransactionId,
    sourceOccurredAt: item.sourceOccurredAt.toISOString(),
  };
}

function toExpectationResponse(item: CreditCardRefundExpectationView) {
  return {
    id: item.id,
    creditCardId: item.creditCardId,
    purchaseId: item.purchaseId,
    originalExpenseTransactionId: item.originalExpenseTransactionId,
    expectedAmount: item.expectedAmount,
    cancelledRemainingAmount: item.cancelledRemainingAmount,
    accreditedAmount: item.accreditedAmount,
    remainingExpected: item.remainingExpected,
    currency: item.currency,
    status: item.status,
    expectedDate: item.expectedDate ? item.expectedDate.toISOString() : null,
    description: item.description,
    promotionId: item.promotionId,
    calculationEligibleBase: item.calculationEligibleBase,
    calculationRawBenefit: item.calculationRawBenefit,
    calculationCapApplied: item.calculationCapApplied,
    calculationLimitedBy: item.calculationLimitedBy,
    calculationPercentage: item.calculationPercentage,
    calculationFixedAmount: item.calculationFixedAmount,
    calculationPromotionName: item.calculationPromotionName,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
