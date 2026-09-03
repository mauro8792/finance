import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../../shared/errors/app-error.js";
import { DEFAULT_USER_TIMEZONE } from "../../users/user.types.js";
import type { FinancialSummary } from "../../financial/financial.types.js";
import type { Category } from "../../categories/category.types.js";
import type { Account } from "../../accounts/account.types.js";
import type { HousingObligation } from "../../housing/housing.types.js";
import type { HousingCoverage } from "../../housing/housing.service.js";
import type { Transaction } from "../../transactions/transaction.types.js";
import type {
  HousingReserveSimulationResult,
  MonthsWithoutIncomeResult,
  NewJobScenarioResult,
} from "../../simulations/simulation.types.js";
import {
  ALLOWED_TOOL_NAMES,
  MAX_TRANSACTION_TOOL_LIMIT,
} from "./ai-tool.schemas.js";
import {
  AiToolRegistry,
  forbiddenWriteToolNames,
} from "./ai-tool.registry.js";
import type { AiToolServices } from "./ai-tool.types.js";

const USER_ID = "user-1";
const OTHER_USER = "user-other";

const summary: FinancialSummary = {
  year: 2026,
  month: 9,
  currency: "ARS",
  monthlyGrossExpenses: "15000.00",
  monthlyNetExpenses: "14000.00",
  monthlyOperatingIncome: "500000.00",
  monthlyFundConsumption: "0.00",
  monthlySurplus: "486000.00",
  totalAvailableARS: "1200000.00",
  averageMonthlyFundConsumption: "100000.00",
  runwayMonths: "12.00",
};

