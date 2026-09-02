import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { FinancialService } from "../financial/financial.service.js";
import { PrismaHousingObligationRepository } from "../housing/housing.repository.js";
import { HousingService } from "../housing/housing.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { computeBalance } from "../transactions/transaction-balance.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { SimulationController } from "./simulation.controller.js";
import { createSimulationRouter } from "./simulation.routes.js";
import { SimulationService } from "./simulation.service.js";
import type {
  HousingReserveSimulationResult,
  MonthsWithoutIncomeResult,
  NewJobScenarioResult,
} from "./simulation.types.js";

const TZ = DEFAULT_USER_TIMEZONE;
const YEAR = 2026;
const MONTH = 8;

class MemoryUserRepository implements UserRepository {
  constructor(private readonly user: User) {}
  async create(): Promise<User> {
    return this.user;
  }
  async findById(id: string): Promise<User | null> {
    return id === this.user.id ? this.user : null;
  }
  async findFirst(): Promise<User | null> {
    return this.user;
  }
}

const user: User = {
  id: randomUUID(),
  name: "QA Simulations HTTP",
  email: null,
  timezone: TZ,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const monthsResult: MonthsWithoutIncomeResult = {
  year: YEAR,
  month: MONTH,
  months: 6,
  baseline: {
    availableCapitalARS: "3000000.00",
    averageMonthlyFundConsumptionARS: null,
    currentRunwayMonths: null,
  },
  projection: {
    monthlyIncomeARS: "0.00",
    monthlyFundConsumptionARS: null,
    totalFundConsumedARS: null,
    remainingCapitalARS: null,
    depletedAfterMonth: null,
    runwayAfterScenarioMonths: null,
  },
};

const jobResult: NewJobScenarioResult = {
  year: YEAR,
  month: MONTH,
  monthsUntilJob: 3,
  totalMonths: 6,
  assumptions: {
    newMonthlyIncomeARS: "800000.00",
    expenseChangeFraction: "0.000000",
  },
  baseline: {
    availableCapitalARS: "6000000.00",
    averageMonthlyFundConsumptionARS: "1000000.00",
    currentRunwayMonths: "6.00",
  },
  projection: {
    adjustedMonthlyConsumptionARS: "1000000.00",
    phaseWithoutIncome: {
      months: 3,
      totalFundConsumedARS: "3000000.00",
      remainingCapitalARS: "3000000.00",
      depletedAfterMonth: null,
    },
    phaseWithNewJob: {
      months: 3,
      monthlyIncomeARS: "800000.00",
      effectiveMonthlyDrawARS: "200000.00",
      totalFundConsumedARS: "600000.00",
      remainingCapitalARS: "2400000.00",
      depletedAfterMonth: null,
    },
    totalFundConsumedARS: "3600000.00",
    remainingCapitalARS: "2400000.00",
    depletedAfterMonth: null,
    finalMonthlyFundConsumptionARS: "200000.00",
    runwayAfterScenarioMonths: "12.00",
  },
};

const housingResult: HousingReserveSimulationResult = {
  housingObligationId: randomUUID(),
  targetInstallments: 10,
  housing: {
    installmentAmountUSD: "1100.00",
    remainingInstallments: 37,
    reserveAccountId: randomUUID(),
    currentReserveUSD: "8000.00",
    effectiveCurrentReserveUSD: "8000.00",
    currentCoveredInstallments: "7.27",
    targetReserveUSD: "11000.00",
    missingReserveUSD: "3000.00",
    excessReserveUSD: "0.00",
  },
  fx: {
    exchangeRateARSPerUSD: "1500.000000",
    arsRequiredForMissingReserve: "4500000.00",
  },
  ars: {
    totalAvailableARS: "10000000.00",
    remainingAvailableARSAfterReserve: "5500000.00",
    arsShortfall: "0.00",
    canFullyFundFromAvailableARS: true,
    currentRunwayMonths: "10.00",
  },
};

function stubService() {
  const calls: unknown[] = [];
  const simulations = {
    simulateMonthsWithoutIncome: async (input: unknown) => {
      calls.push(input);
      return monthsResult;
    },
    simulateNewJobScenario: async (input: unknown) => {
      calls.push(input);
      return jobResult;
    },
    simulateHousingReserve: async (input: unknown) => {
      calls.push(input);
      return housingResult;
    },
  } as unknown as SimulationService;
  return { simulations, calls };
}

function appWith(simulations: SimulationService) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/simulations",
    createSimulationRouter(new SimulationController(simulations, new MemoryUserRepository(user)))
  );
  app.use(errorHandler);
  return app;
}

