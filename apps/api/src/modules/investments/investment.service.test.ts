import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import type {
  Account,
  AccountRepository,
  CreateAccountInput,
  UpdateAccountInput,
} from "../accounts/account.types.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { FinancialService } from "../financial/financial.service.js";
import { computeBalance } from "../transactions/transaction-balance.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { PrismaInvestmentRepository } from "./investment.repository.js";
import { InvestmentService } from "./investment.service.js";
import type {
  CreateInvestmentRecord,
  Investment,
  InvestmentRepository,
  RenewAtomicInput,
} from "./investment.types.js";

class MemoryTransactionRepository implements TransactionRepository {
  readonly items: Transaction[] = [];
  failNextCreate = false;

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("ATOMIC_FAIL");
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
      .filter((item) => query.type === undefined || item.type === query.type);
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("missing");
    }
    const current = this.items[index]!;
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items[index] = updated;
    return updated;
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: Transaction["reimbursementStatus"] }
  ): Promise<Transaction> {
    const created = await this.create(input);
    await this.update(expense.id, { reimbursementStatus: expense.reimbursementStatus });
    return created;
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    return [await this.create(outgoing), await this.create(incoming)];
  }
}

class MemoryInvestmentRepository implements InvestmentRepository {
  readonly items = new Map<string, Investment>();
  failOnReturn = false;
  failOnUpdate = false;
  failOnNewInvestment = false;
  failOnOutflow = false;

  constructor(private readonly transactions: MemoryTransactionRepository) {}

