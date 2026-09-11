import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { UserRepository } from "../users/user.types.js";
import { ReconcileAccountBalanceSchema } from "./account-balance-reconciliation.schema.js";
import type { AccountBalanceReconciliationService } from "./account-balance-reconciliation.service.js";
import type { AccountBalanceReconciliation } from "./account-balance-reconciliation.types.js";
import {
  AccountIdParamsSchema,
  CreateAccountSchema,
  UpdateAccountSchema,
} from "./account.schema.js";
import type { AccountService } from "./account.service.js";
import type { Account } from "./account.types.js";
import type { Transaction } from "../transactions/transaction.types.js";

export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly users: UserRepository,
    private readonly reconciliations?: AccountBalanceReconciliationService
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.accounts.list(userId);
    res.status(200).json(items.map(toAccountResponse));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateAccountSchema, req.body);
    const created = await this.accounts.create(userId, body);
    res.status(201).json(toAccountResponse(created));
  };

  getBalance = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(AccountIdParamsSchema, req.params);
    const result = await this.accounts.getBalance(userId, id);
    res.status(200).json(result);
  };

  reconcileBalance = async (req: Request, res: Response): Promise<void> => {
    if (!this.reconciliations) {
      throw new AppError("NOT_FOUND", "Conciliación no disponible.", 404);
    }
    const userId = getAuthUserId(req);
    const { id } = parseBody(AccountIdParamsSchema, req.params);
    const body = parseBody(ReconcileAccountBalanceSchema, req.body);
    const result = await this.reconciliations.reconcile(userId, {
      accountId: id,
      observedBalance: body.observedBalance,
      reason: body.reason,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      reconciliation: toReconciliationResponse(result.reconciliation),
      transaction: toTransactionResponse(result.transaction),
      balance: result.balance,
    });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(AccountIdParamsSchema, req.params);
    const body = parseBody(UpdateAccountSchema, req.body);
    const updated = await this.accounts.update(userId, id, body);
    res.status(200).json(toAccountResponse(updated));
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(AccountIdParamsSchema, req.params);
    const updated = await this.accounts.activate(userId, id);
    res.status(200).json(toAccountResponse(updated));
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(AccountIdParamsSchema, req.params);
    const updated = await this.accounts.deactivate(userId, id);
    res.status(200).json(toAccountResponse(updated));
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

function toAccountResponse(account: Account) {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    currency: account.currency,
    type: account.type,
    initialBalance: account.initialBalance,
    isActive: account.isActive,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function toReconciliationResponse(item: AccountBalanceReconciliation) {
  return {
    id: item.id,
    accountId: item.accountId,
    transactionId: item.transactionId,
    observedBalance: item.observedBalance,
    previousCalculatedBalance: item.previousCalculatedBalance,
    adjustmentAmount: item.adjustmentAmount,
    currency: item.currency,
    reason: item.reason,
    occurredAt: item.occurredAt.toISOString(),
    idempotencyKey: item.idempotencyKey,
    createdAt: item.createdAt.toISOString(),
  };
}

function toTransactionResponse(transaction: Transaction) {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt.toISOString(),
    metadata: transaction.metadata,
  };
}
