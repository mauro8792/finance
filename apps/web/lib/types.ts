export type Currency = "ARS" | "USD";

export type AccountType =
  | "CASH"
  | "BANK"
  | "FUND"
  | "INVESTMENT"
  | "HOUSING_RESERVE"
  | "OTHER";

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  type?: AccountType;
  isActive: boolean;
};

export type AccountBalance = {
  accountId: string;
  currency: Currency;
  balance: string;
};

export type CreateAccountRequest = {
  name: string;
  currency: Currency;
  type: AccountType;
};

export type UpdateAccountRequest = {
  name?: string;
  type?: AccountType;
};

export type CategoryType = "EXPENSE" | "INCOME" | "BOTH";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  isActive: boolean;
};

export type PaymentMethod =
  | "CASH"
  | "DEBIT_CARD"
  | "CREDIT_CARD"
  | "BANK_TRANSFER"
  | "DIGITAL_WALLET"
  | "OTHER";

export type IncomeKind = "OPERATING" | "CAPITAL";

export type MovementKind = "EXPENSE" | "INCOME";

export type CreateExpenseRequest = {
  amount: string;
  currency: Currency;
  accountId: string;
  categoryId: string;
  description?: string;
  occurredAt?: string;
  paymentMethod?: PaymentMethod;
  isFixed?: boolean;
};

export type CreateIncomeRequest = {
  type: "INCOME";
  amount: string;
  currency: Currency;
  accountId: string;
  categoryId?: string;
  incomeKind: IncomeKind;
  description?: string;
  occurredAt?: string;
};

export type CreateTransactionRequest = CreateExpenseRequest | CreateIncomeRequest;

export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "TRANSFER"
  | "REIMBURSEMENT"
  | "ADJUSTMENT"
  | "INVESTMENT_OUTFLOW"
  | "INVESTMENT_PRINCIPAL_RETURN"
  | "INVESTMENT_RETURN"
  | "CURRENCY_EXCHANGE"
  | "HOUSING_PAYMENT";

export type TransactionStatus = "ACTIVE" | "VOIDED";

export type ReimbursementStatus = "NONE" | "PENDING" | "PARTIAL" | "COMPLETED";

export type TransactionMetadata = {
  incomeKind?: IncomeKind;
  direction?: "IN" | "OUT";
  transferId?: string;
  currencyExchangeId?: string;
  housingPaymentId?: string;
  housingObligationId?: string;
  investmentId?: string;
};

export type Transaction = {
  id: string;
  userId?: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  currency: Currency;
  description: string | null;
  occurredAt: string;
  paymentMethod: PaymentMethod | null;
  isFixed: boolean;
  reimbursementStatus: ReimbursementStatus;
  relatedTransactionId: string | null;
  metadata: TransactionMetadata | null;
};

export type TransactionListFilters = {
  year?: number;
  month?: number;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  status?: TransactionStatus;
};

export type UpdateTransactionRequest = {
  amount?: string;
  categoryId?: string;
  description?: string | null;
  occurredAt?: string;
  paymentMethod?: PaymentMethod | null;
  isFixed?: boolean;
};

export type CreateTransferRequest = {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  description?: string;
  occurredAt?: string;
};

export type TransferResult = {
  transferId: string;
  out: Transaction;
  in: Transaction;
};

export type CreateCurrencyExchangeRequest = {
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  exchangeRate: string;
  description?: string;
  occurredAt?: string;
};

export type CurrencyExchange = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  occurredAt: string;
  description: string | null;
};

export type CurrencyExchangeResult = {
  exchange: CurrencyExchange;
  out: Transaction;
  in: Transaction;
};

export type SpendingPaceView = {
  elapsedDays: number;
  totalDays: number;
  monthProgress: string;
  budgetProgress: string | null;
  aboveExpectedPace: boolean;
};

export type BudgetView = {
  id: string;
  category: { id: string; name: string };
  currency: Currency;
  amount: string;
  year: number;
  month: number;
  consumption: string;
  available: string;
  usedPercent: string | null;
  spendingPace: SpendingPaceView;
};

export type CreateBudgetRequest = {
  categoryId: string;
  amount: string;
  currency: Currency;
  year: number;
  month: number;
};

export type HousingObligation = {
  id: string;
  reserveAccountId: string | null;
  name: string;
  currency: Currency;
  installmentAmount: string;
  remainingInstallments: number;
  dueDay: number | null;
  isActive: boolean;
};

