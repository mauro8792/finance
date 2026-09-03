import assert from "node:assert/strict";
import { test } from "node:test";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { FinancialService } from "../financial/financial.service.js";
import type { FinancialSummary } from "../financial/financial.types.js";
import {
  HousingService,
  type HousingCoverage,
} from "../housing/housing.service.js";
import { PrismaHousingObligationRepository } from "../housing/housing.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { computeBalance } from "../transactions/transaction-balance.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { SimulationService } from "./simulation.service.js";
import type { CapitalProjectionInput } from "./simulation.types.js";

const TZ = DEFAULT_USER_TIMEZONE;
const YEAR = 2026;
const MONTH = 8;
const USER_ID = "user-m72";

const service = new SimulationService();

function stubFinancial(
  overrides: Partial<FinancialSummary> = {}
): FinancialService {
  return {
    getFinancialSummary: async () => ({
      year: YEAR,
      month: MONTH,
      currency: "ARS",
      monthlyGrossExpenses: "1000000.00",
      monthlyNetExpenses: "1000000.00",
      monthlyOperatingIncome: "5000000.00",
      monthlyFundConsumption: "1000000.00",
      monthlySurplus: "0.00",
      totalAvailableARS: "3000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "3.00",
      ...overrides,
    }),
  } as FinancialService;
}

function scenarioInput(months: number) {
  return {
    userId: USER_ID,
    year: YEAR,
    month: MONTH,
    months,
    timeZone: TZ,
  };
}

function jobInput(
  overrides: Partial<{
    monthsUntilJob: number;
    totalMonths: number;
    newMonthlyIncomeARS: string;
    expenseChangeFraction: string;
  }> = {}
) {
  return {
    userId: USER_ID,
    year: YEAR,
    month: MONTH,
    monthsUntilJob: 3,
    totalMonths: 6,
    newMonthlyIncomeARS: "800000.00",
    expenseChangeFraction: "0.000000",
    timeZone: TZ,
    ...overrides,
  };
}

const HOUSING_ID = "housing-m74";

function stubHousing(
  overrides: Partial<HousingCoverage> = {}
): HousingService {
  return {
    getCoverage: async () => ({
      housingObligationId: HOUSING_ID,
      currency: "USD",
      reserveAccountId: "reserve-1",
      reserveBalance: "8000.00",
      installmentAmount: "1100.00",
      remainingInstallments: 37,
      coveredInstallments: "7.27",
      ...overrides,
    }),
  } as HousingService;
}

function housingInput(
  overrides: Partial<{
    housingObligationId: string;
    targetInstallments: number;
    exchangeRateARSPerUSD: string;
  }> = {}
) {
  return {
    userId: USER_ID,
    housingObligationId: HOUSING_ID,
    targetInstallments: 10,
    exchangeRateARSPerUSD: "1500.000000",
    year: YEAR,
    month: MONTH,
    timeZone: TZ,
    ...overrides,
  };
}

test("adjustMonthlyConsumption applies a percentage fraction with ROUND_HALF_UP", () => {
  assert.equal(service.adjustMonthlyConsumption("1000000.00", "0.000000"), "1000000.00");
  assert.equal(service.adjustMonthlyConsumption("1000000.00", "-0.100000"), "900000.00");
  assert.equal(service.adjustMonthlyConsumption("1000000.00", "0.200000"), "1200000.00");
  assert.equal(service.adjustMonthlyConsumption("1000000.00", "-1.000000"), "0.00");
  assert.equal(service.adjustMonthlyConsumption("1.00", "0.005000"), "1.01");
});

