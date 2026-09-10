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
import { BudgetService } from "../budgets/budget.service.js";
import type {
  Budget,
  BudgetRepository,
  CreateBudgetInput,
  UpdateBudgetRecord,
} from "../budgets/budget.types.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { computeCurrentCardDebt } from "../credit-cards/credit-card-debt.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "../credit-cards/credit-card.types.js";
import { FinancialService } from "../financial/financial.service.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { computeBalance } from "./transaction-balance.js";
import { TransactionService } from "./transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "./transaction.types.js";

const TZ = DEFAULT_USER_TIMEZONE;

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
      initialBalance: input.initialBalance ?? "0.00",
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
    if (!current) throw new Error("missing");
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

  async findByUserIdAndName(userId: string, name: string): Promise<Category | null> {
    return (
      [...this.items.values()].find(
        (item) => item.userId === userId && item.name === name
      ) ?? null
    );
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const current = this.items.get(id);
    if (!current) throw new Error("missing");
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryCreditCardRepository implements CreditCardRepository {
  readonly items = new Map<string, CreditCard>();

  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    const now = new Date();
    const card: CreditCard = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      issuer: input.issuer,
      brand: input.brand,
      currency: input.currency,
      isActive: input.isActive ?? true,
      isPrimary: input.isPrimary ?? false,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
      feeStatus: input.feeStatus ?? "UNKNOWN",
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(card.id, card);
    return card;
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<CreditCard[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(id: string, input: UpdateCreditCardInput): Promise<CreditCard> {
    const current = this.items.get(id);
    if (!current) throw new Error("missing");
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async setPrimary(userId: string, id: string): Promise<CreditCard> {
    for (const item of this.items.values()) {
      if (item.userId === userId && item.isPrimary) {
        this.items.set(item.id, { ...item, isPrimary: false, updatedAt: new Date() });
      }
    }
    return this.update(id, { isPrimary: true });
  }
}

class MemoryTransactionRepository implements TransactionRepository {
  readonly items: Transaction[] = [];

  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const transaction: Transaction = {
      id: input.id ?? randomUUID(),
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
      .filter(
        (item) =>
          query.creditCardId === undefined ||
          item.creditCardId === query.creditCardId
      )
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

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("missing");
    const current = this.items[index]!;
    const updated = { ...current, ...input, updatedAt: new Date() };
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
      (item) =>
        item.userId === userId && item.year === year && item.month === month
    );
  }

  async update(id: string, input: UpdateBudgetRecord): Promise<Budget> {
    const current = this.items.get(id);
    if (!current) throw new Error("missing");
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

  async findAuthByEmail() {
    return null;
  }

  async count() {
    return 1;
  }

  async setCredentials() {
    return this.user;
  }
}

async function setupP05() {
  const userId = randomUUID();
  const accounts = new MemoryAccountRepository();
  const categories = new MemoryCategoryRepository();
  const cards = new MemoryCreditCardRepository();
  const transactions = new MemoryTransactionRepository();
  const budgets = new MemoryBudgetRepository();
  const user: User = {
    id: userId,
    name: "P05",
    email: `${userId}@qa.invalid`,
    timezone: TZ,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const account = await accounts.create({
    userId,
    name: "BBVA ARS",
    currency: "ARS",
    type: "BANK",
    initialBalance: "100000.00",
  });
  const category = await categories.create({
    userId,
    name: "Nafta",
    type: "EXPENSE",
  });
  const card = await cards.create({
    userId,
    name: "Visa Santander",
    issuer: "Santander",
    brand: "Visa",
    currency: "ARS",
    isActive: true,
  });

  const txService = new TransactionService(
    transactions,
    accounts,
    categories,
    cards
  );
  const accountService = new AccountService(accounts, transactions);
  const cardService = new CreditCardService(cards, transactions);
  const financial = new FinancialService(transactions, accounts);
  const budgetService = new BudgetService(
    budgets,
    transactions,
    new MemoryUserRepository(user),
    categories
  );

  return {
    userId,
    account,
    category,
    card,
    transactions,
    txService,
    accountService,
    cardService,
    financial,
    budgetService,
    cards,
  };
}

test("P0.5 CASO A — bank expense debits account and spending", async () => {
  const ctx = await setupP05();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    accountId: ctx.account.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T15:00:00.000Z"),
  });

  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "80000.00");

  const spending = await ctx.financial.getMonthlyGrossExpenses(
    ctx.userId,
    2026,
    9,
    TZ
  );
  assert.equal(spending, "20000.00");

  const debt = await ctx.cardService.getCurrentCardDebt(ctx.userId, ctx.card.id);
  assert.equal(debt.currentCardDebt, "0.00");
});

test("P0.5 CASO B — card expense does not debit bank; debt and spending rise", async () => {
  const ctx = await setupP05();
  const created = await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T15:00:00.000Z"),
  });

  assert.equal(created.accountId, null);
  assert.equal(created.creditCardId, ctx.card.id);

  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "100000.00");

  const spending = await ctx.financial.getMonthlyGrossExpenses(
    ctx.userId,
    2026,
    9,
    TZ
  );
  assert.equal(spending, "20000.00");

  const debt = await ctx.cardService.getCurrentCardDebt(ctx.userId, ctx.card.id);
  assert.equal(debt.currentCardDebt, "20000.00");
});

