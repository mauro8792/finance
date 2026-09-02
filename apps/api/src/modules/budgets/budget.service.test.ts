import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { zonedLocalToUtc } from "../../shared/time/month-range.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { PrismaBudgetRepository } from "./budget.repository.js";
import { BudgetService } from "./budget.service.js";
import type { Budget, BudgetRepository, CreateBudgetInput } from "./budget.types.js";

const TZ = DEFAULT_USER_TIMEZONE;
const YEAR = 2026;
const MONTH = 8;

class MemoryBudgetRepository implements BudgetRepository {
  readonly items = new Map<string, Budget>();

  async create(input: CreateBudgetInput): Promise<Budget> {
    const now = new Date();
    const budget: Budget = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(budget.id, budget);
    return budget;
  }

  async findById(id: string): Promise<Budget | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Budget[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async findByUserCategoryPeriod(
    userId: string,
    categoryId: string,
    currency: CreateBudgetInput["currency"],
    year: number,
    month: number
  ): Promise<Budget | null> {
    return (
      [...this.items.values()].find(
        (item) =>
          item.userId === userId &&
          item.categoryId === categoryId &&
          item.currency === currency &&
          item.year === year &&
          item.month === month
      ) ?? null
    );
  }

  async findByUserPeriod(
    userId: string,
    year: number,
    month: number
  ): Promise<Budget[]> {
    return [...this.items.values()].filter(
      (item) => item.userId === userId && item.year === year && item.month === month
    );
  }

  async update(id: string, input: { amount: string }): Promise<Budget> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, amount: input.amount, updatedAt: new Date() };
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

class MemoryUserRepository implements UserRepository {
  constructor(private readonly user: User) {}

  async create(): Promise<User> {
    throw new Error("unused");
  }

  async findById(id: string): Promise<User | null> {
    return id === this.user.id ? this.user : null;
  }

  async findFirst(): Promise<User | null> {
    return this.user;
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
      .filter((item) => query.currency === undefined || item.currency === query.currency)
      .filter((item) => query.accountId === undefined || item.accountId === query.accountId)
      .filter((item) => query.categoryId === undefined || item.categoryId === query.categoryId)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.relatedTransactionId === undefined ||
          item.relatedTransactionId === query.relatedTransactionId
      )
      .filter(
        (item) =>
          query.occurredAtGte === undefined || item.occurredAt >= query.occurredAtGte
      )
      .filter(
        (item) =>
          query.occurredAtLt === undefined || item.occurredAt < query.occurredAtLt
      );
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(): Promise<Transaction> {
    throw new Error("unused");
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
}

function userOf(id: string): User {
  const now = new Date();
  return {
    id,
    name: "QA Budget",
    email: null,
    timezone: TZ,
    createdAt: now,
    updatedAt: now,
  };
}

function midMonth(year = YEAR, month = MONTH, day = 15): Date {
  return zonedLocalToUtc(year, month, day, 12, 0, 0, TZ);
}

async function setup() {
  const userId = randomUUID();
  const accountId = randomUUID();
  const budgets = new MemoryBudgetRepository();
  const transactions = new MemoryTransactionRepository();
  const categories = new MemoryCategoryRepository();
  const category = await categories.create({
    userId,
    name: "Comida",
    type: "EXPENSE",
  });
  const otherCategory = await categories.create({
    userId,
    name: "Nafta",
    type: "EXPENSE",
  });
  const service = new BudgetService(
    budgets,
    transactions,
    new MemoryUserRepository(userOf(userId)),
    categories
  );
  const budget = await budgets.create({
    userId,
    categoryId: category.id,
    currency: "ARS",
    amount: "200000.00",
    year: YEAR,
    month: MONTH,
  });

  return {
    userId,
    categoryId: category.id,
    otherCategoryId: otherCategory.id,
    accountId,
    budgets,
    transactions,
    categories,
    service,
    budget,
  };
}

async function addExpense(
  transactions: MemoryTransactionRepository,
  input: {
    userId: string;
    accountId: string;
    categoryId: string;
    amount: string;
    occurredAt?: Date;
    status?: Transaction["status"];
    currency?: Transaction["currency"];
    type?: Transaction["type"];
    relatedTransactionId?: string | null;
  }
): Promise<Transaction> {
  return transactions.create({
    userId: input.userId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: input.type ?? "EXPENSE",
    status: input.status ?? "ACTIVE",
    amount: input.amount,
    currency: input.currency ?? "ARS",
    occurredAt: input.occurredAt ?? midMonth(),
    relatedTransactionId: input.relatedTransactionId ?? null,
  });
}

test("BudgetService progress is zero without expenses", async () => {
  const { service, budget } = await setup();
  const progress = await service.getProgress(budget.id);
  const available = await service.getAvailable(budget.id);

  assert.equal(progress.consumption, "0.00");
  assert.equal(progress.usedPercent, "0.00");
  assert.equal(available.available, "200000.00");
});

test("BudgetService counts an ACTIVE expense of the budget category", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "147500.00",
  });

  const progress = await service.getProgress(budget.id);
  assert.equal(progress.consumption, "147500.00");
  assert.equal(progress.usedPercent, "73.75");
});