test("POST /api/simulations MONTHS_WITHOUT_INCOME returns the specific DTO", async () => {
  const { simulations, calls } = stubService();
  const response = await request(appWith(simulations))
    .post("/api/simulations")
    .send({
      type: "MONTHS_WITHOUT_INCOME",
      year: YEAR,
      month: MONTH,
      months: 6,
      timeZone: TZ,
    });
  assert.equal(response.status, 200);
  assert.equal(response.body.type, "MONTHS_WITHOUT_INCOME");
  assert.deepEqual(response.body.result, monthsResult);
  assert.equal((calls[0] as { userId: string }).userId, user.id);
  assert.equal((calls[0] as { months: number }).months, 6);
});

test("POST /api/simulations MONTHS_WITHOUT_INCOME preserves a null baseline", async () => {
  const { simulations } = stubService();
  const response = await request(appWith(simulations))
    .post("/api/simulations")
    .send({
      type: "MONTHS_WITHOUT_INCOME",
      year: YEAR,
      month: MONTH,
      months: 6,
      timeZone: TZ,
    });
  assert.equal(response.body.result.baseline.averageMonthlyFundConsumptionARS, null);
  assert.equal(response.body.result.projection.remainingCapitalARS, null);
});

test("POST /api/simulations NEW_JOB returns the specific DTO", async () => {
  const { simulations, calls } = stubService();
  const response = await request(appWith(simulations))
    .post("/api/simulations")
    .send({
      type: "NEW_JOB",
      year: YEAR,
      month: MONTH,
      monthsUntilJob: 3,
      totalMonths: 6,
      newMonthlyIncomeARS: "800000.00",
      expenseChangeFraction: "0.000000",
      timeZone: TZ,
    });
  assert.equal(response.status, 200);
  assert.equal(response.body.type, "NEW_JOB");
  assert.equal(response.body.result.projection.remainingCapitalARS, "2400000.00");
  assert.equal((calls[0] as { newMonthlyIncomeARS: string }).newMonthlyIncomeARS, "800000.00");
});

test("POST /api/simulations HOUSING_RESERVE returns the specific DTO", async () => {
  const { simulations } = stubService();
  const housingObligationId = housingResult.housingObligationId;
  const response = await request(appWith(simulations))
    .post("/api/simulations")
    .send({
      type: "HOUSING_RESERVE",
      housingObligationId,
      targetInstallments: 10,
      exchangeRateARSPerUSD: "1500.000000",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });
  assert.equal(response.status, 200);
  assert.equal(response.body.type, "HOUSING_RESERVE");
  assert.equal(response.body.result.housing.missingReserveUSD, "3000.00");
});

