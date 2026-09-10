import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import { AccountService } from "../accounts/account.service.js";
import type {
  Account,
  AccountRepository,
  CreateAccountInput,
  UpdateAccountInput,
} from "../accounts/account.types.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import { CurrencyExchangeService } from "./currency-exchange.service.js";
import type {
  CreateCurrencyExchangeRecord,
  CurrencyExchange,
  CurrencyExchangeRepository,
} from "./currency-exchange.types.js";

class MemoryAccountRepository implements AccountRepository {
  readonly items = new Map<string, Account>();

  async create(input: CreateAccountInput): Promise<Account> {
    const now = new Date();
    const account: Account = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      currency: input.currency,
      type: input.type,
      initialBalance: input.initialBalance ?? ZERO_INITIAL_BALANCE,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(account.id, account);
    return account;
  }

  async findById(id: string): Promise<Account | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Account[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryTransactionRepository implements TransactionRepository {
  readonly items: Transaction[] = [];

  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const transaction: Transaction = {
      id: randomUUID(),
      userId: input.userId,
      accountId: input.accountId,
      creditCardId: input.creditCardId ?? null,
      categoryId: input.categoryId ?? null,
      type: input.type,
      status: input.status ?? "ACTIVE",
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      occurredAt: input.occurredAt,
      paymentMethod: input.paymentMethod ?? null,
      isFixed: input.isFixed ?? false,
      reimbursementStatus: input.reimbursementStatus ?? "NONE",
      relatedTransactionId: input.relatedTransactionId ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(transaction);
    return transaction;
  }

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.type === undefined || item.type === query.type)
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.status === undefined || item.status === query.status);
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("missing");
    }
    const current = this.items[index]!;
    const updated: Transaction = {
      ...current,
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string }
  ): Promise<Transaction> {
    return this.create(input);
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
  async createTransferAtomic(): Promise<never> {
    throw new Error("createTransferAtomic not used in this test double");
  }
  async listTransfers(): Promise<[]> {
    return [];
  }
  async findTransferById(): Promise<null> {
    return null;
  }
}

class MemoryCurrencyExchangeRepository implements CurrencyExchangeRepository {
  readonly items: CurrencyExchange[] = [];

  constructor(private readonly transactions: MemoryTransactionRepository) {}

