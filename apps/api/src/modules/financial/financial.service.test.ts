import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ZERO_INITIAL_BALANCE } from "../accounts/account.types.js";
import type {
  Account,
  AccountRepository,
  CreateAccountInput,
  UpdateAccountInput,
} from "../accounts/account.types.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { zonedLocalToUtc } from "../../shared/time/month-range.js";
import { FinancialService } from "./financial.service.js";

const TZ = DEFAULT_USER_TIMEZONE;
const YEAR = 2026;
const MONTH = 8;

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

const userId = randomUUID();

function at(year: number, month: number, day = 15): Date {
  return new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
}

async function setup() {
  const accounts = new MemoryAccountRepository();
  const transactions = new MemoryTransactionRepository();
  const service = new FinancialService(transactions, accounts);
  const ars = await accounts.create({
    userId,
    name: "Fondo ARS",
    currency: "ARS",
    type: "FUND",
  });
  const bank = await accounts.create({
    userId,
    name: "Banco ARS",
    currency: "ARS",
    type: "BANK",
  });
  const usd = await accounts.create({
    userId,
    name: "Reserva USD",
    currency: "USD",
    type: "HOUSING_RESERVE",
  });
  return { service, accounts, transactions, ars, bank, usd };
}

async function movement(
  transactions: MemoryTransactionRepository,
  input: Omit<CreateTransactionInput, "userId">
) {
  return transactions.create({ userId, ...input });
}

test("FinancialService gross includes ACTIVE EXPENSE and excludes other types", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    status: "VOIDED",
    amount: "400.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "800.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "TRANSFER",
    amount: "50.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { transferId: randomUUID(), direction: "OUT" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "CURRENCY_EXCHANGE",
    amount: "75.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { currencyExchangeId: randomUUID(), direction: "OUT" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "HOUSING_PAYMENT",
    amount: "500.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: {
      housingPaymentId: randomUUID(),
      housingObligationId: randomUUID(),
    },
  });

  assert.equal(await service.getMonthlyGrossExpenses(userId, YEAR, MONTH, TZ), "1000.00");
  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "800.00");
});

test("FinancialService CAPITAL without categoryId is not operating income and still increases available ARS", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    categoryId: null,
    type: "INCOME",
    amount: "370214.59",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "100.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });

  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "100.00");
  assert.equal(await service.getTotalAvailableARS(userId), "370114.59");
});

test("FinancialService HOUSING_PAYMENT is not expense or income but can reduce available ARS", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "2000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "HOUSING_PAYMENT",
    amount: "500.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: {
      housingPaymentId: randomUUID(),
      housingObligationId: randomUUID(),
    },
  });

  assert.equal(await service.getMonthlyGrossExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getTotalAvailableARS(userId), "1500.00");
});

test("FinancialService INVESTMENT_OUTFLOW is not expense or income but can reduce available ARS", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INVESTMENT_OUTFLOW",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { investmentId: randomUUID() },
  });

  assert.equal(await service.getMonthlyGrossExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getTotalAvailableARS(userId), "400000.00");
});

test("FinancialService investment maturity movements are not operating metrics", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INVESTMENT_OUTFLOW",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { investmentId: randomUUID() },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INVESTMENT_PRINCIPAL_RETURN",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { investmentId: randomUUID() },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INVESTMENT_RETURN",
    amount: "560.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { investmentId: randomUUID() },
  });

  assert.equal(await service.getMonthlyGrossExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getTotalAvailableARS(userId), "500560.00");
});

test("FinancialService net expenses apply reimbursements and ignore VOIDED ones", async () => {
  const { service, transactions, ars } = await setup();
  const expense = await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "1000.00");

  await movement(transactions, {
    accountId: ars.id,
    type: "REIMBURSEMENT",
    amount: "100.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    relatedTransactionId: expense.id,
  });
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "900.00");

  await movement(transactions, {
    accountId: ars.id,
    type: "REIMBURSEMENT",
    amount: "900.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    relatedTransactionId: expense.id,
  });
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "0.00");

  const other = await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "200.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "REIMBURSEMENT",
    status: "VOIDED",
    amount: "200.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    relatedTransactionId: other.id,
  });
  assert.equal(await service.getMonthlyNetExpenses(userId, YEAR, MONTH, TZ), "200.00");
});

