export type CapitalProjectionInput = {
  initialCapitalARS: string;
  months: number;
  monthlyConsumptionARS: string;
  monthlyIncomeARS: string;
};

export type CapitalProjectionResult = {
  initialCapitalARS: string;
  months: number;
  monthlyConsumptionARS: string;
  monthlyIncomeARS: string;
  effectiveMonthlyDrawARS: string;
  totalFundConsumedARS: string;
  remainingCapitalARS: string;
  depletedAfterMonth: number | null;
};

export type MonthsWithoutIncomeInput = {
  userId: string;
  year: number;
  month: number;
  months: number;
  timeZone: string;
};

export type MonthsWithoutIncomeResult = {
  year: number;
  month: number;
  months: number;
  baseline: {
    availableCapitalARS: string;
    averageMonthlyFundConsumptionARS: string | null;
    currentRunwayMonths: string | null;
  };
  projection: {
    monthlyIncomeARS: "0.00";
    monthlyFundConsumptionARS: string | null;
    totalFundConsumedARS: string | null;
    remainingCapitalARS: string | null;
    depletedAfterMonth: number | null;
    runwayAfterScenarioMonths: string | null;
  };
};

export type NewJobScenarioInput = {
  userId: string;
  year: number;
  month: number;
  monthsUntilJob: number;
  totalMonths: number;
  newMonthlyIncomeARS: string;
  expenseChangeFraction: string;
  timeZone: string;
};

export type NewJobScenarioResult = {
  year: number;
  month: number;
  monthsUntilJob: number;
  totalMonths: number;
  assumptions: {
    newMonthlyIncomeARS: string;
    expenseChangeFraction: string;
  };
  baseline: {
    availableCapitalARS: string;
    averageMonthlyFundConsumptionARS: string | null;
    currentRunwayMonths: string | null;
  };
  projection: {
    adjustedMonthlyConsumptionARS: string | null;
    phaseWithoutIncome: {
      months: number;
      totalFundConsumedARS: string | null;
      remainingCapitalARS: string | null;
      depletedAfterMonth: number | null;
    };
    phaseWithNewJob: {
      months: number;
      monthlyIncomeARS: string;
      effectiveMonthlyDrawARS: string | null;
      totalFundConsumedARS: string | null;
      remainingCapitalARS: string | null;
      depletedAfterMonth: number | null;
    };
    totalFundConsumedARS: string | null;
    remainingCapitalARS: string | null;
    depletedAfterMonth: number | null;
    finalMonthlyFundConsumptionARS: string | null;
    runwayAfterScenarioMonths: string | null;
  };
};

export type HousingReserveSimulationInput = {
  userId: string;
  housingObligationId: string;
  targetInstallments: number;
  exchangeRateARSPerUSD: string;
  year: number;
  month: number;
  timeZone: string;
};

export type HousingReserveSimulationResult = {
  housingObligationId: string;
  targetInstallments: number;
  housing: {
    installmentAmountUSD: string;
    remainingInstallments: number;
    reserveAccountId: string | null;
    currentReserveUSD: string | null;
    effectiveCurrentReserveUSD: string;
    currentCoveredInstallments: string | null;
    targetReserveUSD: string;
    missingReserveUSD: string;
    excessReserveUSD: string;
  };
  fx: {
    exchangeRateARSPerUSD: string;
    arsRequiredForMissingReserve: string;
  };
  ars: {
    totalAvailableARS: string;
    remainingAvailableARSAfterReserve: string;
    arsShortfall: string;
    canFullyFundFromAvailableARS: boolean;
    currentRunwayMonths: string | null;
  };
};
