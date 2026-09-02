import type { ApiErrorResponse } from "shared";
import type {
  Account,
  AccountBalance,
  BudgetView,
  Category,
  CreateAccountRequest,
  CreateBudgetRequest,
  CreateHousingRequest,
  CreateCurrencyExchangeRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  CurrencyExchangeResult,
  FinancialSummary,
  HousingCoverage,
  HousingObligation,
  HousingPayment,
  HousingPaymentResult,
  Investment,
  CreateInvestmentRequest,
  MatureInvestmentRequest,
  RegisterHousingPaymentRequest,
  RenewInvestmentRequest,
  RenewInvestmentResult,
  SimulationRequest,
  SimulationResponse,
  Transaction,
  TransactionListFilters,
  TransferResult,
  UpdateAccountRequest,
  UpdateHousingRequest,
  UpdateTransactionRequest,
} from "./types";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  return trimTrailingSlash(fromEnv || "http://localhost:3001");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalized}`;
}

async function readError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    return new ApiClientError(
      response.status,
      body.error?.code ?? "INTERNAL_ERROR",
      body.error?.message ?? `El API respondió ${response.status}`
    );
  } catch {
    return new ApiClientError(
      response.status,
      "INTERNAL_ERROR",
      `El API respondió ${response.status}`
    );
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await readError(response);
  }

  return (await response.json()) as T;
}

export async function getAccounts(): Promise<Account[]> {
  return requestJson<Account[]>("/api/accounts");
}

export async function getAccountBalance(id: string): Promise<AccountBalance> {
  return requestJson<AccountBalance>(`/api/accounts/${id}/balance`);
}

export async function createAccount(payload: CreateAccountRequest): Promise<Account> {
  return requestJson<Account>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAccount(
  id: string,
  payload: UpdateAccountRequest
): Promise<Account> {
  return requestJson<Account>(`/api/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function activateAccount(id: string): Promise<Account> {
  return requestJson<Account>(`/api/accounts/${id}/activate`, {
    method: "POST",
  });
}

export async function deactivateAccount(id: string): Promise<Account> {
  return requestJson<Account>(`/api/accounts/${id}/deactivate`, {
    method: "POST",
  });
}

export async function getCategories(): Promise<Category[]> {
  return requestJson<Category[]>("/api/categories");
}

export async function getTransactions(
  filters: TransactionListFilters = {}
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (filters.month !== undefined) {
    params.set("month", String(filters.month));
  }
  if (filters.year !== undefined && filters.month !== undefined) {
    params.set("year", String(filters.year));
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.accountId) {
    params.set("accountId", filters.accountId);
  }
  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  const query = params.toString();
  return requestJson<Transaction[]>(`/api/transactions${query ? `?${query}` : ""}`);
}

export async function createTransaction(
  payload: CreateTransactionRequest
): Promise<Transaction> {
  return requestJson<Transaction>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTransaction(
  id: string,
  payload: UpdateTransactionRequest
): Promise<Transaction> {
  return requestJson<Transaction>(`/api/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function voidTransaction(id: string): Promise<Transaction> {
  return requestJson<Transaction>(`/api/transactions/${id}/void`, {
    method: "POST",
  });
}

export async function createTransfer(
  payload: CreateTransferRequest
): Promise<TransferResult> {
  return requestJson<TransferResult>("/api/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCurrencyExchange(
  payload: CreateCurrencyExchangeRequest
): Promise<CurrencyExchangeResult> {
  return requestJson<CurrencyExchangeResult>("/api/currency-exchanges", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getBudgets(year: number, month: number): Promise<BudgetView[]> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  return requestJson<BudgetView[]>(`/api/budgets?${params}`);
}

export async function createBudget(payload: CreateBudgetRequest): Promise<BudgetView> {
  return requestJson<BudgetView>("/api/budgets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBudget(id: string, amount: string): Promise<BudgetView> {
  return requestJson<BudgetView>(`/api/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ amount }),
  });
}

export async function getHousing(): Promise<HousingObligation[]> {
  return requestJson<HousingObligation[]>("/api/housing");
}

export async function createHousing(
  payload: CreateHousingRequest
): Promise<HousingObligation> {
  return requestJson<HousingObligation>("/api/housing", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateHousing(
  id: string,
  payload: UpdateHousingRequest
): Promise<HousingObligation> {
  return requestJson<HousingObligation>(`/api/housing/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getHousingCoverage(id: string): Promise<HousingCoverage> {
  return requestJson<HousingCoverage>(`/api/housing/${id}/coverage`);
}

export async function getHousingPayments(id: string): Promise<HousingPayment[]> {
  return requestJson<HousingPayment[]>(`/api/housing/${id}/payments`);
}

export async function registerHousingPayment(
  id: string,
  payload: RegisterHousingPaymentRequest
): Promise<HousingPaymentResult> {
  return requestJson<HousingPaymentResult>(`/api/housing/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInvestments(): Promise<Investment[]> {
  return requestJson<Investment[]>("/api/investments");
}

export async function createInvestment(
  payload: CreateInvestmentRequest
): Promise<Investment> {
  return requestJson<Investment>("/api/investments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function matureInvestment(
  id: string,
  payload: MatureInvestmentRequest
): Promise<Investment> {
  return requestJson<Investment>(`/api/investments/${id}/mature`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function renewInvestment(
  id: string,
  payload: RenewInvestmentRequest
): Promise<RenewInvestmentResult> {
  return requestJson<RenewInvestmentResult>(`/api/investments/${id}/renew`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getFinancialSummary(
  year: number,
  month: number
): Promise<FinancialSummary> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  return requestJson<FinancialSummary>(`/api/financial/summary?${params}`);
}

export async function runSimulation(
  payload: SimulationRequest
): Promise<SimulationResponse> {
  return requestJson<SimulationResponse>("/api/simulations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
