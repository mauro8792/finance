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
  PurchaseWithInstallments,
} from "./credit-card-purchase.types.js";
import { computeFutureInstallmentCommitment } from "../credit-cards/credit-card-commitment.js";
import { toCents } from "../transactions/transaction-balance.js";

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
      feeExpectedAmount: input.feeExpectedAmount ?? null,
      feeNotes: input.feeNotes ?? null,
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

class MemoryPurchaseRepository implements CreditCardPurchaseRepository {
  readonly items: PurchaseWithInstallments[] = [];
  failAfterPurchase = false;
  failNextRecognize = false;
  private readonly transactions: MemoryTransactionRepository;
  private readonly claimChains = new Map<string, Promise<unknown>>();

  constructor(transactions: MemoryTransactionRepository) {
    this.transactions = transactions;
  }

  async createPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallments> {
    const snapshotPurchases = this.items.length;
    const snapshotTx = this.transactions.items.length;

    try {
      if (this.failAfterPurchase) {
        this.failAfterPurchase = false;
        throw new Error("forced purchase atomic failure");
      }
      const transaction = await this.transactions.create(input.transaction);
      const now = new Date();
      const installments = input.installments.map((item) => ({
        ...item,
        recognizedTransactionId:
          item.status === "RECOGNIZED" ? transaction.id : null,
        createdAt: now,
        updatedAt: now,
      }));
      const item: PurchaseWithInstallments = {
        purchase: {
          ...input.purchase,
          createdAt: now,
          updatedAt: now,
        },
        installments,
        recognizedTransactionId: transaction.id,
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

  async findPendingInstallmentAmountsByCreditCardId(
    userId: string,
    creditCardId: string
  ) {
    return this.items
      .filter(
        (item) =>
          item.purchase.userId === userId &&
          item.purchase.creditCardId === creditCardId &&
          item.purchase.status === "ACTIVE"
      )
      .flatMap((item) => item.installments)
      .filter((row) => row.status === "PENDING")
      .map((row) => ({ amount: row.amount, status: row.status }));
  }

  async findDueInstallmentCandidates(asOf: Date, userId?: string) {
    const rows = this.items
      .filter(
        (item) =>
          item.purchase.status === "ACTIVE" &&
          (userId === undefined || item.purchase.userId === userId)
      )
      .flatMap((item) =>
        item.installments
          .filter(
            (inst) =>
              inst.status === "PENDING" &&
              inst.recognizedTransactionId === null &&
              inst.scheduledFor.getTime() <= asOf.getTime()
          )
          .map((inst) => ({
            installmentId: inst.id,
            purchaseId: item.purchase.id,
            userId: item.purchase.userId,
            creditCardId: item.purchase.creditCardId,
            categoryId: item.purchase.categoryId,
            currency: item.purchase.currency,
            description: item.purchase.description,
            installmentNumber: inst.installmentNumber,
            installmentsCount: item.purchase.installmentsCount,
            amount: inst.amount,
            scheduledFor: inst.scheduledFor,
          }))
      );
    return rows.sort((a, b) => {
      const byDate = a.scheduledFor.getTime() - b.scheduledFor.getTime();
      if (byDate !== 0) return byDate;
      const byPurchase = a.purchaseId.localeCompare(b.purchaseId);
      if (byPurchase !== 0) return byPurchase;
      return a.installmentNumber - b.installmentNumber;
    });
  }

  async recognizeInstallmentAtomic(input: {
    installmentId: string;
    recognizedAt: Date;
    transactionId: string;
  }) {
    const previous = this.claimChains.get(input.installmentId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimChains.set(
      input.installmentId,
      previous.then(() => gate)
    );
    await previous;

    try {
      const owner = this.items.find((item) =>
        item.installments.some((inst) => inst.id === input.installmentId)
      );
      const installment = owner?.installments.find(
        (inst) => inst.id === input.installmentId
      );
      if (
        !owner ||
        !installment ||
        owner.purchase.status !== "ACTIVE" ||
        installment.status !== "PENDING" ||
        installment.recognizedTransactionId !== null
      ) {
        return "skipped";
      }

      const snapshotTx = this.transactions.items.length;
      try {
        if (this.failNextRecognize) {
          this.failNextRecognize = false;
          throw new Error("forced recognize failure");
        }
        await this.transactions.create({
          id: input.transactionId,
          userId: owner.purchase.userId,
          accountId: null,
          creditCardId: owner.purchase.creditCardId,
          categoryId: owner.purchase.categoryId,
          type: "EXPENSE",
          status: "ACTIVE",
          amount: installment.amount,
          currency: owner.purchase.currency,
          description:
            owner.purchase.description ??
            `Cuota ${installment.installmentNumber}/${owner.purchase.installmentsCount}`,
          occurredAt: installment.scheduledFor,
          paymentMethod: null,
          isFixed: false,
          reimbursementStatus: "NONE",
        });
        installment.status = "RECOGNIZED";
        installment.recognizedTransactionId = input.transactionId;
        installment.recognizedAt = input.recognizedAt;
        owner.recognizedTransactionId =
          owner.recognizedTransactionId ?? input.transactionId;
        return "recognized";
      } catch (error) {
        this.transactions.items.length = snapshotTx;
        installment.status = "PENDING";
        installment.recognizedTransactionId = null;
        installment.recognizedAt = null;
        throw error;
      }
    } finally {
      release();
    }
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
  const cardService = new CreditCardService(cards, transactions, purchases);
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

test("P0.7 A — 600000 / 6 recognizes only first installment", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    description: "Electrodoméstico",
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });

  assert.equal(created.purchase.totalAmount, "600000.00");
  assert.equal(created.purchase.installmentsCount, 6);
  assert.equal(created.installments.length, 6);
  assert.equal(created.installments[0]?.status, "RECOGNIZED");
  assert.equal(created.installments[0]?.amount, "100000.00");
  for (let i = 1; i < 6; i += 1) {
    assert.equal(created.installments[i]?.status, "PENDING");
    assert.equal(created.installments[i]?.recognizedTransactionId, null);
  }

  assert.equal(ctx.transactions.items.length, 1);
  assert.equal(ctx.transactions.items[0]?.amount, "100000.00");

  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "100000.00");

  const spending = await ctx.financial.getMonthlyGrossExpenses(
    ctx.userId,
    2026,
    9,
    TZ
  );
  assert.equal(spending, "100000.00");

  const commitments = await ctx.cardService.getCommitments(
    ctx.userId,
    ctx.card.id
  );
  assert.equal(commitments.currentCardDebt, "100000.00");
  assert.equal(commitments.futureInstallmentCommitment, "500000.00");
  assert.equal(commitments.totalOutstandingCommitment, "600000.00");
});

test("P0.7 B — 100 / 3 splits without cent loss", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "100.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 3,
  });
  const amounts = created.installments.map((row) => row.amount);
  assert.deepEqual(amounts, ["33.33", "33.33", "33.34"]);
  const sumCents = amounts.reduce((acc, value) => acc + toCents(value), 0n);
  assert.equal(sumCents, toCents("100.00"));
  assert.equal(created.purchase.totalAmount, "100.00");
});