test("POST /api/simulations rejects extra fields, invalid months, income, fraction, target and FX", async () => {
  const simulations = {
    simulateMonthsWithoutIncome: async () => {
      throw new Error("no debe llamarse");
    },
    simulateNewJobScenario: async (input: { newMonthlyIncomeARS: string; expenseChangeFraction: string }) => {
      if (input.newMonthlyIncomeARS.startsWith("-")) {
        throw new AppError("VALIDATION_ERROR", "El importe debe ser un decimal mayor o igual a 0 con hasta 2 decimales.", 400);
      }
      if (input.expenseChangeFraction.startsWith("-1.000001")) {
        throw new AppError("VALIDATION_ERROR", "La variación no puede ser menor que -100%.", 400);
      }
      return jobResult;
    },
    simulateHousingReserve: async (input: { exchangeRateARSPerUSD: string; targetInstallments: number }) => {
      if (input.exchangeRateARSPerUSD === "0" || input.exchangeRateARSPerUSD.startsWith("-")) {
        throw new AppError("VALIDATION_ERROR", "El tipo de cambio debe ser mayor que 0.", 400);
      }
      return housingResult;
    },
  } as unknown as SimulationService;
  const app = appWith(simulations);

  const extra = await request(app)
    .post("/api/simulations")
    .send({
      type: "MONTHS_WITHOUT_INCOME",
      year: YEAR,
      month: MONTH,
      months: 6,
      timeZone: TZ,
      userId: user.id,
    });
  assert.equal(extra.status, 400);

  const months = await request(app)
    .post("/api/simulations")
    .send({
      type: "MONTHS_WITHOUT_INCOME",
      year: YEAR,
      month: MONTH,
      months: 0,
      timeZone: TZ,
    });
  assert.equal(months.status, 400);

  const income = await request(app)
    .post("/api/simulations")
    .send({
      type: "NEW_JOB",
      year: YEAR,
      month: MONTH,
      monthsUntilJob: 3,
      totalMonths: 6,
      newMonthlyIncomeARS: "-1.00",
      expenseChangeFraction: "0.000000",
      timeZone: TZ,
    });
  assert.equal(income.status, 400);

  const fraction = await request(app)
    .post("/api/simulations")
    .send({
      type: "NEW_JOB",
      year: YEAR,
      month: MONTH,
      monthsUntilJob: 3,
      totalMonths: 6,
      newMonthlyIncomeARS: "800000.00",
      expenseChangeFraction: "-1.000001",
      timeZone: TZ,
    });
  assert.equal(fraction.status, 400);

  const target = await request(app)
    .post("/api/simulations")
    .send({
      type: "HOUSING_RESERVE",
      housingObligationId: housingResult.housingObligationId,
      targetInstallments: 0,
      exchangeRateARSPerUSD: "1500.000000",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });
  assert.equal(target.status, 400);

  const fx = await request(app)
    .post("/api/simulations")
    .send({
      type: "HOUSING_RESERVE",
      housingObligationId: housingResult.housingObligationId,
      targetInstallments: 8,
      exchangeRateARSPerUSD: "0",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });
  assert.equal(fx.status, 400);
});

