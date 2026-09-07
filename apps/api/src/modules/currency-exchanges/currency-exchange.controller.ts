import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
import type { Transaction } from "../transactions/transaction.types.js";
import type { UserRepository } from "../users/user.types.js";
import { CreateCurrencyExchangeSchema } from "./currency-exchange.schema.js";
import type { CurrencyExchangeService } from "./currency-exchange.service.js";
import type { CurrencyExchange } from "./currency-exchange.types.js";

export class CurrencyExchangeController {
  constructor(
    private readonly exchanges: CurrencyExchangeService,
    private readonly users: UserRepository
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCurrencyExchangeSchema, req.body);
    const created = await this.exchanges.create(userId, {
      fromAccountId: body.fromAccountId,
      toAccountId: body.toAccountId,
      fromAmount: body.fromAmount,
      exchangeRate: body.exchangeRate,
      description: body.description,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
    res.status(201).json({
      exchange: toExchangeResponse(created.exchange),
      out: toTransactionResponse(created.out),
      in: toTransactionResponse(created.in),
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

function toExchangeResponse(exchange: CurrencyExchange) {
  return {
    id: exchange.id,
    userId: exchange.userId,
    fromAccountId: exchange.fromAccountId,
    toAccountId: exchange.toAccountId,
    fromCurrency: exchange.fromCurrency,
    toCurrency: exchange.toCurrency,
    fromAmount: exchange.fromAmount,
    toAmount: exchange.toAmount,
    exchangeRate: exchange.exchangeRate,
    occurredAt: exchange.occurredAt.toISOString(),
    description: exchange.description,
    createdAt: exchange.createdAt.toISOString(),
  };
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
