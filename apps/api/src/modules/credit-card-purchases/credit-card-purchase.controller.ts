import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  CreateCreditCardPurchaseSchema,
  CreditCardPurchaseIdParamsSchema,
} from "./credit-card-purchase.schema.js";
import type { CreditCardPurchaseService } from "./credit-card-purchase.service.js";
import type { PurchaseWithInstallment } from "./credit-card-purchase.types.js";

export class CreditCardPurchaseController {
  constructor(private readonly purchases: CreditCardPurchaseService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.purchases.list(userId);
    res.status(200).json(items.map(toPurchaseResponse));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardPurchaseIdParamsSchema, req.params);
    const item = await this.purchases.getById(userId, id);
    res.status(200).json(toPurchaseResponse(item));
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
    res.status(201).json(toPurchaseResponse(created));
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

export function toPurchaseResponse(item: PurchaseWithInstallment) {
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
    transactionId: item.transactionId,
    installment: {
      id: item.installment.id,
      installmentNumber: item.installment.installmentNumber,
      amount: item.installment.amount,
      status: item.installment.status,
      recognizedTransactionId: item.installment.recognizedTransactionId,
      recognizedAt: item.installment.recognizedAt?.toISOString() ?? null,
    },
    createdAt: item.purchase.createdAt.toISOString(),
    updatedAt: item.purchase.updatedAt.toISOString(),
  };
}