test("adjustMonthlyConsumption rejects a base below 0 or a cut below -100%", () => {
  assert.throws(
    () => service.adjustMonthlyConsumption("-1.00", "0.000000"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => service.adjustMonthlyConsumption("1000000.00", "-1.000001"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("projectCapital leaves remaining capital when the horizon does not deplete it", () => {
  const result = service.projectCapital({
    initialCapitalARS: "1000.00",
    months: 3,
    monthlyConsumptionARS: "300.00",
    monthlyIncomeARS: "0.00",
  });
  assert.equal(result.effectiveMonthlyDrawARS, "300.00");
  assert.equal(result.remainingCapitalARS, "100.00");
  assert.equal(result.totalFundConsumedARS, "900.00");
  assert.equal(result.depletedAfterMonth, null);
});

test("projectCapital clamps at zero and reports the depletion month", () => {
  const result = service.projectCapital({
    initialCapitalARS: "100.00",
    months: 5,
    monthlyConsumptionARS: "30.00",
    monthlyIncomeARS: "0.00",
  });
  assert.equal(result.remainingCapitalARS, "0.00");
  assert.equal(result.totalFundConsumedARS, "100.00");
  assert.equal(result.depletedAfterMonth, 4);
});

test("projectCapital uses max(consumption - income, 0) as the monthly draw", () => {
  const depleted = service.projectCapital({
    initialCapitalARS: "1000.00",
    months: 5,
    monthlyConsumptionARS: "300.00",
    monthlyIncomeARS: "100.00",
  });
  assert.equal(depleted.effectiveMonthlyDrawARS, "200.00");
  assert.equal(depleted.remainingCapitalARS, "0.00");
  assert.equal(depleted.totalFundConsumedARS, "1000.00");
  assert.equal(depleted.depletedAfterMonth, 5);

  const surplus = service.projectCapital({
    initialCapitalARS: "1000.00",
    months: 3,
    monthlyConsumptionARS: "100.00",
    monthlyIncomeARS: "200.00",
  });
  assert.equal(surplus.effectiveMonthlyDrawARS, "0.00");
  assert.equal(surplus.remainingCapitalARS, "1000.00");
  assert.equal(surplus.totalFundConsumedARS, "0.00");
  assert.equal(surplus.depletedAfterMonth, null);
});

test("projectCapital marks depletion at month 0 when the initial capital is 0", () => {
  const result = service.projectCapital({
    initialCapitalARS: "0.00",
    months: 5,
    monthlyConsumptionARS: "30.00",
    monthlyIncomeARS: "0.00",
  });
  assert.equal(result.depletedAfterMonth, 0);
  assert.equal(result.remainingCapitalARS, "0.00");
  assert.equal(result.totalFundConsumedARS, "0.00");
});

test("projectCapital with months 0 does not consume capital", () => {
  const funded = service.projectCapital({
    initialCapitalARS: "1000.00",
    months: 0,
    monthlyConsumptionARS: "300.00",
    monthlyIncomeARS: "0.00",
  });
  assert.equal(funded.remainingCapitalARS, "1000.00");
  assert.equal(funded.totalFundConsumedARS, "0.00");
  assert.equal(funded.depletedAfterMonth, null);

  const empty = service.projectCapital({
    initialCapitalARS: "0.00",
    months: 0,
    monthlyConsumptionARS: "300.00",
    monthlyIncomeARS: "0.00",
  });
  assert.equal(empty.depletedAfterMonth, 0);
  assert.equal(empty.remainingCapitalARS, "0.00");
});

test("projectCapital rejects negative amounts and non-integer months", () => {
  assert.throws(
    () =>
      service.projectCapital({
        initialCapitalARS: "-1.00",
        months: 1,
        monthlyConsumptionARS: "0.00",
        monthlyIncomeARS: "0.00",
      }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () =>
      service.projectCapital({
        initialCapitalARS: "1.00",
        months: 1.5,
        monthlyConsumptionARS: "0.00",
        monthlyIncomeARS: "0.00",
      }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("calculateSimulatedRunway matches FinancialService null and rounding semantics", () => {
  assert.equal(service.calculateSimulatedRunway("1000000.00", "400000.00"), "2.50");
  assert.equal(service.calculateSimulatedRunway("0.00", "400000.00"), "0.00");
  assert.equal(service.calculateSimulatedRunway("1000000.00", "0.00"), null);
  assert.equal(service.calculateSimulatedRunway("100.00", "30.00"), "3.33");
  assert.throws(
    () => service.calculateSimulatedRunway("-1.00", "1.00"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("convertUsdToArs multiplies by an explicit ARS-per-USD rate", () => {
  assert.equal(service.convertUsdToArs("1100.00", "1500.000000"), "1650000.00");
  assert.equal(service.convertUsdToArs("0.00", "1500.000000"), "0.00");
  assert.equal(service.convertUsdToArs("1.00", "1500.555000"), "1500.56");
  assert.throws(
    () => service.convertUsdToArs("1.00", "0.000000"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => service.convertUsdToArs("1.00", "-1.000000"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => service.convertUsdToArs("-1.00", "1500.000000"),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("simulateMonthsWithoutIncome projects zero income over a funded horizon", async () => {
  const scenario = new SimulationService(stubFinancial());
  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(2));

  assert.equal(result.year, YEAR);
  assert.equal(result.month, MONTH);
  assert.equal(result.months, 2);
  assert.equal(result.baseline.availableCapitalARS, "3000000.00");
  assert.equal(result.baseline.averageMonthlyFundConsumptionARS, "1000000.00");
  assert.equal(result.baseline.currentRunwayMonths, "3.00");
  assert.equal(result.projection.monthlyIncomeARS, "0.00");
  assert.equal(result.projection.monthlyFundConsumptionARS, "1000000.00");
  assert.equal(result.projection.totalFundConsumedARS, "2000000.00");
  assert.equal(result.projection.remainingCapitalARS, "1000000.00");
  assert.equal(result.projection.depletedAfterMonth, null);
  assert.equal(result.projection.runwayAfterScenarioMonths, "1.00");
});

test("simulateMonthsWithoutIncome clamps when capital depletes during the horizon", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "1500000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "1.50",
    })
  );
  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(3));

  assert.equal(result.projection.monthlyIncomeARS, "0.00");
  assert.equal(result.projection.totalFundConsumedARS, "1500000.00");
  assert.equal(result.projection.remainingCapitalARS, "0.00");
  assert.equal(result.projection.depletedAfterMonth, 2);
  assert.equal(result.projection.runwayAfterScenarioMonths, "0.00");
});

test("simulateMonthsWithoutIncome reports depletion at month 0 when there is no capital", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "0.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "0.00",
    })
  );
  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(3));

  assert.equal(result.projection.depletedAfterMonth, 0);
  assert.equal(result.projection.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.remainingCapitalARS, "0.00");
  assert.equal(result.projection.runwayAfterScenarioMonths, "0.00");
});

test("simulateMonthsWithoutIncome keeps capital when average consumption is zero", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "3000000.00",
      averageMonthlyFundConsumption: "0.00",
      runwayMonths: null,
    })
  );
  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(6));

  assert.equal(result.projection.monthlyIncomeARS, "0.00");
  assert.equal(result.projection.monthlyFundConsumptionARS, "0.00");
  assert.equal(result.projection.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.remainingCapitalARS, "3000000.00");
  assert.equal(result.projection.depletedAfterMonth, null);
  assert.equal(result.projection.runwayAfterScenarioMonths, null);
});

test("simulateMonthsWithoutIncome preserves a null baseline without inventing a projection", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "3000000.00",
      averageMonthlyFundConsumption: null,
      runwayMonths: null,
      monthlyOperatingIncome: "800000.00",
    })
  );
  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(6));

  assert.equal(result.baseline.availableCapitalARS, "3000000.00");
  assert.equal(result.baseline.averageMonthlyFundConsumptionARS, null);
  assert.equal(result.baseline.currentRunwayMonths, null);
  assert.equal(result.projection.monthlyIncomeARS, "0.00");
  assert.equal(result.projection.monthlyFundConsumptionARS, null);
  assert.equal(result.projection.totalFundConsumedARS, null);
  assert.equal(result.projection.remainingCapitalARS, null);
  assert.equal(result.projection.depletedAfterMonth, null);
  assert.equal(result.projection.runwayAfterScenarioMonths, null);
});

