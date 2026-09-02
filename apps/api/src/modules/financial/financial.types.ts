export type FinancialSummary = {
  year: number;
  month: number;
  currency: "ARS";
  monthlyGrossExpenses: string;
  monthlyNetExpenses: string;
  monthlyOperatingIncome: string;
  monthlyFundConsumption: string;
  monthlySurplus: string;
  totalAvailableARS: string;
  averageMonthlyFundConsumption: string | null;
  runwayMonths: string | null;
};

export const RUNWAY_ACCOUNT_TYPES = ["CASH", "BANK", "FUND"] as const;