  async createCaucionAtomic(
    investment: CreateInvestmentRecord,
    transaction: CreateTransactionInput & { id: string }
  ): Promise<{ investment: Investment; transaction: Transaction }> {
    const investmentSnapshot = new Map(this.items);
    const transactionSnapshot = this.transactions.items.slice();
    const now = new Date();
    const created: Investment = {
      ...investment,
      renewedFromInvestmentId: null,
      actualReturn: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(created.id, created);
    try {
      const createdTx = await this.transactions.create(transaction);
      return { investment: created, transaction: createdTx };
    } catch (error) {
      this.items.clear();
      for (const [id, item] of investmentSnapshot) {
        this.items.set(id, item);
      }
      this.transactions.items.splice(
        0,
        this.transactions.items.length,
        ...transactionSnapshot
      );
      throw error;
    }
  }

  async matureAtomic(
    investmentId: string,
    patch: { status: "MATURED"; actualReturn: string },
    principalReturn: CreateTransactionInput & { id: string },
    investmentReturn: (CreateTransactionInput & { id: string }) | null
  ): Promise<{
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
  }> {
    const investmentSnapshot = new Map(this.items);
    const transactionSnapshot = this.transactions.items.slice();
    try {
      const createdPrincipal = await this.transactions.create(principalReturn);
      if (this.failOnReturn) {
        throw new Error("ATOMIC_FAIL_RETURN");
      }
      const createdReturn = investmentReturn
        ? await this.transactions.create(investmentReturn)
        : null;
      if (this.failOnUpdate) {
        throw new Error("ATOMIC_FAIL_UPDATE");
      }
      const current = this.items.get(investmentId);
      if (!current) {
        throw new Error("missing");
      }
      const updated: Investment = {
        ...current,
        status: patch.status,
        actualReturn: patch.actualReturn,
        updatedAt: new Date(),
      };
      this.items.set(investmentId, updated);
      return {
        investment: updated,
        principalReturn: createdPrincipal,
        investmentReturn: createdReturn,
      };
    } catch (error) {
      this.items.clear();
      for (const [id, item] of investmentSnapshot) {
        this.items.set(id, item);
      }
      this.transactions.items.splice(
        0,
        this.transactions.items.length,
        ...transactionSnapshot
      );
      throw error;
    }
  }

  async renewAtomic(input: RenewAtomicInput): Promise<{
    original: Investment;
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
    outflow: Transaction;
  }> {
    const investmentSnapshot = new Map(this.items);
    const transactionSnapshot = this.transactions.items.slice();
    try {
      const createdPrincipal = await this.transactions.create(input.principalReturn);
      if (this.failOnReturn) {
        throw new Error("ATOMIC_FAIL_RETURN");
      }
      const createdReturn = input.investmentReturn
        ? await this.transactions.create(input.investmentReturn)
        : null;
      if (this.failOnNewInvestment) {
        throw new Error("ATOMIC_FAIL_NEW");
      }
      const current = this.items.get(input.originalId);
      if (!current) {
        throw new Error("missing");
      }
      const now = new Date();
      const original: Investment = {
        ...current,
        status: input.originalPatch.status,
        actualReturn: input.originalPatch.actualReturn,
        updatedAt: now,
      };
      this.items.set(original.id, original);
      const created: Investment = {
        ...input.newInvestment,
        actualReturn: null,
        createdAt: now,
        updatedAt: now,
      };
      this.items.set(created.id, created);
      if (this.failOnOutflow) {
        throw new Error("ATOMIC_FAIL_OUTFLOW");
      }
      const outflow = await this.transactions.create(input.outflow);
      return {
        original,
        investment: created,
        principalReturn: createdPrincipal,
        investmentReturn: createdReturn,
        outflow,
      };
    } catch (error) {
      this.items.clear();
      for (const [id, item] of investmentSnapshot) {
        this.items.set(id, item);
      }
      this.transactions.items.splice(
        0,
        this.transactions.items.length,
        ...transactionSnapshot
      );
      throw error;
    }
  }

  async findById(id: string): Promise<Investment | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Investment[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }
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

const unusedCategories = {
  async create() {
    throw new Error("unused");
  },
  async findById() {
    return null;
  },
  async findByUserId() {
    return [];
  },
  async findByUserIdAndName() {
    return null;
  },
  async update() {
    throw new Error("unused");
  },
};

async function setup() {
  const userId = randomUUID();
  const accounts = new MemoryAccountRepository();
  const transactions = new MemoryTransactionRepository();
  const investments = new MemoryInvestmentRepository(transactions);
  const service = new InvestmentService(investments, accounts, transactions);
  const origin = await accounts.create({
    userId,
    name: "Banco origen QA",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  return { userId, accounts, transactions, investments, service, origin };
}

function validCaucion(accountId: string) {
  return {
    accountId,
    currency: "ARS" as const,
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: new Date("2026-09-01T15:00:00.000Z"),
    maturityDate: new Date("2026-09-08T15:00:00.000Z"),
  };
}

function validMature(destinationAccountId: string, actualReturn = "560.00") {
  return {
    destinationAccountId,
    capitalReturned: "100000.00",
    actualReturn,
    occurredAt: new Date("2026-09-08T15:00:00.000Z"),
  };
}

function validRenew(
  accountId: string,
  renewalPrincipal = "100000.00",
  actualReturn = "560.00",
  annualRate = "0.300000"
) {
  return {
    accountId,
    renewalPrincipal,
    actualReturn,
    annualRate,
    occurredAt: new Date("2026-09-08T15:00:00.000Z"),
    maturityDate: new Date("2026-09-15T15:00:00.000Z"),
  };
}

function seedInvestment(
  investments: MemoryInvestmentRepository,
  userId: string,
  accountId: string,
  status: Investment["status"],
  type: Investment["type"] = "CAUCION"
): Investment {
  const now = new Date();
  const item: Investment = {
    id: randomUUID(),
    userId,
    accountId,
    renewedFromInvestmentId: null,
    type,
    status,
    currency: "ARS",
    principal: "100000.00",
    annualRate: "0.300000",
    startDate: new Date("2026-09-01T15:00:00.000Z"),
    maturityDate: new Date("2026-09-08T15:00:00.000Z"),
    expectedReturn: "575.34",
    actualReturn: status === "MATURED" ? "560.00" : null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
  investments.items.set(item.id, item);
  return item;
}

test("InvestmentService creates an ACTIVE CAUCION and INVESTMENT_OUTFLOW atomically", async () => {
  const { service, userId, origin, transactions } = await setup();
  const result = await service.createCaucion(userId, validCaucion(origin.id));

  assert.equal(result.investment.type, "CAUCION");
  assert.equal(result.investment.status, "ACTIVE");
  assert.equal(result.investment.principal, "100000.00");
  assert.equal(result.investment.annualRate, "0.300000");
  assert.equal(result.investment.expectedReturn, "575.34");
  assert.equal(result.investment.actualReturn, null);
  assert.equal(result.investment.renewedFromInvestmentId, null);
  assert.equal(result.investment.accountId, origin.id);
  assert.equal(result.transaction.type, "INVESTMENT_OUTFLOW");
  assert.equal(result.transaction.status, "ACTIVE");
  assert.equal(result.transaction.amount, "100000.00");
  assert.equal(result.transaction.currency, "ARS");
  assert.equal(result.transaction.accountId, origin.id);
  assert.equal(result.transaction.categoryId, null);
  assert.deepEqual(result.transaction.metadata, {
    investmentId: result.investment.id,
  });
  assert.equal(transactions.items.length, 1);
  assert.equal(
    computeBalance(origin.initialBalance, transactions.items),
    "400000.00"
  );
});

test("InvestmentService lists the user's investments with ACTIVE first", async () => {
  const { service, userId, origin, investments } = await setup();
  assert.deepEqual(await service.list(userId), []);
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await service.mature(userId, created.investment.id, validMature(origin.id));
  const active = seedInvestment(investments, userId, origin.id, "ACTIVE");
  seedInvestment(investments, randomUUID(), origin.id, "ACTIVE");
  const listed = await service.list(userId);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.id, active.id);
  assert.equal(listed[0]?.status, "ACTIVE");
  assert.equal(listed[1]?.id, created.investment.id);
  assert.equal(listed[1]?.status, "MATURED");
});

test("InvestmentService allows same calendar day with expectedReturn 0.00", async () => {
  const { service, userId, origin } = await setup();
  const startDate = new Date("2026-09-01T15:00:00.000Z");
  const result = await service.createCaucion(userId, {
    ...validCaucion(origin.id),
    startDate,
    maturityDate: startDate,
  });

  assert.equal(result.investment.expectedReturn, "0.00");
  assert.equal(result.investment.status, "ACTIVE");
});

test("InvestmentService does not require Account.type INVESTMENT", async () => {
  const { service, userId, accounts } = await setup();
  const cash = await accounts.create({
    userId,
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
    initialBalance: "100000.00",
  });
  const result = await service.createCaucion(userId, validCaucion(cash.id));
  assert.equal(result.investment.accountId, cash.id);
});

test("InvestmentService rejects principal 0, negative rate and inverted calendar dates", async () => {
  const { service, userId, origin } = await setup();
  await assert.rejects(
    () => service.createCaucion(userId, { ...validCaucion(origin.id), principal: "0.00" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.createCaucion(userId, {
        ...validCaucion(origin.id),
        annualRate: "-0.100000",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.createCaucion(userId, {
        ...validCaucion(origin.id),
        startDate: new Date("2026-09-08T15:00:00.000Z"),
        maturityDate: new Date("2026-09-01T15:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("InvestmentService rejects a missing, foreign or inactive origin account", async () => {
  const { service, userId, accounts, origin } = await setup();
  await assert.rejects(
    () => service.createCaucion(userId, validCaucion(randomUUID())),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });
  await assert.rejects(
    () => service.createCaucion(userId, validCaucion(foreign.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  await accounts.update(origin.id, { isActive: false });
  await assert.rejects(
    () => service.createCaucion(userId, validCaucion(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
});

test("InvestmentService rejects currency mismatch and insufficient balance", async () => {
  const { service, userId, accounts, origin } = await setup();
  await assert.rejects(
    () =>
      service.createCaucion(userId, {
        ...validCaucion(origin.id),
        currency: "USD",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
  const small = await accounts.create({
    userId,
    name: "Saldo bajo",
    currency: "ARS",
    type: "BANK",
    initialBalance: "99999.99",
  });
  await assert.rejects(
    () => service.createCaucion(userId, validCaucion(small.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "INSUFFICIENT_BALANCE"
  );
});

test("InvestmentService rolls back when the outflow write fails", async () => {
  const { service, userId, origin, transactions, investments } = await setup();
  transactions.failNextCreate = true;

  await assert.rejects(() => service.createCaucion(userId, validCaucion(origin.id)));
  assert.equal(investments.items.size, 0);
  assert.equal(transactions.items.length, 0);
});

test("TransactionService rejects PATCH and VOID of INVESTMENT_OUTFLOW", async () => {
  const { service, userId, origin, transactions, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const txService = new TransactionService(transactions, accounts, unusedCategories);

  await assert.rejects(
    () => txService.update(userId, created.transaction.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_OUTFLOW_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, created.transaction.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_OUTFLOW_IMMUTABLE"
  );
});

test("InvestmentService persists a fictional caución on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const investments = new PrismaInvestmentRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new InvestmentService(investments, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Investment M6.2" });
  const origin = await accounts.create({
    userId: user.id,
    name: `Banco M6.2 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });

  try {
    const result = await service.createCaucion(user.id, validCaucion(origin.id));
    assert.equal(result.investment.type, "CAUCION");
    assert.equal(result.investment.status, "ACTIVE");
    assert.equal(result.investment.expectedReturn, "575.34");
    assert.equal(result.transaction.type, "INVESTMENT_OUTFLOW");
    assert.equal(result.transaction.categoryId, null);
    assert.deepEqual(result.transaction.metadata, {
      investmentId: result.investment.id,
    });
    const movements = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(origin.initialBalance, movements), "400000.00");

    await assert.rejects(() =>
      investments.createCaucionAtomic(
        {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "CAUCION",
          status: "ACTIVE",
          currency: "ARS",
          principal: "1.00",
          annualRate: "0.300000",
          startDate: new Date("2026-09-01T15:00:00.000Z"),
          maturityDate: new Date("2026-09-08T15:00:00.000Z"),
          expectedReturn: "0.01",
          notes: null,
        },
        {
          id: randomUUID(),
          userId: randomUUID(),
          accountId: origin.id,
          type: "INVESTMENT_OUTFLOW",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-01T15:00:00.000Z"),
          metadata: { investmentId: randomUUID() },
        }
      )
    );
    assert.equal(await prisma.investment.count({ where: { userId: user.id } }), 1);
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "INVESTMENT_OUTFLOW" },
      }),
      1
    );
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.investment.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: origin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("InvestmentService matures an ACTIVE CAUCION with principal and yield credits", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const matured = await service.mature(userId, created.investment.id, validMature(origin.id));

  assert.equal(matured.investment.status, "MATURED");
  assert.equal(matured.investment.expectedReturn, "575.34");
  assert.equal(matured.investment.actualReturn, "560.00");
  assert.equal(matured.destinationAccountId, origin.id);
  assert.equal(matured.principalReturn.type, "INVESTMENT_PRINCIPAL_RETURN");
  assert.equal(matured.principalReturn.amount, "100000.00");
  assert.equal(matured.principalReturn.accountId, origin.id);
  assert.equal(matured.principalReturn.categoryId, null);
  assert.deepEqual(matured.principalReturn.metadata, {
    investmentId: created.investment.id,
  });
  assert.equal(matured.investmentReturn?.type, "INVESTMENT_RETURN");
  assert.equal(matured.investmentReturn?.amount, "560.00");
  assert.equal(matured.investmentReturn?.categoryId, null);
  assert.deepEqual(matured.investmentReturn?.metadata, {
    investmentId: created.investment.id,
  });
  assert.equal(
    computeBalance(origin.initialBalance, transactions.items),
    "500560.00"
  );
});

test("InvestmentService allows actualReturn 0 without a zero-amount transaction", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const matured = await service.mature(
    userId,
    created.investment.id,
    validMature(origin.id, "0.00")
  );

  assert.equal(matured.investment.status, "MATURED");
  assert.equal(matured.investment.actualReturn, "0.00");
  assert.equal(matured.investment.expectedReturn, "575.34");
  assert.equal(matured.investmentReturn, null);
  assert.equal(
    transactions.items.filter((item) => item.type === "INVESTMENT_RETURN").length,
    0
  );
  assert.equal(
    transactions.items.filter((item) => item.type === "INVESTMENT_PRINCIPAL_RETURN").length,
    1
  );
  assert.equal(computeBalance(origin.initialBalance, transactions.items), "500000.00");
});

test("InvestmentService rejects missing, foreign and non-ACTIVE investments", async () => {
  const { service, userId, origin, investments } = await setup();
  await assert.rejects(
    () => service.mature(userId, randomUUID(), validMature(origin.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = seedInvestment(investments, randomUUID(), origin.id, "ACTIVE");
  await assert.rejects(
    () => service.mature(userId, foreign.id, validMature(origin.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  for (const status of ["DRAFT", "MATURED", "RENEWED", "CANCELLED"] as const) {
    const item = seedInvestment(investments, userId, origin.id, status);
    await assert.rejects(
      () => service.mature(userId, item.id, validMature(origin.id)),
      (error: unknown) =>
        error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
    );
  }
  const other = seedInvestment(investments, userId, origin.id, "ACTIVE", "OTHER");
  await assert.rejects(
    () => service.mature(userId, other.id, validMature(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("InvestmentService rejects a second mature without extra movements", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await service.mature(userId, created.investment.id, validMature(origin.id));
  const count = transactions.items.length;

  await assert.rejects(
    () => service.mature(userId, created.investment.id, validMature(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
  );
  assert.equal(transactions.items.length, count);
  assert.equal(computeBalance(origin.initialBalance, transactions.items), "500560.00");
});

test("InvestmentService rejects destination account problems and capital/return mismatches", async () => {
  const { service, userId, origin, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        destinationAccountId: randomUUID(),
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "BANK",
    initialBalance: "0.00",
  });
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        destinationAccountId: foreign.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const usd = await accounts.create({
    userId,
    name: "USD",
    currency: "USD",
    type: "BANK",
    initialBalance: "100000.00",
  });
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        destinationAccountId: usd.id,
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
  await accounts.update(origin.id, { isActive: false });
  await assert.rejects(
    () => service.mature(userId, created.investment.id, validMature(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
  await accounts.update(origin.id, { isActive: true });
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        capitalReturned: "99999.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        capitalReturned: "100001.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        actualReturn: "-10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("InvestmentService compares occurredAt to maturityDate by ART calendar day", async () => {
  const { service, userId, origin } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        occurredAt: new Date("2026-09-07T15:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.mature(userId, created.investment.id, {
        ...validMature(origin.id),
        occurredAt: new Date("2026-09-08T02:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  const sameDay = await service.mature(userId, created.investment.id, {
    ...validMature(origin.id),
    occurredAt: new Date("2026-09-08T03:00:00.000Z"),
  });
  assert.equal(sameDay.investment.status, "MATURED");
});

test("InvestmentService accepts occurredAt after maturityDate", async () => {
  const { service, userId, origin } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const matured = await service.mature(userId, created.investment.id, {
    ...validMature(origin.id),
    occurredAt: new Date("2026-09-10T15:00:00.000Z"),
  });
  assert.equal(matured.investment.status, "MATURED");
});

test("InvestmentService rolls back if yield write or investment update fails", async () => {
  const { service, userId, origin, transactions, investments } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  investments.failOnReturn = true;
  await assert.rejects(() =>
    service.mature(userId, created.investment.id, validMature(origin.id))
  );
  assert.equal((await investments.findById(created.investment.id))?.status, "ACTIVE");
  assert.equal(
    transactions.items.filter((item) => item.type !== "INVESTMENT_OUTFLOW").length,
    0
  );

  investments.failOnReturn = false;
  investments.failOnUpdate = true;
  await assert.rejects(() =>
    service.mature(userId, created.investment.id, validMature(origin.id))
  );
  assert.equal((await investments.findById(created.investment.id))?.status, "ACTIVE");
  assert.equal(
    transactions.items.filter((item) => item.type !== "INVESTMENT_OUTFLOW").length,
    0
  );
});

test("TransactionService rejects PATCH and VOID of maturity movements", async () => {
  const { service, userId, origin, transactions, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const matured = await service.mature(userId, created.investment.id, validMature(origin.id));
  const txService = new TransactionService(transactions, accounts, unusedCategories);

  await assert.rejects(
    () =>
      txService.update(userId, matured.principalReturn.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, matured.principalReturn.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () =>
      txService.update(userId, matured.investmentReturn!.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, matured.investmentReturn!.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_RETURN_IMMUTABLE"
  );
});

test("InvestmentService persists a fictional maturity on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const investments = new PrismaInvestmentRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new InvestmentService(investments, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Investment M6.3" });
  const origin = await accounts.create({
    userId: user.id,
    name: `Banco M6.3 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });

  try {
    const created = await service.createCaucion(user.id, validCaucion(origin.id));
    const matured = await service.mature(user.id, created.investment.id, validMature(origin.id));
    assert.equal(matured.investment.status, "MATURED");
    assert.equal(matured.investment.expectedReturn, "575.34");
    assert.equal(matured.investment.actualReturn, "560.00");
    assert.equal(matured.principalReturn.type, "INVESTMENT_PRINCIPAL_RETURN");
    assert.equal(matured.principalReturn.amount, "100000.00");
    assert.equal(matured.investmentReturn?.type, "INVESTMENT_RETURN");
    assert.equal(matured.investmentReturn?.amount, "560.00");
    const movements = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(origin.initialBalance, movements), "500560.00");

    await assert.rejects(
      () => service.mature(user.id, created.investment.id, validMature(origin.id)),
      (error: unknown) =>
        error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
    );
    const afterSecond = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(origin.initialBalance, afterSecond), "500560.00");
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "INVESTMENT_PRINCIPAL_RETURN" },
      }),
      1
    );
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "INVESTMENT_RETURN" },
      }),
      1
    );

    await assert.rejects(() =>
      investments.matureAtomic(
        created.investment.id,
        { status: "MATURED", actualReturn: "1.00" },
        {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "INVESTMENT_PRINCIPAL_RETURN",
          amount: "100000.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: created.investment.id },
        },
        {
          id: randomUUID(),
          userId: randomUUID(),
          accountId: origin.id,
          type: "INVESTMENT_RETURN",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: created.investment.id },
        }
      )
    );
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "INVESTMENT_PRINCIPAL_RETURN" },
      }),
      1
    );
    assert.equal((await investments.findById(created.investment.id))?.actualReturn, "560.00");

    await assert.rejects(() =>
      investments.matureAtomic(
        randomUUID(),
        { status: "MATURED", actualReturn: "1.00" },
        {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "INVESTMENT_PRINCIPAL_RETURN",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: created.investment.id },
        },
        null
      )
    );
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "INVESTMENT_PRINCIPAL_RETURN" },
      }),
      1
    );

    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'transaction_type_enum'
      ORDER BY e.enumsortorder
    `;
    assert.ok(labels.some((row) => row.enumlabel === "INVESTMENT_PRINCIPAL_RETURN"));
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.investment.deleteMany({ where: { userId: user.id, renewedFromInvestmentId: { not: null } } });
    await prisma.investment.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: origin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("InvestmentService renews a CAUCION in full and preserves original history", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const originalExpected = created.investment.expectedReturn;
  const originalRate = created.investment.annualRate;
  const originalStart = created.investment.startDate.toISOString();
  const originalMaturity = created.investment.maturityDate!.toISOString();
  const renewed = await service.renew(userId, created.investment.id, validRenew(origin.id));

  assert.equal(renewed.original.status, "RENEWED");
  assert.equal(renewed.original.actualReturn, "560.00");
  assert.equal(renewed.original.principal, "100000.00");
  assert.equal(renewed.original.annualRate, originalRate);
  assert.equal(renewed.original.expectedReturn, originalExpected);
  assert.equal(renewed.original.startDate.toISOString(), originalStart);
  assert.equal(renewed.original.maturityDate!.toISOString(), originalMaturity);
  assert.equal(renewed.investment.status, "ACTIVE");
  assert.equal(renewed.investment.type, "CAUCION");
  assert.equal(renewed.investment.principal, "100000.00");
  assert.equal(renewed.investment.annualRate, "0.300000");
  assert.equal(renewed.investment.expectedReturn, "575.34");
  assert.equal(renewed.investment.renewedFromInvestmentId, created.investment.id);
  assert.equal(renewed.investment.actualReturn, null);
  assert.equal(renewed.investment.startDate.toISOString(), renewed.occurredAt.toISOString());
  assert.equal(renewed.principalReturn.type, "INVESTMENT_PRINCIPAL_RETURN");
  assert.equal(renewed.principalReturn.amount, "100000.00");
  assert.deepEqual(renewed.principalReturn.metadata, { investmentId: created.investment.id });
  assert.equal(renewed.investmentReturn?.type, "INVESTMENT_RETURN");
  assert.equal(renewed.investmentReturn?.amount, "560.00");
  assert.deepEqual(renewed.investmentReturn?.metadata, { investmentId: created.investment.id });
  assert.equal(renewed.outflow.type, "INVESTMENT_OUTFLOW");
  assert.equal(renewed.outflow.amount, "100000.00");
  assert.deepEqual(renewed.outflow.metadata, { investmentId: renewed.investment.id });
  assert.equal(computeBalance(origin.initialBalance, transactions.items), "400560.00");
});

test("InvestmentService renews a CAUCION partially without capitalizing yield", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const renewed = await service.renew(
    userId,
    created.investment.id,
    validRenew(origin.id, "70000.00", "560.00", "0.280000")
  );

  assert.equal(renewed.original.status, "RENEWED");
  assert.equal(renewed.investment.principal, "70000.00");
  assert.equal(renewed.investment.annualRate, "0.280000");
  assert.equal(renewed.investment.expectedReturn, "375.89");
  assert.equal(renewed.outflow.amount, "70000.00");
  assert.equal(computeBalance(origin.initialBalance, transactions.items), "430560.00");
});

test("InvestmentService renewal movements are not operating metrics", async () => {
  const { service, userId, origin, transactions, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await service.renew(
    userId,
    created.investment.id,
    validRenew(origin.id, "70000.00", "560.00", "0.280000")
  );
  const financial = new FinancialService(transactions, accounts);
  const tz = DEFAULT_USER_TIMEZONE;
  assert.equal(await financial.getMonthlyGrossExpenses(userId, 2026, 9, tz), "0.00");
  assert.equal(await financial.getMonthlyNetExpenses(userId, 2026, 9, tz), "0.00");
  assert.equal(await financial.getMonthlyOperatingIncome(userId, 2026, 9, tz), "0.00");
  assert.equal(await financial.getMonthlyFundConsumption(userId, 2026, 9, tz), "0.00");
});

test("InvestmentService allows actualReturn 0 on renew without a zero-amount return", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const renewed = await service.renew(
    userId,
    created.investment.id,
    validRenew(origin.id, "100000.00", "0.00")
  );

  assert.equal(renewed.original.status, "RENEWED");
  assert.equal(renewed.original.actualReturn, "0.00");
  assert.equal(renewed.investmentReturn, null);
  assert.equal(
    transactions.items.filter((item) => item.type === "INVESTMENT_RETURN").length,
    0
  );
  assert.equal(computeBalance(origin.initialBalance, transactions.items), "400000.00");
});

test("InvestmentService allows a full renew when pre-renewal balance is zero", async () => {
  const { service, userId, accounts, transactions } = await setup();
  const tight = await accounts.create({
    userId,
    name: "Saldo justo",
    currency: "ARS",
    type: "BANK",
    initialBalance: "100000.00",
  });
  const created = await service.createCaucion(userId, validCaucion(tight.id));
  assert.equal(computeBalance(tight.initialBalance, transactions.items), "0.00");
  const renewed = await service.renew(userId, created.investment.id, validRenew(tight.id));
  assert.equal(renewed.original.status, "RENEWED");
  assert.equal(computeBalance(tight.initialBalance, transactions.items), "560.00");
});

test("InvestmentService rejects missing, foreign and non-ACTIVE renewals", async () => {
  const { service, userId, origin, investments } = await setup();
  await assert.rejects(
    () => service.renew(userId, randomUUID(), validRenew(origin.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = seedInvestment(investments, randomUUID(), origin.id, "ACTIVE");
  await assert.rejects(
    () => service.renew(userId, foreign.id, validRenew(origin.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  for (const status of ["DRAFT", "MATURED", "RENEWED", "CANCELLED"] as const) {
    const item = seedInvestment(investments, userId, origin.id, status);
    await assert.rejects(
      () => service.renew(userId, item.id, validRenew(origin.id)),
      (error: unknown) =>
        error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
    );
  }
});

test("InvestmentService rejects a second renew without extra movements", async () => {
  const { service, userId, origin, transactions } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const first = await service.renew(userId, created.investment.id, validRenew(origin.id));
  const count = transactions.items.length;

  await assert.rejects(
    () => service.renew(userId, created.investment.id, validRenew(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
  );
  assert.equal(transactions.items.length, count);
  assert.equal(first.investment.status, "ACTIVE");
});

test("InvestmentService rejects invalid renewal account, amounts, rate and dates", async () => {
  const { service, userId, origin, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  await assert.rejects(
    () => service.renew(userId, created.investment.id, validRenew(randomUUID())),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "ARS",
    type: "BANK",
    initialBalance: "0.00",
  });
  await assert.rejects(
    () => service.renew(userId, created.investment.id, validRenew(foreign.id)),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const usd = await accounts.create({
    userId,
    name: "USD",
    currency: "USD",
    type: "BANK",
    initialBalance: "100000.00",
  });
  await assert.rejects(
    () => service.renew(userId, created.investment.id, validRenew(usd.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
  await accounts.update(origin.id, { isActive: false });
  await assert.rejects(
    () => service.renew(userId, created.investment.id, validRenew(origin.id)),
    (error: unknown) =>
      error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
  await accounts.update(origin.id, { isActive: true });
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        renewalPrincipal: "0.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        renewalPrincipal: "-1.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        renewalPrincipal: "100001.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        actualReturn: "-10.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        annualRate: "-0.100000",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        occurredAt: new Date("2026-09-07T15:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.renew(userId, created.investment.id, {
        ...validRenew(origin.id),
        maturityDate: new Date("2026-09-07T15:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("InvestmentService rolls back a failed renew and keeps the original ACTIVE", async () => {
  const { service, userId, origin, transactions, investments } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));

  investments.failOnReturn = true;
  await assert.rejects(() =>
    service.renew(userId, created.investment.id, validRenew(origin.id))
  );
  assert.equal((await investments.findById(created.investment.id))?.status, "ACTIVE");
  assert.equal(transactions.items.filter((item) => item.type !== "INVESTMENT_OUTFLOW").length, 0);

  investments.failOnReturn = false;
  investments.failOnNewInvestment = true;
  await assert.rejects(() =>
    service.renew(userId, created.investment.id, validRenew(origin.id))
  );
  assert.equal((await investments.findById(created.investment.id))?.status, "ACTIVE");
  assert.equal(investments.items.size, 1);

  investments.failOnNewInvestment = false;
  investments.failOnOutflow = true;
  await assert.rejects(() =>
    service.renew(userId, created.investment.id, validRenew(origin.id))
  );
  assert.equal((await investments.findById(created.investment.id))?.status, "ACTIVE");
  assert.equal(investments.items.size, 1);
  assert.equal(transactions.items.length, 1);
});

test("TransactionService rejects PATCH and VOID of renewal movements", async () => {
  const { service, userId, origin, transactions, accounts } = await setup();
  const created = await service.createCaucion(userId, validCaucion(origin.id));
  const renewed = await service.renew(userId, created.investment.id, validRenew(origin.id));
  const txService = new TransactionService(transactions, accounts, unusedCategories);

  await assert.rejects(
    () =>
      txService.update(userId, renewed.principalReturn.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, renewed.principalReturn.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_PRINCIPAL_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () =>
      txService.update(userId, renewed.investmentReturn!.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, renewed.investmentReturn!.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_RETURN_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.update(userId, renewed.outflow.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_OUTFLOW_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, renewed.outflow.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "INVESTMENT_OUTFLOW_IMMUTABLE"
  );
});

test("InvestmentService persists a fictional renewal on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const investments = new PrismaInvestmentRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new InvestmentService(investments, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Investment M6.4" });
  const origin = await accounts.create({
    userId: user.id,
    name: `Banco M6.4 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "500000.00",
  });

  try {
    const created = await service.createCaucion(user.id, validCaucion(origin.id));
    const renewed = await service.renew(
      user.id,
      created.investment.id,
      validRenew(origin.id, "70000.00", "560.00", "0.280000")
    );
    assert.equal(renewed.original.status, "RENEWED");
    assert.equal(renewed.original.actualReturn, "560.00");
    assert.equal(renewed.original.expectedReturn, "575.34");
    assert.equal(renewed.investment.status, "ACTIVE");
    assert.equal(renewed.investment.principal, "70000.00");
    assert.equal(renewed.investment.annualRate, "0.280000");
    assert.equal(renewed.investment.expectedReturn, "375.89");
    assert.equal(renewed.investment.renewedFromInvestmentId, created.investment.id);
    assert.equal(renewed.principalReturn.amount, "100000.00");
    assert.equal(renewed.principalReturn.type, "INVESTMENT_PRINCIPAL_RETURN");
    assert.equal(renewed.investmentReturn?.amount, "560.00");
    assert.equal(renewed.outflow.amount, "70000.00");
    const movements = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(origin.initialBalance, movements), "430560.00");

    await assert.rejects(
      () => service.renew(user.id, created.investment.id, validRenew(origin.id)),
      (error: unknown) =>
        error instanceof AppError && error.code === "INVESTMENT_NOT_ACTIVE"
    );
    const afterSecond = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(origin.initialBalance, afterSecond), "430560.00");