test("simulateMonthsWithoutIncome rejects months that are not a positive integer", async () => {
  let called = 0;
  const financial = {
    getFinancialSummary: async () => {
      called += 1;
      throw new Error("FinancialService no debe ejecutarse con months inválidos");
    },
  } as FinancialService;
  const scenario = new SimulationService(financial);

  await assert.rejects(
    () => scenario.simulateMonthsWithoutIncome(scenarioInput(0)),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateMonthsWithoutIncome(scenarioInput(-1)),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateMonthsWithoutIncome(scenarioInput(1.5)),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.equal(called, 0);
});

test("simulateMonthsWithoutIncome uses available capital and average consumption, never operating income", async () => {
  const financial = stubFinancial({
    monthlyOperatingIncome: "5000000.00",
    totalAvailableARS: "3000000.00",
    averageMonthlyFundConsumption: "1000000.00",
    runwayMonths: "3.00",
  });
  const scenario = new SimulationService(financial);
  const projections: CapitalProjectionInput[] = [];
  const originalProject = scenario.projectCapital.bind(scenario);
  scenario.projectCapital = (input) => {
    projections.push(input);
    return originalProject(input);
  };

  const result = await scenario.simulateMonthsWithoutIncome(scenarioInput(2));

  assert.equal(projections.length, 1);
  assert.equal(projections[0]?.initialCapitalARS, "3000000.00");
  assert.equal(projections[0]?.monthlyConsumptionARS, "1000000.00");
  assert.equal(projections[0]?.monthlyIncomeARS, "0.00");
  assert.notEqual(projections[0]?.monthlyIncomeARS, "5000000.00");
  assert.equal(result.projection.monthlyIncomeARS, "0.00");
  assert.equal(result.projection.totalFundConsumedARS, "2000000.00");
});

test("simulateMonthsWithoutIncome on PostgreSQL ignores real operating income and does not persist", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const financial = new FinancialService(transactions, accounts);
  const scenario = new SimulationService(financial);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Simulation M7.2" });
  const origin = await accounts.create({
    userId: user.id,
    name: `Banco M7.2 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "4000000.00",
  });
  const closedMonth = new Date(Date.UTC(YEAR, MONTH - 2, 15, 15, 0, 0));
  const occurredAt = new Date(Date.UTC(YEAR, MONTH - 1, 15, 15, 0, 0));

  try {
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "EXPENSE",
      amount: "500000.00",
      currency: "ARS",
      occurredAt: closedMonth,
    });
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "EXPENSE",
      amount: "1000000.00",
      currency: "ARS",
      occurredAt,
    });
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "INCOME",
      amount: "500000.00",
      currency: "ARS",
      occurredAt,
      metadata: { incomeKind: "OPERATING" },
    });

    const baseline = await financial.getFinancialSummary(user.id, YEAR, MONTH, TZ);
    assert.equal(baseline.totalAvailableARS, "3000000.00");
    assert.equal(baseline.averageMonthlyFundConsumption, "500000.00");
    assert.equal(baseline.monthlyOperatingIncome, "500000.00");
    assert.equal(baseline.runwayMonths, "6.00");

    const movementsBefore = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    const balanceBefore = computeBalance(origin.initialBalance, movementsBefore);
    const txCountBefore = await prisma.transaction.count({ where: { userId: user.id } });

    const result = await scenario.simulateMonthsWithoutIncome({
      userId: user.id,
      year: YEAR,
      month: MONTH,
      months: 2,
      timeZone: TZ,
    });

    assert.equal(result.projection.monthlyIncomeARS, "0.00");
    assert.notEqual(result.projection.monthlyIncomeARS, baseline.monthlyOperatingIncome);
    assert.equal(result.projection.monthlyFundConsumptionARS, "500000.00");
    assert.equal(result.projection.totalFundConsumedARS, "1000000.00");
    assert.equal(result.projection.remainingCapitalARS, "2000000.00");
    assert.equal(result.projection.depletedAfterMonth, null);
    assert.equal(result.projection.runwayAfterScenarioMonths, "4.00");
    assert.equal(result.baseline.currentRunwayMonths, "6.00");

    const movementsAfter = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(movementsAfter.length, movementsBefore.length);
    assert.equal(computeBalance(origin.initialBalance, movementsAfter), balanceBefore);
    assert.equal(
      await prisma.transaction.count({ where: { userId: user.id } }),
      txCountBefore
    );
    assert.equal(
      (await accounts.findById(origin.id))?.initialBalance,
      origin.initialBalance
    );
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: origin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("simulateNewJobScenario covers a gap then a partial new income", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "6000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "6.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(jobInput());

  assert.equal(result.monthsUntilJob, 3);
  assert.equal(result.totalMonths, 6);
  assert.equal(result.assumptions.newMonthlyIncomeARS, "800000.00");
  assert.equal(result.assumptions.expenseChangeFraction, "0.000000");
  assert.equal(result.projection.adjustedMonthlyConsumptionARS, "1000000.00");
  assert.equal(result.projection.phaseWithoutIncome.months, 3);
  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "3000000.00");
  assert.equal(result.projection.phaseWithoutIncome.remainingCapitalARS, "3000000.00");
  assert.equal(result.projection.phaseWithoutIncome.depletedAfterMonth, null);
  assert.equal(result.projection.phaseWithNewJob.months, 3);
  assert.equal(result.projection.phaseWithNewJob.monthlyIncomeARS, "800000.00");
  assert.equal(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "200000.00");
  assert.equal(result.projection.phaseWithNewJob.totalFundConsumedARS, "600000.00");
  assert.equal(result.projection.phaseWithNewJob.remainingCapitalARS, "2400000.00");
  assert.equal(result.projection.totalFundConsumedARS, "3600000.00");
  assert.equal(result.projection.remainingCapitalARS, "2400000.00");
  assert.equal(result.projection.finalMonthlyFundConsumptionARS, "200000.00");
  assert.equal(result.projection.runwayAfterScenarioMonths, "12.00");
  assert.equal(result.projection.depletedAfterMonth, null);
});

test("simulateNewJobScenario stops consuming when the new job covers expenses", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "6000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "6.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({
      monthsUntilJob: 2,
      totalMonths: 6,
      newMonthlyIncomeARS: "1200000.00",
    })
  );

  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "2000000.00");
  assert.equal(result.projection.phaseWithoutIncome.remainingCapitalARS, "4000000.00");
  assert.equal(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "0.00");
  assert.equal(result.projection.phaseWithNewJob.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.remainingCapitalARS, "4000000.00");
  assert.equal(result.projection.finalMonthlyFundConsumptionARS, "0.00");
  assert.equal(result.projection.runwayAfterScenarioMonths, null);
});

test("simulateNewJobScenario applies a -10% expense change to both phases", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "6000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "6.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({ expenseChangeFraction: "-0.100000" })
  );

  assert.equal(result.projection.adjustedMonthlyConsumptionARS, "900000.00");
  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "2700000.00");
  assert.equal(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "100000.00");
});

test("simulateNewJobScenario applies a +20% expense change to both phases", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "6000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "6.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({ expenseChangeFraction: "0.200000" })
  );

  assert.equal(result.projection.adjustedMonthlyConsumptionARS, "1200000.00");
  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "3600000.00");
  assert.equal(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "400000.00");
});

test("simulateNewJobScenario uses the new income for the whole horizon when monthsUntilJob is 0", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "6000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "6.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({ monthsUntilJob: 0, totalMonths: 6 })
  );

  assert.equal(result.projection.phaseWithoutIncome.months, 0);
  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.phaseWithoutIncome.remainingCapitalARS, "6000000.00");
  assert.equal(result.projection.phaseWithNewJob.months, 6);
  assert.equal(result.projection.phaseWithNewJob.monthlyIncomeARS, "800000.00");
  assert.equal(result.projection.phaseWithNewJob.totalFundConsumedARS, "1200000.00");
  assert.equal(result.projection.remainingCapitalARS, "4800000.00");
});

test("simulateNewJobScenario keeps phase2 empty when the job starts after the horizon", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "8000000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "8.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({
      monthsUntilJob: 6,
      totalMonths: 6,
      newMonthlyIncomeARS: "800000.00",
    })
  );

  assert.equal(result.projection.phaseWithNewJob.months, 0);
  assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "6000000.00");
  assert.equal(result.projection.remainingCapitalARS, "2000000.00");
  assert.equal(result.projection.finalMonthlyFundConsumptionARS, "1000000.00");
  assert.equal(result.projection.runwayAfterScenarioMonths, "2.00");
});

test("simulateNewJobScenario reports global depletion from phase1", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "1500000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "1.50",
    })
  );
  const result = await scenario.simulateNewJobScenario(jobInput());

  assert.equal(result.projection.phaseWithoutIncome.depletedAfterMonth, 2);
  assert.equal(result.projection.remainingCapitalARS, "0.00");
  assert.equal(result.projection.totalFundConsumedARS, "1500000.00");
  assert.equal(result.projection.depletedAfterMonth, 2);
});

test("simulateNewJobScenario reports global depletion as monthsUntilJob plus phase2", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "2500000.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "2.50",
    })
  );
  const result = await scenario.simulateNewJobScenario(
    jobInput({
      monthsUntilJob: 2,
      totalMonths: 6,
      newMonthlyIncomeARS: "0.00",
    })
  );

  assert.equal(result.projection.phaseWithoutIncome.depletedAfterMonth, null);
  assert.equal(result.projection.phaseWithNewJob.depletedAfterMonth, 1);
  assert.equal(result.projection.depletedAfterMonth, 3);
  assert.equal(result.projection.remainingCapitalARS, "0.00");
});

test("simulateNewJobScenario reports global depletion 0 when there is no capital", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "0.00",
      averageMonthlyFundConsumption: "1000000.00",
      runwayMonths: "0.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(jobInput());

  assert.equal(result.projection.depletedAfterMonth, 0);
  assert.equal(result.projection.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.remainingCapitalARS, "0.00");
});

test("simulateNewJobScenario preserves a null baseline without inventing a projection", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "3000000.00",
      averageMonthlyFundConsumption: null,
      runwayMonths: null,
      monthlyOperatingIncome: "800000.00",
    })
  );
  const result = await scenario.simulateNewJobScenario(jobInput({ totalMonths: 6 }));

  assert.equal(result.baseline.availableCapitalARS, "3000000.00");
  assert.equal(result.projection.adjustedMonthlyConsumptionARS, null);
  assert.equal(result.projection.totalFundConsumedARS, null);
  assert.equal(result.projection.remainingCapitalARS, null);
  assert.equal(result.projection.depletedAfterMonth, null);
  assert.equal(result.projection.finalMonthlyFundConsumptionARS, null);
  assert.equal(result.projection.runwayAfterScenarioMonths, null);
});

test("simulateNewJobScenario keeps capital when average consumption is zero", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "3000000.00",
      averageMonthlyFundConsumption: "0.00",
      runwayMonths: null,
    })
  );
  const result = await scenario.simulateNewJobScenario(jobInput());

  assert.equal(result.projection.adjustedMonthlyConsumptionARS, "0.00");
  assert.equal(result.projection.totalFundConsumedARS, "0.00");
  assert.equal(result.projection.remainingCapitalARS, "3000000.00");
  assert.equal(result.projection.runwayAfterScenarioMonths, null);
});

test("simulateNewJobScenario rejects invalid temporal inputs, income and expense fraction", async () => {
  let called = 0;
  const financial = {
    getFinancialSummary: async () => {
      called += 1;
      throw new Error("FinancialService no debe ejecutarse con inputs inválidos");
    },
  } as FinancialService;
  const scenario = new SimulationService(financial);

  await assert.rejects(
    () => scenario.simulateNewJobScenario(jobInput({ monthsUntilJob: -1 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateNewJobScenario(jobInput({ monthsUntilJob: 1.5 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateNewJobScenario(jobInput({ totalMonths: 0 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateNewJobScenario(jobInput({ totalMonths: -2 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateNewJobScenario(jobInput({ totalMonths: 1.5 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      scenario.simulateNewJobScenario(
        jobInput({ monthsUntilJob: 7, totalMonths: 6 })
      ),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      scenario.simulateNewJobScenario(jobInput({ newMonthlyIncomeARS: "-1.00" })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      scenario.simulateNewJobScenario(
        jobInput({ expenseChangeFraction: "-1.000001" })
      ),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.equal(called, 0);
});

test("simulateNewJobScenario uses available capital and average consumption, never operating income", async () => {
  const financial = stubFinancial({
    monthlyOperatingIncome: "5000000.00",
    totalAvailableARS: "6000000.00",
    averageMonthlyFundConsumption: "1000000.00",
    runwayMonths: "6.00",
  });
  const scenario = new SimulationService(financial);
  const projections: CapitalProjectionInput[] = [];
  const originalProject = scenario.projectCapital.bind(scenario);
  scenario.projectCapital = (input) => {
    projections.push(input);
    return originalProject(input);
  };
  const adjustments: string[][] = [];
  const originalAdjust = scenario.adjustMonthlyConsumption.bind(scenario);
  scenario.adjustMonthlyConsumption = (base, change) => {
    adjustments.push([base, change]);
    return originalAdjust(base, change);
  };

  const result = await scenario.simulateNewJobScenario(jobInput());

  assert.equal(adjustments.length, 1);
  assert.deepEqual(adjustments[0], ["1000000.00", "0.000000"]);
  assert.equal(projections.length, 2);
  assert.equal(projections[0]?.initialCapitalARS, "6000000.00");
  assert.equal(projections[0]?.monthlyIncomeARS, "0.00");
  assert.equal(projections[0]?.monthlyConsumptionARS, "1000000.00");
  assert.equal(projections[1]?.monthlyIncomeARS, "800000.00");
  assert.equal(projections[1]?.initialCapitalARS, "3000000.00");
  assert.notEqual(projections[0]?.monthlyIncomeARS, "5000000.00");
  assert.notEqual(projections[1]?.monthlyIncomeARS, "5000000.00");
  assert.equal(result.projection.phaseWithNewJob.monthlyIncomeARS, "800000.00");
});

test("simulateNewJobScenario on PostgreSQL ignores real operating income and does not persist", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const financial = new FinancialService(transactions, accounts);
  const scenario = new SimulationService(financial);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Simulation M7.3" });
  const origin = await accounts.create({
    userId: user.id,
    name: `Banco M7.3 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "4000000.00",
  });
  const closedMonth = new Date(Date.UTC(YEAR, MONTH - 2, 15, 15, 0, 0));
  const occurredAt = new Date(Date.UTC(YEAR, MONTH - 1, 15, 15, 0, 0));

  try {
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "EXPENSE",
      amount: "500000.00",
      currency: "ARS",
      occurredAt: closedMonth,
    });
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "EXPENSE",
      amount: "1000000.00",
      currency: "ARS",
      occurredAt,
    });
    await transactions.create({
      userId: user.id,
      accountId: origin.id,
      type: "INCOME",
      amount: "500000.00",
      currency: "ARS",
      occurredAt,
      metadata: { incomeKind: "OPERATING" },
    });

    const baseline = await financial.getFinancialSummary(user.id, YEAR, MONTH, TZ);
    assert.equal(baseline.totalAvailableARS, "3000000.00");
    assert.equal(baseline.averageMonthlyFundConsumption, "500000.00");
    assert.equal(baseline.monthlyOperatingIncome, "500000.00");

    const movementsBefore = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    const balanceBefore = computeBalance(origin.initialBalance, movementsBefore);
    const txCountBefore = await prisma.transaction.count({ where: { userId: user.id } });

    const result = await scenario.simulateNewJobScenario({
      userId: user.id,
      year: YEAR,
      month: MONTH,
      monthsUntilJob: 2,
      totalMonths: 4,
      newMonthlyIncomeARS: "300000.00",
      expenseChangeFraction: "0.000000",
      timeZone: TZ,
    });

    assert.equal(result.projection.phaseWithNewJob.monthlyIncomeARS, "300000.00");
    assert.notEqual(
      result.projection.phaseWithNewJob.monthlyIncomeARS,
      baseline.monthlyOperatingIncome
    );
    assert.equal(result.projection.phaseWithoutIncome.totalFundConsumedARS, "1000000.00");
    assert.equal(result.projection.phaseWithNewJob.effectiveMonthlyDrawARS, "200000.00");
    assert.equal(result.projection.remainingCapitalARS, "1600000.00");
    assert.equal(result.projection.totalFundConsumedARS, "1400000.00");

    const movementsAfter = await transactions.findByUserId(user.id, {
      accountId: origin.id,
      status: "ACTIVE",
    });
    assert.equal(movementsAfter.length, movementsBefore.length);
    assert.equal(computeBalance(origin.initialBalance, movementsAfter), balanceBefore);
    assert.equal(
      await prisma.transaction.count({ where: { userId: user.id } }),
      txCountBefore
    );
  } finally {
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { id: origin.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("simulateHousingReserve funds a 10-installment target from a partial USD reserve", async () => {
  const scenario = new SimulationService(
    stubFinancial({
      totalAvailableARS: "10000000.00",
      runwayMonths: "10.00",
    }),
    stubHousing()
  );
  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(result.housingObligationId, HOUSING_ID);
  assert.equal(result.targetInstallments, 10);
  assert.equal(result.housing.installmentAmountUSD, "1100.00");
  assert.equal(result.housing.remainingInstallments, 37);
  assert.equal(result.housing.targetReserveUSD, "11000.00");
  assert.equal(result.housing.currentReserveUSD, "8000.00");
  assert.equal(result.housing.effectiveCurrentReserveUSD, "8000.00");
  assert.equal(result.housing.currentCoveredInstallments, "7.27");
  assert.equal(result.housing.missingReserveUSD, "3000.00");
  assert.equal(result.housing.excessReserveUSD, "0.00");
  assert.equal(result.fx.exchangeRateARSPerUSD, "1500.000000");
  assert.equal(result.fx.arsRequiredForMissingReserve, "4500000.00");
  assert.equal(result.ars.totalAvailableARS, "10000000.00");
  assert.equal(result.ars.remainingAvailableARSAfterReserve, "5500000.00");
  assert.equal(result.ars.arsShortfall, "0.00");
  assert.equal(result.ars.canFullyFundFromAvailableARS, true);
  assert.equal(result.ars.currentRunwayMonths, "10.00");
});

test("simulateHousingReserve reports excess when the reserve already covers the target", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "10000000.00", runwayMonths: "10.00" }),
    stubHousing({ reserveBalance: "11000.00", coveredInstallments: "10.00" })
  );
  const result = await scenario.simulateHousingReserve(
    housingInput({ targetInstallments: 8 })
  );

  assert.equal(result.housing.targetReserveUSD, "8800.00");
  assert.equal(result.housing.missingReserveUSD, "0.00");
  assert.equal(result.housing.excessReserveUSD, "2200.00");
  assert.equal(result.fx.arsRequiredForMissingReserve, "0.00");
  assert.equal(result.ars.remainingAvailableARSAfterReserve, "10000000.00");
  assert.equal(result.ars.arsShortfall, "0.00");
  assert.equal(result.ars.canFullyFundFromAvailableARS, true);
});

