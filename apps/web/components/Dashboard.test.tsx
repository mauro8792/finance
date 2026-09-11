import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVACY_KEY } from "../lib/privacy";
import type {
  Account,
  CreditCard,
  CreditCardCommitments,
  FinancialSummary,
  HousingCoverage,
  HousingObligation,
  Investment,
  Transaction,
} from "../lib/types";
import { Dashboard } from "./Dashboard";
import { PrivacyProvider } from "./PrivacyProvider";

const getFinancialSummary = vi.fn();
const getHousing = vi.fn();
const getHousingCoverage = vi.fn();
const getAccounts = vi.fn();
const getAccountBalance = vi.fn();
const getInvestments = vi.fn();
const getCreditCards = vi.fn();
const getCreditCardCommitments = vi.fn();
const getTransactions = vi.fn();

vi.mock("../lib/api", () => ({
  getFinancialSummary: (year: number, month: number) =>
    getFinancialSummary(year, month),
  getHousing: () => getHousing(),
  getHousingCoverage: (id: string) => getHousingCoverage(id),
  getAccounts: () => getAccounts(),
  getAccountBalance: (id: string) => getAccountBalance(id),
  getInvestments: () => getInvestments(),
  getCreditCards: () => getCreditCards(),
  getCreditCardCommitments: (id: string) => getCreditCardCommitments(id),
  getTransactions: (filters?: unknown) => getTransactions(filters),
  isUnauthorizedError: () => false,
}));

const loaded: FinancialSummary = {
  year: 2026,
  month: 8,
  currency: "ARS",
  monthlyGrossExpenses: "2414.06",
  monthlyNetExpenses: "2114.06",
  monthlyOperatingIncome: "86033.83",
  monthlyFundConsumption: "600000.00",
  monthlySurplus: "83919.77",
  totalAvailableARS: "20800000.00",
  averageMonthlyFundConsumption: "2000000.00",
  runwayMonths: "10.40",
};

const casa: HousingObligation = {
  id: "h-casa",
  reserveAccountId: "acc-reserva",
  name: "casa",
  currency: "USD",
  installmentAmount: "1100.00",
  remainingInstallments: 37,
  dueDay: null,
  isActive: true,
};

const coverageQa: HousingCoverage = {
  housingObligationId: "h-casa",
  currency: "USD",
  reserveAccountId: "acc-reserva",
  reserveBalance: "8800.00",
  installmentAmount: "1100.00",
  remainingInstallments: 37,
  coveredInstallments: "8.00",
};

const fondo: Account = {
  id: "acc-fondo",
  name: "QA Fondo",
  currency: "ARS",
  type: "FUND",
  isActive: true,
};

const reserva: Account = {
  id: "acc-reserva",
  name: "QA Reserva",
  currency: "USD",
  type: "HOUSING_RESERVE",
  isActive: true,
};

const caucion: Investment = {
  id: "inv-1",
  accountId: "acc-inversion",
  type: "CAUCION",
  status: "ACTIVE",
  currency: "ARS",
  principal: "1500000.00",
  annualRate: "0.400000",
  startDate: "2026-08-01T15:00:00.000Z",
  maturityDate: "2026-09-01T15:00:00.000Z",
  expectedReturn: "50000.00",
  actualReturn: null,
  notes: null,
  renewedFromInvestmentId: null,
  createdAt: "2026-08-01T15:00:00.000Z",
  updatedAt: "2026-08-01T15:00:00.000Z",
};

const visa: CreditCard = {
  id: "card-1",
  userId: "user-1",
  name: "QA Visa",
  issuer: "Banco QA",
  brand: "VISA",
  currency: "ARS",
  isActive: true,
  isPrimary: true,
  closingDay: 20,
  dueDay: 28,
  feeStatus: "WAIVED",
  feeExpectedAmount: null,
  feeNotes: null,
  configComplete: true,
  createdAt: "2026-08-01T15:00:00.000Z",
  updatedAt: "2026-08-01T15:00:00.000Z",
};

const visaCommitments: CreditCardCommitments = {
  creditCardId: "card-1",
  currentCardDebt: "125000.00",
  currentCardDebtByCurrency: [{ currency: "ARS", amount: "125000.00" }],
  futureInstallmentCommitment: "75000.00",
  totalOutstandingCommitment: "200000.00",
};

