import type { Currency } from "shared";
import type { Transaction, CreateTransactionInput } from "../transactions/transaction.types.js";

export type CurrencyExchange = {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  occurredAt: Date;
  description: string | null;
  createdAt: Date;
};

export type CreateCurrencyExchangeInput = {
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  exchangeRate: string;
  description?: string;
  occurredAt?: Date;
};

export type CreateCurrencyExchangeRecord = {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  occurredAt: Date;
  description: string | null;
};

export type CurrencyExchangeRepository = {
  createAtomic(
    exchange: CreateCurrencyExchangeRecord,
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<{ exchange: CurrencyExchange; out: Transaction; in: Transaction }>;
};