test("P0.5 CASO C — bank + card expenses: bank -10k, spending 30k, debt 20k", async () => {
  const ctx = await setupP05();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "10000.00",
    currency: "ARS",
    accountId: ctx.account.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T12:00:00.000Z"),
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T13:00:00.000Z"),
  });

  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "90000.00");

  const spending = await ctx.financial.getMonthlyGrossExpenses(
    ctx.userId,
    2026,
    9,
    TZ
  );
  assert.equal(spending, "30000.00");

  const debt = await ctx.cardService.getCurrentCardDebt(ctx.userId, ctx.card.id);
  assert.equal(debt.currentCardDebt, "20000.00");

  const bankOnly = computeBalance(
    ctx.account.initialBalance,
    ctx.transactions.items.filter((item) => item.accountId === ctx.account.id)
  );
  assert.equal(bankOnly, "90000.00");
});

test("P0.5 CASO D — reject EXPENSE with both null or both set", async () => {
  const ctx = await setupP05();

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        categoryId: ctx.category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        accountId: ctx.account.id,
        creditCardId: ctx.card.id,
        categoryId: ctx.category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("P0.5 CASO E — reject missing / foreign / inactive / currency mismatch card", async () => {
  const ctx = await setupP05();
  const otherUser = randomUUID();
  const foreign = await ctx.cards.create({
    userId: otherUser,
    name: "Alien",
    issuer: "X",
    brand: "Visa",
    currency: "ARS",
  });
  const inactive = await ctx.cards.create({
    userId: ctx.userId,
    name: "Inactive",
    issuer: "X",
    brand: "Visa",
    currency: "ARS",
    isActive: false,
  });
  const usdCard = await ctx.cards.create({
    userId: ctx.userId,
    name: "USD Card",
    issuer: "X",
    brand: "Visa",
    currency: "USD",
  });

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        creditCardId: randomUUID(),
        categoryId: ctx.category.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        creditCardId: foreign.id,
        categoryId: ctx.category.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        creditCardId: inactive.id,
        categoryId: ctx.category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CREDIT_CARD_INACTIVE"
  );

  await assert.rejects(
    () =>
      ctx.txService.createExpense(ctx.userId, {
        amount: "10.00",
        currency: "ARS",
        creditCardId: usdCard.id,
        categoryId: ctx.category.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
});

test("P0.5 CASO F — MVP1 bank expense request still works", async () => {
  const ctx = await setupP05();
  const created = await ctx.txService.createExpense(ctx.userId, {
    amount: "1500.00",
    currency: "ARS",
    accountId: ctx.account.id,
    categoryId: ctx.category.id,
    paymentMethod: "CREDIT_CARD",
  });
  assert.equal(created.accountId, ctx.account.id);
  assert.equal(created.creditCardId, null);
  assert.equal(created.paymentMethod, "CREDIT_CARD");
  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "98500.00");
});

test("P0.5 CASO G — card expense consumes budget", async () => {
  const ctx = await setupP05();
  await ctx.budgetService.create(ctx.userId, {
    categoryId: ctx.category.id,
    year: 2026,
    month: 9,
    amount: "100000.00",
    currency: "ARS",
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "50000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });

  const listed = await ctx.budgetService.listByPeriod(ctx.userId, 2026, 9);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.consumption, "50000.00");
});

test("P0.5 CASO H — card expense does not reduce available liquidity", async () => {
  const ctx = await setupP05();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T15:00:00.000Z"),
  });

  const available = await ctx.financial.getTotalAvailableARS(ctx.userId);
  assert.equal(available, "100000.00");
});

test("P0.5 CASO I — currentCardDebt sums multiple ACTIVE card expenses", async () => {
  const ctx = await setupP05();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "30000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
  });
  const debt = await ctx.cardService.getCurrentCardDebt(ctx.userId, ctx.card.id);
  assert.equal(debt.currentCardDebt, "50000.00");
  assert.equal(
    computeCurrentCardDebt(
      ctx.transactions.items.filter((item) => item.creditCardId != null)
    ),
    "50000.00"
  );
});

test("P0.5 CASO J — list/export tolerate accountId null", async () => {
  const ctx = await setupP05();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "1200.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    description: "Nafta tarjeta",
    occurredAt: new Date("2026-09-05T15:00:00.000Z"),
  });

  const listed = await ctx.txService.list(ctx.userId, { year: 2026, month: 9 }, TZ);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.accountId, null);
  assert.equal(listed[0]?.creditCardId, ctx.card.id);

  const csv = await ctx.txService.exportCsv(
    ctx.userId,
    { year: 2026, month: 9 },
    TZ
  );
  assert.match(csv, /Nafta tarjeta/);
  assert.doesNotMatch(csv, /undefined/);
});
