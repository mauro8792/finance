import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { computeBalance } from "../transactions/transaction-balance.js";
import type { TransactionRepository } from "../transactions/transaction.types.js";
import {
  ACCOUNT_TYPES,
  ZERO_INITIAL_BALANCE,
  type Account,
  type AccountRepository,
  type AccountType,
  type UpdateAccountInput,
} from "./account.types.js";

export class AccountService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async list(userId: string): Promise<Account[]> {
    return this.accounts.findByUserId(userId);
  }

  async create(
    userId: string,
    input: { name: string; currency: Currency; type: AccountType }
  ): Promise<Account> {
    return this.accounts.create({
      userId,
      name: normalizeName(input.name),
      currency: requireCurrency(input.currency),
      type: requireAccountType(input.type),
      initialBalance: ZERO_INITIAL_BALANCE,
      isActive: true,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateAccountInput
  ): Promise<Account> {
    await this.requireOwned(userId, id);
    const patch: UpdateAccountInput = {};

    if (input.name !== undefined) {
      patch.name = normalizeName(input.name);
    }

    if (input.currency !== undefined) {
      patch.currency = requireCurrency(input.currency);
    }

    if (input.type !== undefined) {
      patch.type = requireAccountType(input.type);
    }

    if (input.isActive !== undefined) {
      patch.isActive = input.isActive;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Debe enviarse al menos un campo para actualizar.",
        400
      );
    }

    return this.accounts.update(id, patch);
  }

  async activate(userId: string, id: string): Promise<Account> {
    return this.update(userId, id, { isActive: true });
  }

  async deactivate(userId: string, id: string): Promise<Account> {
    return this.update(userId, id, { isActive: false });
  }

  async getBalance(
    userId: string,
    accountId: string
  ): Promise<{ accountId: string; currency: Currency; balance: string }> {
    const account = await this.requireOwned(userId, accountId);
    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });

    return {
      accountId: account.id,
      currency: account.currency,
      balance: computeBalance(account.initialBalance, movements),
    };
  }

  private async requireOwned(userId: string, id: string): Promise<Account> {
    const account = await this.accounts.findById(id);

    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }

    return account;
  }
}

function normalizeName(name: string): string {
  const value = name.trim();

  if (!value) {
    throw new AppError("VALIDATION_ERROR", "El nombre es obligatorio.", 400);
  }

  if (value.length > 120) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El nombre no puede superar 120 caracteres.",
      400
    );
  }

  return value;
}

function requireCurrency(currency: string): Currency {
  if ((CURRENCIES as readonly string[]).includes(currency)) {
    return currency as Currency;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "La moneda debe ser ARS o USD.",
    400
  );
}

function requireAccountType(type: string): AccountType {
  if ((ACCOUNT_TYPES as readonly string[]).includes(type)) {
    return type as AccountType;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "El tipo de cuenta debe ser CASH, BANK, FUND, INVESTMENT, HOUSING_RESERVE u OTHER.",
    400
  );
}