    await assert.rejects(() =>
      investments.renewAtomic({
        originalId: created.investment.id,
        originalPatch: { status: "RENEWED", actualReturn: "1.00" },
        newInvestment: {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "CAUCION",
          status: "ACTIVE",
          currency: "ARS",
          principal: "1.00",
          annualRate: "0.280000",
          startDate: new Date("2026-09-08T15:00:00.000Z"),
          maturityDate: new Date("2026-09-15T15:00:00.000Z"),
          expectedReturn: "0.01",
          notes: null,
          renewedFromInvestmentId: created.investment.id,
        },
        principalReturn: {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "INVESTMENT_PRINCIPAL_RETURN",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: created.investment.id },
        },
        investmentReturn: {
          id: randomUUID(),
          userId: randomUUID(),
          accountId: origin.id,
          type: "INVESTMENT_RETURN",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: created.investment.id },
        },
        outflow: {
          id: randomUUID(),
          userId: user.id,
          accountId: origin.id,
          type: "INVESTMENT_OUTFLOW",
          amount: "1.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-08T15:00:00.000Z"),
          metadata: { investmentId: randomUUID() },
        },
      })
    );
    assert.equal(await prisma.investment.count({ where: { userId: user.id } }), 2);
    assert.equal((await investments.findById(created.investment.id))?.status, "RENEWED");
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.investment.deleteMany({
      where: { userId: user.id, renewedFromInvestmentId: { not: null } },
    });
    await prisma.investment.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: origin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
