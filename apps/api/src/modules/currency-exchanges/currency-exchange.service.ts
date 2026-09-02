import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";
import type { Account, AccountRepository } from "../accounts/account.types.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import { computeBalance, toCents } from "../transactions/transaction-balance.js";
import type { TransactionRepository } from "../transactions/transaction.types.js";
import { calculateToAmount, parsePositiveRate } from "./currency-exchange.math.js";
import type {
  CreateCurrencyExchangeInput,
  CurrencyExchange,
  CurrencyExchangeRepository,
} from "./currency-exchange.types.js";
import type { Transaction } from "../transactions/transaction.types.js";

export class CurrencyExchangeService {
  constructor(
    private readonly exchanges: CurrencyExchangeRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async create(
    userId: string,
    input: CreateCurrencyExchangeInput
  ): Promise<{ exchange: CurrencyExchange; out: Transaction; in: Transaction }> {
    if (input.fromAccountId === input.toAccountId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La cuenta origen y la cuenta destino deben ser distintas.",
        400
      );
    }

    const fromAccount = await this.requireActiveOwnedAccount(
      userId,
      input.fromAccountId
    );
    const toAccount = await this.requireActiveOwnedAccount(
      userId,
      input.toAccountId
    );

    if (fromAccount.currency === toAccount.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "El cambio de moneda requiere cuentas de distinta moneda.",
        400
      );
    }

    const fromAmount = parsePositiveAmount(input.fromAmount);
    const exchangeRate = parsePositiveRate(input.exchangeRate);
    const toAmount = calculateToAmount(
      fromAccount.currency,
      toAccount.currency,
      fromAmount,
      exchangeRate
    );

    const sourceMovements = await this.transactions.findByUserId(userId, {
      accountId: fromAccount.id,
      status: "ACTIVE",
    });
    const available = computeBalance(fromAccount.initialBalance, sourceMovements);

    if (toCents(available) < toCents(fromAmount)) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "La cuenta origen no tiene saldo suficiente.",
        400
      );
    }

    const id = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();
    const description = normalizeDescription(input.description);
    const shared = {
      userId,
      categoryId: null,
      type: "CURRENCY_EXCHANGE" as const,
      status: "ACTIVE" as const,
      description,
      occurredAt,
      paymentMethod: null,
      reimbursementStatus: "NONE" as const,
      relatedTransactionId: null,
    };

    return this.exchanges.createAtomic(
      {
        id,
        userId,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        fromCurrency: fromAccount.currency,
        toCurrency: toAccount.currency,
        fromAmount,
        toAmount,
        exchangeRate,
        occurredAt,
        description,
      },
      {
        ...shared,
        accountId: fromAccount.id,
        amount: fromAmount,
        currency: fromAccount.currency,
        metadata: { currencyExchangeId: id, direction: "OUT" },
      },
      {
        ...shared,
        accountId: toAccount.id,
        amount: toAmount,
        currency: toAccount.currency,
        metadata: { currencyExchangeId: id, direction: "IN" },
      }
    );
  }

  private async requireActiveOwnedAccount(
    userId: string,
    accountId: string
  ): Promise<Account> {
    const account = await this.accounts.findById(accountId);

    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }

    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede registrar un movimiento sobre una cuenta inactiva.",
        400
      );
    }

    return account;
  }
}

function normalizeDescription(description: string | undefined): string | null {
  if (description === undefined) {
    return null;
  }

  const value = description.trim();

  if (value.length > 255) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La descripción no puede superar 255 caracteres.",
      400
    );
  }

  return value || null;
}