  async createAtomic(
    exchange: CreateCurrencyExchangeRecord,
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<{ exchange: CurrencyExchange; out: Transaction; in: Transaction }> {
    const exchangeSnapshot = this.items.slice();
    const transactionSnapshot = this.transactions.items.slice();
    try {
      const now = new Date();
      const created: CurrencyExchange = {
        ...exchange,
        createdAt: now,
      };
      this.items.push(created);
      const out = await this.transactions.create(outgoing);
      const inn = await this.transactions.create(incoming);
      return { exchange: created, out, in: inn };
    } catch (error) {
      this.items.splice(0, this.items.length, ...exchangeSnapshot);
      this.transactions.items.splice(
        0,
        this.transactions.items.length,
        ...transactionSnapshot
      );
      throw error;
    }
  }
}

const userId = randomUUID();

async function fundedSetup() {
  const accounts = new MemoryAccountRepository();
  const transactions = new MemoryTransactionRepository();
  const exchanges = new MemoryCurrencyExchangeRepository(transactions);
  const service = new CurrencyExchangeService(exchanges, accounts, transactions);
  const transactionService = new TransactionService(
    transactions,
    accounts,
    { findById: async () => null } as never
  );
  const ars = await accounts.create({
    userId,
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });
  const usd = await accounts.create({
    userId,
    name: "Fondo USD",
    currency: "USD",
    type: "FUND",
  });
  await transactions.create({
    userId,
    accountId: ars.id,
    type: "INCOME",
    amount: "1500000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { incomeKind: "CAPITAL" },
  });
  return {
    service,
    transactionService,
    accounts,
    transactions,
    exchanges,
    ars,
    usd,
    accountService: new AccountService(accounts, transactions),
  };
}

test("CurrencyExchangeService buys USD atomically", async () => {
  const { service, exchanges, ars, usd, accountService, transactions } =
    await fundedSetup();

  const created = await service.create(userId, {
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "1500000.00",
    exchangeRate: "1500.000000",
    description: "Compra USD",
  });

  assert.equal(exchanges.items.length, 1);
  assert.equal(created.exchange.fromCurrency, "ARS");
  assert.equal(created.exchange.toCurrency, "USD");
  assert.equal(created.exchange.fromAmount, "1500000.00");
  assert.equal(created.exchange.toAmount, "1000.00");
  assert.equal(created.exchange.exchangeRate, "1500.000000");
  assert.equal(created.out.type, "CURRENCY_EXCHANGE");
  assert.equal(created.in.type, "CURRENCY_EXCHANGE");
  assert.equal(created.out.status, "ACTIVE");
  assert.equal(created.in.status, "ACTIVE");
  assert.equal(created.out.amount, "1500000.00");
  assert.equal(created.in.amount, "1000.00");
  assert.equal(created.out.currency, "ARS");
  assert.equal(created.in.currency, "USD");
  assert.equal(created.out.categoryId, null);
  assert.equal(created.in.categoryId, null);
  assert.equal(created.out.relatedTransactionId, null);
  assert.equal(created.in.relatedTransactionId, null);
  assert.deepEqual(created.out.metadata, {
    currencyExchangeId: created.exchange.id,
    direction: "OUT",
  });
  assert.deepEqual(created.in.metadata, {
    currencyExchangeId: created.exchange.id,
    direction: "IN",
  });

  const sourceBalance = await accountService.getBalance(userId, ars.id);
  const destBalance = await accountService.getBalance(userId, usd.id);
  assert.equal(sourceBalance.balance, "0.00");
  assert.equal(destBalance.balance, "1000.00");

  const expenses = await transactions.findByUserId(userId, { type: "EXPENSE" });
  const incomes = await transactions.findByUserId(userId, { type: "INCOME" });
  assert.equal(expenses.length, 0);
  assert.equal(incomes.length, 1);
});

test("CurrencyExchangeService sells USD atomically", async () => {
  const { service, ars, usd, accountService } = await fundedSetup();
  await service.create(userId, {
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "1500000.00",
    exchangeRate: "1500",
  });

  const created = await service.create(userId, {
    fromAccountId: usd.id,
    toAccountId: ars.id,
    fromAmount: "1000.00",
    exchangeRate: "1500",
  });

  assert.equal(created.exchange.fromCurrency, "USD");
  assert.equal(created.exchange.toCurrency, "ARS");
  assert.equal(created.exchange.toAmount, "1500000.00");
  const usdBalance = await accountService.getBalance(userId, usd.id);
  const arsBalance = await accountService.getBalance(userId, ars.id);
  assert.equal(usdBalance.balance, "0.00");
  assert.equal(arsBalance.balance, "1500000.00");
});

test("CurrencyExchangeService applies ROUND_HALF_UP to toAmount", async () => {
  const { service, accounts, transactions, ars, usd } = await fundedSetup();
  const small = await accounts.create({
    userId,
    name: "Cambio chico",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: small.id,
    type: "INCOME",
    amount: "1.00",
    currency: "ARS",
    occurredAt: new Date(),
  });

  const created = await service.create(userId, {
    fromAccountId: small.id,
    toAccountId: usd.id,
    fromAmount: "1.00",
    exchangeRate: "8.000000",
  });

  assert.equal(created.exchange.toAmount, "0.13");
  assert.ok(ars.id);
});

test("CurrencyExchangeService rejects a missing source account", async () => {
  const { service, usd } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: randomUUID(),
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("CurrencyExchangeService rejects a missing destination account", async () => {
  const { service, ars } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: randomUUID(),
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("CurrencyExchangeService rejects another user's source account", async () => {
  const { service, accounts, usd } = await fundedSetup();
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "CASH",
  });
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: foreign.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("CurrencyExchangeService rejects another user's destination account", async () => {
  const { service, accounts, ars } = await fundedSetup();
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena USD",
    currency: "USD",
    type: "BANK",
  });
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: foreign.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("CurrencyExchangeService rejects an inactive source account", async () => {
  const { service, accounts, ars, usd } = await fundedSetup();
  await accounts.update(ars.id, { isActive: false });
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("CurrencyExchangeService rejects an inactive destination account", async () => {
  const { service, accounts, ars, usd } = await fundedSetup();
  await accounts.update(usd.id, { isActive: false });
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("CurrencyExchangeService rejects the same account", async () => {
  const { service, ars } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: ars.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CurrencyExchangeService rejects the same currency", async () => {
  const { service, accounts, ars } = await fundedSetup();
  const otherArs = await accounts.create({
    userId,
    name: "Otro ARS",
    currency: "ARS",
    type: "BANK",
  });
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: otherArs.id,
        fromAmount: "10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("CurrencyExchangeService rejects fromAmount 0 and negative", async () => {
  const { service, ars, usd } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "0",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "-10.00",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CurrencyExchangeService rejects invalid exchangeRate", async () => {
  const { service, ars, usd } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "0",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "-1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "10.00",
        exchangeRate: "1500.0000001",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CurrencyExchangeService rejects insufficient source balance", async () => {
  const { service, ars, usd } = await fundedSetup();
  await assert.rejects(
    () =>
      service.create(userId, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        fromAmount: "1500000.01",
        exchangeRate: "1500",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INSUFFICIENT_BALANCE"
  );
});

test("CurrencyExchangeService rolls back if the incoming leg fails", async () => {
  const { accounts, ars, usd } = await fundedSetup();
  class FailingTx extends MemoryTransactionRepository {
    async create(input: CreateTransactionInput): Promise<Transaction> {
      if (
        input.type === "CURRENCY_EXCHANGE" &&
        input.metadata &&
        typeof input.metadata === "object" &&
        "direction" in input.metadata &&
        input.metadata.direction === "IN"
      ) {
        throw new Error("simulated IN failure");
      }
      return super.create(input);
    }
  }
  const failingTx = new FailingTx();
  await failingTx.create({
    userId,
    accountId: ars.id,
    type: "INCOME",
    amount: "1500000.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  const exchanges = new MemoryCurrencyExchangeRepository(failingTx);
  const service = new CurrencyExchangeService(exchanges, accounts, failingTx);

  await assert.rejects(() =>
    service.create(userId, {
      fromAccountId: ars.id,
      toAccountId: usd.id,
      fromAmount: "1500000.00",
      exchangeRate: "1500",
    })
  );

  assert.equal(exchanges.items.length, 0);
  assert.equal(
    failingTx.items.filter((item) => item.type === "CURRENCY_EXCHANGE").length,
    0
  );
});

test("CurrencyExchangeService rejects PATCH and VOID of a CURRENCY_EXCHANGE leg", async () => {
  const { service, transactionService, ars, usd } = await fundedSetup();
  const created = await service.create(userId, {
    fromAccountId: ars.id,
    toAccountId: usd.id,
    fromAmount: "1500000.00",
    exchangeRate: "1500",
  });

  await assert.rejects(
    () =>
      transactionService.update(userId, created.out.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_EXCHANGE_IMMUTABLE"
  );
  await assert.rejects(
    () => transactionService.void(userId, created.in.id, { idempotencyKey: `void-${randomUUID()}` }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_EXCHANGE_IMMUTABLE"
  );
  assert.ok(DEFAULT_USER_TIMEZONE);
});