test("P0.7 C — installmentsCount=1 matches P0.6 behavior", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    description: "Nafta",
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 1,
  });

  assert.equal(created.purchase.installmentsCount, 1);
  assert.equal(created.installments.length, 1);
  assert.equal(created.installments[0]?.status, "RECOGNIZED");
  assert.equal(created.installments[0]?.amount, "20000.00");
  assert.equal(
    created.recognizedTransactionId,
    created.installments[0]?.recognizedTransactionId
  );

  const tx = await ctx.transactions.findById(created.recognizedTransactionId!);
  assert.ok(tx);
  assert.equal(tx.type, "EXPENSE");
  assert.equal(tx.accountId, null);
  assert.equal(tx.creditCardId, ctx.card.id);
  assert.equal(tx.amount, "20000.00");

  const commitments = await ctx.cardService.getCommitments(
    ctx.userId,
    ctx.card.id
  );
  assert.equal(commitments.currentCardDebt, "20000.00");
  assert.equal(commitments.futureInstallmentCommitment, "0.00");
});

test("P0.7 D — invalid installmentsCount rejected", async () => {
  const ctx = await setup();
  for (const installmentsCount of [0, -1, 61]) {
    await assert.rejects(
      () =>
        ctx.purchaseService.create(ctx.userId, {
          creditCardId: ctx.card.id,
          categoryId: ctx.category.id,
          currency: "ARS",
          totalAmount: "10.00",
          purchaseDate: "2026-09-07",
          installmentsCount,
        }),
      (e: unknown) => e instanceof AppError && e.code === "VALIDATION_ERROR"
    );
  }
});