export type HousingCoverage = {
  housingObligationId: string;
  currency: Currency;
  reserveAccountId: string | null;
  reserveBalance: string | null;
  installmentAmount: string;
  remainingInstallments: number;
  coveredInstallments: string | null;
};

export type HousingPayment = {
  id: string;
  housingObligationId: string;
  transactionId: string;
  accountId: string;
  amount: string;
  currency: Currency;
  installmentNumber: number | null;
  paidAt: string;
};

export type CreateHousingRequest = {
  name: string;
  currency: Currency;
  installmentAmount: string;
  remainingInstallments: number;
  dueDay?: number | null;
  reserveAccountId?: string | null;
};

export type UpdateHousingRequest = {
  name?: string;
  installmentAmount?: string;
  remainingInstallments?: number;
  dueDay?: number | null;
  reserveAccountId?: string | null;
  isActive?: boolean;
};

export type RegisterHousingPaymentRequest = {
  accountId: string;
  amount?: string;
  occurredAt?: string;
  installmentNumber?: number | null;
};

export type HousingPaymentResult = {
  payment: HousingPayment;
  remainingInstallments: number;
  isActive: boolean;
};

export type InvestmentType = "CAUCION" | "OTHER";

export type InvestmentStatus =
  | "DRAFT"
  | "ACTIVE"
  | "MATURED"
  | "RENEWED"
  | "CANCELLED";

export type Investment = {
  id: string;
  accountId: string;
  type: InvestmentType;
  status: InvestmentStatus;
  currency: Currency;
  principal: string;
  annualRate: string | null;
  startDate: string;
  maturityDate: string | null;
  expectedReturn: string | null;
  actualReturn: string | null;
  notes: string | null;
  renewedFromInvestmentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInvestmentRequest = {
  accountId: string;
  currency: Currency;
  principal: string;
  annualRate: string;
  startDate: string;
  maturityDate: string;
  notes?: string | null;
};

export type UpdateActiveInvestmentRequest = {
  principal: string;
  annualRate: string;
  startDate: string;
  maturityDate: string;
  notes?: string | null;
};

export type MatureInvestmentRequest = {
  destinationAccountId: string;
  capitalReturned: string;
  actualReturn: string;
  occurredAt: string;
};

export type RenewInvestmentRequest = {
  accountId: string;
  renewalPrincipal: string;
  actualReturn: string;
  annualRate: string;
  occurredAt: string;
  maturityDate: string;
  notes?: string | null;
};

export type RenewInvestmentResult = {
  original: Investment;
  investment: Investment;
  occurredAt: string;
};

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

export type SimulationType = "MONTHS_WITHOUT_INCOME" | "NEW_JOB" | "HOUSING_RESERVE";

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

export type MonthsWithoutIncomeRequest = {
  type: "MONTHS_WITHOUT_INCOME";
  year: number;
  month: number;
  months: number;
  timeZone: string;
};

export type NewJobSimulationRequest = {
  type: "NEW_JOB";
  year: number;
  month: number;
  monthsUntilJob: number;
  totalMonths: number;
  newMonthlyIncomeARS: string;
  expenseChangeFraction: string;
  timeZone: string;
};

export type HousingReserveSimulationRequest = {
  type: "HOUSING_RESERVE";
  housingObligationId: string;
  targetInstallments: number;
  exchangeRateARSPerUSD: string;
  year: number;
  month: number;
  timeZone: string;
};

export type SimulationRequest =
  | MonthsWithoutIncomeRequest
  | NewJobSimulationRequest
  | HousingReserveSimulationRequest;

export type SimulationResponse =
  | { type: "MONTHS_WITHOUT_INCOME"; result: MonthsWithoutIncomeResult }
  | { type: "NEW_JOB"; result: NewJobScenarioResult }
  | { type: "HOUSING_RESERVE"; result: HousingReserveSimulationResult };

export type AIParsedTransaction = {
  type: MovementKind | null;
  amount: string | null;
  currency: Currency;
  categoryHint: string | null;
  accountHint: string | null;
  description: string | null;
  occurredAt: string | null;
  paymentMethod: PaymentMethod | null;
  incomeKind: IncomeKind | null;
};

export type ParseTransactionResponse = {
  transactions: AIParsedTransaction[];
  ambiguities: string[];
};

export type ParseTransactionRequest = {
  text: string;
};

export type ChatRequest = {
  message: string;
};

export type ChatResponse = {
  answer: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};