test("FinancialService operating income excludes CAPITAL, reimbursements and transfers", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "300.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "10000000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "REIMBURSEMENT",
    amount: "50.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    relatedTransactionId: randomUUID(),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "TRANSFER",
    amount: "10.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { transferId: randomUUID(), direction: "IN" },
  });

  assert.equal(
    await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ),
    "300.00"
  );
});

test("FinancialService fund consumption is max(0, net - operating)", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1500.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "400.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "1100.00");

  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "1100.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "0.00");
});

test("FinancialService totalAvailableARS only sums active CASH BANK FUND ARS", async () => {
  const { service, accounts, transactions, ars, bank, usd } = await setup();
  const cash = await accounts.create({
    userId,
    name: "Efectivo",
    currency: "ARS",
    type: "CASH",
  });
  const investment = await accounts.create({
    userId,
    name: "Plazo",
    currency: "ARS",
    type: "INVESTMENT",
  });
  const other = await accounts.create({
    userId,
    name: "Otros",
    currency: "ARS",
    type: "OTHER",
  });
  const inactive = await accounts.create({
    userId,
    name: "Inactiva",
    currency: "ARS",
    type: "FUND",
    isActive: false,
  });

  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "100.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: bank.id,
    type: "INCOME",
    amount: "40.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: cash.id,
    type: "INCOME",
    amount: "10.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: usd.id,
    type: "INCOME",
    amount: "1000.00",
    currency: "USD",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: investment.id,
    type: "INCOME",
    amount: "500.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: other.id,
    type: "INCOME",
    amount: "80.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: inactive.id,
    type: "INCOME",
    amount: "70.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });

  assert.equal(await service.getTotalAvailableARS(userId), "150.00");
});

test("FinancialService runway uses last valid closed months and returns null without history or zero average", async () => {
  const { service, transactions, ars } = await setup();
  assert.equal(await service.calculateRunway(userId, YEAR, MONTH, TZ), null);

  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "8000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH - 1),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });

  const summary = await service.getFinancialSummary(userId, YEAR, MONTH, TZ);
  assert.equal(summary.totalAvailableARS, "6000.00");
  assert.equal(summary.averageMonthlyFundConsumption, "1000.00");
  assert.equal(summary.runwayMonths, "6.00");
  assert.equal(summary.monthlyFundConsumption, "1000.00");
});

test("FinancialService valid month with consumption 0 still enters the average", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "900000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH - 2),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "100.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH - 1),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "200.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH - 1),
    metadata: { incomeKind: "OPERATING" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "600000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });

  const summary = await service.getFinancialSummary(userId, YEAR, MONTH, TZ);
  assert.equal(summary.averageMonthlyFundConsumption, "450000.00");
  assert.equal(summary.monthlyFundConsumption, "600000.00");
});

test("FinancialService CAPITAL does not reduce fund consumption", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "10000000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });

  assert.equal(await service.getMonthlyOperatingIncome(userId, YEAR, MONTH, TZ), "0.00");
  assert.equal(await service.getMonthlyFundConsumption(userId, YEAR, MONTH, TZ), "1000.00");
});

test("FinancialService surplus is shown when operating exceeds net expenses", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "1200.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });

  const summary = await service.getFinancialSummary(userId, YEAR, MONTH, TZ);
  assert.equal(summary.monthlyFundConsumption, "0.00");
  assert.equal(summary.monthlySurplus, "200.00");
  assert.equal(summary.runwayMonths, null);
});

test("FinancialService integrated month ignores transfer, exchange and capital as operating", async () => {
  const { service, transactions, ars, bank, usd } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "10000000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "CAPITAL" },
  });
  const expense = await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "1000000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "REIMBURSEMENT",
    amount: "100000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    relatedTransactionId: expense.id,
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "300000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { incomeKind: "OPERATING" },
  });
  const transferId = randomUUID();
  await movement(transactions, {
    accountId: ars.id,
    type: "TRANSFER",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { transferId, direction: "OUT" },
  });
  await movement(transactions, {
    accountId: bank.id,
    type: "TRANSFER",
    amount: "500000.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { transferId, direction: "IN" },
  });
  const exchangeId = randomUUID();
  await movement(transactions, {
    accountId: ars.id,
    type: "CURRENCY_EXCHANGE",
    amount: "1500.00",
    currency: "ARS",
    occurredAt: at(YEAR, MONTH),
    metadata: { currencyExchangeId: exchangeId, direction: "OUT" },
  });
  await movement(transactions, {
    accountId: usd.id,
    type: "CURRENCY_EXCHANGE",
    amount: "1.00",
    currency: "USD",
    occurredAt: at(YEAR, MONTH),
    metadata: { currencyExchangeId: exchangeId, direction: "IN" },
  });

  const summary = await service.getFinancialSummary(userId, YEAR, MONTH, TZ);
  assert.equal(summary.currency, "ARS");
  assert.equal(summary.monthlyGrossExpenses, "1000000.00");
  assert.equal(summary.monthlyNetExpenses, "900000.00");
  assert.equal(summary.monthlyOperatingIncome, "300000.00");
  assert.equal(summary.monthlyFundConsumption, "600000.00");
  assert.equal(summary.monthlySurplus, "0.00");
  assert.equal(summary.totalAvailableARS, "9398500.00");
});

