import type { CurrencyExchange as PrismaCurrencyExchange } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  toCreateData,
  toTransaction,
} from "../transactions/transaction.repository.js";
import type {
  CreateTransactionInput,
  Transaction,
} from "../transactions/transaction.types.js";
import type {
  CreateCurrencyExchangeRecord,
  CurrencyExchange,
  CurrencyExchangeRepository,
} from "./currency-exchange.types.js";

export class PrismaCurrencyExchangeRepository implements CurrencyExchangeRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async createAtomic(
    exchange: CreateCurrencyExchangeRecord,
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<{
    exchange: CurrencyExchange;
    out: Transaction;
    in: Transaction;
  }> {
    const records = await this.prisma.$transaction(async (tx) => {
      const created = await tx.currencyExchange.create({
        data: {
          id: exchange.id,
          userId: exchange.userId,
          fromAccountId: exchange.fromAccountId,
          toAccountId: exchange.toAccountId,
          fromCurrency: exchange.fromCurrency,
          toCurrency: exchange.toCurrency,
          fromAmount: exchange.fromAmount,
          toAmount: exchange.toAmount,
          exchangeRate: exchange.exchangeRate,
          occurredAt: exchange.occurredAt,
          description: exchange.description,
        },
      });
      const out = await tx.transaction.create({ data: toCreateData(outgoing) });
      const incomingLeg = await tx.transaction.create({
        data: toCreateData(incoming),
      });
      return { created, out, incomingLeg };
    });

    return {
      exchange: toCurrencyExchange(records.created),
      out: toTransaction(records.out),
      in: toTransaction(records.incomingLeg),
    };
  }
}

function toCurrencyExchange(record: PrismaCurrencyExchange): CurrencyExchange {
  return {
    id: record.id,
    userId: record.userId,
    fromAccountId: record.fromAccountId,
    toAccountId: record.toAccountId,
    fromCurrency: record.fromCurrency as Currency,
    toCurrency: record.toCurrency as Currency,
    fromAmount: record.fromAmount.toFixed(2),
    toAmount: record.toAmount.toFixed(2),
    exchangeRate: record.exchangeRate.toFixed(6),
    occurredAt: record.occurredAt,
    description: record.description,
    createdAt: record.createdAt,
  };
}
