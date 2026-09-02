import { AppError } from "../../shared/errors/app-error.js";
import { divideRoundHalfUp, parsePositiveRate } from "../currency-exchanges/currency-exchange.math.js";
import type { FinancialService } from "../financial/financial.service.js";
import type { HousingService } from "../housing/housing.service.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type {
  CapitalProjectionInput,
  CapitalProjectionResult,
  HousingReserveSimulationInput,
  HousingReserveSimulationResult,
  MonthsWithoutIncomeInput,
  MonthsWithoutIncomeResult,
  NewJobScenarioInput,
  NewJobScenarioResult,
} from "./simulation.types.js";

const RATE_MICRO = 1_000_000n;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const FRACTION_PATTERN = /^-?(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/;
const ZERO_INCOME_ARS = "0.00" as const;
const ZERO_AMOUNT = "0.00";

export class SimulationService {
  constructor(
    private readonly financial: FinancialService | null = null,
    private readonly housing: HousingService | null = null
  ) {}

  async simulateMonthsWithoutIncome(
    input: MonthsWithoutIncomeInput
  ): Promise<MonthsWithoutIncomeResult> {
    const financial = this.requireFinancial();
    const months = parsePositiveInteger(input.months);
    const summary = await financial.getFinancialSummary(
      input.userId,
      input.year,
      input.month,
      input.timeZone
    );

    const baseline = {
      availableCapitalARS: summary.totalAvailableARS,
      averageMonthlyFundConsumptionARS: summary.averageMonthlyFundConsumption,
      currentRunwayMonths: summary.runwayMonths,
    };

    if (summary.averageMonthlyFundConsumption === null) {
      return {
        year: summary.year,
        month: summary.month,
        months,
        baseline,
        projection: {
          monthlyIncomeARS: ZERO_INCOME_ARS,
          monthlyFundConsumptionARS: null,
          totalFundConsumedARS: null,
          remainingCapitalARS: null,
          depletedAfterMonth: null,
          runwayAfterScenarioMonths: null,
        },
      };
    }

    const projected = this.projectCapital({
      initialCapitalARS: summary.totalAvailableARS,
      months,
      monthlyConsumptionARS: summary.averageMonthlyFundConsumption,
      monthlyIncomeARS: ZERO_INCOME_ARS,
    });

    return {
      year: summary.year,
      month: summary.month,
      months,
      baseline,
      projection: {
        monthlyIncomeARS: ZERO_INCOME_ARS,
        monthlyFundConsumptionARS: summary.averageMonthlyFundConsumption,
        totalFundConsumedARS: projected.totalFundConsumedARS,
        remainingCapitalARS: projected.remainingCapitalARS,
        depletedAfterMonth: projected.depletedAfterMonth,
        runwayAfterScenarioMonths: this.calculateSimulatedRunway(
          projected.remainingCapitalARS,
          summary.averageMonthlyFundConsumption
        ),
      },
    };
  }

  async simulateNewJobScenario(
    input: NewJobScenarioInput
  ): Promise<NewJobScenarioResult> {
    const financial = this.requireFinancial();
    const monthsUntilJob = parseNonNegativeInteger(input.monthsUntilJob);
    const totalMonths = parsePositiveInteger(input.totalMonths);
    if (monthsUntilJob > totalMonths) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Los meses hasta el empleo no pueden superar el horizonte total.",
        400
      );
    }

    const newMonthlyIncomeARS = parseNonNegativeAmount(input.newMonthlyIncomeARS);
    const expenseChangeFraction = parsePercentageChange(input.expenseChangeFraction);
    const phase2Months = totalMonths - monthsUntilJob;
    const summary = await financial.getFinancialSummary(
      input.userId,
      input.year,
      input.month,
      input.timeZone
    );

    const assumptions = {
      newMonthlyIncomeARS,
      expenseChangeFraction,
    };
    const baseline = {
      availableCapitalARS: summary.totalAvailableARS,
      averageMonthlyFundConsumptionARS: summary.averageMonthlyFundConsumption,
      currentRunwayMonths: summary.runwayMonths,
    };

    if (summary.averageMonthlyFundConsumption === null) {
      return {
        year: summary.year,
        month: summary.month,
        monthsUntilJob,
        totalMonths,
        assumptions,
        baseline,
        projection: {
          adjustedMonthlyConsumptionARS: null,
          phaseWithoutIncome: {
            months: monthsUntilJob,
            totalFundConsumedARS: null,
            remainingCapitalARS: null,
            depletedAfterMonth: null,
          },
          phaseWithNewJob: {
            months: phase2Months,
            monthlyIncomeARS: newMonthlyIncomeARS,
            effectiveMonthlyDrawARS: null,
            totalFundConsumedARS: null,
            remainingCapitalARS: null,
            depletedAfterMonth: null,
          },
          totalFundConsumedARS: null,
          remainingCapitalARS: null,
          depletedAfterMonth: null,
          finalMonthlyFundConsumptionARS: null,
          runwayAfterScenarioMonths: null,
        },
      };
    }

    const adjustedMonthlyConsumptionARS = this.adjustMonthlyConsumption(
      summary.averageMonthlyFundConsumption,
      expenseChangeFraction
    );

    const phase1 = this.projectCapital({
      initialCapitalARS: summary.totalAvailableARS,
      months: monthsUntilJob,
      monthlyConsumptionARS: adjustedMonthlyConsumptionARS,
      monthlyIncomeARS: ZERO_INCOME_ARS,
    });

    const phase2 = this.projectCapital({
      initialCapitalARS: phase1.remainingCapitalARS,
      months: phase2Months,
      monthlyConsumptionARS: adjustedMonthlyConsumptionARS,
      monthlyIncomeARS: newMonthlyIncomeARS,
    });

    const finalMonthlyFundConsumptionARS =
      totalMonths > monthsUntilJob
        ? phase2.effectiveMonthlyDrawARS
        : adjustedMonthlyConsumptionARS;

    return {
      year: summary.year,
      month: summary.month,
      monthsUntilJob,
      totalMonths,
      assumptions,
      baseline,
      projection: {
        adjustedMonthlyConsumptionARS,
        phaseWithoutIncome: {
          months: phase1.months,
          totalFundConsumedARS: phase1.totalFundConsumedARS,
          remainingCapitalARS: phase1.remainingCapitalARS,
          depletedAfterMonth: phase1.depletedAfterMonth,
        },
        phaseWithNewJob: {
          months: phase2.months,
          monthlyIncomeARS: phase2.monthlyIncomeARS,
          effectiveMonthlyDrawARS: phase2.effectiveMonthlyDrawARS,
          totalFundConsumedARS: phase2.totalFundConsumedARS,
          remainingCapitalARS: phase2.remainingCapitalARS,
          depletedAfterMonth: phase2.depletedAfterMonth,
        },
        totalFundConsumedARS: fromCents(
          toCents(phase1.totalFundConsumedARS) + toCents(phase2.totalFundConsumedARS)
        ),
        remainingCapitalARS: phase2.remainingCapitalARS,
        depletedAfterMonth: globalDepletedAfterMonth(
          phase1.depletedAfterMonth,
          phase2.depletedAfterMonth,
          monthsUntilJob
        ),
        finalMonthlyFundConsumptionARS,
        runwayAfterScenarioMonths: this.calculateSimulatedRunway(
          phase2.remainingCapitalARS,
          finalMonthlyFundConsumptionARS
        ),
      },
    };
  }

  async simulateHousingReserve(
    input: HousingReserveSimulationInput
  ): Promise<HousingReserveSimulationResult> {
    const housing = this.requireHousing();
    const financial = this.requireFinancial();
    const targetInstallments = parsePositiveInteger(
      input.targetInstallments,
      "Las cuotas objetivo deben ser un entero mayor que 0."
    );
    const exchangeRateARSPerUSD = parsePositiveRate(input.exchangeRateARSPerUSD);
    const coverage = await housing.getCoverage(input.userId, input.housingObligationId);

    if (coverage.currency !== "USD") {
      throw new AppError(
        "UNSUPPORTED_SCENARIO",
        "Este escenario sólo admite obligaciones de vivienda en USD.",
        400
      );
    }

    if (targetInstallments > coverage.remainingInstallments) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Las cuotas objetivo no pueden superar las cuotas pendientes.",
        400
      );
    }

    const targetReserveUSD = fromCents(
      toCents(coverage.installmentAmount) * BigInt(targetInstallments)
    );
    const currentReserveUSD = coverage.reserveBalance;
    const effectiveCurrentReserveUSD = effectiveReserveUsd(currentReserveUSD);
    const targetCents = toCents(targetReserveUSD);
    const effectiveCents = toCents(effectiveCurrentReserveUSD);
    const missingReserveUSD = fromCents(
      targetCents > effectiveCents ? targetCents - effectiveCents : 0n
    );
    const excessReserveUSD = fromCents(
      effectiveCents > targetCents ? effectiveCents - targetCents : 0n
    );
    const arsRequiredForMissingReserve = this.convertUsdToArs(
      missingReserveUSD,
      exchangeRateARSPerUSD
    );

    const summary = await financial.getFinancialSummary(
      input.userId,
      input.year,
      input.month,
      input.timeZone
    );
    const availableCents = toCents(summary.totalAvailableARS);
    const requiredCents = toCents(arsRequiredForMissingReserve);

    return {
      housingObligationId: coverage.housingObligationId,
      targetInstallments,
      housing: {
        installmentAmountUSD: coverage.installmentAmount,
        remainingInstallments: coverage.remainingInstallments,
        reserveAccountId: coverage.reserveAccountId,
        currentReserveUSD,
        effectiveCurrentReserveUSD,
        currentCoveredInstallments: coverage.coveredInstallments,
        targetReserveUSD,
        missingReserveUSD,
        excessReserveUSD,
      },
      fx: {
        exchangeRateARSPerUSD,
        arsRequiredForMissingReserve,
      },
      ars: {
        totalAvailableARS: summary.totalAvailableARS,
        remainingAvailableARSAfterReserve: fromCents(
          availableCents > requiredCents ? availableCents - requiredCents : 0n
        ),
        arsShortfall: fromCents(
          requiredCents > availableCents ? requiredCents - availableCents : 0n
        ),
        canFullyFundFromAvailableARS: availableCents >= requiredCents,
        currentRunwayMonths: summary.runwayMonths,
      },
    };
  }

  adjustMonthlyConsumption(
    baseMonthlyConsumption: string,
    percentageChange: string
  ): string {
    const base = parseNonNegativeAmount(baseMonthlyConsumption);
    const change = parsePercentageChange(percentageChange);
    const factorMicro = RATE_MICRO + toRateMicro(change);
    const adjusted = divideRoundHalfUp(toCents(base) * factorMicro, RATE_MICRO);
    return fromCents(adjusted);
  }

  projectCapital(input: CapitalProjectionInput): CapitalProjectionResult {
    const initialCapitalARS = parseNonNegativeAmount(input.initialCapitalARS);
    const monthlyConsumptionARS = parseNonNegativeAmount(input.monthlyConsumptionARS);
    const monthlyIncomeARS = parseNonNegativeAmount(input.monthlyIncomeARS);
    const months = parseNonNegativeInteger(input.months);

    const consumption = toCents(monthlyConsumptionARS);
    const income = toCents(monthlyIncomeARS);
    const draw = consumption > income ? consumption - income : 0n;
    const initial = toCents(initialCapitalARS);
    const horizon = BigInt(months);

    let remaining = initial;
    let consumed = 0n;
    let depletedAfterMonth: number | null = initial === 0n ? 0 : null;

    if (months > 0 && initial > 0n && draw > 0n) {
      const maxDraw = draw * horizon;
      if (maxDraw < initial) {
        remaining = initial - maxDraw;
        consumed = maxDraw;
        depletedAfterMonth = null;
      } else {
        remaining = 0n;
        consumed = initial;
        depletedAfterMonth = Number((initial + draw - 1n) / draw);
      }
    } else if (months > 0 && initial === 0n) {
      remaining = 0n;
      consumed = 0n;
      depletedAfterMonth = 0;
    }

    return {
      initialCapitalARS,
      months,
      monthlyConsumptionARS,
      monthlyIncomeARS,
      effectiveMonthlyDrawARS: fromCents(draw),
      totalFundConsumedARS: fromCents(consumed),
      remainingCapitalARS: fromCents(remaining),
      depletedAfterMonth,
    };
  }

  calculateSimulatedRunway(
    availableCapitalARS: string,
    monthlyFundConsumptionARS: string
  ): string | null {
    const capital = parseNonNegativeAmount(availableCapitalARS);
    const consumption = parseNonNegativeAmount(monthlyFundConsumptionARS);
    const consumptionCents = toCents(consumption);
    if (consumptionCents === 0n) {
      return null;
    }
    const hundredths = divideRoundHalfUp(toCents(capital) * 100n, consumptionCents);
    return fromCents(hundredths);
  }

  convertUsdToArs(amountUSD: string, exchangeRateARSPerUSD: string): string {
    const amount = parseNonNegativeAmount(amountUSD);
    const rate = parsePositiveRate(exchangeRateARSPerUSD);
    return fromCents(divideRoundHalfUp(toCents(amount) * toRateMicro(rate), RATE_MICRO));
  }

  private requireFinancial(): FinancialService {
    if (!this.financial) {
      throw new AppError(
        "INTERNAL_ERROR",
        "SimulationService requiere FinancialService para escenarios.",
        500
      );
    }

    return this.financial;
  }

  private requireHousing(): HousingService {
    if (!this.housing) {
      throw new AppError(
        "INTERNAL_ERROR",
        "SimulationService requiere HousingService para escenarios de vivienda.",
        500
      );
    }

    return this.housing;
  }
}