test("P0.7 E — budget consumes only recognized installment", async () => {
  const ctx = await setup();
  await ctx.budgetService.create(ctx.userId, {
    categoryId: ctx.category.id,
    year: 2026,
    month: 9,
    amount: "1000000.00",
    currency: "ARS",
  });
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const listed = await ctx.budgetService.listByPeriod(ctx.userId, 2026, 9);
  assert.equal(listed[0]?.consumption, "100000.00");
});

test("P0.7 F — purchase.totalAmount never double-counted", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  assert.equal(computeCurrentCardDebt(ctx.transactions.items), "100000.00");
  assert.equal(ctx.transactions.items.length, 1);
  assert.equal(ctx.purchases.items.length, 1);
});

test("P0.7 G/H — future commitment only PENDING ACTIVE; CANCELLED excluded", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "300.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 3,
  });
  // Simulate cancelling one pending installment in memory.
  created.installments[1]!.status = "CANCELLED";
  const pending = created.installments.filter((row) => row.status === "PENDING");
  assert.equal(computeFutureInstallmentCommitment(pending), "100.00");
  assert.equal(
    computeFutureInstallmentCommitment(created.installments),
    "100.00"
  );
});

test("P0.7 I — direct P0.5 card EXPENSE affects debt only", async () => {
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

  const commitments = await ctx.cardService.getCommitments(
    ctx.userId,
    ctx.card.id
  );
  assert.equal(commitments.currentCardDebt, "1500.00");
  assert.equal(commitments.futureInstallmentCommitment, "0.00");
});

test("P0.7 J — multiple purchases aggregate correctly", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "50000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
  });
  const commitments = await ctx.cardService.getCommitments(
    ctx.userId,
    ctx.card.id
  );
  assert.equal(commitments.currentCardDebt, "150000.00");
  assert.equal(commitments.futureInstallmentCommitment, "500000.00");
  assert.equal(commitments.totalOutstandingCommitment, "650000.00");
});

test("P0.7 K — USD rounding exact", async () => {
  const ctx = await setup();
  const usdCard = await ctx.cards.create({
    userId: ctx.userId,
    name: "USD Card",
    issuer: "Bank",
    brand: "Visa",
    currency: "USD",
  });
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: usdCard.id,
    categoryId: ctx.category.id,
    currency: "USD",
    totalAmount: "10.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 3,
  });
  const sumCents = created.installments.reduce(
    (acc, row) => acc + toCents(row.amount),
    0n
  );
  assert.equal(sumCents, toCents("10.00"));
  assert.deepEqual(
    created.installments.map((row) => row.amount),
    ["3.33", "3.33", "3.34"]
  );
});

test("P0.7 L — schedule dates handle month lengths and leap year", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "400.00",
    purchaseDate: "2024-01-31",
    installmentsCount: 4,
  });
  const dates = created.installments.map((row) =>
    row.scheduledFor.toISOString().slice(0, 10)
  );
  assert.deepEqual(dates, [
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
    "2024-04-30",
  ]);

  const yearChange = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "200.00",
    purchaseDate: "2026-11-07",
    installmentsCount: 2,
  });
  assert.equal(
    yearChange.installments[1]?.scheduledFor.toISOString().slice(0, 10),
    "2026-12-07"
  );
});

test("P0.7 M — atomic rollback leaves no partial purchase", async () => {
  const ctx = await setup();
  ctx.purchases.failAfterPurchase = true;
  await assert.rejects(() =>
    ctx.purchaseService.create(ctx.userId, {
      creditCardId: ctx.card.id,
      categoryId: ctx.category.id,
      currency: "ARS",
      totalAmount: "100.00",
      purchaseDate: "2026-09-07",
      installmentsCount: 3,
    })
  );
  assert.equal(ctx.purchases.items.length, 0);
  assert.equal(ctx.transactions.items.length, 0);
});

test("P0.7 N — user isolation for purchases and commitments", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "50.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 2,
  });
  const listed = await ctx.purchaseService.list(ctx.userId);
  assert.equal(listed.length, 1);
  await assert.rejects(
    () => ctx.purchaseService.getById(randomUUID(), created.purchase.id),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
  await assert.rejects(
    () => ctx.cardService.getCommitments(randomUUID(), ctx.card.id),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
});