const category: Category = {
  id: "cat-comida",
  userId: USER_ID,
  name: "Comida",
  type: "EXPENSE",
  isSystem: true,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const account: Account = {
  id: "acc-1",
  userId: USER_ID,
  name: "Santander",
  currency: "ARS",
  type: "BANK",
  initialBalance: "0.00",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const obligation: HousingObligation = {
  id: "house-1",
  userId: USER_ID,
  reserveAccountId: "acc-res",
  name: "Cuota depto",
  currency: "ARS",
  installmentAmount: "500000.00",
  remainingInstallments: 120,
  dueDay: 10,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const coverage: HousingCoverage = {
  housingObligationId: "house-1",
  currency: "ARS",
  reserveAccountId: "acc-res",
  reserveBalance: "4700000.00",
  installmentAmount: "500000.00",
  remainingInstallments: 120,
  coveredInstallments: "9.40",
};

const usdObligation: HousingObligation = {
  ...obligation,
  id: "house-usd",
  name: "Cuota USD",
  currency: "USD",
  installmentAmount: "1100.00",
  remainingInstallments: 37,
};

const noIncomeResult: MonthsWithoutIncomeResult = {
  year: 2026,
  month: 9,
  months: 6,
  baseline: {
    availableCapitalARS: "1200000.00",
    averageMonthlyFundConsumptionARS: "100000.00",
    currentRunwayMonths: "12.00",
  },
  projection: {
    monthlyIncomeARS: "0.00",
    monthlyFundConsumptionARS: "100000.00",
    totalFundConsumedARS: "600000.00",
    remainingCapitalARS: "600000.00",
    depletedAfterMonth: null,
    runwayAfterScenarioMonths: "6.00",
  },
};

const newJobResult: NewJobScenarioResult = {
  year: 2026,
  month: 9,
  monthsUntilJob: 3,
  totalMonths: 12,
  assumptions: {
    newMonthlyIncomeARS: "3500000.00",
    expenseChangeFraction: "0.000000",
  },
  baseline: {
    availableCapitalARS: "1200000.00",
    averageMonthlyFundConsumptionARS: "100000.00",
    currentRunwayMonths: "12.00",
  },
  projection: {
    adjustedMonthlyConsumptionARS: "100000.00",
    phaseWithoutIncome: {
      months: 3,
      totalFundConsumedARS: "300000.00",
      remainingCapitalARS: "900000.00",
      depletedAfterMonth: null,
    },
    phaseWithNewJob: {
      months: 9,
      monthlyIncomeARS: "3500000.00",
      effectiveMonthlyDrawARS: "0.00",
      totalFundConsumedARS: "0.00",
      remainingCapitalARS: "900000.00",
      depletedAfterMonth: null,
    },
    totalFundConsumedARS: "300000.00",
    remainingCapitalARS: "900000.00",
    depletedAfterMonth: null,
    finalMonthlyFundConsumptionARS: "0.00",
    runwayAfterScenarioMonths: null,
  },
};

const housingReserveResult: HousingReserveSimulationResult = {
  housingObligationId: "house-usd",
  targetInstallments: 8,
  housing: {
    installmentAmountUSD: "1100.00",
    remainingInstallments: 37,
    reserveAccountId: "acc-res",
    currentReserveUSD: "8000.00",
    effectiveCurrentReserveUSD: "8000.00",
    currentCoveredInstallments: "7.27",
    targetReserveUSD: "8800.00",
    missingReserveUSD: "800.00",
    excessReserveUSD: "0.00",
  },
  fx: {
    exchangeRateARSPerUSD: "1400.000000",
    arsRequiredForMissingReserve: "1120000.00",
  },
  ars: {
    totalAvailableARS: "1200000.00",
    remainingAvailableARSAfterReserve: "80000.00",
    arsShortfall: "0.00",
    canFullyFundFromAvailableARS: true,
    currentRunwayMonths: "12.00",
  },
};

function expenseTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    userId: USER_ID,
    accountId: account.id,
    categoryId: category.id,
    type: "EXPENSE",
    status: "ACTIVE",
    amount: "15000.00",
    currency: "ARS",
    description: "panadería",
    occurredAt: new Date("2026-09-02T12:00:00.000Z"),
    paymentMethod: "CASH",
    isFixed: false,
    reimbursementStatus: "NONE",
    relatedTransactionId: null,
    metadata: null,
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    updatedAt: new Date("2026-09-02T12:00:00.000Z"),
    ...overrides,
  };
}

function services(overrides: Partial<{
  financial: AiToolServices["financial"];
  transactions: AiToolServices["transactions"] & { lastList?: unknown };
  categories: AiToolServices["categories"];
  accounts: AiToolServices["accounts"];
  housing: AiToolServices["housing"];
  simulations: AiToolServices["simulations"];
}> = {}): AiToolServices & {
  financialCalls: unknown[];
  listCalls: unknown[];
  simulationCalls: unknown[];
} {
  const financialCalls: unknown[] = [];
  const listCalls: unknown[] = [];
  const simulationCalls: unknown[] = [];
  const base: AiToolServices & {
    financialCalls: unknown[];
    listCalls: unknown[];
    simulationCalls: unknown[];
  } = {
    financialCalls,
    listCalls,
    simulationCalls,
    financial: {
      async getFinancialSummary(userId, year, month, timeZone) {
        financialCalls.push({ userId, year, month, timeZone });
        return summary;
      },
    },
    transactions: {
      async list(userId, input, timeZone) {
        listCalls.push({ userId, input, timeZone });
        return [expenseTx()];
      },
    },
    categories: {
      async list(userId) {
        return userId === USER_ID ? [category] : [];
      },
    },
    accounts: {
      async list(userId) {
        return userId === USER_ID ? [account] : [];
      },
      async getBalance(userId, accountId) {
        return { accountId, currency: "ARS", balance: "250000.00" };
      },
    },
    housing: {
      async list(userId) {
        return userId === USER_ID ? [obligation] : [];
      },
      async getCoverage(userId, id) {
        assert.equal(userId, USER_ID);
        assert.equal(id, obligation.id);
        return coverage;
      },
    },
    simulations: {
      async simulateMonthsWithoutIncome(input) {
        simulationCalls.push({ type: "MONTHS_WITHOUT_INCOME", input });
        return { ...noIncomeResult, months: input.months, year: input.year, month: input.month };
      },
      async simulateNewJobScenario(input) {
        simulationCalls.push({ type: "NEW_JOB", input });
        return {
          ...newJobResult,
          monthsUntilJob: input.monthsUntilJob,
          totalMonths: input.totalMonths,
          assumptions: {
            newMonthlyIncomeARS: input.newMonthlyIncomeARS,
            expenseChangeFraction: input.expenseChangeFraction,
          },
        };
      },
      async simulateHousingReserve(input) {
        simulationCalls.push({ type: "HOUSING_RESERVE", input });
        return {
          ...housingReserveResult,
          housingObligationId: input.housingObligationId,
          targetInstallments: input.targetInstallments,
        };
      },
    },
    ...overrides,
  };
  return base;
}

function registry(svc = services()) {
  return new AiToolRegistry(svc, { userId: USER_ID, timeZone: DEFAULT_USER_TIMEZONE });
}

test("registry allowlist is exactly the read-only catalog", () => {
  const names = [...registry().listNames()];
  assert.deepEqual(names, [...ALLOWED_TOOL_NAMES]);
  for (const forbidden of forbiddenWriteToolNames()) {
    assert.equal(names.includes(forbidden as never), false);
  }
  assert.equal(
    registry()
      .listDefinitions()
      .every((item) => names.includes(item.name)),
    true
  );
});

test("unknown tool is rejected", async () => {
  const result = await registry().execute("createTransaction", {});
  assert.deepEqual(result, { ok: false, error: "Tool no permitida." });
});

test("invalid and extra args are rejected", async () => {
  const invalid = await registry().execute("get_financial_summary", {
    year: 2026,
    month: 13,
  });
  assert.equal(invalid.ok, false);

  const extra = await registry().execute("get_accounts_summary", { foo: true });
  assert.equal(extra.ok, false);

  const empty = await registry().execute("get_financial_summary", {});
  assert.equal(empty.ok, false);
});

test("userId is not an AI-controlled tool argument", async () => {
  const svc = services();
  const result = await registry(svc).execute("get_financial_summary", {
    year: 2026,
    month: 9,
    userId: OTHER_USER,
  });
  assert.equal(result.ok, false);
  assert.equal(svc.financialCalls.length, 0);

  const defs = JSON.stringify(registry().listDefinitions());
  assert.doesNotMatch(defs, /userId/);
});

test("get_financial_summary delegates to FinancialService with injected user", async () => {
  const svc = services();
  const result = await registry(svc).execute("get_financial_summary", {
    year: 2026,
    month: 9,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as FinancialSummary;
    assert.equal(data.totalAvailableARS, "1200000.00");
    assert.equal(data.runwayMonths, "12.00");
    assert.equal(typeof data.totalAvailableARS, "string");
    assert.equal(typeof data.runwayMonths, "string");
  }
  assert.deepEqual(svc.financialCalls, [
    { userId: USER_ID, year: 2026, month: 9, timeZone: DEFAULT_USER_TIMEZONE },
  ]);
});

test("get_month_summary returns month metrics without recalculating", async () => {
  const svc = services();
  const result = await registry(svc).execute("get_month_summary", {
    year: 2026,
    month: 9,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown>;
    assert.equal(data.monthlyGrossExpenses, "15000.00");
    assert.equal(data.monthlyNetExpenses, "14000.00");
    assert.equal(data.monthlyOperatingIncome, "500000.00");
    assert.equal(data.monthlyFundConsumption, "0.00");
    assert.equal(data.totalAvailableARS, undefined);
    assert.equal(typeof data.monthlyGrossExpenses, "string");
  }
  assert.equal(svc.financialCalls.length, 1);
});

test("get_transactions respects filters, ACTIVE status and limit", async () => {
  const svc = services();
  const many = Array.from({ length: 25 }, (_, index) =>
    expenseTx({ id: `tx-${index}`, amount: `${index + 1}.00` })
  );
  svc.transactions = {
    async list(userId, input, timeZone) {
      svc.listCalls.push({ userId, input, timeZone });
      return many;
    },
  };

  const result = await registry(svc).execute("get_transactions", {
    year: 2026,
    month: 9,
    type: "EXPENSE",
    categoryName: "Comida",
    limit: 10,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(svc.listCalls[0], {
    userId: USER_ID,
    timeZone: DEFAULT_USER_TIMEZONE,
    input: {
      year: 2026,
      month: 9,
      type: "EXPENSE",
      currency: undefined,
      categoryId: "cat-comida",
      status: "ACTIVE",
    },
  });
  if (result.ok) {
    const data = result.data as {
      limit: number;
      returned: number;
      truncated: boolean;
      transactions: Array<Record<string, unknown>>;
    };
    assert.equal(data.limit, 10);
    assert.equal(data.returned, 10);
    assert.equal(data.truncated, true);
    assert.equal(data.transactions[0]?.amount, "1.00");
    assert.equal(typeof data.transactions[0]?.amount, "string");
    assert.equal(data.transactions[0]?.categoryName, "Comida");
    assert.equal(data.transactions[0]?.accountName, "Santander");
    assert.equal(data.transactions[0]?.id, undefined);
    assert.equal(data.transactions[0]?.userId, undefined);
  }
  assert.ok(MAX_TRANSACTION_TOOL_LIMIT >= 10);
});

test("get_housing_summary uses existing coverage and omits IDs", async () => {
  const result = await registry().execute("get_housing_summary", {});
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as { obligations: Array<Record<string, unknown>> };
    assert.equal(data.obligations[0]?.name, "Cuota depto");
    assert.equal(data.obligations[0]?.coveredInstallments, "9.40");
    assert.equal(typeof data.obligations[0]?.coveredInstallments, "string");
    assert.equal(data.obligations[0]?.housingObligationId, undefined);
    assert.equal(data.obligations[0]?.reserveAccountId, undefined);
  }
});

test("get_accounts_summary is read-only and omits IDs", async () => {
  const result = await registry().execute("get_accounts_summary", {});
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as { accounts: Array<Record<string, unknown>> };
    assert.equal(data.accounts[0]?.name, "Santander");
    assert.equal(data.accounts[0]?.balance, "250000.00");
    assert.equal(typeof data.accounts[0]?.balance, "string");
    assert.equal(data.accounts[0]?.id, undefined);
    assert.equal(data.accounts[0]?.userId, undefined);
  }
});

test("service errors are sanitized", async () => {
  const prismaLeak = services();
  prismaLeak.financial = {
    async getFinancialSummary() {
      throw new Error("prisma P2021 SELECT * FROM accounts sk-secret");
    },
  };
  const leaked = await registry(prismaLeak).execute("get_financial_summary", {
    year: 2026,
    month: 9,
  });
  assert.deepEqual(leaked, { ok: false, error: "No se pudieron obtener los datos." });
  assert.doesNotMatch(JSON.stringify(leaked), /prisma|SELECT|sk-/i);

  const notFound = services();
  notFound.housing = {
    async list() {
      return [obligation];
    },
    async getCoverage() {
      throw new AppError("NOT_FOUND", "Obligación no encontrada.", 404);
    },
  };
  const mapped = await registry(notFound).execute("get_housing_summary", {});
  assert.deepEqual(mapped, { ok: false, error: "Obligación no encontrada." });
});

test("registry tools never mutate", async () => {
  const names = registry().listNames();
  for (const forbidden of forbiddenWriteToolNames()) {
    const result = await registry().execute(forbidden, {});
    assert.equal(result.ok, false);
    assert.equal((names as readonly string[]).includes(forbidden), false);
  }
  assert.equal(
    names.every((name) => name.startsWith("get_") || name.startsWith("simulate_")),
    true
  );
});

test("simulation tools are present, read-only and omit userId", () => {
  const names = [...registry().listNames()];
  assert.equal(names.includes("simulate_no_income"), true);
  assert.equal(names.includes("simulate_new_job"), true);
  assert.equal(names.includes("simulate_housing_reserve"), true);
  for (const forbidden of forbiddenWriteToolNames()) {
    assert.equal(names.includes(forbidden as never), false);
  }
  const defs = JSON.stringify(registry().listDefinitions());
  assert.doesNotMatch(defs, /userId|housingObligationId|accountId/);
});

test("simulate_no_income delegates to SimulationService with injected user", async () => {
  const svc = services();
  const result = await registry(svc).execute("simulate_no_income", {
    year: 2026,
    month: 9,
    months: 6,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as {
      kind: string;
      applied: boolean;
      scenarioType: string;
      projection: { remainingCapitalARS: string };
    };
    assert.equal(data.kind, "scenario");
    assert.equal(data.applied, false);
    assert.equal(data.scenarioType, "MONTHS_WITHOUT_INCOME");
    assert.equal(typeof data.projection.remainingCapitalARS, "string");
  }
  assert.deepEqual(svc.simulationCalls, [
    {
      type: "MONTHS_WITHOUT_INCOME",
      input: {
        userId: USER_ID,
        year: 2026,
        month: 9,
        months: 6,
        timeZone: DEFAULT_USER_TIMEZONE,
      },
    },
  ]);
});

test("simulate_new_job delegates and defaults expense change to zero", async () => {
  const svc = services();
  const result = await registry(svc).execute("simulate_new_job", {
    year: 2026,
    month: 9,
    monthsUntilJob: 3,
    totalMonths: 12,
    newMonthlyIncomeARS: "3500000.00",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as { kind: string; applied: boolean; scenarioType: string };
    assert.equal(data.kind, "scenario");
    assert.equal(data.applied, false);
    assert.equal(data.scenarioType, "NEW_JOB");
  }
  const call = svc.simulationCalls[0] as {
    type: string;
    input: { userId: string; newMonthlyIncomeARS: string; expenseChangeFraction: string };
  };
  assert.equal(call.type, "NEW_JOB");
  assert.equal(call.input.userId, USER_ID);
  assert.equal(call.input.newMonthlyIncomeARS, "3500000.00");
  assert.equal(call.input.expenseChangeFraction, "0.000000");
});

test("simulate_housing_reserve resolves a unique obligation without exposing IDs", async () => {
  const svc = services({
    housing: {
      async list(userId) {
        return userId === USER_ID ? [usdObligation] : [];
      },
      async getCoverage() {
        throw new Error("getCoverage should not run for the simulation tool");
      },
    },
  });
  const result = await registry(svc).execute("simulate_housing_reserve", {
    year: 2026,
    month: 9,
    targetInstallments: 8,
    exchangeRateARSPerUSD: "1400",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    const data = result.data as Record<string, unknown> & {
      housing: Record<string, unknown>;
    };
    assert.equal(data.kind, "scenario");
    assert.equal(data.applied, false);
    assert.equal(data.housingName, "Cuota USD");
    assert.equal(data.housingObligationId, undefined);
    assert.equal(data.housing.reserveAccountId, undefined);
    assert.equal(typeof data.ars, "object");
  }
  const call = svc.simulationCalls[0] as {
    input: { userId: string; housingObligationId: string; exchangeRateARSPerUSD: string };
  };
  assert.equal(call.input.userId, USER_ID);
  assert.equal(call.input.housingObligationId, usdObligation.id);
  assert.equal(call.input.exchangeRateARSPerUSD, "1400");
});

test("simulation tools reject invalid extra args and client userId", async () => {
  const svc = services();
  const invalidMonths = await registry(svc).execute("simulate_no_income", {
    year: 2026,
    month: 9,
    months: -1,
  });
  assert.equal(invalidMonths.ok, false);

  const extra = await registry(svc).execute("simulate_no_income", {
    year: 2026,
    month: 9,
    months: 6,
    foo: true,
  });
  assert.equal(extra.ok, false);

  const asNumber = await registry(svc).execute("simulate_new_job", {
    year: 2026,
    month: 9,
    monthsUntilJob: 3,
    totalMonths: 12,
    newMonthlyIncomeARS: 3500000,
  });
  assert.equal(asNumber.ok, false);

  const withUser = await registry(svc).execute("simulate_new_job", {
    year: 2026,
    month: 9,
    monthsUntilJob: 3,
    totalMonths: 12,
    newMonthlyIncomeARS: "3500000.00",
    userId: OTHER_USER,
  });
  assert.equal(withUser.ok, false);

  const withId = await registry(svc).execute("simulate_housing_reserve", {
    year: 2026,
    month: 9,
    targetInstallments: 8,
    exchangeRateARSPerUSD: "1400",
    housingObligationId: usdObligation.id,
  });
  assert.equal(withId.ok, false);
  assert.equal(svc.simulationCalls.length, 0);
});

test("simulate_housing_reserve asks for a name when several obligations exist", async () => {
  const svc = services({
    housing: {
      async list() {
        return [usdObligation, { ...usdObligation, id: "house-2", name: "Cochera" }];
      },
      async getCoverage() {
        throw new Error("unused");
      },
    },
  });
  const missing = await registry(svc).execute("simulate_housing_reserve", {
    year: 2026,
    month: 9,
    targetInstallments: 8,
    exchangeRateARSPerUSD: "1400",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.error, /nombre de la obligación/i);
  }
  assert.equal(svc.simulationCalls.length, 0);
});

test("simulate_housing_reserve requires FX and does not invent it", async () => {
  const svc = services();
  const result = await registry(svc).execute("simulate_housing_reserve", {
    year: 2026,
    month: 9,
    targetInstallments: 8,
  });
  assert.equal(result.ok, false);
  assert.equal(svc.simulationCalls.length, 0);
});

test("simulation tools do not persist or talk to Prisma", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "ai-tool.registry.ts"), "utf8");
  assert.doesNotMatch(src, /prisma|PrismaClient|\.create\(|\.update\(|\.delete\(/);
  assert.match(src, /simulateMonthsWithoutIncome/);
  assert.match(src, /simulateNewJobScenario/);
  assert.match(src, /simulateHousingReserve/);
});