test("BudgetService ignores an expense of another category", async () => {
  const { service, budget, transactions, userId, accountId, otherCategoryId } =
    await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId: otherCategoryId,
    amount: "80000.00",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService ignores a VOIDED expense", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "50000.00",
    status: "VOIDED",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService ignores HOUSING_PAYMENT even if category matches", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "500.00",
    type: "HOUSING_PAYMENT",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService ignores INVESTMENT_OUTFLOW even if category matches", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "100000.00",
    type: "INVESTMENT_OUTFLOW",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService ignores INVESTMENT_PRINCIPAL_RETURN and INVESTMENT_RETURN", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "100000.00",
    type: "INVESTMENT_PRINCIPAL_RETURN",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "560.00",
    type: "INVESTMENT_RETURN",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService subtracts a partial ACTIVE reimbursement", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  const expense = await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "100000.00",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "25000.00",
    type: "REIMBURSEMENT",
    relatedTransactionId: expense.id,
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "75000.00");
});

test("BudgetService reaches zero consumption when the expense is fully reimbursed", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  const expense = await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "40000.00",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "40000.00",
    type: "REIMBURSEMENT",
    relatedTransactionId: expense.id,
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService ignores a VOIDED reimbursement", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  const expense = await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "80000.00",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "80000.00",
    type: "REIMBURSEMENT",
    status: "VOIDED",
    relatedTransactionId: expense.id,
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "80000.00");
});

test("BudgetService does not consume budget from income, transfer or currency exchange", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "90000.00",
    type: "INCOME",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "90000.00",
    type: "TRANSFER",
  });
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "90000.00",
    type: "CURRENCY_EXCHANGE",
  });

  assert.equal((await service.getProgress(budget.id)).consumption, "0.00");
});

test("BudgetService available is amount minus consumption and can be negative", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "145000.00",
  });
  assert.equal((await service.getAvailable(budget.id)).available, "55000.00");

  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "100000.00",
  });
  const over = await service.getAvailable(budget.id);
  assert.equal(over.consumption, "245000.00");
  assert.equal(over.available, "-45000.00");
  assert.equal((await service.getProgress(budget.id)).usedPercent, "122.50");
});

test("BudgetService spending pace compares consumption to elapsed calendar days", async () => {
  const { service, budget, transactions, userId, accountId, categoryId } = await setup();
  await addExpense(transactions, {
    userId,
    accountId,
    categoryId,
    amount: "140000.00",
    occurredAt: midMonth(YEAR, MONTH, 10),
  });

  const asOf = zonedLocalToUtc(YEAR, MONTH, 10, 18, 0, 0, TZ);
  const pace = await service.getSpendingPace(budget.id, asOf);

  assert.equal(pace.elapsedDays, 10);
  assert.equal(pace.totalDays, 31);
  assert.equal(pace.monthProgressPercent, "32.26");
  assert.equal(pace.budgetProgressPercent, "70.00");
  assert.equal(pace.aboveExpectedPace, true);
});

test("BudgetService spending pace uses Argentina calendar day around UTC midnight", async () => {
  const { service, budget } = await setup();
  const stillAugust = await service.getSpendingPace(
    budget.id,
    new Date("2026-09-01T02:00:00.000Z")
  );
  assert.equal(stillAugust.elapsedDays, 31);
  assert.equal(stillAugust.totalDays, 31);

  const septemberInArgentina = await service.getSpendingPace(
    budget.id,
    new Date("2026-09-01T04:00:00.000Z")
  );
  assert.equal(septemberInArgentina.elapsedDays, 31);
  assert.equal(septemberInArgentina.totalDays, 31);
});

test("BudgetService QA fixture on PostgreSQL: Comida 300000 with net 120000", async () => {
  const users = new PrismaUserRepository();
  const categories = new PrismaCategoryRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const budgets = new PrismaBudgetRepository();
  const prisma = getPrismaClient();
  const service = new BudgetService(budgets, transactions, users, categories);

  const user = await users.create({ name: "QA Budget M4.2" });
  const category = await categories.create({
    userId: user.id,
    name: `Comida M4.2 ${Date.now()}`,
    type: "EXPENSE",
  });
  const account = await accounts.create({
    userId: user.id,
    name: `Caja M4.2 ${Date.now()}`,
    currency: "ARS",
    type: "CASH",
    initialBalance: ZERO_INITIAL_BALANCE,
  });

  try {
    const budget = await budgets.create({
      userId: user.id,
      categoryId: category.id,
      currency: "ARS",
      amount: "300000.00",
      year: YEAR,
      month: MONTH,
    });
    await transactions.create({
      userId: user.id,
      accountId: account.id,
      categoryId: category.id,
      type: "EXPENSE",
      amount: "120000.00",
      currency: "ARS",
      occurredAt: midMonth(),
    });

    const progress = await service.getProgress(budget.id);
    const available = await service.getAvailable(budget.id);

    assert.equal(progress.consumption, "120000.00");
    assert.equal(progress.usedPercent, "40.00");
    assert.equal(available.available, "180000.00");

    const listed = await service.listByPeriod(user.id, YEAR, MONTH);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.amount, "300000.00");
    assert.equal(listed[0]?.consumption, "120000.00");
    assert.equal(listed[0]?.available, "180000.00");
    assert.equal(listed[0]?.usedPercent, "40.00");
    assert.equal(listed[0]?.category.name, category.name);
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.budget.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: account.id } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("BudgetService create rejects amount 0 and an INCOME category", async () => {
  const { service, userId, categoryId, categories } = await setup();
  await assert.rejects(
    () =>
      service.create(userId, {
        categoryId,
        amount: "0.00",
        currency: "ARS",
        year: YEAR,
        month: MONTH,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("mayor que 0")
  );

  const income = await categories.create({
    userId,
    name: "Sueldo",
    type: "INCOME",
  });
  await assert.rejects(
    () =>
      service.create(userId, {
        categoryId: income.id,
        amount: "100.00",
        currency: "ARS",
        year: YEAR,
        month: MONTH,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("EXPENSE o BOTH")
  );
});
