import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import { AccountService } from "./account.service.js";
import {
  ZERO_INITIAL_BALANCE,
  type Account,
  type AccountRepository,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "./account.types.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";

class MemoryAccountRepository implements AccountRepository {
  private readonly items = new Map<string, Account>();

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
    return [...this.items.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated: Account = {
      ...current,
      ...input,
      updatedAt: new Date(),
    };
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

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.relatedTransactionId === undefined ||
          item.relatedTransactionId === query.relatedTransactionId
      );
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
      ...(input.reimbursementStatus !== undefined
        ? { reimbursementStatus: input.reimbursementStatus }
        : {}),
      updatedAt: new Date(),
    };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: Transaction["reimbursementStatus"] }
  ): Promise<Transaction> {
    const created = await this.create(input);
    await this.update(expense.id, {
      reimbursementStatus: expense.reimbursementStatus,
    });
    return created;
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    const snapshot = this.items.slice();
    try {
      const out = await this.create(outgoing);
      const inn = await this.create(incoming);
      return [out, inn];
    } catch (error) {
      this.items.splice(0, this.items.length, ...snapshot);
      throw error;
    }
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

function createService(transactions = new MemoryTransactionRepository()) {
  return {
    service: new AccountService(new MemoryAccountRepository(), transactions),
    transactions,
  };
}

const userId = randomUUID();

test("AccountService creates an account at zero and lists it", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());

  const created = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  const listed = await service.list(userId);

  assert.equal(created.name, "Efectivo");
  assert.equal(created.currency, "ARS");
  assert.equal(created.type, "CASH");
  assert.equal(created.initialBalance, ZERO_INITIAL_BALANCE);
  assert.equal(created.isActive, true);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
});

test("AccountService lists accounts for the same user", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());
  await service.create(userId, { name: "Banco", currency: "ARS", type: "BANK" });
  await service.create(userId, { name: "Fondo", currency: "USD", type: "FUND" });

  const listed = await service.list(userId);

  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.name, "Banco");
  assert.equal(listed[1]?.name, "Fondo");
});

test("AccountService rejects an empty name", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());

  await assert.rejects(
    () => service.create(userId, { name: "  ", currency: "ARS", type: "CASH" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("AccountService rejects an invalid currency", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());

  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Efectivo",
        currency: "EUR" as "ARS",
        type: "CASH",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("AccountService rejects an invalid account type", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());

  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Efectivo",
        currency: "ARS",
        type: "CREDIT_CARD" as "CASH",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("AccountService hides other users on update", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());
  const otherUserId = randomUUID();
  const created = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });

  await assert.rejects(
    () => service.update(otherUserId, created.id, { name: "Otro" }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("AccountService deactivates without deleting", async () => {
  const service = new AccountService(new MemoryAccountRepository(), new MemoryTransactionRepository());
  const created = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });

  const deactivated = await service.deactivate(userId, created.id);
  assert.equal(deactivated.isActive, false);

  const listed = await service.list(userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
  assert.equal(listed[0]?.isActive, false);

  const reactivated = await service.activate(userId, created.id);
  assert.equal(reactivated.isActive, true);
});

test("AccountService balance credits INCOME including CAPITAL", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Fondo",
    currency: "ARS",
    type: "FUND",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "100.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { incomeKind: "OPERATING" },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "50.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { incomeKind: "CAPITAL" },
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.accountId, account.id);
  assert.equal(result.currency, "ARS");
  assert.equal(result.balance, "150.00");
  assert.equal(account.initialBalance, ZERO_INITIAL_BALANCE);
});

test("AccountService balance debits EXPENSE", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "100.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "EXPENSE",
    amount: "30.50",
    currency: "ARS",
    occurredAt: new Date(),
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "69.50");
});

test("AccountService balance debits HOUSING_PAYMENT even without metadata", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Reserva",
    currency: "USD",
    type: "HOUSING_RESERVE",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "2000.00",
    currency: "USD",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "HOUSING_PAYMENT",
    amount: "500.00",
    currency: "USD",
    occurredAt: new Date(),
    metadata: {
      housingPaymentId: randomUUID(),
      housingObligationId: randomUUID(),
    },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "HOUSING_PAYMENT",
    amount: "100.00",
    currency: "USD",
    occurredAt: new Date(),
    metadata: null,
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "1400.00");
});

test("AccountService balance debits INVESTMENT_OUTFLOW even without metadata", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Banco",
    currency: "ARS",
    type: "BANK",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INVESTMENT_OUTFLOW",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { investmentId: randomUUID() },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INVESTMENT_OUTFLOW",
    amount: "50000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: null,
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "350000.00");
});

test("AccountService balance credits INVESTMENT_PRINCIPAL_RETURN and INVESTMENT_RETURN", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Banco",
    currency: "ARS",
    type: "BANK",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INVESTMENT_OUTFLOW",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { investmentId: randomUUID() },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INVESTMENT_PRINCIPAL_RETURN",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { investmentId: randomUUID() },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INVESTMENT_RETURN",
    amount: "560.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: null,
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "500560.00");
});

test("AccountService balance ignores VOIDED movements", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "100.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "EXPENSE",
    status: "VOIDED",
    amount: "40.00",
    currency: "ARS",
    occurredAt: new Date(),
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "100.00");
});

test("AccountService balance credits REIMBURSEMENT", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "EXPENSE",
    amount: "100.00",
    currency: "ARS",
    occurredAt: new Date(),
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "REIMBURSEMENT",
    amount: "30.00",
    currency: "ARS",
    occurredAt: new Date(),
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "-70.00");
});

test("AccountService balance debits TRANSFER OUT and credits TRANSFER IN", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { incomeKind: "CAPITAL" },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "TRANSFER",
    amount: "300.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { transferId: randomUUID(), direction: "OUT" },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "TRANSFER",
    amount: "50.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { transferId: randomUUID(), direction: "IN" },
  });

  const result = await service.getBalance(userId, account.id);

  assert.equal(result.balance, "750.00");
});

test("AccountService balance fails when TRANSFER metadata has no valid direction", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "TRANSFER",
    amount: "300.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { transferId: randomUUID() } as unknown as CreateTransactionInput["metadata"],
  });

  await assert.rejects(
    () => service.getBalance(userId, account.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVALID_TRANSFER_METADATA"
  );
});

test("AccountService balance debits CURRENCY_EXCHANGE OUT and credits IN", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "INCOME",
    amount: "1500000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { incomeKind: "CAPITAL" },
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "CURRENCY_EXCHANGE",
    amount: "1500000.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { currencyExchangeId: randomUUID(), direction: "OUT" },
  });

  const result = await service.getBalance(userId, account.id);
  assert.equal(result.balance, "0.00");
});

test("AccountService balance fails when CURRENCY_EXCHANGE metadata is invalid", async () => {
  const { service, transactions } = createService();
  const account = await service.create(userId, {
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "CURRENCY_EXCHANGE",
    amount: "100.00",
    currency: "ARS",
    occurredAt: new Date(),
    metadata: { direction: "OUT" } as unknown as CreateTransactionInput["metadata"],
  });

  await assert.rejects(
    () => service.getBalance(userId, account.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVALID_CURRENCY_EXCHANGE_METADATA"
  );
});

test("AccountService balance rejects another user's account", async () => {
  const { service } = createService();
  const account = await service.create(userId, {
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });

  await assert.rejects(
    () => service.getBalance(randomUUID(), account.id),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});
