import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import {
  CreateCreditCardSchema,
  CreditCardIdParamsSchema,
  UpdateCreditCardSchema,
} from "./credit-card.schema.js";
import type { CreditCardService } from "./credit-card.service.js";
import {
  isConfigComplete,
  type CreditCard,
} from "./credit-card.types.js";

export class CreditCardController {
  constructor(private readonly cards: CreditCardService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.cards.list(userId);
    res.status(200).json(items.map(toCreditCardResponse));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCreditCardSchema, req.body);
    const created = await this.cards.create(userId, body);
    res.status(201).json(toCreditCardResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const body = parseBody(UpdateCreditCardSchema, req.body);
    const updated = await this.cards.update(userId, id, body);
    res.status(200).json(toCreditCardResponse(updated));
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const updated = await this.cards.activate(userId, id);
    res.status(200).json(toCreditCardResponse(updated));
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const updated = await this.cards.deactivate(userId, id);
    res.status(200).json(toCreditCardResponse(updated));
  };

  setPrimary = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const updated = await this.cards.setPrimary(userId, id);
    res.status(200).json(toCreditCardResponse(updated));
  };

  currentDebt = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CreditCardIdParamsSchema, req.params);
    const result = await this.cards.getCurrentCardDebt(userId, id);
    res.status(200).json(result);
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

function toCreditCardResponse(card: CreditCard) {
  return {
    id: card.id,
    userId: card.userId,
    name: card.name,
    issuer: card.issuer,
    brand: card.brand,
    currency: card.currency,
    isActive: card.isActive,
    isPrimary: card.isPrimary,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    feeStatus: card.feeStatus,
    configComplete: isConfigComplete(card),
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}