test("simulateHousingReserve reports ARS shortfall when available capital is insufficient", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "3000000.00", runwayMonths: "3.00" }),
    stubHousing()
  );
  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(result.fx.arsRequiredForMissingReserve, "4500000.00");
  assert.equal(result.ars.remainingAvailableARSAfterReserve, "0.00");
  assert.equal(result.ars.arsShortfall, "1500000.00");
  assert.equal(result.ars.canFullyFundFromAvailableARS, false);
});

test("simulateHousingReserve treats a missing reserve account as effective zero", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "10000000.00" }),
    stubHousing({
      reserveAccountId: null,
      reserveBalance: null,
      coveredInstallments: null,
    })
  );
  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(result.housing.currentReserveUSD, null);
  assert.equal(result.housing.currentCoveredInstallments, null);
  assert.equal(result.housing.effectiveCurrentReserveUSD, "0.00");
  assert.equal(result.housing.targetReserveUSD, "11000.00");
  assert.equal(result.housing.missingReserveUSD, "11000.00");
  assert.equal(result.fx.arsRequiredForMissingReserve, "16500000.00");
});

test("simulateHousingReserve treats a zero reserve as effective zero", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "10000000.00" }),
    stubHousing({ reserveBalance: "0.00", coveredInstallments: "0.00" })
  );
  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(result.housing.currentReserveUSD, "0.00");
  assert.equal(result.housing.effectiveCurrentReserveUSD, "0.00");
  assert.equal(result.housing.missingReserveUSD, "11000.00");
});

