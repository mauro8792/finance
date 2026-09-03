import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { UserRepository } from "../users/user.types.js";
import {
  AccountIdParamsSchema,
  CreateAccountSchema,
  UpdateAccountSchema,
} from "./account.schema.js";
import type { AccountService } from "./account.service.js";
import type { Account } from "./account.types.js";

export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly users: UserRepository
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
