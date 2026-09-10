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
import { PrismaUserRepository } from "../users/user.repository.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { HousingService } from "./housing.service.js";
import { PrismaHousingObligationRepository } from "./housing.repository.js";
import { computeBalance } from "../transactions/transaction-balance.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
  UpdateTransactionRecord,
} from "../transactions/transaction.types.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateHousingObligationInput,
  CreateHousingPaymentRecord,
  HousingObligation,
  HousingObligationRepository,
  HousingPayment,
  UpdateHousingObligationRecord,
} from "./housing.types.js";
import { RemainingInstallmentsConflictError } from "./housing.types.js";

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
      .filter((item) => query.type === undefined || item.type === query.type)
      .filter((item) => query.currency === undefined || item.currency === query.currency);
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

class MemoryHousingRepository implements HousingObligationRepository {
  readonly items = new Map<string, HousingObligation>();
  readonly payments = new Map<string, HousingPayment>();

  constructor(private readonly transactions = new MemoryTransactionRepository()) {}

  async create(input: CreateHousingObligationInput): Promise<HousingObligation> {
    const now = new Date();
    const item: HousingObligation = {
      id: randomUUID(),
      userId: input.userId,
      reserveAccountId: input.reserveAccountId ?? null,
      name: input.name,
      currency: input.currency,
      installmentAmount: input.installmentAmount,
      remainingInstallments: input.remainingInstallments,
      dueDay: input.dueDay ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(item.id, item);
    return item;
  }

  async findById(id: string): Promise<HousingObligation | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<HousingObligation[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async update(
    id: string,
    input: UpdateHousingObligationRecord
  ): Promise<HousingObligation> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async findPaymentsByObligationId(obligationId: string): Promise<HousingPayment[]> {
    return [...this.payments.values()]
      .filter((item) => item.housingObligationId === obligationId)
      .sort((left, right) => {
        const byPaid = right.paidAt.getTime() - left.paidAt.getTime();
        if (byPaid !== 0) {
          return byPaid;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  async registerPaymentAtomic(
    payment: CreateHousingPaymentRecord,
    transaction: CreateTransactionInput & { id: string },
    obligationId: string
  ) {
    const obligationSnapshot = new Map(this.items);
    const paymentSnapshot = new Map(this.payments);
    const transactionSnapshot = this.transactions.items.slice();
    try {
      const current = this.items.get(obligationId);
      if (!current || current.remainingInstallments <= 0) {
        throw new RemainingInstallmentsConflictError();
      }
      const createdTx = await this.transactions.create(transaction);
      const createdPayment: HousingPayment = {
        ...payment,
        createdAt: new Date(),
      };
      this.payments.set(createdPayment.id, createdPayment);
      const updated: HousingObligation = {
        ...current,
        remainingInstallments: current.remainingInstallments - 1,
        updatedAt: new Date(),
      };
      this.items.set(obligationId, updated);
      return {
        payment: createdPayment,
        transaction: createdTx,
        obligation: updated,
      };
    } catch (error) {
      this.items.clear();
      for (const [id, item] of obligationSnapshot) {
        this.items.set(id, item);
      }
      this.payments.clear();
      for (const [id, item] of paymentSnapshot) {
        this.payments.set(id, item);
      }
      this.transactions.items.splice(0, this.transactions.items.length, ...transactionSnapshot);
      throw error;
    }
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

async function setup() {
  const userId = randomUUID();
  const accounts = new MemoryAccountRepository();
  const transactions = new MemoryTransactionRepository();
  const housing = new MemoryHousingRepository(transactions);
  const service = new HousingService(housing, accounts, transactions);
  const reserve = await accounts.create({
    userId,
    name: "Reserva vivienda QA",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  return { userId, accounts, housing, service, reserve, transactions };
}

test("HousingService creates a configurable obligation without hardcoded personal amounts", async () => {
  const { service, userId, reserve } = await setup();
  const created = await service.create(userId, {
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    dueDay: 10,
    reserveAccountId: reserve.id,
  });

  assert.equal(created.name, "Casa QA");
  assert.equal(created.currency, "USD");
  assert.equal(created.installmentAmount, "500.00");
  assert.equal(created.remainingInstallments, 12);
  assert.equal(created.dueDay, 10);
  assert.equal(created.reserveAccountId, reserve.id);
  assert.equal(created.isActive, true);
});

test("HousingService rejects installment amount 0 and a negative remaining count", async () => {
  const { service, userId } = await setup();
  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Casa QA",
        currency: "USD",
        installmentAmount: "0.00",
        remainingInstallments: 12,
      }),
    (error: unknown) => error instanceof Error && error.message.includes("mayor que 0")
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Casa QA",
        currency: "USD",
        installmentAmount: "500.00",
        remainingInstallments: -1,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("mayor o igual a 0")
  );
});

test("HousingService rejects a reserve account with another currency or owner", async () => {
  const { service, userId, accounts } = await setup();
  const ars = await accounts.create({
    userId,
    name: "Caja ARS",
    currency: "ARS",
    type: "CASH",
  });
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "USD",
    type: "HOUSING_RESERVE",
  });

  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Casa QA",
        currency: "USD",
        installmentAmount: "500.00",
        remainingInstallments: 4,
        reserveAccountId: ars.id,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("misma moneda")
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        name: "Casa QA",
        currency: "USD",
        installmentAmount: "500.00",
        remainingInstallments: 4,
        reserveAccountId: foreign.id,
      }),
    (error: unknown) => error instanceof Error && error.message.includes("Cuenta no encontrada")
  );
});

test("HousingService lists only the current user and updates documented fields", async () => {
  const { service, userId } = await setup();
  const created = await service.create(userId, {
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 8,
  });
  await service.create(randomUUID(), {
    name: "Ajena",
    currency: "USD",
    installmentAmount: "900.00",
    remainingInstallments: 3,
  });

  const listed = await service.list(userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);

  await assert.rejects(
    () => service.getById(userId, randomUUID()),
    (error: unknown) => error instanceof Error && error.message.includes("no existe")
  );

  const updated = await service.update(userId, created.id, {
    name: "Casa actualizada",
    installmentAmount: "550.00",
    remainingInstallments: 7,
    dueDay: 15,
  });
  assert.equal(updated.name, "Casa actualizada");
  assert.equal(updated.installmentAmount, "550.00");
  assert.equal(updated.remainingInstallments, 7);
  assert.equal(updated.dueDay, 15);
});

test("HousingService persists a fictional obligation on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const housing = new PrismaHousingObligationRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new HousingService(housing, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Housing M5.1" });
  const reserve = await accounts.create({
    userId: user.id,
    name: `Reserva M5.1 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
  });

  try {
    const created = await service.create(user.id, {
      name: "Obligación QA",
      currency: "USD",
      installmentAmount: "250.50",
      remainingInstallments: 6,
      dueDay: 5,
      reserveAccountId: reserve.id,
    });
    assert.equal(created.installmentAmount, "250.50");
    assert.equal(created.remainingInstallments, 6);
    const found = await service.getById(user.id, created.id);
    assert.equal(found.name, "Obligación QA");
  } finally {
    await prisma.housingObligation.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: reserve.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

async function paymentSetup() {
  const ctx = await setup();
  const obligation = await ctx.service.create(ctx.userId, {
    name: "Casa QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: ctx.reserve.id,
  });
  return { ...ctx, obligation };
}

test("HousingService registerPayment persists payment, transaction and decrements remaining", async () => {
  const { service, userId, reserve, housing, transactions, obligation } = await paymentSetup();
  const result = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
  });

  assert.equal(result.payment.amount, "500.00");
  assert.equal(result.payment.currency, "USD");
  assert.equal(result.payment.accountId, reserve.id);
  assert.equal(result.payment.housingObligationId, obligation.id);
  assert.equal(result.payment.transactionId, result.transaction.id);
  assert.equal(housing.payments.size, 1);
  assert.equal(result.transaction.type, "HOUSING_PAYMENT");
  assert.equal(result.transaction.status, "ACTIVE");
  assert.equal(result.transaction.categoryId, null);
  assert.equal(result.transaction.relatedTransactionId, null);
  assert.equal(result.transaction.reimbursementStatus, "NONE");
  assert.deepEqual(result.transaction.metadata, {
    housingPaymentId: result.payment.id,
    housingObligationId: obligation.id,
  });
  assert.equal(result.remainingInstallments, 11);
  assert.equal(result.isActive, true);
  assert.equal(
    computeBalance(reserve.initialBalance, transactions.items),
    "1500.00"
  );
});

test("HousingService registerPayment defaults amount to installmentAmount", async () => {
  const { service, userId, reserve, obligation } = await paymentSetup();
  const result = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
  });
  assert.equal(result.payment.amount, "500.00");
  assert.equal(result.remainingInstallments, 11);
});

test("HousingService registerPayment keeps isActive when remaining reaches 0", async () => {
  const { service, userId, reserve } = await setup();
  const obligation = await service.create(userId, {
    name: "Última cuota QA",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 1,
    reserveAccountId: reserve.id,
  });
  const result = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
  });
  assert.equal(result.remainingInstallments, 0);
  assert.equal(result.isActive, true);
});

test("HousingService registerPayment rejects missing, foreign and inactive obligations", async () => {
  const { service, userId, reserve } = await setup();
  const inactive = await service.create(userId, {
    name: "Inactiva",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
  });
  await service.update(userId, inactive.id, { isActive: false });
  const zero = await service.create(userId, {
    name: "Sin cuotas",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 0,
  });
  const foreign = await service.create(randomUUID(), {
    name: "Ajena",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 3,
  });

  await assert.rejects(
    () => service.registerPayment(userId, randomUUID(), { accountId: reserve.id }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  await assert.rejects(
    () => service.registerPayment(userId, foreign.id, { accountId: reserve.id }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  await assert.rejects(
    () => service.registerPayment(userId, inactive.id, { accountId: reserve.id }),
    (error: unknown) =>
      error instanceof AppError && error.code === "HOUSING_OBLIGATION_INACTIVE"
  );
  await assert.rejects(
    () => service.registerPayment(userId, zero.id, { accountId: reserve.id }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NO_REMAINING_INSTALLMENTS"
  );
});

test("HousingService registerPayment rejects invalid accounts and amounts", async () => {
  const { service, userId, accounts, obligation } = await paymentSetup();
  const inactive = await accounts.create({
    userId,
    name: "Inactiva",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
    isActive: false,
  });
  const ars = await accounts.create({
    userId,
    name: "Caja ARS",
    currency: "ARS",
    type: "CASH",
    initialBalance: "2000.00",
  });
  const foreign = await accounts.create({
    userId: randomUUID(),
    name: "Ajena",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const empty = await accounts.create({
    userId,
    name: "Sin saldo",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "100.00",
  });

  await assert.rejects(
    () => service.registerPayment(userId, obligation.id, { accountId: randomUUID() }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  await assert.rejects(
    () => service.registerPayment(userId, obligation.id, { accountId: foreign.id }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  await assert.rejects(
    () => service.registerPayment(userId, obligation.id, { accountId: inactive.id }),
    (error: unknown) => error instanceof AppError && error.code === "ACCOUNT_INACTIVE"
  );
  await assert.rejects(
    () => service.registerPayment(userId, obligation.id, { accountId: ars.id }),
    (error: unknown) => error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );
  await assert.rejects(
    () =>
      service.registerPayment(userId, obligation.id, {
        accountId: empty.id,
        amount: "0.00",
      }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.registerPayment(userId, obligation.id, {
        accountId: empty.id,
        amount: "-10.00",
      }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.registerPayment(userId, obligation.id, {
        accountId: empty.id,
        amount: "500.00",
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === "INSUFFICIENT_BALANCE"
  );
});

test("HousingService registerPayment rolls back when remaining cannot decrement", async () => {
  const { housing, reserve, obligation, transactions } = await paymentSetup();
  await housing.update(obligation.id, { remainingInstallments: 0 });

  await assert.rejects(
    () =>
      housing.registerPaymentAtomic(
        {
          id: randomUUID(),
          housingObligationId: obligation.id,
          transactionId: randomUUID(),
          accountId: reserve.id,
          amount: "500.00",
          currency: "USD",
          installmentNumber: null,
          paidAt: new Date(),
        },
        {
          id: randomUUID(),
          userId: obligation.userId,
          accountId: reserve.id,
          type: "HOUSING_PAYMENT",
          amount: "500.00",
          currency: "USD",
          occurredAt: new Date(),
          metadata: {
            housingPaymentId: randomUUID(),
            housingObligationId: obligation.id,
          },
        },
        obligation.id
      ),
    (error: unknown) => error instanceof RemainingInstallmentsConflictError
  );

  assert.equal(housing.payments.size, 0);
  assert.equal(transactions.items.length, 0);
  assert.equal((await housing.findById(obligation.id))?.remainingInstallments, 0);
});

test("TransactionService rejects PATCH and VOID of HOUSING_PAYMENT", async () => {
  const { service, userId, reserve, obligation, transactions, accounts } =
    await paymentSetup();
  const paid = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
  });
  const txService = new TransactionService(
    transactions,
    accounts,
    {
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
    }
  );

  await assert.rejects(
    () => txService.update(userId, paid.transaction.id, { description: "no" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "HOUSING_PAYMENT_IMMUTABLE"
  );
  await assert.rejects(
    () => txService.void(userId, paid.transaction.id),
    (error: unknown) =>
      error instanceof AppError && error.code === "HOUSING_PAYMENT_IMMUTABLE"
  );
});

test("HousingService persists a fictional housing payment on PostgreSQL", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const housing = new PrismaHousingObligationRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new HousingService(housing, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Housing M5.2" });
  const reserve = await accounts.create({
    userId: user.id,
    name: `Reserva M5.2 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });

  try {
    const obligation = await service.create(user.id, {
      name: "Obligación QA",
      currency: "USD",
      installmentAmount: "500.00",
      remainingInstallments: 12,
      reserveAccountId: reserve.id,
    });
    const result = await service.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      amount: "500.00",
    });
    assert.equal(result.payment.amount, "500.00");
    assert.equal(result.transaction.type, "HOUSING_PAYMENT");
    assert.equal(result.transaction.categoryId, null);
    assert.equal(result.remainingInstallments, 11);
    const movements = await transactions.findByUserId(user.id, {
      accountId: reserve.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(reserve.initialBalance, movements), "1500.00");

    await housing.update(obligation.id, { remainingInstallments: 0 });
    await assert.rejects(() =>
      housing.registerPaymentAtomic(
        {
          id: randomUUID(),
          housingObligationId: obligation.id,
          transactionId: randomUUID(),
          accountId: reserve.id,
          amount: "500.00",
          currency: "USD",
          installmentNumber: null,
          paidAt: new Date(),
        },
        {
          id: randomUUID(),
          userId: user.id,
          accountId: reserve.id,
          type: "HOUSING_PAYMENT",
          amount: "500.00",
          currency: "USD",
          occurredAt: new Date(),
          metadata: {
            housingPaymentId: randomUUID(),
            housingObligationId: obligation.id,
          },
        },
        obligation.id
      )
    );
    const payments = await prisma.housingPayment.findMany({
      where: { housingObligationId: obligation.id },
    });
    assert.equal(payments.length, 1);
    const extraTx = await prisma.transaction.count({
      where: { userId: user.id, type: "HOUSING_PAYMENT" },
    });
    assert.equal(extraTx, 1);
  } finally {
    await prisma.housingPayment.deleteMany({
      where: { housingObligation: { userId: user.id } },
    });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.housingObligation.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: reserve.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("HousingService getCoverage is null when there is no reserve account", async () => {
  const { service, userId } = await setup();
  const obligation = await service.create(userId, {
    name: "Sin reserva",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
  });

  const coverage = await service.getCoverage(userId, obligation.id);
  assert.equal(coverage.housingObligationId, obligation.id);
  assert.equal(coverage.currency, "USD");
  assert.equal(coverage.reserveAccountId, null);
  assert.equal(coverage.reserveBalance, null);
  assert.equal(coverage.coveredInstallments, null);
  assert.equal(coverage.installmentAmount, "500.00");
  assert.equal(coverage.remainingInstallments, 12);
  assert.equal(typeof coverage.installmentAmount, "string");
});

test("HousingService getCoverage rounds 2000/1100 to 1.82 and 4700/500 to 9.40", async () => {
  const { service, userId, accounts } = await setup();
  const reserve = await accounts.create({
    userId,
    name: "Reserva 1100",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const obligation = await service.create(userId, {
    name: "Cuota 1100",
    currency: "USD",
    installmentAmount: "1100.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });
  const coverage = await service.getCoverage(userId, obligation.id);
  assert.equal(coverage.reserveBalance, "2000.00");
  assert.equal(coverage.coveredInstallments, "1.82");

  const otherReserve = await accounts.create({
    userId,
    name: "Reserva 500",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "4700.00",
  });
  const other = await service.create(userId, {
    name: "Cuota 500",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 20,
    reserveAccountId: otherReserve.id,
  });
  assert.equal((await service.getCoverage(userId, other.id)).coveredInstallments, "9.40");
});

test("HousingService getCoverage keeps a non-positive reserve balance and zeros coverage", async () => {
  const { service, userId, accounts } = await setup();
  const zero = await accounts.create({
    userId,
    name: "Cero",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "0.00",
  });
  const negative = await accounts.create({
    userId,
    name: "Negativa",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "-200.00",
  });
  const zeroObligation = await service.create(userId, {
    name: "Cero",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
    reserveAccountId: zero.id,
  });
  const negativeObligation = await service.create(userId, {
    name: "Negativa",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
    reserveAccountId: negative.id,
  });

  const zeroCoverage = await service.getCoverage(userId, zeroObligation.id);
  assert.equal(zeroCoverage.reserveBalance, "0.00");
  assert.equal(zeroCoverage.coveredInstallments, "0.00");

  const negativeCoverage = await service.getCoverage(userId, negativeObligation.id);
  assert.equal(negativeCoverage.reserveBalance, "-200.00");
  assert.equal(negativeCoverage.coveredInstallments, "0.00");
});

test("HousingService getCoverage calculates inactive obligations and rejects foreign ones", async () => {
  const { service, userId, reserve } = await setup();
  const obligation = await service.create(userId, {
    name: "Inactiva",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 12,
    reserveAccountId: reserve.id,
  });
  await service.update(userId, obligation.id, { isActive: false });

  const coverage = await service.getCoverage(userId, obligation.id);
  assert.equal(coverage.coveredInstallments, "4.00");
  assert.equal(coverage.reserveBalance, "2000.00");

  await assert.rejects(
    () => service.getCoverage(userId, randomUUID()),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
  const foreign = await service.create(randomUUID(), {
    name: "Ajena",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 3,
  });
  await assert.rejects(
    () => service.getCoverage(userId, foreign.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("HousingService getCoverage does not cap by remainingInstallments and ignores remaining 0", async () => {
  const { service, userId, accounts } = await setup();
  const reserve = await accounts.create({
    userId,
    name: "Sobra",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "5000.00",
  });
  const capped = await service.create(userId, {
    name: "5 pendientes",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 5,
    reserveAccountId: reserve.id,
  });
  const zeroRemaining = await service.create(userId, {
    name: "0 pendientes",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 0,
    reserveAccountId: reserve.id,
  });

  assert.equal((await service.getCoverage(userId, capped.id)).coveredInstallments, "10.00");
  assert.equal((await service.getCoverage(userId, capped.id)).remainingInstallments, 5);
  assert.equal(
    (await service.getCoverage(userId, zeroRemaining.id)).coveredInstallments,
    "10.00"
  );
});

test("HousingService getCoverage rejects a reserve currency mismatch without FX", async () => {
  const { service, userId, accounts, housing } = await setup();
  const reserve = await accounts.create({
    userId,
    name: "USD",
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const obligation = await service.create(userId, {
    name: "USD",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 8,
    reserveAccountId: reserve.id,
  });
  await accounts.update(reserve.id, { currency: "ARS" });

  await assert.rejects(
    () => service.getCoverage(userId, obligation.id),
    (error: unknown) => error instanceof AppError && error.code === "CURRENCY_MISMATCH"
  );

  await housing.update(obligation.id, { reserveAccountId: randomUUID() });
  await assert.rejects(
    () => service.getCoverage(userId, obligation.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("HousingService getCoverage recalculates after a HousingPayment and does not persist coverage", async () => {
  const { service, userId, reserve, housing, transactions, obligation } = await paymentSetup();
  const before = await service.getCoverage(userId, obligation.id);
  assert.equal(before.reserveBalance, "2000.00");
  assert.equal(before.coveredInstallments, "4.00");
  assert.equal(before.remainingInstallments, 12);

  await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
  });

  const after = await service.getCoverage(userId, obligation.id);
  assert.equal(after.reserveBalance, "1500.00");
  assert.equal(after.coveredInstallments, "3.00");
  assert.equal(after.remainingInstallments, 11);
  assert.equal(housing.payments.size, 1);
  assert.equal(transactions.items.filter((item) => item.type === "HOUSING_PAYMENT").length, 1);
});

test("HousingService getCoverage fixture on PostgreSQL recalculates after payment", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const housing = new PrismaHousingObligationRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new HousingService(housing, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Housing M5.3" });
  const reserve = await accounts.create({
    userId: user.id,
    name: `Reserva M5.3 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });

  try {
    const obligation = await service.create(user.id, {
      name: "Obligación QA",
      currency: "USD",
      installmentAmount: "500.00",
      remainingInstallments: 12,
      reserveAccountId: reserve.id,
    });
    const before = await service.getCoverage(user.id, obligation.id);
    assert.equal(before.reserveBalance, "2000.00");
    assert.equal(before.coveredInstallments, "4.00");
    assert.equal(before.remainingInstallments, 12);

    await service.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      amount: "500.00",
    });
    const after = await service.getCoverage(user.id, obligation.id);
    assert.equal(after.reserveBalance, "1500.00");
    assert.equal(after.coveredInstallments, "3.00");
    assert.equal(after.remainingInstallments, 11);
    assert.equal(typeof after.coveredInstallments, "string");
  } finally {
    await prisma.housingPayment.deleteMany({
      where: { housingObligation: { userId: user.id } },
    });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.housingObligation.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: reserve.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("HousingService listPayments is empty, ordered and scoped to the obligation", async () => {
  const { service, userId, reserve, obligation } = await paymentSetup();
  assert.deepEqual(await service.listPayments(userId, obligation.id), []);

  const older = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
    occurredAt: new Date("2026-07-01T12:00:00.000Z"),
  });
  const newer = await service.registerPayment(userId, obligation.id, {
    accountId: reserve.id,
    amount: "500.00",
    occurredAt: new Date("2026-08-01T12:00:00.000Z"),
  });
  const listed = await service.listPayments(userId, obligation.id);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.id, newer.payment.id);
  assert.equal(listed[1]?.id, older.payment.id);
  assert.equal(listed[0]?.amount, "500.00");
  assert.equal(typeof listed[0]?.amount, "string");

  const other = await service.create(userId, {
    name: "Otra",
    currency: "USD",
    installmentAmount: "500.00",
    remainingInstallments: 4,
    reserveAccountId: reserve.id,
  });
  await service.registerPayment(userId, other.id, {
    accountId: reserve.id,
    amount: "500.00",
  });
  assert.equal((await service.listPayments(userId, obligation.id)).length, 2);

  await service.update(userId, obligation.id, { isActive: false });
  assert.equal((await service.listPayments(userId, obligation.id)).length, 2);

  await assert.rejects(
    () => service.listPayments(userId, randomUUID()),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});

test("HousingService listPayments and getCoverage use PostgreSQL after two payments", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const housing = new PrismaHousingObligationRepository();
  const transactions = new PrismaTransactionRepository();
  const service = new HousingService(housing, accounts, transactions);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Housing M5.3.1" });
  const reserve = await accounts.create({
    userId: user.id,
    name: `Reserva M5.3.1 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });

  try {
    const obligation = await service.create(user.id, {
      name: "Obligación QA",
      currency: "USD",
      installmentAmount: "500.00",
      remainingInstallments: 12,
      reserveAccountId: reserve.id,
    });
    const first = await service.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      amount: "500.00",
      occurredAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    const second = await service.registerPayment(user.id, obligation.id, {
      accountId: reserve.id,
      amount: "500.00",
      occurredAt: new Date("2026-08-10T12:00:00.000Z"),
    });
    const listed = await service.listPayments(user.id, obligation.id);
    assert.equal(listed.length, 2);
    assert.equal(listed[0]?.id, second.payment.id);
    assert.equal(listed[1]?.id, first.payment.id);
    assert.equal(listed[0]?.transactionId, second.transaction.id);
    assert.equal(listed[0]?.amount, "500.00");
    assert.equal(typeof listed[0]?.amount, "string");

    const coverage = await service.getCoverage(user.id, obligation.id);
    assert.equal(coverage.reserveBalance, "1000.00");
    assert.equal(coverage.remainingInstallments, 10);
    assert.equal(coverage.coveredInstallments, "2.00");
  } finally {
    await prisma.housingPayment.deleteMany({
      where: { housingObligation: { userId: user.id } },
    });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.housingObligation.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: reserve.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
