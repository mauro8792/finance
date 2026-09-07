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
import { computeCurrentCardDebt } from "../credit-cards/credit-card-debt.js";
import { CreditCardService } from "../credit-cards/credit-card.service.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "../credit-cards/credit-card.types.js";
import { TransactionService } from "../transactions/transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../categories/category.types.js";
import { CreditCardPurchaseService } from "../credit-card-purchases/credit-card-purchase.service.js";
import type {
  CreatePurchaseAtomicInput,
  CreditCardPurchaseRepository,
  PurchaseWithInstallments,
} from "../credit-card-purchases/credit-card-purchase.types.js";
import { CreditCardStatementService } from "./credit-card-statement.service.js";
import { StatementCloseConflictError } from "./credit-card-statement.repository.js";
import type {
  CloseStatementRecord,
  CreateStatementRecord,
  CreditCardStatement,
  CreditCardStatementRepository,
} from "./credit-card-statement.types.js";

class MemoryAccounts implements AccountRepository {
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
    const current = this.items.get(id)!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryCategories implements CategoryRepository {
  readonly items = new Map<string, Category>();
  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      isSystem: false,
      isActive: true,
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
  async findByUserIdAndName() {
    return null;
  }
  async update(id: string, input: UpdateCategoryInput) {
    const current = this.items.get(id)!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

class MemoryCards implements CreditCardRepository {
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
      isPrimary: false,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
      feeStatus: "UNKNOWN",
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
    const current = this.items.get(id)!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
  async setPrimary(userId: string, id: string) {
    return this.update(id, { isPrimary: true });
  }
}

class MemoryTransactions implements TransactionRepository {
  readonly items: Transaction[] = [];
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const tx: Transaction = {
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
      isFixed: false,
      reimbursementStatus: "NONE",
      relatedTransactionId: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(tx);
    return tx;
  }
  async findByUserId(userId: string, query: FindTransactionsQuery = {}) {
    return this.items
      .filter((item) => item.userId === userId)
      .filter((item) => query.type === undefined || item.type === query.type)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter(
        (item) =>
          query.creditCardId === undefined ||
          item.creditCardId === query.creditCardId
      )
      .filter(
        (item) =>
          query.accountId === undefined || item.accountId === query.accountId
      )
      .filter(
        (item) =>
          query.occurredAtGte === undefined ||
          item.occurredAt >= query.occurredAtGte
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

class MemoryPurchases implements CreditCardPurchaseRepository {
  readonly items: PurchaseWithInstallments[] = [];
  constructor(private readonly transactions: MemoryTransactions) {}
  async createPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallments> {
    const tx = await this.transactions.create(input.transaction);
    const now = new Date();
    const item: PurchaseWithInstallments = {
      purchase: { ...input.purchase, createdAt: now, updatedAt: now },
      installments: input.installments.map((row) => ({
        ...row,
        recognizedTransactionId:
          row.status === "RECOGNIZED" ? tx.id : null,
        createdAt: now,
        updatedAt: now,
      })),
      recognizedTransactionId: tx.id,
    };
    this.items.push(item);
    return item;
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
  async findDueInstallmentCandidates() {
    return [];
  }
  async recognizeInstallmentAtomic() {
    return "skipped" as const;
  }
}

class MemoryStatements implements CreditCardStatementRepository {
  readonly items = new Map<string, CreditCardStatement>();
  key(cardId: string, closing: Date) {
    return `${cardId}:${closing.toISOString()}`;
  }
  async createProjected(input: CreateStatementRecord) {
    const k = this.key(input.creditCardId, input.closingDate);
    if ([...this.items.values()].some(
      (row) => this.key(row.creditCardId, row.closingDate) === k
    )) {
      const err = Object.assign(new Error("unique"), {
        code: "P2002",
      });
      throw err;
    }
    const now = new Date();
    const row: CreditCardStatement = {
      ...input,
      status: "PROJECTED",
      closedProjectedAmount: null,
      actualAmount: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(row.id, row);
    return row;
  }
  async findById(id: string) {
    return this.items.get(id) ?? null;
  }
  async findByCreditCardAndClosingDate(creditCardId: string, closingDate: Date) {
    const k = this.key(creditCardId, closingDate);
    return (
      [...this.items.values()].find(
        (row) => this.key(row.creditCardId, row.closingDate) === k
      ) ?? null
    );
  }
  async findByCreditCardId(creditCardId: string) {
    return [...this.items.values()]
      .filter((row) => row.creditCardId === creditCardId)
      .sort((a, b) => b.closingDate.getTime() - a.closingDate.getTime());
  }
  async close(id: string, input: CloseStatementRecord) {
    const current = this.items.get(id);
    if (!current || current.status !== "PROJECTED") {
      throw new StatementCloseConflictError(id);
    }
    const updated: CreditCardStatement = {
      ...current,
      status: "CLOSED",
      closedProjectedAmount: input.closedProjectedAmount,
      actualAmount: input.actualAmount,
      closedAt: input.closedAt,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }
}

async function setup(opts?: { closingDay?: number | null; dueDay?: number | null }) {
  const userId = randomUUID();
  const accounts = new MemoryAccounts();
  const categories = new MemoryCategories();
  const cards = new MemoryCards();
  const transactions = new MemoryTransactions();
  const purchases = new MemoryPurchases(transactions);
  const statements = new MemoryStatements();

  const account = await accounts.create({
    userId,
    name: "Bank",
    currency: "ARS",
    type: "BANK",
    initialBalance: "100000.00",
  });
  const category = await categories.create({
    userId,
    name: "Cat",
    type: "EXPENSE",
  });
  const card = await cards.create({
    userId,
    name: "Visa",
    issuer: "Bank",
    brand: "Visa",
    currency: "ARS",
    closingDay: opts?.closingDay === undefined ? 20 : opts.closingDay,
    dueDay: opts?.dueDay === undefined ? 10 : opts.dueDay,
  });

  const statementService = new CreditCardStatementService(
    statements,
    cards,
    transactions
  );
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

  return {
    userId,
    account,
    category,
    card,
    cards,
    transactions,
    statements,
    statementService,
    purchaseService,
    txService,
    accountService,
    cardService,
  };
}

test("P0.9 F — card without closingDay rejects project", async () => {
  const ctx = await setup({ closingDay: null, dueDay: null });
  await assert.rejects(
    () =>
      ctx.statementService.getOrCreateProjected(
        ctx.userId,
        ctx.card.id,
        new Date("2026-09-20T12:00:00.000Z")
      ),
    (e: unknown) =>
      e instanceof AppError && e.code === "CREDIT_CARD_CONFIG_INCOMPLETE"
  );
});

test("P0.9 G/I/J — projection includes recognized + direct P0.5 only", async () => {
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
    occurredAt: new Date("2026-09-15T12:00:00.000Z"),
  });
  const view = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(view.statement.status, "PROJECTED");
  assert.equal(view.projectedAmount, "150000.00");
  assert.equal(view.transactions?.length, 2);
});

test("P0.9 H — PENDING installment excluded from projection", async () => {
  const ctx = await setup();
  await ctx.purchaseService.create(ctx.userId, {
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    currency: "ARS",
    totalAmount: "600000.00",
    purchaseDate: "2026-09-07",
    installmentsCount: 6,
  });
  const view = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(view.projectedAmount, "100000.00");
});

test("P0.9 K/L — other card and bank expense excluded", async () => {
  const ctx = await setup();
  const other = await ctx.cards.create({
    userId: ctx.userId,
    name: "Other",
    issuer: "X",
    brand: "Visa",
    currency: "ARS",
    closingDay: 20,
    dueDay: 10,
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "999.00",
    currency: "ARS",
    creditCardId: other.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  await ctx.txService.createExpense(ctx.userId, {
    amount: "777.00",
    currency: "ARS",
    accountId: ctx.account.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  const view = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(view.projectedAmount, "0.00");
});

test("P0.9 M — idempotent getOrCreate", async () => {
  const ctx = await setup();
  const a = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  const b = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(a.statement.id, b.statement.id);
  assert.equal(ctx.statements.items.size, 1);
});

test("P0.9 N — concurrent create yields one statement", async () => {
  const ctx = await setup();
  const closing = new Date("2026-09-20T12:00:00.000Z");
  const [a, b] = await Promise.all([
    ctx.statementService.getOrCreateProjected(ctx.userId, ctx.card.id, closing),
    ctx.statementService.getOrCreateProjected(ctx.userId, ctx.card.id, closing),
  ]);
  assert.equal(a.statement.id, b.statement.id);
  assert.equal(ctx.statements.items.size, 1);
});

test("P0.9 O/P/Q/R/S — close snapshots; no debt/liquidity/tx side effects", async () => {
  const ctx = await setup();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "150000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  const projected = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  const debtBefore = await ctx.cardService.getCurrentCardDebt(
    ctx.userId,
    ctx.card.id
  );
  const balanceBefore = await ctx.accountService.getBalance(
    ctx.userId,
    ctx.account.id
  );
  const txCount = ctx.transactions.items.length;

  const closed = await ctx.statementService.close(
    ctx.userId,
    ctx.card.id,
    projected.statement.id,
    "152500.00"
  );
  assert.equal(closed.statement.status, "CLOSED");
  assert.equal(closed.projectedAmount, "150000.00");
  assert.equal(closed.statement.closedProjectedAmount, "150000.00");
  assert.equal(closed.statement.actualAmount, "152500.00");
  assert.equal(closed.difference, "2500.00");
  assert.equal(ctx.transactions.items.length, txCount);

  const debtAfter = await ctx.cardService.getCurrentCardDebt(
    ctx.userId,
    ctx.card.id
  );
  const balanceAfter = await ctx.accountService.getBalance(
    ctx.userId,
    ctx.account.id
  );
  assert.equal(debtAfter.currentCardDebt, debtBefore.currentCardDebt);
  assert.equal(balanceAfter.balance, balanceBefore.balance);
  assert.equal(computeCurrentCardDebt(ctx.transactions.items), "150000.00");
});

test("P0.9 T/U — retroactive tx after CLOSED keeps snapshot; flags reconciliation", async () => {
  const ctx = await setup();
  await ctx.txService.createExpense(ctx.userId, {
    amount: "100000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  const projected = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  const closed = await ctx.statementService.close(
    ctx.userId,
    ctx.card.id,
    projected.statement.id
  );
  assert.equal(closed.statement.closedProjectedAmount, "100000.00");

  await ctx.txService.createExpense(ctx.userId, {
    amount: "20000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-12T12:00:00.000Z"),
  });
  const again = await ctx.statementService.getById(
    ctx.userId,
    ctx.card.id,
    closed.statement.id
  );
  assert.equal(again.statement.closedProjectedAmount, "100000.00");
  assert.equal(again.projectedAmount, "100000.00");
  assert.equal(again.currentDerivedAmount, "120000.00");
  assert.equal(again.hasReconciliationDifference, true);
});

test("P0.9 V — PROJECTED dynamically reflects new recognized expense", async () => {
  const ctx = await setup();
  const view = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(view.projectedAmount, "0.00");
  await ctx.txService.createExpense(ctx.userId, {
    amount: "40000.00",
    currency: "ARS",
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    occurredAt: new Date("2026-09-05T12:00:00.000Z"),
  });
  const refreshed = await ctx.statementService.getById(
    ctx.userId,
    ctx.card.id,
    view.statement.id
  );
  assert.equal(refreshed.projectedAmount, "40000.00");
});

test("P0.9 W — user isolation", async () => {
  const ctx = await setup();
  const created = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  await assert.rejects(
    () =>
      ctx.statementService.getById(
        randomUUID(),
        ctx.card.id,
        created.statement.id
      ),
    (e: unknown) => e instanceof AppError && e.code === "NOT_FOUND"
  );
});

test("P0.9 X — currency mismatch expenses excluded from projection", async () => {
  const ctx = await setup();
  await ctx.transactions.create({
    userId: ctx.userId,
    accountId: null,
    creditCardId: ctx.card.id,
    categoryId: ctx.category.id,
    type: "EXPENSE",
    status: "ACTIVE",
    amount: "10.00",
    currency: "USD",
    occurredAt: new Date("2026-09-10T12:00:00.000Z"),
  });
  const view = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  assert.equal(view.projectedAmount, "0.00");
});

test("P0.9 Y — closing twice rejected", async () => {
  const ctx = await setup();
  const projected = await ctx.statementService.getOrCreateProjected(
    ctx.userId,
    ctx.card.id,
    new Date("2026-09-20T12:00:00.000Z")
  );
  await ctx.statementService.close(
    ctx.userId,
    ctx.card.id,
    projected.statement.id
  );
  await assert.rejects(
    () =>
      ctx.statementService.close(
        ctx.userId,
        ctx.card.id,
        projected.statement.id
      ),
    (e: unknown) => e instanceof AppError && e.code === "VALIDATION_ERROR"
  );
});