test("POST /api/simulations rejects a non-USD housing scenario from the service", async () => {
  const simulations = {
    simulateHousingReserve: async () => {
      throw new AppError(
        "UNSUPPORTED_SCENARIO",
        "Este escenario sólo admite obligaciones de vivienda en USD.",
        400
      );
    },
  } as unknown as SimulationService;
  const response = await request(appWith(simulations))
    .post("/api/simulations")
    .send({
      type: "HOUSING_RESERVE",
      housingObligationId: housingResult.housingObligationId,
      targetInstallments: 8,
      exchangeRateARSPerUSD: "1500.000000",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "UNSUPPORTED_SCENARIO");
});

test("POST /api/simulations on PostgreSQL does not persist financial side effects", async () => {
  const users = new PrismaUserRepository();
  const accounts = new PrismaAccountRepository();
  const transactions = new PrismaTransactionRepository();
  const housingRepo = new PrismaHousingObligationRepository();
  const housing = new HousingService(housingRepo, accounts, transactions);
  const financial = new FinancialService(transactions, accounts);
  const simulations = new SimulationService(financial, housing);
  const prisma = getPrismaClient();
  const owner = await users.create({ name: "QA Simulation M7.5 HTTP" });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/simulations",
    createSimulationRouter(
      new SimulationController(simulations, {
        create: async () => owner,
        findById: async (id: string) => (id === owner.id ? owner : null),
        findFirst: async () => owner,
      })
    )
  );
  app.use(errorHandler);

  const ars = await accounts.create({
    userId: owner.id,
    name: `Banco M7.5 ${Date.now()}`,
    currency: "ARS",
    type: "BANK",
    initialBalance: "7000000.00",
  });
  const reserve = await accounts.create({
    userId: owner.id,
    name: `Reserva M7.5 ${Date.now()}`,
    currency: "USD",
    type: "HOUSING_RESERVE",
    initialBalance: "2000.00",
  });
  const occurredAt = new Date(Date.UTC(YEAR, MONTH - 1, 15, 15, 0, 0));

  try {
    await transactions.create({
      userId: owner.id,
      accountId: ars.id,
      type: "EXPENSE",
      amount: "1000000.00",
      currency: "ARS",
      occurredAt,
    });
    const obligation = await housing.create(owner.id, {
      name: "Cuotas QA HTTP",
      currency: "USD",
      installmentAmount: "500.00",
      remainingInstallments: 12,
      reserveAccountId: reserve.id,
    });

    const txBefore = await prisma.transaction.count({ where: { userId: owner.id } });
    const payBefore = await prisma.housingPayment.count({
      where: { housingObligationId: obligation.id },
    });
    const fxBefore = await prisma.currencyExchange.count({ where: { userId: owner.id } });
    const invBefore = await prisma.investment.count({ where: { userId: owner.id } });
    const budgetBefore = await prisma.budget.count({ where: { userId: owner.id } });

    const noIncome = await request(app).post("/api/simulations").send({
      type: "MONTHS_WITHOUT_INCOME",
      year: YEAR,
      month: MONTH,
      months: 6,
      timeZone: TZ,
    });
    assert.equal(noIncome.status, 200);
    assert.equal(noIncome.body.result.projection.remainingCapitalARS, "0.00");
    assert.equal(noIncome.body.result.projection.depletedAfterMonth, 6);

    const job = await request(app).post("/api/simulations").send({
      type: "NEW_JOB",
      year: YEAR,
      month: MONTH,
      monthsUntilJob: 3,
      totalMonths: 6,
      newMonthlyIncomeARS: "800000.00",
      expenseChangeFraction: "0.000000",
      timeZone: TZ,
    });
    assert.equal(job.status, 200);
    assert.equal(job.body.result.projection.remainingCapitalARS, "2400000.00");
    assert.equal(job.body.result.projection.runwayAfterScenarioMonths, "12.00");

    const house = await request(app).post("/api/simulations").send({
      type: "HOUSING_RESERVE",
      housingObligationId: obligation.id,
      targetInstallments: 8,
      exchangeRateARSPerUSD: "1500.000000",
      year: YEAR,
      month: MONTH,
      timeZone: TZ,
    });
    assert.equal(house.status, 200);
    assert.equal(house.body.result.housing.targetReserveUSD, "4000.00");
    assert.equal(house.body.result.housing.missingReserveUSD, "2000.00");
    assert.equal(house.body.result.fx.arsRequiredForMissingReserve, "3000000.00");
    assert.equal(house.body.result.ars.remainingAvailableARSAfterReserve, "3000000.00");

    assert.equal(await prisma.transaction.count({ where: { userId: owner.id } }), txBefore);
    assert.equal(
      await prisma.housingPayment.count({ where: { housingObligationId: obligation.id } }),
      payBefore
    );
    assert.equal(await prisma.currencyExchange.count({ where: { userId: owner.id } }), fxBefore);
    assert.equal(await prisma.investment.count({ where: { userId: owner.id } }), invBefore);
    assert.equal(await prisma.budget.count({ where: { userId: owner.id } }), budgetBefore);
    assert.equal(
      computeBalance(
        ars.initialBalance,
        await transactions.findByUserId(owner.id, { accountId: ars.id, status: "ACTIVE" })
      ),
      "6000000.00"
    );
    assert.equal(
      computeBalance(
        reserve.initialBalance,
        await transactions.findByUserId(owner.id, { accountId: reserve.id, status: "ACTIVE" })
      ),
      "2000.00"
    );
    assert.equal((await housing.getById(owner.id, obligation.id)).remainingInstallments, 12);
  } finally {
    await prisma.housingPayment.deleteMany({
      where: { housingObligation: { userId: owner.id } },
    });
    await prisma.housingObligation.deleteMany({ where: { userId: owner.id } });
    await prisma.transaction.deleteMany({ where: { userId: owner.id } });
    await prisma.account.deleteMany({ where: { userId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
});
