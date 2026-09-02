import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import {
  CreateExpenseSchema,
  CreateIncomeSchema,
  CreateReimbursementSchema,
  CreateTransferSchema,
  ListTransactionsQuerySchema,
  TransactionIdParamsSchema,
  UpdateTransactionSchema,
} from "./transaction.schema.js";
import type { TransactionService } from "./transaction.service.js";
import type { Transaction } from "./transaction.types.js";

export class TransactionController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly users: UserRepository
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const user = await this.requireUser();
    const query = parseBody(ListTransactionsQuerySchema, req.query);
    const items = await this.transactions.list(user.id, query, user.timezone);
    res.status(200).json(items.map(toTransactionResponse));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
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
    const userId = await this.requireUserId();
    const { id } = parseBody(TransactionIdParamsSchema, req.params);
    const voided = await this.transactions.void(userId, id);
    res.status(200).json(toTransactionResponse(voided));
  };

  registerReimbursement = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
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
    const userId = await this.requireUserId();
    const body = parseBody(CreateTransferSchema, req.body);
    const created = await this.transactions.createTransfer(userId, {
      sourceAccountId: body.sourceAccountId,
      destinationAccountId: body.destinationAccountId,
      amount: body.amount,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    res.status(201).json({
      transferId: created.transferId,
      out: toTransactionResponse(created.out),
      in: toTransactionResponse(created.in),
    });
  };

  createExpense = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
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
      categoryId: body.categoryId,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      paymentMethod: body.paymentMethod,
      isFixed: body.isFixed,
    });
    res.status(201).json(toTransactionResponse(created));
  };

  private async requireUserId(): Promise<string> {
    const user = await this.requireUser();
    return user.id;
  }

  private async requireUser() {
    const user = await this.users.findFirst();

    if (!user) {
      throw new AppError(
        "USER_NOT_CONFIGURED",
        "No hay un usuario configurado.",
        500
      );
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