test("P0.7 O — inactive card rejects new purchase", async () => {
  const ctx = await setup();
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
        creditCardId: inactive.id,
        categoryId: ctx.category.id,
        currency: "ARS",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
        installmentsCount: 2,
      }),
    (e: unknown) => e instanceof AppError && e.code === "CREDIT_CARD_INACTIVE"
  );
});

test("P0.7 — liquidity unchanged; currency mismatch still rejected", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const available = await ctx.financial.getTotalAvailableARS(ctx.userId);
  assert.equal(available, "100000.00");

  await assert.rejects(
    () =>
      ctx.purchaseService.create(ctx.userId, {
        creditCardId: ctx.card.id,
        categoryId: ctx.category.id,
        currency: "USD",
        totalAmount: "10.00",
        purchaseDate: "2026-09-07",
        installmentsCount: 2,
      }),
    (e: unknown) => e instanceof AppError && e.code === "CURRENCY_MISMATCH"
  );
});

test("P0.8 A — one due PENDING becomes RECOGNIZED + EXPENSE", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const asOf = created.installments[1]!.scheduledFor;
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf,
    userId: ctx.userId,
  });
  assert.equal(result.recognized, 1);
  assert.equal(created.installments[1]?.status, "RECOGNIZED");
  assert.equal(ctx.transactions.items.length, 2);
  assert.equal(ctx.transactions.items[1]?.amount, "100000.00");
  assert.equal(
    ctx.transactions.items[1]?.occurredAt.toISOString(),
    created.installments[1]!.scheduledFor.toISOString()
  );
});

test("P0.8 B — future PENDING untouched", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2026-09-07T12:00:00.000Z"),
    userId: ctx.userId,
  });
  assert.equal(result.eligible, 0);
  assert.equal(result.recognized, 0);
  assert.ok(created.installments.slice(1).every((row) => row.status === "PENDING"));
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 C — already RECOGNIZED not duplicated", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 1,
  });
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2026-12-31T23:59:59.999Z"),
    userId: ctx.userId,
  });
  assert.equal(result.eligible, 0);
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 D — CANCELLED never recognized", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "300.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 3,
  });
  created.installments[1]!.status = "CANCELLED";
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2027-01-01T00:00:00.000Z"),
    userId: ctx.userId,
  });
  assert.equal(result.recognized, 1);
  assert.equal(created.installments[1]?.status, "CANCELLED");
  assert.equal(created.installments[2]?.status, "RECOGNIZED");
});

test("P0.8 E — VOIDED purchase pending untouched", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "300.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 3,
  });
  created.purchase.status = "VOIDED";
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2027-01-01T00:00:00.000Z"),
    userId: ctx.userId,
  });
  assert.equal(result.eligible, 0);
  assert.equal(result.recognized, 0);
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 F/G — catch-up four installments keeps scheduledFor as occurredAt", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const asOf = created.installments[4]!.scheduledFor;
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf,
    userId: ctx.userId,
  });
  assert.equal(result.recognized, 4);
  assert.equal(ctx.transactions.items.length, 5);
  for (let index = 1; index <= 4; index += 1) {
    const installment = created.installments[index]!;
    assert.equal(installment.status, "RECOGNIZED");
    const tx = ctx.transactions.items.find(
      (row) => row.id === installment.recognizedTransactionId
    );
    assert.ok(tx);
    assert.equal(tx.occurredAt.toISOString(), installment.scheduledFor.toISOString());
  }
  assert.equal(created.installments[5]?.status, "PENDING");
});

test("P0.8 H — metrics move future → current; total unchanged", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const before = await ctx.cardService.getCommitments(ctx.userId, ctx.card.id);
  assert.equal(before.currentCardDebt, "100000.00");
  assert.equal(before.futureInstallmentCommitment, "500000.00");
  assert.equal(before.totalOutstandingCommitment, "600000.00");

  await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[1]!.scheduledFor,
    userId: ctx.userId,
  });
  const after = await ctx.cardService.getCommitments(ctx.userId, ctx.card.id);
  assert.equal(after.currentCardDebt, "200000.00");
  assert.equal(after.futureInstallmentCommitment, "400000.00");
  assert.equal(after.totalOutstandingCommitment, "600000.00");

  const balance = await ctx.accountService.getBalance(ctx.userId, ctx.account.id);
  assert.equal(balance.balance, "100000.00");
});