function effectiveReserveUsd(currentReserveUSD: string | null): string {
  if (currentReserveUSD === null || toCents(currentReserveUSD) <= 0n) {
    return ZERO_AMOUNT;
  }

  return currentReserveUSD;
}

function globalDepletedAfterMonth(
  phase1DepletedAfterMonth: number | null,
  phase2DepletedAfterMonth: number | null,
  monthsUntilJob: number
): number | null {
  if (phase1DepletedAfterMonth !== null) {
    return phase1DepletedAfterMonth;
  }

  if (phase2DepletedAfterMonth !== null) {
    return monthsUntilJob + phase2DepletedAfterMonth;
  }

  return null;
}

function parseNonNegativeAmount(raw: string): string {
  const value = raw.trim();
  if (!AMOUNT_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El importe debe ser un decimal mayor o igual a 0 con hasta 2 decimales.",
      400
    );
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function parseNonNegativeInteger(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Los meses deben ser un entero mayor o igual a 0.",
      400
    );
  }
  return value;
}

function parsePositiveInteger(
  value: number,
  message = "Los meses deben ser un entero mayor que 0."
): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError("VALIDATION_ERROR", message, 400);
  }
  return value;
}

function parsePercentageChange(raw: string): string {
  const value = raw.trim();
  if (!FRACTION_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La variación debe ser una fracción con hasta 6 decimales y no menor que -1.",
      400
    );
  }
  const micros = toRateMicro(value);
  if (micros < -RATE_MICRO) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La variación no puede ser menor que -100%.",
      400
    );
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(6, "0")}`;
}

function toRateMicro(rate: string): bigint {
  const negative = rate.startsWith("-");
  const unsigned = negative ? rate.slice(1) : rate;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const micros = BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
  return negative ? -micros : micros;
}
