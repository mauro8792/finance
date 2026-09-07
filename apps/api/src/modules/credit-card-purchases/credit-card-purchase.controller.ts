import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  CreateCreditCardPurchaseSchema,
  CreditCardPurchaseIdParamsSchema,
} from "./credit-card-purchase.schema.js";
import type { CreditCardPurchaseService } from "./credit-card-purchase.service.js";
import type { PurchaseWithInstallments } from "./credit-card-purchase.types.js";

export class CreditCardPurchaseController {
  constructor(private readonly purchases: CreditCardPurchaseService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.purchases.list(userId);
    res.status(200).json(items.map(toPurchaseListResponse));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardPurchaseIdParamsSchema, req.params);
    const item = await this.purchases.getById(userId, id);
    res.status(200).json(toPurchaseDetailResponse(item));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCreditCardPurchaseSchema, req.body);
    const created = await this.purchases.create(userId, {
      creditCardId: body.creditCardId,
      categoryId: body.categoryId,
      description: body.description,
      currency: body.currency,
      totalAmount: body.totalAmount,
      purchaseDate: body.purchaseDate,
      installmentsCount: body.installmentsCount,
    });
    res.status(201).json(toPurchaseDetailResponse(created));
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

function toInstallmentResponse(
  installment: PurchaseWithInstallments["installments"][number]
) {
  return {
    id: installment.id,
    installmentNumber: installment.installmentNumber,
    amount: installment.amount,
    status: installment.status,
    scheduledFor: installment.scheduledFor.toISOString(),
    recognizedTransactionId: installment.recognizedTransactionId,
    recognizedAt: installment.recognizedAt?.toISOString() ?? null,
  };
}

export function toPurchaseDetailResponse(item: PurchaseWithInstallments) {
  return {
    id: item.purchase.id,
    userId: item.purchase.userId,
    creditCardId: item.purchase.creditCardId,
    categoryId: item.purchase.categoryId,
    description: item.purchase.description,
    currency: item.purchase.currency,
    totalAmount: item.purchase.totalAmount,
    installmentAmount: item.purchase.installmentAmount,
    installmentsCount: item.purchase.installmentsCount,
    purchaseDate: item.purchase.purchasedAt.toISOString(),
    status: item.purchase.status,
    recognizedTransactionId: item.recognizedTransactionId,
    installments: item.installments.map(toInstallmentResponse),
    createdAt: item.purchase.createdAt.toISOString(),
    updatedAt: item.purchase.updatedAt.toISOString(),
  };
}

/** List omits full installment expansion for lighter payloads. */
export function toPurchaseListResponse(item: PurchaseWithInstallments) {
  const pendingCount = item.installments.filter(
    (row) => row.status === "PENDING"
  ).length;
  const recognizedCount = item.installments.filter(
    (row) => row.status === "RECOGNIZED"
  ).length;
  return {
    id: item.purchase.id,
    userId: item.purchase.userId,
    creditCardId: item.purchase.creditCardId,
    categoryId: item.purchase.categoryId,
    description: item.purchase.description,
    currency: item.purchase.currency,
    totalAmount: item.purchase.totalAmount,
    installmentAmount: item.purchase.installmentAmount,
    installmentsCount: item.purchase.installmentsCount,
    purchaseDate: item.purchase.purchasedAt.toISOString(),
    status: item.purchase.status,
    recognizedTransactionId: item.recognizedTransactionId,
    recognizedInstallmentsCount: recognizedCount,
    pendingInstallmentsCount: pendingCount,
    createdAt: item.purchase.createdAt.toISOString(),
    updatedAt: item.purchase.updatedAt.toISOString(),
  };
}
