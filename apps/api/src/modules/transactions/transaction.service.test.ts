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
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { TransactionService } from "./transaction.service.js";
import { toCents } from "./transaction-balance.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "./transaction.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";

function matchesOccurredAt(occurredAt: Date, query: FindTransactionsQuery): boolean {
  if (query.occurredAtRanges && query.occurredAtRanges.length > 0) {
    return query.occurredAtRanges.some(
      (range) => occurredAt >= range.gte && occurredAt < range.lt
    );
  }
  if (query.occurredAtGte !== undefined && occurredAt < query.occurredAtGte) {
    return false;
  }
  if (query.occurredAtLt !== undefined && occurredAt >= query.occurredAtLt) {
    return false;
  }
  return true;
}

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

class MemoryCategoryRepository implements CategoryRepository {
  readonly items = new Map<string, Category>();

  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      isSystem: input.isSystem ?? false,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(category.id, category);
    return category;
  }

  async findById(id: string): Promise<Category | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Category[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async findByUserIdAndName(): Promise<Category | null> {
    return null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
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
      .filter(
        (item) =>
          query.categoryId === undefined || item.categoryId === query.categoryId
      )
      .filter(
        (item) => query.currency === undefined || item.currency === query.currency
      )
      .filter(
        (item) => query.accountId === undefined || item.accountId === query.accountId
      )
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.relatedTransactionId === undefined ||
          item.relatedTransactionId === query.relatedTransactionId
      )
      .filter((item) => matchesOccurredAt(item.occurredAt, query))
      .sort((left, right) => {
        const byOccurred = right.occurredAt.getTime() - left.occurredAt.getTime();
        if (byOccurred !== 0) {
          return byOccurred;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
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
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
      ...(input.paymentMethod !== undefined
        ? { paymentMethod: input.paymentMethod }
        : {}),
      ...(input.isFixed !== undefined ? { isFixed: input.isFixed } : {}),
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
}

const userId = randomUUID();

async function setup() {
  const accounts = new MemoryAccountRepository();
  const categories = new MemoryCategoryRepository();
  const transactions = new MemoryTransactionRepository();
  const service = new TransactionService(transactions, accounts, categories);
  const account = await accounts.create({
    userId,
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  const category = await categories.create({
    userId,
    name: "Comida",
    type: "EXPENSE",
  });
  const incomeCategory = await categories.create({
    userId,
    name: "Sueldo",
    type: "INCOME",
  });
  return {
    service,
    accounts,
    categories,
    transactions,
    account,
    category,
    incomeCategory,
  };
}

test("TransactionService creates an ACTIVE EXPENSE", async () => {
  const { service, account, category, transactions } = await setup();

  const created = await service.createExpense(userId, {
    amount: "75.50",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  assert.equal(created.type, "EXPENSE");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.amount, "75.50");
  assert.equal(created.currency, "ARS");
  assert.equal(created.reimbursementStatus, "NONE");
  assert.equal(created.accountId, account.id);
  assert.equal(created.categoryId, category.id);
  assert.equal(created.isFixed, false);
  assert.equal(account.initialBalance, ZERO_INITIAL_BALANCE);
  assert.equal(transactions.items.length, 1);
});

test("TransactionService rejects amount 0", async () => {
  const { service, account, category } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "0",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a negative amount", async () => {
  const { service, account, category } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "-10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects an invalid amount", async () => {
  const { service, account, category } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.123",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a missing account", async () => {
  const { service, category } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: randomUUID(),
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects another user's account", async () => {
  const { service, categories, account } = await setup();
  const otherCategory = await categories.create({
    userId: randomUUID(),
    name: "Ajena",
    type: "EXPENSE",
  });

  await assert.rejects(
    () =>
      service.createExpense(randomUUID(), {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: otherCategory.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects an inactive account", async () => {
  const { service, accounts, account, category } = await setup();
  await accounts.update(account.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("TransactionService rejects a missing category", async () => {
  const { service, account } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: randomUUID(),
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects another user's category", async () => {
  const { service, account, categories } = await setup();
  const foreign = await categories.create({
    userId: randomUUID(),
    name: "Ajena",
    type: "EXPENSE",
  });

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: foreign.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects an inactive category", async () => {
  const { service, account, categories, category } = await setup();
  await categories.update(category.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CATEGORY_INACTIVE"
  );
});

test("TransactionService rejects an INCOME category for EXPENSE", async () => {
  const { service, account, categories } = await setup();
  const income = await categories.create({
    userId,
    name: "Sueldo",
    type: "INCOME",
  });

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: income.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CATEGORY_TYPE_INCOMPATIBLE"
  );
});

test("TransactionService rejects a currency that does not match the account", async () => {
  const { service, account, category } = await setup();

  await assert.rejects(
    () =>
      service.createExpense(userId, {
        amount: "10.00",
        currency: "USD",
        accountId: account.id,
        categoryId: category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("TransactionService creates an OPERATING INCOME", async () => {
  const { service, account, incomeCategory, transactions } = await setup();

  const created = await service.createIncome(userId, {
    amount: "50000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });

  assert.equal(created.type, "INCOME");
  assert.equal(created.status, "ACTIVE");
  assert.equal(created.amount, "50000.00");
  assert.deepEqual(created.metadata, { incomeKind: "OPERATING" });
  assert.equal(account.initialBalance, ZERO_INITIAL_BALANCE);
  assert.equal(transactions.items.length, 1);
});

test("TransactionService creates a CAPITAL INCOME without changing initialBalance", async () => {
  const { service, account, incomeCategory } = await setup();

  const created = await service.createIncome(userId, {
    amount: "39000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
    description: "Capital inicial",
  });

  assert.equal(created.type, "INCOME");
  assert.equal(created.status, "ACTIVE");
  assert.deepEqual(created.metadata, { incomeKind: "CAPITAL" });
  assert.notEqual(
    (created.metadata as { incomeKind: string }).incomeKind,
    "OPERATING"
  );
  assert.equal(account.initialBalance, ZERO_INITIAL_BALANCE);
});

test("TransactionService rejects INCOME amount 0", async () => {
  const { service, account, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "0.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a negative INCOME amount", async () => {
  const { service, account, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "-1.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects INCOME on a missing account", async () => {
  const { service, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: randomUUID(),
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects INCOME on another user's account", async () => {
  const { service, account, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(randomUUID(), {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects INCOME on an inactive account", async () => {
  const { service, accounts, account, incomeCategory } = await setup();
  await accounts.update(account.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "CAPITAL",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("TransactionService rejects INCOME with a currency mismatch", async () => {
  const { service, account, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "USD",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("TransactionService rejects INCOME with a missing category", async () => {
  const { service, account } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: randomUUID(),
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects INCOME with another user's category", async () => {
  const { service, account, categories } = await setup();
  const foreign = await categories.create({
    userId: randomUUID(),
    name: "Ajena",
    type: "INCOME",
  });

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: foreign.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects INCOME with an inactive category", async () => {
  const { service, account, categories, incomeCategory } = await setup();
  await categories.update(incomeCategory.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CATEGORY_INACTIVE"
  );
});

test("TransactionService rejects an EXPENSE category for INCOME", async () => {
  const { service, account, category } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: category.id,
        incomeKind: "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CATEGORY_TYPE_INCOMPATIBLE"
  );
});

test("TransactionService rejects an invalid incomeKind", async () => {
  const { service, account, incomeCategory } = await setup();

  await assert.rejects(
    () =>
      service.createIncome(userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: account.id,
        categoryId: incomeCategory.id,
        incomeKind: "BONUS" as "OPERATING",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService lists movements newest first and includes VOIDED", async () => {
  const { service, transactions, account, category } = await setup();
  const older = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-08-10T12:00:00.000Z"),
  });
  const newer = await service.createExpense(userId, {
    amount: "20.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-08-20T12:00:00.000Z"),
  });
  const voided = await transactions.create({
    userId,
    accountId: account.id,
    categoryId: category.id,
    type: "EXPENSE",
    status: "VOIDED",
    amount: "30.00",
    currency: "ARS",
    occurredAt: new Date("2026-08-15T12:00:00.000Z"),
  });

  const listed = await service.list(userId, {}, DEFAULT_USER_TIMEZONE);

  assert.deepEqual(
    listed.map((item) => item.id),
    [newer.id, voided.id, older.id]
  );
  assert.equal(listed[1]?.status, "VOIDED");
});

test("TransactionService list hides another user's movements", async () => {
  const { service, transactions, account, category } = await setup();
  await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await transactions.create({
    userId: randomUUID(),
    accountId: account.id,
    categoryId: category.id,
    type: "EXPENSE",
    amount: "99.00",
    currency: "ARS",
    occurredAt: new Date("2026-08-01T12:00:00.000Z"),
  });

  const listed = await service.list(userId, {}, DEFAULT_USER_TIMEZONE);

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.userId, userId);
});

test("TransactionService filters by type, category and currency", async () => {
  const { service, transactions, account, category, incomeCategory } =
    await setup();
  const expense = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const income = await service.createIncome(userId, {
    amount: "50.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });
  await transactions.create({
    userId,
    accountId: account.id,
    categoryId: category.id,
    type: "EXPENSE",
    amount: "5.00",
    currency: "USD",
    occurredAt: new Date("2026-08-01T12:00:00.000Z"),
  });

  const byType = await service.list(
    userId,
    { type: "INCOME" },
    DEFAULT_USER_TIMEZONE
  );
  const byCategory = await service.list(
    userId,
    { categoryId: category.id },
    DEFAULT_USER_TIMEZONE
  );
  const byCurrency = await service.list(
    userId,
    { currency: "ARS" },
    DEFAULT_USER_TIMEZONE
  );

  assert.deepEqual(
    byType.map((item) => item.id),
    [income.id]
  );
  assert.equal(byCategory.length, 2);
  assert.ok(byCategory.every((item) => item.categoryId === category.id));
  assert.deepEqual(
    byCurrency.map((item) => item.id).sort(),
    [expense.id, income.id].sort()
  );
});

test("TransactionService filters by accountId and status", async () => {
  const { service, accounts, account, category } = await setup();
  const other = await accounts.create({
    userId,
    name: "Banco",
    currency: "ARS",
    type: "BANK",
  });
  const first = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.createExpense(userId, {
    amount: "20.00",
    currency: "ARS",
    accountId: other.id,
    categoryId: category.id,
  });
  const voided = await service.createExpense(userId, {
    amount: "30.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.void(userId, voided.id);

  const byAccount = await service.list(
    userId,
    { accountId: account.id },
    DEFAULT_USER_TIMEZONE
  );
  const byStatus = await service.list(
    userId,
    { status: "VOIDED" },
    DEFAULT_USER_TIMEZONE
  );

  assert.equal(byAccount.length, 2);
  assert.ok(byAccount.every((item) => item.accountId === account.id));
  assert.ok(byAccount.some((item) => item.id === first.id));
  assert.deepEqual(
    byStatus.map((item) => item.id),
    [voided.id]
  );
});

test("TransactionService filters month using the user timezone", async () => {
  const { service, account, category } = await setup();
  const stillJuly = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-08-01T02:00:00.000Z"),
  });
  const august = await service.createExpense(userId, {
    amount: "20.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-08-01T03:00:00.000Z"),
  });

  const listed = await service.list(
    userId,
    { year: 2026, month: 8 },
    DEFAULT_USER_TIMEZONE
  );

  assert.deepEqual(
    listed.map((item) => item.id),
    [august.id]
  );
  assert.equal(stillJuly.occurredAt.toISOString(), "2026-08-01T02:00:00.000Z");
});

test("TransactionService filters by calendar month without year", async () => {
  const { service, account, category, incomeCategory } = await setup();
  const june = await service.createExpense(userId, {
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-06-15T15:00:00.000Z"),
  });
  await service.createExpense(userId, {
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-07-15T15:00:00.000Z"),
  });
  await service.createExpense(userId, {
    amount: "2000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
    occurredAt: new Date("2026-08-15T15:00:00.000Z"),
  });
  await service.createIncome(userId, {
    amount: "40000000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
    occurredAt: new Date("2026-09-01T15:00:00.000Z"),
  });

  const onlyJune = await service.list(userId, { month: 6 }, DEFAULT_USER_TIMEZONE);
  const onlyJuly = await service.list(userId, { month: 7 }, DEFAULT_USER_TIMEZONE);
  const august2026 = await service.list(
    userId,
    { year: 2026, month: 8 },
    DEFAULT_USER_TIMEZONE
  );
  const all = await service.list(userId, {}, DEFAULT_USER_TIMEZONE);

  assert.deepEqual(
    onlyJune.map((item) => item.id),
    [june.id]
  );
  assert.equal(onlyJuly.length, 1);
  assert.equal(onlyJuly[0]?.occurredAt.toISOString(), "2026-07-15T15:00:00.000Z");
  assert.equal(august2026.length, 1);
  assert.equal(august2026[0]?.occurredAt.toISOString(), "2026-08-15T15:00:00.000Z");
  assert.equal(all.length, 4);
});

test("TransactionService rejects an incomplete month filter", async () => {
  const { service } = await setup();

  await assert.rejects(
    () => service.list(userId, { year: 2026 }, DEFAULT_USER_TIMEZONE),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService updates an ACTIVE expense amount and category", async () => {
  const { service, account, category, categories } = await setup();
  const other = await categories.create({
    userId,
    name: "Nafta",
    type: "EXPENSE",
  });
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const updated = await service.update(userId, created.id, {
    amount: "25.50",
    categoryId: other.id,
    description: "Nafta actualizada",
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.type, "EXPENSE");
  assert.equal(updated.status, "ACTIVE");
  assert.equal(updated.amount, "25.50");
  assert.equal(updated.categoryId, other.id);
  assert.equal(updated.description, "Nafta actualizada");
  assert.equal(updated.userId, userId);
});

test("TransactionService rejects editing another user's movement", async () => {
  const { service, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () => service.update(randomUUID(), created.id, { amount: "11.00" }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects editing a VOIDED movement", async () => {
  const { service, transactions, account, category } = await setup();
  const voided = await transactions.create({
    userId,
    accountId: account.id,
    categoryId: category.id,
    type: "EXPENSE",
    status: "VOIDED",
    amount: "10.00",
    currency: "ARS",
    occurredAt: new Date(),
  });

  await assert.rejects(
    () => service.update(userId, voided.id, { amount: "11.00" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_VOIDED"
  );
});

test("TransactionService rejects an EXPENSE category when editing INCOME", async () => {
  const { service, account, category, incomeCategory } = await setup();
  const created = await service.createIncome(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });

  await assert.rejects(
    () => service.update(userId, created.id, { categoryId: category.id }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CATEGORY_TYPE_INCOMPATIBLE"
  );
});

test("TransactionService rejects amount 0 on update", async () => {
  const { service, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () => service.update(userId, created.id, { amount: "0.00" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService voids an ACTIVE movement without deleting it", async () => {
  const { service, transactions, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "40.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const voided = await service.void(userId, created.id);

  assert.equal(voided.id, created.id);
  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.amount, "40.00");
  assert.equal(voided.type, "EXPENSE");
  assert.equal(transactions.items.length, 1);
  assert.equal(transactions.items[0]?.id, created.id);
});

test("TransactionService rejects voiding another user's movement", async () => {
  const { service, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () => service.void(randomUUID(), created.id),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects voiding an already VOIDED movement", async () => {
  const { service, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.void(userId, created.id);

  await assert.rejects(
    () => service.void(userId, created.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_ALREADY_VOIDED"
  );
});

test("TransactionService rejects voiding a related movement without cascade", async () => {
  const { service, transactions, account, category } = await setup();
  const created = await service.createExpense(userId, {
    amount: "10.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  transactions.items[0]!.relatedTransactionId = randomUUID();

  await assert.rejects(
    () => service.void(userId, created.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_RELATED"
  );
});

test("TransactionService registers a partial reimbursement and updates status", async () => {
  const { service, account, category, transactions } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  const reimbursement = await service.registerReimbursement(userId, expense.id, {
    amount: "40.00",
    accountId: account.id,
  });

  assert.equal(reimbursement.type, "REIMBURSEMENT");
  assert.equal(reimbursement.status, "ACTIVE");
  assert.equal(reimbursement.amount, "40.00");
  assert.equal(reimbursement.currency, "ARS");
  assert.equal(reimbursement.accountId, account.id);
  assert.equal(reimbursement.categoryId, null);
  assert.equal(reimbursement.relatedTransactionId, expense.id);
  assert.equal(reimbursement.userId, userId);
  assert.equal(transactions.items.length, 2);
  assert.equal(
    (await transactions.findById(expense.id))?.reimbursementStatus,
    "PARTIAL"
  );
  const net = await service.getNetExpense(userId, expense.id);
  assert.equal(net.grossAmount, "100.00");
  assert.equal(net.netAmount, "60.00");
  assert.equal(net.reimbursementStatus, "PARTIAL");
});

test("TransactionService completes a reimbursement at the original amount", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await service.registerReimbursement(userId, expense.id, {
    amount: "100.00",
    accountId: account.id,
  });

  const net = await service.getNetExpense(userId, expense.id);
  assert.equal(net.netAmount, "0.00");
  assert.equal(net.reimbursementStatus, "COMPLETED");
});

test("TransactionService allows multiple partial reimbursements", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await service.registerReimbursement(userId, expense.id, {
    amount: "25.00",
    accountId: account.id,
  });
  await service.registerReimbursement(userId, expense.id, {
    amount: "30.00",
    accountId: account.id,
  });

  const net = await service.getNetExpense(userId, expense.id);
  assert.equal(net.netAmount, "45.00");
  assert.equal(net.reimbursementStatus, "PARTIAL");
});

test("TransactionService rejects over-reimbursement", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.registerReimbursement(userId, expense.id, {
    amount: "80.00",
    accountId: account.id,
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "25.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "REIMBURSEMENT_EXCEEDS_PENDING"
  );
});

test("TransactionService rejects reimbursement amount 0", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "0.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a negative reimbursement", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "-10.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a missing expense", async () => {
  const { service, account } = await setup();

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, randomUUID(), {
        amount: "10.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects reimbursement on another user's expense", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(randomUUID(), expense.id, {
        amount: "10.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects reimbursement on a VOIDED expense", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.void(userId, expense.id);

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "10.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_VOIDED"
  );
});

test("TransactionService rejects reimbursement on INCOME", async () => {
  const { service, account, incomeCategory } = await setup();
  const income = await service.createIncome(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "OPERATING",
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, income.id, {
        amount: "10.00",
        accountId: account.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_TYPE_INCOMPATIBLE"
  );
});

test("TransactionService rejects a missing receiving account", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "10.00",
        accountId: randomUUID(),
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects another user's receiving account", async () => {
  const { service, accounts, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "CASH",
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "10.00",
        accountId: foreign.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );
});

test("TransactionService rejects an inactive receiving account", async () => {
  const { service, accounts, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const receiving = await accounts.create({
    userId,
    name: "Receptora",
    currency: "ARS",
    type: "BANK",
  });
  await accounts.update(receiving.id, { isActive: false });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "10.00",
        accountId: receiving.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("TransactionService rejects a currency mismatch on reimbursement", async () => {
  const { service, accounts, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const usd = await accounts.create({
    userId,
    name: "USD",
    currency: "USD",
    type: "BANK",
  });

  await assert.rejects(
    () =>
      service.registerReimbursement(userId, expense.id, {
        amount: "10.00",
        accountId: usd.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("TransactionService net expense ignores VOIDED reimbursements", async () => {
  const { service, transactions, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.registerReimbursement(userId, expense.id, {
    amount: "25.00",
    accountId: account.id,
  });
  await transactions.create({
    userId,
    accountId: account.id,
    type: "REIMBURSEMENT",
    status: "VOIDED",
    amount: "30.00",
    currency: "ARS",
    occurredAt: new Date(),
    relatedTransactionId: expense.id,
  });

  const net = await service.getNetExpense(userId, expense.id);
  assert.equal(net.netAmount, "75.00");
});

test("TransactionService net expense rejects a VOIDED expense", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  await service.void(userId, expense.id);

  await assert.rejects(
    () => service.getNetExpense(userId, expense.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_VOIDED"
  );
});

test("TransactionService rejects voiding an expense that has reimbursements", async () => {
  const { service, account, category } = await setup();
  const expense = await service.createExpense(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: category.id,
  });
  const reimbursement = await service.registerReimbursement(userId, expense.id, {
    amount: "40.00",
    accountId: account.id,
  });

  await assert.rejects(
    () => service.void(userId, expense.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_RELATED"
  );
  await assert.rejects(
    () => service.void(userId, reimbursement.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSACTION_RELATED"
  );
});

async function fundedTransferSetup() {
  const ctx = await setup();
  const destination = await ctx.accounts.create({
    userId,
    name: "Banco",
    currency: "ARS",
    type: "BANK",
  });
  await ctx.service.createIncome(userId, {
    amount: "1000.00",
    currency: "ARS",
    accountId: ctx.account.id,
    categoryId: ctx.incomeCategory.id,
    incomeKind: "CAPITAL",
  });
  await ctx.service.createIncome(userId, {
    amount: "100.00",
    currency: "ARS",
    accountId: destination.id,
    categoryId: ctx.incomeCategory.id,
    incomeKind: "CAPITAL",
  });
  return {
    ...ctx,
    destination,
    accountService: new AccountService(ctx.accounts, ctx.transactions),
  };
}

test("TransactionService creates an atomic same-currency transfer", async () => {
  const { service, account, destination, accountService } =
    await fundedTransferSetup();

  const created = await service.createTransfer(userId, {
    sourceAccountId: account.id,
    destinationAccountId: destination.id,
    amount: "300.00",
    description: "Ahorro",
  });

  assert.equal(created.out.type, "TRANSFER");
  assert.equal(created.in.type, "TRANSFER");
  assert.equal(created.out.status, "ACTIVE");
  assert.equal(created.in.status, "ACTIVE");
  assert.equal(created.out.amount, "300.00");
  assert.equal(created.in.amount, "300.00");
  assert.equal(created.out.currency, "ARS");
  assert.equal(created.in.currency, "ARS");
  assert.equal(created.out.categoryId, null);
  assert.equal(created.in.categoryId, null);
  assert.equal(created.out.relatedTransactionId, null);
  assert.equal(created.in.relatedTransactionId, null);
  assert.equal(created.out.accountId, account.id);
  assert.equal(created.in.accountId, destination.id);
  assert.deepEqual(created.out.metadata, {
    transferId: created.transferId,
    direction: "OUT",
  });
  assert.deepEqual(created.in.metadata, {
    transferId: created.transferId,
    direction: "IN",
  });
  assert.match(
    created.transferId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  const sourceBalance = await accountService.getBalance(userId, account.id);
  const destinationBalance = await accountService.getBalance(
    userId,
    destination.id
  );
  assert.equal(sourceBalance.balance, "700.00");
  assert.equal(destinationBalance.balance, "400.00");
});

test("TransactionService transfer does not change combined wealth or count as EXPENSE/INCOME", async () => {
  const { service, account, destination, accountService } =
    await fundedTransferSetup();
  const beforeSource = await accountService.getBalance(userId, account.id);
  const beforeDestination = await accountService.getBalance(
    userId,
    destination.id
  );

  await service.createTransfer(userId, {
    sourceAccountId: account.id,
    destinationAccountId: destination.id,
    amount: "300.00",
  });

  const afterSource = await accountService.getBalance(userId, account.id);
  const afterDestination = await accountService.getBalance(
    userId,
    destination.id
  );
  assert.equal(
    toCents(beforeSource.balance) + toCents(beforeDestination.balance),
    toCents(afterSource.balance) + toCents(afterDestination.balance)
  );

  const expenses = await service.list(
    userId,
    { type: "EXPENSE" },
    DEFAULT_USER_TIMEZONE
  );
  const incomes = await service.list(
    userId,
    { type: "INCOME" },
    DEFAULT_USER_TIMEZONE
  );
  const transfers = await service.list(
    userId,
    { type: "TRANSFER" },
    DEFAULT_USER_TIMEZONE
  );
  assert.equal(expenses.length, 0);
  assert.equal(incomes.length, 2);
  assert.equal(transfers.length, 2);
  assert.ok(incomes.every((item) => item.type === "INCOME"));
  assert.ok(transfers.every((item) => item.type === "TRANSFER"));
});

test("TransactionService rejects a transfer from a missing source account", async () => {
  const { service, destination } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: randomUUID(),
        destinationAccountId: destination.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("TransactionService rejects a transfer to a missing destination account", async () => {
  const { service, account } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: randomUUID(),
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("TransactionService rejects a transfer from another user's source account", async () => {
  const { service, accounts, destination } = await fundedTransferSetup();
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "CASH",
  });

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: foreign.id,
        destinationAccountId: destination.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("TransactionService rejects a transfer to another user's destination account", async () => {
  const { service, accounts, account } = await fundedTransferSetup();
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "BANK",
  });

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: foreign.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("TransactionService rejects a transfer from an inactive source account", async () => {
  const { service, accounts, account, destination } = await fundedTransferSetup();
  await accounts.update(account.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("TransactionService rejects a transfer to an inactive destination account", async () => {
  const { service, accounts, account, destination } = await fundedTransferSetup();
  await accounts.update(destination.id, { isActive: false });

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("TransactionService rejects a transfer to the same account", async () => {
  const { service, account } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: account.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a transfer between different currencies", async () => {
  const { service, accounts, account, incomeCategory } = await fundedTransferSetup();
  const usd = await accounts.create({
    userId,
    name: "USD",
    currency: "USD",
    type: "BANK",
  });
  await service.createIncome(userId, {
    amount: "50.00",
    currency: "USD",
    accountId: usd.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
  });

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: usd.id,
        amount: "10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("TransactionService rejects a transfer with amount 0", async () => {
  const { service, account, destination } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        amount: "0",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a transfer with a negative amount", async () => {
  const { service, account, destination } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        amount: "-10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("TransactionService rejects a transfer with insufficient source balance", async () => {
  const { service, account, destination } = await fundedTransferSetup();

  await assert.rejects(
    () =>
      service.createTransfer(userId, {
        sourceAccountId: account.id,
        destinationAccountId: destination.id,
        amount: "1000.01",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INSUFFICIENT_BALANCE"
  );
});

test("TransactionService rolls back both legs if the incoming TRANSFER fails", async () => {
  const { accounts, categories, account, incomeCategory } = await setup();
  class FailingIncomingRepository extends MemoryTransactionRepository {
    async create(input: CreateTransactionInput): Promise<Transaction> {
      if (
        input.type === "TRANSFER" &&
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
  const transactions = new FailingIncomingRepository();
  const service = new TransactionService(transactions, accounts, categories);
  const destination = await accounts.create({
    userId,
    name: "Banco",
    currency: "ARS",
    type: "BANK",
  });
  await service.createIncome(userId, {
    amount: "1000.00",
    currency: "ARS",
    accountId: account.id,
    categoryId: incomeCategory.id,
    incomeKind: "CAPITAL",
  });

  await assert.rejects(() =>
    service.createTransfer(userId, {
      sourceAccountId: account.id,
      destinationAccountId: destination.id,
      amount: "300.00",
    })
  );

  assert.equal(
    transactions.items.filter((item) => item.type === "TRANSFER").length,
    0
  );
  assert.equal(
    transactions.items.filter((item) => item.type === "INCOME").length,
    1
  );
});

test("TransactionService rejects PATCH of an individual TRANSFER leg", async () => {
  const { service, account, destination } = await fundedTransferSetup();
  const created = await service.createTransfer(userId, {
    sourceAccountId: account.id,
    destinationAccountId: destination.id,
    amount: "300.00",
  });

  await assert.rejects(
    () => service.update(userId, created.out.id, { description: "editada" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
  );
  await assert.rejects(
    () => service.update(userId, created.in.id, { amount: "10.00" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
  );
});

test("TransactionService rejects VOID of an individual TRANSFER leg", async () => {
  const { service, account, destination } = await fundedTransferSetup();
  const created = await service.createTransfer(userId, {
    sourceAccountId: account.id,
    destinationAccountId: destination.id,
    amount: "300.00",
  });

  await assert.rejects(
    () => service.void(userId, created.out.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
  );
  await assert.rejects(
    () => service.void(userId, created.in.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "TRANSFER_IMMUTABLE"
  );
});