test("simulateHousingReserve ignores a negative reserve when computing the missing amount", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "10000000.00" }),
    stubHousing({ reserveBalance: "-500.00", coveredInstallments: "0.00" })
  );
  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(result.housing.currentReserveUSD, "-500.00");
  assert.equal(result.housing.effectiveCurrentReserveUSD, "0.00");
  assert.equal(result.housing.missingReserveUSD, "11000.00");
});

test("simulateHousingReserve allows targetInstallments equal to remainingInstallments", async () => {
  const scenario = new SimulationService(
    stubFinancial({ totalAvailableARS: "100000000.00" }),
    stubHousing()
  );
  const result = await scenario.simulateHousingReserve(
    housingInput({ targetInstallments: 37 })
  );

  assert.equal(result.housing.targetReserveUSD, "40700.00");
  assert.equal(result.targetInstallments, 37);
});

test("simulateHousingReserve rejects invalid targets, FX and non-USD housing", async () => {
  let housingCalls = 0;
  const housing = {
    getCoverage: async () => {
      housingCalls += 1;
      return {
        housingObligationId: HOUSING_ID,
        currency: "ARS",
        reserveAccountId: "reserve-1",
        reserveBalance: "8000.00",
        installmentAmount: "1100.00",
        remainingInstallments: 37,
        coveredInstallments: "7.27",
      };
    },
  } as HousingService;
  let financialCalls = 0;
  const financial = {
    getFinancialSummary: async () => {
      financialCalls += 1;
      throw new Error("FinancialService no debe ejecutarse en validaciones");
    },
  } as FinancialService;
  const scenario = new SimulationService(financial, housing);

  await assert.rejects(
    () => scenario.simulateHousingReserve(housingInput({ targetInstallments: 0 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateHousingReserve(housingInput({ targetInstallments: -1 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => scenario.simulateHousingReserve(housingInput({ targetInstallments: 1.5 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      scenario.simulateHousingReserve(housingInput({ exchangeRateARSPerUSD: "0" })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      scenario.simulateHousingReserve(housingInput({ exchangeRateARSPerUSD: "-1.00" })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.equal(housingCalls, 0);

  await assert.rejects(
    () => scenario.simulateHousingReserve(housingInput()),
    (error: unknown) => error instanceof AppError && error.code === "UNSUPPORTED_SCENARIO"
  );
  assert.equal(housingCalls, 1);
  assert.equal(financialCalls, 0);

  const usdScenario = new SimulationService(
    financial,
    stubHousing({ remainingInstallments: 10 })
  );
  await assert.rejects(
    () => usdScenario.simulateHousingReserve(housingInput({ targetInstallments: 11 })),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  assert.equal(financialCalls, 0);
});

test("simulateHousingReserve with available ARS zero still funds a covered target", async () => {
  const uncovered = new SimulationService(
    stubFinancial({ totalAvailableARS: "0.00", runwayMonths: null }),
    stubHousing()
  );
  const missing = await uncovered.simulateHousingReserve(housingInput());
  assert.equal(missing.ars.remainingAvailableARSAfterReserve, "0.00");
  assert.equal(missing.ars.arsShortfall, "4500000.00");
  assert.equal(missing.ars.canFullyFundFromAvailableARS, false);

  const covered = new SimulationService(
    stubFinancial({ totalAvailableARS: "0.00", runwayMonths: null }),
    stubHousing({ reserveBalance: "11000.00", coveredInstallments: "10.00" })
  );
  const funded = await covered.simulateHousingReserve(
    housingInput({ targetInstallments: 8 })
  );
  assert.equal(funded.fx.arsRequiredForMissingReserve, "0.00");
  assert.equal(funded.ars.remainingAvailableARSAfterReserve, "0.00");
  assert.equal(funded.ars.arsShortfall, "0.00");
  assert.equal(funded.ars.canFullyFundFromAvailableARS, true);
});

test("simulateHousingReserve uses coverage and available ARS without converting the runway", async () => {
  const housing = stubHousing();
  const financial = stubFinancial({
    totalAvailableARS: "10000000.00",
    runwayMonths: "10.00",
    monthlyOperatingIncome: "5000000.00",
  });
  const scenario = new SimulationService(financial, housing);
  const conversions: string[][] = [];
  const originalConvert = scenario.convertUsdToArs.bind(scenario);
  scenario.convertUsdToArs = (amount, rate) => {
    conversions.push([amount, rate]);
    return originalConvert(amount, rate);
  };
  let runwayCalls = 0;
  const originalRunway = scenario.calculateSimulatedRunway.bind(scenario);
  scenario.calculateSimulatedRunway = (capital, consumption) => {
    runwayCalls += 1;
    return originalRunway(capital, consumption);
  };

  const result = await scenario.simulateHousingReserve(housingInput());

  assert.equal(conversions.length, 1);
  assert.deepEqual(conversions[0], ["3000.00", "1500.000000"]);
  assert.equal(runwayCalls, 0);
  assert.equal(result.housing.currentReserveUSD, "8000.00");
  assert.equal(result.ars.totalAvailableARS, "10000000.00");
  assert.equal(result.ars.currentRunwayMonths, "10.00");
});

test("simulateHousingReserve on PostgreSQL does not buy USD or change housing", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const housingRepo = new PrismaHousingObligationRepository();
  const housing = new HousingService(housingRepo, accounts, transactions);
  const financial = new FinancialService(transactions, accounts);
  const scenario = new SimulationService(financial, housing);
  const prisma = getPrismaClient();
  const user = await users.create({ name: "QA Simulation M7.4" });
  const reserve = await accounts.create({
    userId: user.id,
    name: `Reserva M7.4 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const ars = await accounts.create({
    userId: user.id,
    name: `Banco M7.4 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "5000000.00",
  });
  const extraUsd = await accounts.create({
    userId: user.id,
    name: `USD extra M7.4 ${Date.now()}`,
    currency: "USD",
    type: "BANK",
    initialBalance: "9999.00",
  });

  try {
    const obligation = await housing.create(user.id, {
      name: "Cuotas QA",
      currency: "USD",
      installmentAmount: "500.00",
      remainingInstallments: 12,
      reserveAccountId: reserve.id,
    });

    const txCountBefore = await prisma.transaction.count({ where: { userId: user.id } });
    const paymentCountBefore = await prisma.housingPayment.count({
      where: { housingObligationId: obligation.id },
    });
    const fxCountBefore = await prisma.currencyExchange.count({
      where: { userId: user.id },
    });

    const result = await scenario.simulateHousingReserve({
      userId: user.id,
      housingObligationId: obligation.id,
      targetInstallments: 8,
      exchangeRateARSPerUSD: "1500.000000",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });

    assert.equal(result.housing.targetReserveUSD, "4000.00");
    assert.equal(result.housing.currentReserveUSD, "2000.00");
    assert.equal(result.housing.missingReserveUSD, "2000.00");
    assert.equal(result.fx.arsRequiredForMissingReserve, "3000000.00");
    assert.equal(result.ars.totalAvailableARS, "5000000.00");
    assert.equal(result.ars.remainingAvailableARSAfterReserve, "2000000.00");
    assert.equal(result.housing.remainingInstallments, 12);

    const afterObligation = await housing.getById(user.id, obligation.id);
    assert.equal(afterObligation.remainingInstallments, 12);
    const reserveMovements = await transactions.findByUserId(user.id, {
      accountId: reserve.id,
      status: "ACTIVE",
    });
    const arsMovements = await transactions.findByUserId(user.id, {
      accountId: ars.id,
      status: "ACTIVE",
    });
    assert.equal(computeBalance(reserve.initialBalance, reserveMovements), "2000.00");
    assert.equal(computeBalance(ars.initialBalance, arsMovements), "5000000.00");
    assert.equal(
      await prisma.transaction.count({ where: { userId: user.id } }),
      txCountBefore
    );
    assert.equal(
      await prisma.housingPayment.count({ where: { housingObligationId: obligation.id } }),
      paymentCountBefore
    );
    assert.equal(
      await prisma.currencyExchange.count({ where: { userId: user.id } }),
      fxCountBefore
    );
    assert.equal(
      computeBalance(
        extraUsd.initialBalance,
        await transactions.findByUserId(user.id, { accountId: extraUsd.id, status: "ACTIVE" })
      ),
      "9999.00"
    );
  } finally {
    await prisma.housingPayment.deleteMany({
      where: { housingObligation: { userId: user.id } },
    });
    await prisma.housingObligation.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