test("P0.8 I — second execution creates zero new Transactions", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const asOf = created.installments[2]!.scheduledFor;
  const first = await ctx.purchaseService.recognizeDueInstallments({
    asOf,
    userId: ctx.userId,
  });
  assert.equal(first.recognized, 2);
  const second = await ctx.purchaseService.recognizeDueInstallments({
    asOf,
    userId: ctx.userId,
  });
  assert.equal(second.eligible, 0);
  assert.equal(second.recognized, 0);
  assert.equal(ctx.transactions.items.length, 3);
});

test("P0.8 J — concurrent recognition yields exactly one Transaction", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const asOf = created.installments[1]!.scheduledFor;
  const [a, b] = await Promise.all([
    ctx.purchaseService.recognizeDueInstallments({ asOf, userId: ctx.userId }),
    ctx.purchaseService.recognizeDueInstallments({ asOf, userId: ctx.userId }),
  ]);
  assert.equal(a.recognized + b.recognized, 1);
  assert.equal(a.skipped + b.skipped, 1);
  assert.equal(ctx.transactions.items.length, 2);
  assert.equal(created.installments[1]?.status, "RECOGNIZED");
});

test("P0.8 K — rollback on recognize failure leaves no orphan Transaction", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  ctx.purchases.failNextRecognize = true;
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[1]!.scheduledFor,
    userId: ctx.userId,
  });
  assert.equal(result.failed, 1);
  assert.equal(result.recognized, 0);
  assert.equal(created.installments[1]?.status, "PENDING");
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 L — retry after partial failure does not duplicate prior", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[1]!.scheduledFor,
    userId: ctx.userId,
  });
  assert.equal(ctx.transactions.items.length, 2);

  ctx.purchases.failNextRecognize = true;
  const failed = await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[2]!.scheduledFor,
    userId: ctx.userId,
  });
  assert.equal(failed.failed, 1);
  assert.equal(ctx.transactions.items.length, 2);

  const retry = await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[2]!.scheduledFor,
    userId: ctx.userId,
  });
  assert.equal(retry.recognized, 1);
  assert.equal(ctx.transactions.items.length, 3);
});

test("P0.8 M — user isolation on recognition", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const other = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2027-01-01T00:00:00.000Z"),
    userId: randomUUID(),
  });
  assert.equal(other.eligible, 0);
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 N — purchase 1/1 regression: no second Transaction", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "20000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 1,
  });
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2030-01-01T00:00:00.000Z"),
    userId: ctx.userId,
  });
  assert.equal(result.recognized, 0);
  assert.equal(ctx.transactions.items.length, 1);
});

test("P0.8 O — direct P0.5 EXPENSE untouched by recognition", async () => {
  const ctx = await setup();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "1500.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
  });
  const before = ctx.transactions.items.length;
  await ctx.purchaseService.recognizeDueInstallments({
    asOf: new Date("2030-01-01T00:00:00.000Z"),
    userId: ctx.userId,
  });
  assert.equal(ctx.transactions.items.length, before);
});

test("P0.8 P — budget consumes scheduledFor period, not run day", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  await ctx.budgetService.create(ctx.userId, {
    categoryId: ctx.category.id,
    year: 2026,
    month: 10,
    amount: "1000000.00",
    currency: "ARS",
  });
  await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[1]!.scheduledFor,
    userId: ctx.userId,
  });
  const oct = await ctx.budgetService.listByPeriod(ctx.userId, 2026, 10);
  assert.equal(oct[0]?.consumption, "100000.00");
  const jan = await ctx.budgetService.listByPeriod(ctx.userId, 2027, 1);
  assert.equal(jan.length, 0);
});

test("P0.8 Q — dry-run zero writes", async () => {
  const ctx = await setup();
  const created = await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const result = await ctx.purchaseService.recognizeDueInstallments({
    asOf: created.installments[3]!.scheduledFor,
    userId: ctx.userId,
    dryRun: true,
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.eligible, 3);
  assert.equal(result.recognized, 0);
  assert.equal(result.totalsByCurrency.ARS, "300000.00");
  assert.equal(ctx.transactions.items.length, 1);
  assert.ok(created.installments.slice(1).every((row) => row.status === "PENDING"));
});