const supermercado: Transaction = {
  id: "tx-1",
  accountId: "acc-fondo",
  categoryId: "cat-1",
  type: "EXPENSE",
  status: "ACTIVE",
  amount: "42500.00",
  currency: "ARS",
  description: "Supermercado",
  occurredAt: "2026-08-14T15:00:00.000Z",
  paymentMethod: "DEBIT_CARD",
  isFixed: false,
  reimbursementStatus: "NONE",
  relatedTransactionId: null,
  metadata: null,
};

const anulado: Transaction = {
  ...supermercado,
  id: "tx-2",
  status: "VOIDED",
  amount: "999999.00",
  description: "Gasto anulado",
};

function renderDashboard({ privacy = false }: { privacy?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const dashboard = <Dashboard year={2026} month={8} />;
  return render(
    <QueryClientProvider client={client}>
      {privacy ? <PrivacyProvider>{dashboard}</PrivacyProvider> : dashboard}
    </QueryClientProvider>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    getFinancialSummary.mockReset();
    getHousing.mockReset();
    getHousingCoverage.mockReset();
    getAccounts.mockReset();
    getAccountBalance.mockReset();
    getInvestments.mockReset();
    getCreditCards.mockReset();
    getCreditCardCommitments.mockReset();
    getTransactions.mockReset();

    getHousing.mockResolvedValue([]);
    getHousingCoverage.mockResolvedValue(coverageQa);
    getAccounts.mockResolvedValue([]);
    getAccountBalance.mockResolvedValue({
      accountId: fondo.id,
      currency: "ARS",
      balance: "0.00",
    });
    getInvestments.mockResolvedValue([]);
    getCreditCards.mockResolvedValue([]);
    getCreditCardCommitments.mockResolvedValue(visaCommitments);
    getTransactions.mockResolvedValue([]);
  });

  it("shows a loading state", () => {
    getFinancialSummary.mockReturnValue(new Promise(() => undefined));
    renderDashboard();
    expect(screen.getByLabelText("Cargando resumen financiero")).toBeTruthy();
    expect(screen.queryByText("No pudimos cargar tu resumen. Probá de nuevo.")).toBeNull();
    expect(screen.queryByText("Todavía no configuraste tu vivienda.")).toBeNull();
  });

  it("renders the hero with the available ARS fund and the runway", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByText("Disponible")).toBeTruthy();
    expect(screen.getByText("Runway")).toBeTruthy();
    expect(screen.getByText("10,4 meses")).toBeTruthy();
  });

  it("renders the loaded summary metrics", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getAllByText("Gasto neto").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 2.114,06").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Consumo del fondo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 600.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Superávit del mes")).toBeTruthy();
    expect(screen.getAllByText("$ 83.919,77").length).toBeGreaterThan(0);
  });

  it("shows a friendly copy when runway is null", async () => {
    getFinancialSummary.mockResolvedValue({
      ...loaded,
      averageMonthlyFundConsumption: null,
      runwayMonths: null,
      monthlySurplus: "0.00",
    });
    renderDashboard();

    expect((await screen.findAllByText("Sin datos suficientes")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Superávit del mes")).toBeNull();
    expect(screen.getByText("$ 20.800.000,00")).toBeTruthy();
  });

  it("links the quick actions and recovers from an API error", async () => {
    const user = userEvent.setup();
    getFinancialSummary.mockRejectedValueOnce(new Error("fail"));
    renderDashboard();

    expect(await screen.findByText("No pudimos cargar tu resumen. Probá de nuevo.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Registrar gasto/ }).getAttribute("href")
    ).toBe("/registrar");
    expect(
      screen.getByRole("link", { name: /Registrar ingreso/ }).getAttribute("href")
    ).toBe("/registrar");
    expect(screen.getByRole("link", { name: /Transferir/ }).getAttribute("href")).toBe(
      "/transfers"
    );
    expect(
      screen.getByRole("link", { name: /Ver movimientos/ }).getAttribute("href")
    ).toBe("/transactions");

    getFinancialSummary.mockResolvedValueOnce(loaded);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
  });

  it("shows expanded month analysis from the same FinancialSummary", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Análisis del mes" })).toBeTruthy();
    expect(screen.getAllByText("Gasto bruto").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 2.414,06").length).toBeGreaterThan(0);
    expect(screen.getByText("Promedio de consumo")).toBeTruthy();
    expect(screen.getAllByText("$ 2.000.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Comparación del mes")).toBeTruthy();
    expect(screen.getByText("Consumo vs promedio")).toBeTruthy();
    expect(screen.getByText("Este mes")).toBeTruthy();
    expect(screen.getByText("Promedio")).toBeTruthy();
  });

  it("hides the average comparison when there is no valid history", async () => {
    getFinancialSummary.mockResolvedValue({
      ...loaded,
      averageMonthlyFundConsumption: null,
      runwayMonths: null,
      monthlySurplus: "0.00",
    });
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Análisis del mes" })).toBeTruthy();
    expect(screen.getAllByText("Sin datos suficientes").length).toBeGreaterThan(0);
    expect(screen.queryByText("Consumo vs promedio")).toBeNull();
  });

  it("shows 8,00 covered installments and reserve from HousingCoverage", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([casa]);
    getHousingCoverage.mockResolvedValue(coverageQa);
    renderDashboard();

    expect(await screen.findByText("USD 8.800,00")).toBeTruthy();
    expect(screen.getByText("Reserva USD")).toBeTruthy();
    expect(screen.getByText("8,00 cuotas cubiertas")).toBeTruthy();
    expect(screen.getByText("8,00")).toBeTruthy();
    expect(screen.getByText("37 cuotas pendientes")).toBeTruthy();
    expect(screen.getByText("USD 1.100,00")).toBeTruthy();
  });

  it("keeps the ARS fund separated from the USD reserve", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([casa]);
    renderDashboard();

    // Con montos en USD presentes, el hero aclara la moneda en su label en vez
    // de repetir el importe en una métrica aparte.
    expect(await screen.findByText("Disponible ARS")).toBeTruthy();
    expect(screen.queryByText("Disponible")).toBeNull();
    expect(screen.getAllByText("$ 20.800.000,00").length).toBe(1);
    expect(screen.getByText("USD 8.800,00")).toBeTruthy();
  });

  it("shows the housing empty state when there is no active housing", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([{ ...casa, isActive: false }]);
    renderDashboard();

    expect(await screen.findByText("Todavía no configuraste tu vivienda.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Configurar vivienda" }).getAttribute("href")
    ).toBe("/housing");
    expect(getHousingCoverage).not.toHaveBeenCalled();
  });

  it("asks to configure a reserve when coverage has none", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([{ ...casa, reserveAccountId: null }]);
    getHousingCoverage.mockResolvedValue({
      ...coverageQa,
      reserveAccountId: null,
      reserveBalance: null,
      coveredInstallments: null,
    });
    renderDashboard();

    expect(
      await screen.findByText("Tu vivienda no tiene una cuenta de reserva configurada.")
    ).toBeTruthy();
    expect(screen.queryByText("Reserva USD")).toBeNull();
    expect(screen.queryByText("Cuotas cubiertas")).toBeNull();
  });

  it("shows 0,00 cuotas cubiertas when coverage is zero", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([casa]);
    getHousingCoverage.mockResolvedValue({
      ...coverageQa,
      reserveBalance: "0.00",
      coveredInstallments: "0.00",
    });
    renderDashboard();

    expect(await screen.findByText("0,00 cuotas cubiertas")).toBeTruthy();
    expect(screen.getByText("USD 0,00")).toBeTruthy();
    expect(screen.getByText("0,00")).toBeTruthy();
  });

  it("does not flash the housing empty state while housing is loading", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockReturnValue(new Promise(() => undefined));
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByLabelText("Cargando vivienda")).toBeTruthy();
    expect(screen.queryByText("Todavía no configuraste tu vivienda.")).toBeNull();
  });

  it("keeps financial metrics visible when housing fails and retries locally", async () => {
    const user = userEvent.setup();
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockRejectedValueOnce(new Error("fail"));
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByText("10,4 meses")).toBeTruthy();
    expect(await screen.findByText("No pudimos cargar tu vivienda. Probá de nuevo.")).toBeTruthy();
    expect(screen.queryByText("No pudimos cargar tu resumen. Probá de nuevo.")).toBeNull();
    getHousing.mockResolvedValueOnce([casa]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("8,00 cuotas cubiertas")).toBeTruthy();
  });

  it("ignores inactive housing and uses the first active in backend order", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    const inactiveFirst: HousingObligation = {
      ...casa,
      id: "h-old",
      name: "aaa",
      isActive: false,
    };
    getHousing.mockResolvedValue([inactiveFirst, casa]);
    renderDashboard();

    expect(await screen.findByText("8,00 cuotas cubiertas")).toBeTruthy();
    await waitFor(() => {
      expect(getHousingCoverage).toHaveBeenCalledWith("h-casa");
    });
  });

  it("previews active accounts with their balances", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getAccounts.mockResolvedValue([fondo, reserva, { ...fondo, id: "acc-old", isActive: false }]);
    getAccountBalance.mockImplementation(async (id: string) =>
      id === fondo.id
        ? { accountId: id, currency: "ARS", balance: "3500000.00" }
        : { accountId: id, currency: "USD", balance: "8800.00" }
    );
    renderDashboard();

    expect(await screen.findByText("QA Fondo")).toBeTruthy();
    expect(screen.getByText("QA Reserva")).toBeTruthy();
    expect(screen.queryByText("Todavía no tenés cuentas activas.")).toBeNull();
    expect(await screen.findByText("$ 3.500.000,00")).toBeTruthy();
    expect(screen.getByText("USD 8.800,00")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver todas las cuentas" }).getAttribute("href")
    ).toBe("/accounts");
  });

  it("shows the accounts empty state when there are no active accounts", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getAccounts.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText("Todavía no tenés cuentas activas.")).toBeTruthy();
    expect(getAccountBalance).not.toHaveBeenCalled();
  });

  it("lists only active expenses in gastos recientes", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getTransactions.mockResolvedValue([supermercado, anulado]);
    renderDashboard();

    expect(await screen.findByText("Supermercado")).toBeTruthy();
    expect(screen.getByText("$ 42.500,00")).toBeTruthy();
    expect(screen.getByText("14/08/2026")).toBeTruthy();
    expect(screen.queryByText("Gasto anulado")).toBeNull();
    expect(screen.queryByText("$ 999.999,00")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ver todos los gastos" }).getAttribute("href")
    ).toBe("/transactions");
  });

  it("shows active investments and their ARS principal metric", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getInvestments.mockResolvedValue([caucion, { ...caucion, id: "inv-2", status: "MATURED" }]);
    renderDashboard();

    expect((await screen.findAllByText("$ 1.500.000,00")).length).toBe(2);
    expect(screen.getAllByText("Inversiones").length).toBe(2);
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.queryByText("No tenés inversiones activas.")).toBeNull();
  });

  it("shows the credit card debt when there are cards", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getCreditCards.mockResolvedValue([visa]);
    getCreditCardCommitments.mockResolvedValue(visaCommitments);
    renderDashboard();

    expect(await screen.findByText("QA Visa")).toBeTruthy();
    expect((await screen.findAllByText("$ 125.000,00")).length).toBeGreaterThan(0);
    expect(screen.getByText("Deuda tarjetas")).toBeTruthy();
    expect(screen.queryByText("No tenés tarjetas cargadas.")).toBeNull();
  });

  it("flattens multi-currency card debt without summing ARS+USD", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getCreditCards.mockResolvedValue([visa]);
    getCreditCardCommitments.mockResolvedValue({
      ...visaCommitments,
      currentCardDebt: "125000.00",
      currentCardDebtByCurrency: [
        { currency: "ARS", amount: "125000.00" },
        { currency: "USD", amount: "80.00" },
      ],
    });
    renderDashboard();

    expect((await screen.findAllByText("$ 125.000,00")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD 80,00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$ 125.080,00")).toBeNull();
  });

  it("shows a soft empty state when there are no credit cards", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getCreditCards.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText("No tenés tarjetas cargadas.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Agregar tarjeta" }).getAttribute("href")
    ).toBe("/cards");
    expect(screen.queryByText("Deuda tarjetas")).toBeNull();
    expect(getCreditCardCommitments).not.toHaveBeenCalled();
  });

  it("exposes the privacy toggle in the header", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar montos" })).toBeTruthy();
  });

  it("masks every amount when privacy mode is on", async () => {
    localStorage.setItem(PRIVACY_KEY, "1");
    getFinancialSummary.mockResolvedValue(loaded);
    getAccounts.mockResolvedValue([reserva]);
    getAccountBalance.mockResolvedValue({
      accountId: reserva.id,
      currency: "USD",
      balance: "8800.00",
    });
    getTransactions.mockResolvedValue([supermercado]);
    renderDashboard({ privacy: true });

    expect((await screen.findAllByText("$ ••••••")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("USD ••••••")).length).toBeGreaterThan(0);
    expect(screen.queryByText("$ 20.800.000,00")).toBeNull();
    expect(screen.queryByText("$ 42.500,00")).toBeNull();
    expect(screen.queryByText("USD 8.800,00")).toBeNull();
    expect(screen.getByText("Supermercado")).toBeTruthy();
  });
});
