import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { UserRepository } from "../users/user.types.js";
import {
  CreateExpenseSchema,
  CreateIncomeSchema,
  CreateReimbursementSchema,
  CreateTransferSchema,
  ListTransactionsQuerySchema,
  TransactionIdParamsSchema,
  TransferIdParamsSchema,
  UpdateTransactionSchema,
} from "./transaction.schema.js";
import type { TransactionService } from "./transaction.service.js";
import type { Transaction, TransferView } from "./transaction.types.js";

export class TransactionController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly users: UserRepository
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const user = await this.requireUser(req);
    const query = parseBody(ListTransactionsQuerySchema, req.query);
    const items = await this.transactions.list(user.id, query, user.timezone);
    res.status(200).json(items.map(toTransactionResponse));
  };

  exportCsv = async (req: Request, res: Response): Promise<void> => {
    const user = await this.requireUser(req);
    const query = parseBody(ListTransactionsQuerySchema, req.query);
    const csv = await this.transactions.exportCsv(user.id, query, user.timezone);
    const body = Buffer.from(csv, "utf8");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="movimientos.csv"');
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).end(body);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(TransactionIdParamsSchema, req.params);
    const body = parseBody(UpdateTransactionSchema, req.body);
    const updated = await this.transactions.update(userId, id, {
      amount: body.amount,
      categoryId: body.categoryId,
      description: body.description === null ? null : body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      paymentMethod: body.paymentMethod,
      isFixed: body.isFixed,
    });
    res.status(200).json(toTransactionResponse(updated));
  };

  void = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(TransactionIdParamsSchema, req.params);
    const voided = await this.transactions.void(userId, id);
    res.status(200).json(toTransactionResponse(voided));
  };

  registerReimbursement = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(TransactionIdParamsSchema, req.params);
    const body = parseBody(CreateReimbursementSchema, req.body);
    const created = await this.transactions.registerReimbursement(userId, id, {
      amount: body.amount,
      accountId: body.accountId,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    res.status(201).json(toTransactionResponse(created));
  };

  createTransfer = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateTransferSchema, req.body);
    const created = await this.transactions.createTransfer(userId, {
      sourceAccountId: body.sourceAccountId,
      destinationAccountId: body.destinationAccountId,
      amount: body.amount,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(created.created ? 201 : 200).json({
      transferId: created.transferId,
      out: toTransactionResponse(created.out),
      in: toTransactionResponse(created.in),
    });
  };

  listTransfers = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.transactions.listTransfers(userId);
    res.status(200).json(items.map(toTransferResponse));
  };

  getTransfer = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(TransferIdParamsSchema, req.params);
    const item = await this.transactions.getTransfer(userId, id);
    res.status(200).json(toTransferResponse(item));
  };

  createExpense = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const type = (req.body as { type?: unknown } | undefined)?.type;

    if (type === "INCOME") {
      const body = parseBody(CreateIncomeSchema, req.body);
      const created = await this.transactions.createIncome(userId, {
        amount: body.amount,
        currency: body.currency,
        accountId: body.accountId,
        categoryId: body.categoryId,
        incomeKind: body.incomeKind,
        description: body.description,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      });
      res.status(201).json(toTransactionResponse(created));
      return;
    }

    if (type !== undefined && type !== "EXPENSE") {
      throw new AppError(
        "VALIDATION_ERROR",
        "El tipo debe ser EXPENSE o INCOME.",
        400
      );
    }

    const body = parseBody(CreateExpenseSchema, req.body);
    const created = await this.transactions.createExpense(userId, {
      amount: body.amount,
      currency: body.currency,
      accountId: body.accountId,
      creditCardId: body.creditCardId,
      categoryId: body.categoryId,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      paymentMethod: body.paymentMethod,
      isFixed: body.isFixed,
    });
    res.status(201).json(toTransactionResponse(created));
  };

  private async requireUser(req: Request) {
    const user = await this.users.findById(getAuthUserId(req));

    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
    }

    return user;
  }
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

function toTransactionResponse(transaction: Transaction) {
  return {
    id: transaction.id,
    userId: transaction.userId,
    accountId: transaction.accountId,
    creditCardId: transaction.creditCardId,
    categoryId: transaction.categoryId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description,
    occurredAt: transaction.occurredAt.toISOString(),
    paymentMethod: transaction.paymentMethod,
    isFixed: transaction.isFixed,
    reimbursementStatus: transaction.reimbursementStatus,
    relatedTransactionId: transaction.relatedTransactionId,
    metadata: transaction.metadata,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

function toTransferResponse(item: TransferView) {
  return {
    transferId: item.transferId,
    sourceAccountId: item.sourceAccountId,
    destinationAccountId: item.destinationAccountId,
    amount: item.amount,
    currency: item.currency,
    description: item.description,
    occurredAt: item.occurredAt.toISOString(),
    outTransactionId: item.outTransactionId,
    inTransactionId: item.inTransactionId,
    createdAt: item.createdAt.toISOString(),
  };
}