test("FinancialService runway average excludes the open month and uses up to 3 closed valid months", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "26800000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 7),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 8),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "15000.00",
    currency: "ARS",
    occurredAt: at(2026, 9, 2),
  });

  const september = await service.getFinancialSummary(userId, 2026, 9, TZ);
  assert.equal(september.monthlyGrossExpenses, "15000.00");
  assert.equal(september.monthlyNetExpenses, "15000.00");
  assert.equal(september.monthlyFundConsumption, "15000.00");
  assert.equal(september.totalAvailableARS, "20785000.00");
  assert.equal(september.averageMonthlyFundConsumption, "2000000.00");
  assert.equal(september.runwayMonths, "10.39");
});

test("FinancialService includes a now-closed month in the runway average after month change", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "26800000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 7),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 8),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "15000.00",
    currency: "ARS",
    occurredAt: at(2026, 9, 2),
  });

  const october = await service.getFinancialSummary(userId, 2026, 10, TZ);
  assert.equal(october.monthlyGrossExpenses, "0.00");
  assert.equal(october.totalAvailableARS, "20785000.00");
  assert.equal(october.averageMonthlyFundConsumption, "1338333.33");
  assert.equal(october.runwayMonths, "15.53");
});

test("FinancialService open-month spike reduces available but not the historical average", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "26800000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 6),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 7),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 8),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "10000000.00",
    currency: "ARS",
    occurredAt: at(2026, 9, 2),
  });

  const september = await service.getFinancialSummary(userId, 2026, 9, TZ);
  assert.equal(september.monthlyGrossExpenses, "10000000.00");
  assert.equal(september.totalAvailableARS, "10800000.00");
  assert.equal(september.averageMonthlyFundConsumption, "2000000.00");
  assert.equal(september.runwayMonths, "5.40");
});

test("FinancialService uses fewer than 3 closed valid months and ignores an open-only history", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "5000000.00",
    currency: "ARS",
    occurredAt: at(2026, 8),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: at(2026, 8),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "15000.00",
    currency: "ARS",
    occurredAt: at(2026, 9, 2),
  });

  const oneClosed = await service.getFinancialSummary(userId, 2026, 9, TZ);
  assert.equal(oneClosed.averageMonthlyFundConsumption, "2000000.00");
  assert.equal(oneClosed.monthlyGrossExpenses, "15000.00");
  assert.equal(oneClosed.totalAvailableARS, "2985000.00");

  const openOnly = await service.getFinancialSummary(userId, 2026, 8, TZ);
  assert.equal(openOnly.monthlyGrossExpenses, "2000000.00");
  assert.equal(openOnly.averageMonthlyFundConsumption, null);
  assert.equal(openOnly.runwayMonths, null);
});

test("FinancialService open month for runway uses the user timezone, not UTC", async () => {
  const { service, transactions, ars } = await setup();
  await movement(transactions, {
    accountId: ars.id,
    type: "INCOME",
    amount: "5000000.00",
    currency: "ARS",
    occurredAt: zonedLocalToUtc(2026, 8, 31, 23, 0, 0, TZ),
    metadata: { incomeKind: "CAPITAL" },
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "2000000.00",
    currency: "ARS",
    occurredAt: zonedLocalToUtc(2026, 8, 31, 23, 0, 0, TZ),
  });
  await movement(transactions, {
    accountId: ars.id,
    type: "EXPENSE",
    amount: "15000.00",
    currency: "ARS",
    occurredAt: zonedLocalToUtc(2026, 9, 1, 1, 0, 0, TZ),
  });

  const september = await service.getFinancialSummary(userId, 2026, 9, TZ);
  assert.equal(september.monthlyGrossExpenses, "15000.00");
  assert.equal(september.averageMonthlyFundConsumption, "2000000.00");
  assert.equal(september.totalAvailableARS, "2985000.00");
});
