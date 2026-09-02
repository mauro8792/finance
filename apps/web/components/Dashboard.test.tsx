import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialSummary, HousingCoverage, HousingObligation } from "../lib/types";
import { Dashboard } from "./Dashboard";

const getFinancialSummary = vi.fn();
const getHousing = vi.fn();
const getHousingCoverage = vi.fn();

vi.mock("../lib/api", () => ({
  getFinancialSummary: (year: number, month: number) =>
    getFinancialSummary(year, month),
  getHousing: () => getHousing(),
  getHousingCoverage: (id: string) => getHousingCoverage(id),
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

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard year={2026} month={8} />
    </QueryClientProvider>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    getFinancialSummary.mockReset();
    getHousing.mockReset();
    getHousingCoverage.mockReset();
    getHousing.mockResolvedValue([]);
    getHousingCoverage.mockResolvedValue(coverageQa);
  });

  it("shows a loading state", () => {
    getFinancialSummary.mockReturnValue(new Promise(() => undefined));
    renderDashboard();
    expect(screen.getByText("Cargando resumen financiero")).toBeTruthy();
  });

  it("renders the loaded summary metrics", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getAllByText("Gasto neto").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 2.114,06").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Consumo del fondo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 600.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Disponible para vivir")).toBeTruthy();
    expect(screen.getByText("10,4 meses")).toBeTruthy();
    expect(screen.getByText("Superávit del mes")).toBeTruthy();
    expect(screen.getByText("$ 83.919,77")).toBeTruthy();
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

  it("links the registrar CTA and recovers from an API error", async () => {
    const user = userEvent.setup();
    getFinancialSummary.mockRejectedValueOnce(new Error("fail"));
    renderDashboard();

    expect(await screen.findByText("No pudimos cargar tu resumen. Probá de nuevo.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Registrar movimiento" });
    expect(cta.getAttribute("href")).toBe("/registrar");

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
    expect(screen.getByRole("link", { name: "Registrar movimiento" }).getAttribute("href")).toBe(
      "/registrar"
    );
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

    expect(await screen.findByText("Vivienda USD")).toBeTruthy();
    expect(screen.getByText("8,00 cuotas cubiertas")).toBeTruthy();
    expect(screen.getByText("USD 8.800,00 reservados")).toBeTruthy();
    expect(screen.queryByText("Aún no disponible")).toBeNull();
  });

  it("shows Sin configurar when there is no active housing", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([{ ...casa, isActive: false }]);
    renderDashboard();

    expect(await screen.findByText("Sin configurar")).toBeTruthy();
    expect(screen.getByText("Vivienda USD")).toBeTruthy();
    expect(getHousingCoverage).not.toHaveBeenCalled();
    expect(screen.queryByText("Aún no disponible")).toBeNull();
  });

  it("shows Sin reserva configurada when coverage has a null reserve", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([{ ...casa, reserveAccountId: null }]);
    getHousingCoverage.mockResolvedValue({
      ...coverageQa,
      reserveAccountId: null,
      reserveBalance: null,
      coveredInstallments: null,
    });
    renderDashboard();

    expect(await screen.findByText("Sin reserva configurada")).toBeTruthy();
    expect(screen.queryByText("0,00 cuotas cubiertas")).toBeNull();
    expect(screen.queryByText("Aún no disponible")).toBeNull();
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
    expect(screen.getByText("USD 0,00 reservados")).toBeTruthy();
  });

  it("does not flash Sin configurar while housing is loading", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockReturnValue(new Promise(() => undefined));
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByLabelText("Cargando vivienda")).toBeTruthy();
    expect(screen.queryByText("Sin configurar")).toBeNull();
    expect(screen.queryByText("Aún no disponible")).toBeNull();
  });

  it("keeps financial metrics visible when housing fails", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockRejectedValue(new Error("fail"));
    renderDashboard();

    expect(await screen.findByText("$ 20.800.000,00")).toBeTruthy();
    expect(screen.getByText("10,4 meses")).toBeTruthy();
    expect(await screen.findByText("No se pudo cargar")).toBeTruthy();
    expect(screen.queryByText("Aún no disponible")).toBeNull();
  });

  it("uses the obligation currency in the housing label", async () => {
    getFinancialSummary.mockResolvedValue(loaded);
    getHousing.mockResolvedValue([{ ...casa, currency: "ARS", reserveAccountId: "acc-ars" }]);
    getHousingCoverage.mockResolvedValue({
      ...coverageQa,
      currency: "ARS",
      reserveAccountId: "acc-ars",
      reserveBalance: "50000.00",
      coveredInstallments: "2.00",
    });
    renderDashboard();

    expect(await screen.findByText("Vivienda ARS")).toBeTruthy();
    expect(screen.getByText("2,00 cuotas cubiertas")).toBeTruthy();
    expect(screen.queryByText("Vivienda USD")).toBeNull();
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
});
