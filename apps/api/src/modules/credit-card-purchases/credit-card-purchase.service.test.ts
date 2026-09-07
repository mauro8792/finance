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
import { TransactionService } from "../transactions/transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import { CreditCardPurchaseService } from "./credit-card-purchase.service.js";
import type {
  CreatePurchaseAtomicInput,
  CreditCardPurchaseRepository,
  PurchaseWithInstallment,
} from "./credit-card-purchase.types.js";

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
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async update(id: string, input: UpdateAccountInput) {
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
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async findByUserIdAndName(userId: string, name: string) {
    return (
      [...this.items.values()].find(
        (item) => item.userId === userId && item.name === name
      ) ?? null
    );
  }
  async update(id: string, input: UpdateCategoryInput) {
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
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async update(id: string, input: UpdateCreditCardInput) {
    const current = this.items.get(id);
    if (!current) throw new Error("missing");
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
  async setPrimary(userId: string, id: string) {
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
  failNextCreate = false;

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("forced transaction failure");
    }
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

  async findByUserId(userId: string, query: FindTransactionsQuery = {}) {
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
          query.occurredAtGte === undefined || item.occurredAt >= query.occurredAtGte
      )
      .filter(
        (item) =>
          query.occurredAtLt === undefined || item.occurredAt < query.occurredAtLt
      );
  }

  async findById(id: string) {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async update(id: string, input: UpdateTransactionRecord) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("missing");
    const updated = { ...this.items[index]!, ...input, updatedAt: new Date() };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string }
  ) {
    return this.create(input);
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
}

class MemoryPurchaseRepository implements CreditCardPurchaseRepository {
  readonly items: PurchaseWithInstallment[] = [];
  failAfterPurchase = false;
  private readonly transactions: MemoryTransactionRepository;

  constructor(transactions: MemoryTransactionRepository) {
    this.transactions = transactions;
  }

  async createCashPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallment> {
    // Simulate atomicity: either all succeed or nothing is kept.
    const snapshotPurchases = this.items.length;
    const snapshotTx = this.transactions.items.length;

    try {
      if (this.failAfterPurchase) {
        this.failAfterPurchase = false;
        throw new Error("forced purchase atomic failure");
      }
      const transaction = await this.transactions.create(input.transaction);
      const now = new Date();
      const item: PurchaseWithInstallment = {
        purchase: {
          ...input.purchase,
          createdAt: now,
          updatedAt: now,
        },
        installment: {
          ...input.installment,
          createdAt: now,
          updatedAt: now,
        },
        transactionId: transaction.id,
      };
      this.items.push(item);
      return item;
    } catch (error) {
      this.items.length = snapshotPurchases;
      this.transactions.items.length = snapshotTx;
      throw error;
    }
  }

  async findById(id: string) {
    return this.items.find((item) => item.purchase.id === id) ?? null;
  }

  async findByUserId(userId: string) {
    return this.items.filter((item) => item.purchase.userId === userId);
  }
}

class MemoryBudgetRepository implements BudgetRepository {
  readonly items = new Map<string, Budget>();
  async create(input: CreateBudgetInput): Promise<Budget> {
    const now = new Date();
    const budget: Budget = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.items.set(budget.id, budget);
    return budget;
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByUserId(userId: string) {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
  async findByUserCategoryPeriod(
    userId: string,
    categoryId: string,
    currency: CreateBudgetInput["currency"],
    year: number,
    month: number
  ) {
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
  async findByUserPeriod(userId: string, year: number, month: number) {
    return [...this.items.values()].filter(
      (item) => item.userId === userId && item.year === year && item.month === month
    );
  }
  async update(id: string, input: UpdateBudgetRecord) {
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
  async findById(id: string) {
    return id === this.user.id ? this.user : null;
  }
  async findFirst() {
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

async function setup() {
  const userId = randomUUID();
  const accounts = new MemoryAccountRepository();
  const categories = new MemoryCategoryRepository();
  const cards = new MemoryCreditCardRepository();
  const transactions = new MemoryTransactionRepository();
  const purchases = new MemoryPurchaseRepository(transactions);
  const budgets = new MemoryBudgetRepository();
  const user: User = {
    id: userId,
    name: "P06",
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
  });

  const purchaseService = new CreditCardPurchaseService(
    purchases,
    cards,
    categories
  );
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
    cards,
    purchases,
    transactions,
    purchaseService,
    txService,
    accountService,
    cardService,
    financial,
    budgetService,
  };
}

test("P0.6 A — create purchase 1 pago creates purchase + installment + EXPENSE", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    description: "Nafta",
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
  });

  assert.equal(created.purchase.installmentsCount, 1);
  assert.equal(created.purchase.totalAmount, "20000.00");
  assert.equal(created.installment.installmentNumber, 1);
  assert.equal(created.installment.status, "RECOGNIZED");
  assert.equal(created.installment.amount, "20000.00");
  assert.equal(created.transactionId, created.installment.recognizedTransactionId);

  const tx = await ctx.transactions.findById(created.transactionId);
  assert.ok(tx);
  assert.equal(tx.type, "EXPENSE");
  assert.equal(tx.accountId, null);
  assert.equal(tx.creditCardId, ctx.card.id);
  assert.equal(tx.amount, "20000.00");
});

test("P0.6 B/L — atomic failure leaves no orphan purchase or transaction", async () => {
  const ctx = await setup();
  ctx.purchases.failAfterPurchase = true;
  await assert.rejects(() =>
    ctx.purchaseService.create(ctx.userId, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      currency: "ARS",
      totalAmount: "100.00",
      purchaseDate: "2026-09-07",
    })
  );
  assert.equal(ctx.purchases.items.length, 0);
  assert.equal(ctx.transactions.items.length, 0);
});

test("P0.6 C — bank unchanged, spending and debt rise once", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: 20000,
    purchaseDate: "2026-09-07",
  });

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

