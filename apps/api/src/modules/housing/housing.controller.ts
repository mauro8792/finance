import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import type { Transaction } from "../transactions/transaction.types.js";
import {
  CreateHousingObligationSchema,
  HousingIdParamsSchema,
  RegisterHousingPaymentSchema,
  UpdateHousingObligationSchema,
} from "./housing.schema.js";
import type { HousingService } from "./housing.service.js";
import type { HousingObligation, HousingPayment } from "./housing.types.js";

export class HousingController {
  constructor(
    private readonly housing: HousingService,
    private readonly users: UserRepository
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const items = await this.housing.list(userId);
    res.status(200).json(items.map(toHousingResponse));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const item = await this.housing.getById(userId, id);
    res.status(200).json(toHousingResponse(item));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const body = parseValue(CreateHousingObligationSchema, req.body);
    const created = await this.housing.create(userId, body);
    res.status(201).json(toHousingResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const body = parseValue(UpdateHousingObligationSchema, req.body);
    const updated = await this.housing.update(userId, id, body);
    res.status(200).json(toHousingResponse(updated));
  };

  getCoverage = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const coverage = await this.housing.getCoverage(userId, id);
    res.status(200).json(coverage);
  };

  listPayments = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const payments = await this.housing.listPayments(userId, id);
    res.status(200).json(payments.map(toPaymentListResponse));
  };

  registerPayment = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const body = parseValue(RegisterHousingPaymentSchema, req.body);
    const result = await this.housing.registerPayment(userId, id, {
      accountId: body.accountId,
      amount: body.amount,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      installmentNumber: body.installmentNumber,
    });
    res.status(201).json({
      payment: toPaymentResponse(result.payment),
      transaction: toTransactionResponse(result.transaction),
      remainingInstallments: result.remainingInstallments,
      isActive: result.isActive,
    });
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

function toHousingResponse(item: HousingObligation) {
  return {
    id: item.id,
    reserveAccountId: item.reserveAccountId,
    name: item.name,
    currency: item.currency,
    installmentAmount: item.installmentAmount,
    remainingInstallments: item.remainingInstallments,
    dueDay: item.dueDay,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toPaymentListResponse(item: HousingPayment) {
  return {
    id: item.id,
    housingObligationId: item.housingObligationId,
    transactionId: item.transactionId,
    accountId: item.accountId,
    amount: item.amount,
    currency: item.currency,
    installmentNumber: item.installmentNumber,
    paidAt: item.paidAt.toISOString(),
  };
}

function toPaymentResponse(item: HousingPayment) {
  return {
    ...toPaymentListResponse(item),
    createdAt: item.createdAt.toISOString(),
  };
}

function toTransactionResponse(transaction: Transaction) {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt.toISOString(),
    reimbursementStatus: transaction.reimbursementStatus,
    relatedTransactionId: transaction.relatedTransactionId,
    metadata: transaction.metadata,
    createdAt: transaction.createdAt.toISOString(),
  };
}
