import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { UserRepository } from "../users/user.types.js";
import type { Transaction } from "../transactions/transaction.types.js";
import {
  CreateHousingObligationSchema,
  HousingIdParamsSchema,
  HousingPaymentIdParamsSchema,
  RegisterHousingPaymentSchema,
  UpdateHousingObligationSchema,
  VoidHousingPaymentSchema,
} from "./housing.schema.js";
import type { HousingService } from "./housing.service.js";
import type { HousingObligation, HousingPayment } from "./housing.types.js";

export class HousingController {
  constructor(
    private readonly housing: HousingService,
    private readonly users: UserRepository
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.housing.list(userId);
    res.status(200).json(items.map(toHousingResponse));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const item = await this.housing.getById(userId, id);
    res.status(200).json(toHousingResponse(item));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseValue(CreateHousingObligationSchema, req.body);
    const created = await this.housing.create(userId, body);
    res.status(201).json(toHousingResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const body = parseValue(UpdateHousingObligationSchema, req.body);
    const updated = await this.housing.update(userId, id, body);
    res.status(200).json(toHousingResponse(updated));
  };

  getCoverage = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const coverage = await this.housing.getCoverage(userId, id);
    res.status(200).json(coverage);
  };

  listPayments = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const payments = await this.housing.listPayments(userId, id);
    res.status(200).json(payments.map(toPaymentListResponse));
  };

  registerPayment = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseValue(HousingIdParamsSchema, req.params);
    const body = parseValue(RegisterHousingPaymentSchema, req.body);
    const result = await this.housing.registerPayment(userId, id, {
      accountId: body.accountId,
      amount: body.amount,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      installmentNumber: body.installmentNumber,
      periodYear: body.periodYear,
      periodMonth: body.periodMonth,
    });
    res.status(201).json({
      payment: toPaymentResponse(result.payment),
      transaction: toTransactionResponse(result.transaction),
      remainingInstallments: result.remainingInstallments,
      isActive: result.isActive,
    });
  };

  voidPayment = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id, paymentId } = parseValue(HousingPaymentIdParamsSchema, req.params);
    const body = parseValue(VoidHousingPaymentSchema, req.body);
    const result = await this.housing.voidPayment(userId, id, paymentId, {
      idempotencyKey: body.idempotencyKey,
    });
    res.status(200).json({
      created: result.created,
      payment: toPaymentResponse(result.payment),
      transaction: toTransactionResponse(result.transaction),
      remainingInstallments: result.obligation.remainingInstallments,
      isActive: result.obligation.isActive,
    });
  };
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
    periodYear: item.periodYear,
    periodMonth: item.periodMonth,
    paidAt: item.paidAt.toISOString(),
    voidedAt: item.voidedAt ? item.voidedAt.toISOString() : null,
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
    creditCardId: transaction.creditCardId,
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