test("P0.6 D — no double count from purchase.totalAmount", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
  });
  // Debt derives only from EXPENSE movements, not purchase rows.
  assert.equal(computeCurrentCardDebt(ctx.transactions.items), "20000.00");
  assert.equal(ctx.purchases.items.length, 1);
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.6 E — budget consumes once", async () => {
  const ctx = await setup();
  await ctx.budgetService.create(ctx.userId, {
    categoryId: ctx.category.id,
    year: 2026,
    month: 9,
    amount: "100000.00",
    currency: "ARS",
  });
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
  });
  const listed = await ctx.budgetService.listByPeriod(ctx.userId, 2026, 9);
  assert.equal(listed[0]?.consumption, "20000.00");
});

test("P0.6 F — reject missing / inactive / foreign card", async () => {
  const ctx = await setup();
  const foreign = await ctx.cards.create({
    userId: randomUUID(),
    name: "X",
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

  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: randomUUID(),
        categoryId: ctx.category.id,
        currency: "ARS",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
      }),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: foreign.id,
        categoryId: ctx.category.id,
        currency: "ARS",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
      }),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: inactive.id,
        categoryId: ctx.category.id,
        currency: "ARS",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
      }),
    (e: unknown) => e instanceof AppError && e.code === "CREDIT_CARD_INACTIVE"
  );
});

test("P0.6 G — currency mismatch rejected", async () => {
  const ctx = await setup();
  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: ctx.card.id,
        categoryId: ctx.category.id,
        currency: "USD",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
      }),
    (e: unknown) => e instanceof AppError && e.code === "CURRENCY_MISMATCH"
  );
});

test("P0.6 H — installmentsCount must be 1", async () => {
  const ctx = await setup();
  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: ctx.card.id,
        categoryId: ctx.category.id,
        currency: "ARS",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
        installmentsCount: 2,
      }),
    (e: unknown) => e instanceof AppError && e.code === "VALIDATION_ERROR"
  );
});

test("P0.6 I — list/detail user isolation", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "50.00",
    purchaseDate: "2026-09-07",
  });
  const listed = await ctx.purchaseService.list(ctx.userId);
  assert.equal(listed.length, 1);
  const detail = await ctx.purchaseService.getById(ctx.userId, created.purchase.id);
  assert.equal(detail.purchase.id, created.purchase.id);
  await assert.rejects(
    () => ctx.purchaseService.getById(randomUUID(), created.purchase.id),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
});

test("P0.6 J — direct P0.5 card EXPENSE still works", async () => {
  const ctx = await setup();
  const expense = await ctx.txService.createExpense(ctx.userId, {
    amount: "1500.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
  });
  assert.equal(expense.accountId, null);
  assert.equal(expense.creditCardId, ctx.card.id);
  assert.equal(ctx.purchases.items.length, 0);
});

test("P0.6 K — liquidity unchanged after purchase", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
  });
  const available = await ctx.financial.getTotalAvailableARS(ctx.userId);
  assert.equal(available, "100000.00");
});
