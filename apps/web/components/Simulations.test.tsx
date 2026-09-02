import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentYearMonth } from "../lib/format-money";
import { SIMULATION_TIMEZONE } from "../lib/simulations";
import type {
  HousingObligation,
  HousingReserveSimulationResult,
  MonthsWithoutIncomeResult,
  NewJobScenarioResult,
  SimulationRequest,
} from "../lib/types";
import { SimulationsPage } from "./Simulations";

const { getHousing, runSimulation, ApiClientError } = vi.hoisted(() => {
  class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  }
  return {
    ApiClientError,
    getHousing: vi.fn(),
    runSimulation: vi.fn(),
  };
});

vi.mock("../lib/api", () => ({
  ApiClientError,
  getHousing: () => getHousing(),
  runSimulation: (payload: SimulationRequest) => runSimulation(payload),
}));

const period = currentYearMonth();

const housingOne: HousingObligation = {
  id: "11111111-1111-4111-8111-111111111111",
  reserveAccountId: "res-1",
  name: "Cuotas departamento",
  currency: "USD",
  installmentAmount: "500.00",
  remainingInstallments: 12,
  dueDay: 10,
  isActive: true,
};

const housingTwo: HousingObligation = {
  ...housingOne,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Cochera",
};

const monthsResult: MonthsWithoutIncomeResult = {
  year: period.year,
  month: period.month,
  months: 6,
  baseline: {
    availableCapitalARS: "3000000.00",
    averageMonthlyFundConsumptionARS: "1000000.00",
    currentRunwayMonths: "3.00",
  },
  projection: {
    monthlyIncomeARS: "0.00",
    monthlyFundConsumptionARS: "1000000.00",
    totalFundConsumedARS: "3000000.00",
    remainingCapitalARS: "0.00",
    depletedAfterMonth: 3,
    runwayAfterScenarioMonths: "0.00",
  },
};

const monthsNullBaseline: MonthsWithoutIncomeResult = {
  ...monthsResult,
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
  year: period.year,
  month: period.month,
  monthsUntilJob: 3,
  totalMonths: 6,
  assumptions: {
    newMonthlyIncomeARS: "800000.00",
    expenseChangeFraction: "-0.100000",
  },
  baseline: {
    availableCapitalARS: "6000000.00",
    averageMonthlyFundConsumptionARS: "1000000.00",
    currentRunwayMonths: "6.00",
  },
  projection: {
    adjustedMonthlyConsumptionARS: "900000.00",
    phaseWithoutIncome: {
      months: 3,
      totalFundConsumedARS: "2700000.00",
      remainingCapitalARS: "3300000.00",
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

const jobDrawZero: NewJobScenarioResult = {
  ...jobResult,
  projection: {
    ...jobResult.projection,
    phaseWithNewJob: {
      ...jobResult.projection.phaseWithNewJob,
      effectiveMonthlyDrawARS: "0.00",
    },
    finalMonthlyFundConsumptionARS: "0.00",
    runwayAfterScenarioMonths: null,
  },
};

const jobDepleted: NewJobScenarioResult = {
  ...jobResult,
  projection: {
    ...jobResult.projection,
    remainingCapitalARS: "0.00",
    depletedAfterMonth: 0,
    runwayAfterScenarioMonths: "0.00",
  },
};

const housingFunded: HousingReserveSimulationResult = {
  housingObligationId: housingOne.id,
  targetInstallments: 8,
  housing: {
    installmentAmountUSD: "500.00",
    remainingInstallments: 12,
    reserveAccountId: "res-1",
    currentReserveUSD: "2000.00",
    effectiveCurrentReserveUSD: "2000.00",
    currentCoveredInstallments: "4.00",
    targetReserveUSD: "4000.00",
    missingReserveUSD: "2000.00",
    excessReserveUSD: "0.00",
  },
  fx: {
    exchangeRateARSPerUSD: "1500.000000",
    arsRequiredForMissingReserve: "3000000.00",
  },
  ars: {
    totalAvailableARS: "5000000.00",
    remainingAvailableARSAfterReserve: "2000000.00",
    arsShortfall: "0.00",
    canFullyFundFromAvailableARS: true,
    currentRunwayMonths: "5.00",
  },
};

const housingShort: HousingReserveSimulationResult = {
  ...housingFunded,
  ars: {
    ...housingFunded.ars,
    totalAvailableARS: "1000000.00",
    remainingAvailableARSAfterReserve: "0.00",
    arsShortfall: "2000000.00",
    canFullyFundFromAvailableARS: false,
  },
};

const housingNullReserve: HousingReserveSimulationResult = {
  ...housingFunded,
  housing: {
    ...housingFunded.housing,
    reserveAccountId: null,
    currentReserveUSD: null,
    effectiveCurrentReserveUSD: "0.00",
    currentCoveredInstallments: null,
    missingReserveUSD: "4000.00",
  },
  fx: {
    exchangeRateARSPerUSD: "1500.000000",
    arsRequiredForMissingReserve: "6000000.00",
  },
};

function renderSimulations(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <SimulationsPage />
    </QueryClientProvider>
  );
  return { ...view, client, invalidate };
}

describe("SimulationsPage", () => {
  beforeEach(() => {
    getHousing.mockReset();
    runSimulation.mockReset();
    getHousing.mockResolvedValue([housingOne]);
  });

  it("renders the title, disclaimer, empty state and three scenario options", () => {
    renderSimulations();
    expect(screen.getByRole("heading", { name: "Simulaciones" })).toBeTruthy();
    expect(screen.getByText("Probá escenarios sin modificar tus datos reales.")).toBeTruthy();
    expect(
      screen.getByText("Las simulaciones no modifican tus movimientos ni saldos.")
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Sin ingresos" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Nuevo empleo" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Reserva vivienda" })).toBeTruthy();
    expect(screen.getByText("Completá los datos para ver el escenario.")).toBeTruthy();
  });

  it("submits months without income and renders baseline, remaining, runway and depletion", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({
      type: "MONTHS_WITHOUT_INCOME",
      result: monthsResult,
    });
    const { invalidate } = renderSimulations();
    await user.type(
      screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"),
      "6"
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));
    await waitFor(() => {
      expect(runSimulation).toHaveBeenCalledWith({
        type: "MONTHS_WITHOUT_INCOME",
        year: period.year,
        month: period.month,
        months: 6,
        timeZone: SIMULATION_TIMEZONE,
      });
    });
    expect((await screen.findAllByText("$ 3.000.000,00")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 1.000.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("El fondo se agotaría durante el mes 3.")).toBeTruthy();
    expect(screen.getByText("0 meses")).toBeTruthy();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("uses month shortcuts without treating them as the only allowed values", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({
      type: "MONTHS_WITHOUT_INCOME",
      result: { ...monthsResult, months: 4 },
    });
    renderSimulations();
    await user.click(screen.getByRole("button", { name: "6 meses" }));
    expect(
      (screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?") as HTMLInputElement)
        .value
    ).toBe("6");
    await user.clear(screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"));
    await user.type(screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"), "4");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    await waitFor(() => {
      expect(runSimulation).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MONTHS_WITHOUT_INCOME", months: 4 })
      );
    });
  });

  it("shows the null-baseline copy without substituting zero consumption", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({
      type: "MONTHS_WITHOUT_INCOME",
      result: monthsNullBaseline,
    });
    renderSimulations();
    await user.type(
      screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"),
      "6"
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText("Todavía no hay suficiente historial para calcular este escenario.")
    ).toBeTruthy();
    expect(
      screen.getByText("No hay suficiente historial para estimar el consumo mensual.")
    ).toBeTruthy();
    expect(screen.getByText("$ 3.000.000,00")).toBeTruthy();
    expect(screen.queryByText("Consumo mensual promedio")?.parentElement?.textContent).not.toMatch(
      /\$ 0/
    );
  });

  it("shows loading copy, blocks double submit and maps API errors to Spanish", async () => {
    const user = userEvent.setup();
    let resolveSim: ((value: unknown) => void) | undefined;
    runSimulation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSim = resolve;
        })
    );
    renderSimulations();
    await user.type(
      screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"),
      "6"
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(await screen.findByRole("button", { name: "Simulando..." })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Simulando..." }) as HTMLButtonElement).disabled).toBe(
      true
    );
    await user.click(screen.getByRole("button", { name: "Simulando..." }));
    expect(runSimulation).toHaveBeenCalledTimes(1);
    resolveSim?.({ type: "MONTHS_WITHOUT_INCOME", result: monthsResult });
    expect(await screen.findByText("El fondo se agotaría durante el mes 3.")).toBeTruthy();

    runSimulation.mockRejectedValueOnce(
      new ApiClientError(400, "INVALID_MONTHS", "INVALID_MONTHS")
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText("La cantidad de meses debe ser un entero mayor que 0.")
    ).toBeTruthy();
    expect(screen.queryByText("INVALID_MONTHS")).toBeNull();
  });

  it("does not mix results when switching scenarios", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({
      type: "MONTHS_WITHOUT_INCOME",
      result: monthsResult,
    });
    renderSimulations();
    await user.type(
      screen.getByLabelText("¿Cuántos meses querés simular sin ingresos?"),
      "6"
    );
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(await screen.findByText("El fondo se agotaría durante el mes 3.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Nuevo empleo" }));
    expect(screen.queryByText("El fondo se agotaría durante el mes 3.")).toBeNull();
    expect(screen.getByText("Completá los datos para ver el escenario.")).toBeTruthy();
    expect(screen.getByLabelText("Meses hasta nuevo empleo")).toBeTruthy();
  });

  it("converts a human expense percent and renders new-job phases", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "NEW_JOB", result: jobResult });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Nuevo empleo" }));
    await user.type(screen.getByLabelText("Meses hasta nuevo empleo"), "3");
    await user.type(screen.getByLabelText("Horizonte a simular"), "6");
    await user.type(screen.getByLabelText("Nuevo ingreso mensual"), "800000");
    await user.clear(screen.getByLabelText("Cambio estimado de gastos (%)"));
    await user.type(screen.getByLabelText("Cambio estimado de gastos (%)"), "-10");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    await waitFor(() => {
      expect(runSimulation).toHaveBeenCalledWith({
        type: "NEW_JOB",
        year: period.year,
        month: period.month,
        monthsUntilJob: 3,
        totalMonths: 6,
        newMonthlyIncomeARS: "800000.00",
        expenseChangeFraction: "-0.100000",
        timeZone: SIMULATION_TIMEZONE,
      });
    });
    expect(await screen.findByText("Consumido durante etapa sin ingreso")).toBeTruthy();
    expect(screen.getByText("$ 2.400.000,00")).toBeTruthy();
    expect(screen.getByText("12 meses")).toBeTruthy();
    expect(screen.getByText("-10%")).toBeTruthy();
  });

  it("explains a zero draw without N/A or infinite runway", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "NEW_JOB", result: jobDrawZero });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Nuevo empleo" }));
    await user.type(screen.getByLabelText("Meses hasta nuevo empleo"), "3");
    await user.type(screen.getByLabelText("Horizonte a simular"), "6");
    await user.type(screen.getByLabelText("Nuevo ingreso mensual"), "800000");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText("El fondo dejaría de consumirse con este escenario.")
    ).toBeTruthy();
    expect(screen.queryByText("N/A")).toBeNull();
    expect(screen.queryByText(/infinito/i)).toBeNull();
  });

  it("shows global depletion including a start without ARS capital", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "NEW_JOB", result: jobDepleted });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Nuevo empleo" }));
    await user.type(screen.getByLabelText("Meses hasta nuevo empleo"), "3");
    await user.type(screen.getByLabelText("Horizonte a simular"), "6");
    await user.type(screen.getByLabelText("Nuevo ingreso mensual"), "800000");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText("El escenario comienza sin capital ARS disponible.")
    ).toBeTruthy();
  });

  it("loads real housing obligations, submits FX and target, and renders the USD/ARS result", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "HOUSING_RESERVE", result: housingFunded });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Reserva vivienda" }));
    expect(await screen.findByLabelText("Obligación de vivienda")).toBeTruthy();
    expect(screen.getByText("Pendientes: 12")).toBeTruthy();
    expect((screen.getByLabelText("Obligación de vivienda") as HTMLSelectElement).value).toBe(
      housingOne.id
    );
    await user.type(screen.getByLabelText("Cuotas que querés reservar"), "8");
    await user.type(screen.getByLabelText("Cotización ARS por USD"), "1500");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    await waitFor(() => {
      expect(runSimulation).toHaveBeenCalledWith({
        type: "HOUSING_RESERVE",
        housingObligationId: housingOne.id,
        targetInstallments: 8,
        exchangeRateARSPerUSD: "1500.000000",
        year: period.year,
        month: period.month,
        timeZone: SIMULATION_TIMEZONE,
      });
    });
    expect(await screen.findByText("USD 4.000,00")).toBeTruthy();
    expect(screen.getByText("$ 3.000.000,00")).toBeTruthy();
    expect(
      screen.getByText("Con el capital ARS disponible podrías cubrir este objetivo.")
    ).toBeTruthy();
    expect(screen.getByText("5 meses")).toBeTruthy();
    expect(screen.queryByText(/nuevo runway/i)).toBeNull();
  });

  it("lets the user pick among several housing obligations", async () => {
    getHousing.mockResolvedValue([housingOne, housingTwo]);
    const user = userEvent.setup();
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Reserva vivienda" }));
    expect(await screen.findByRole("option", { name: "Elegí una obligación" })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Obligación de vivienda"), housingTwo.id);
    expect((screen.getByLabelText("Obligación de vivienda") as HTMLSelectElement).value).toBe(
      housingTwo.id
    );
  });

  it("shows the ARS shortfall copy when the reserve cannot be fully funded", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "HOUSING_RESERVE", result: housingShort });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Reserva vivienda" }));
    await screen.findByLabelText("Obligación de vivienda");
    await user.type(screen.getByLabelText("Cuotas que querés reservar"), "8");
    await user.type(screen.getByLabelText("Cotización ARS por USD"), "1500");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect(
      await screen.findByText("Faltarían $ 2.000.000,00 para cubrir este objetivo.")
    ).toBeTruthy();
  });

  it("treats a null reserve as no configured account and usable USD 0", async () => {
    const user = userEvent.setup();
    runSimulation.mockResolvedValue({ type: "HOUSING_RESERVE", result: housingNullReserve });
    renderSimulations();
    await user.click(screen.getByRole("radio", { name: "Reserva vivienda" }));
    await screen.findByLabelText("Obligación de vivienda");
    await user.type(screen.getByLabelText("Cuotas que querés reservar"), "8");
    await user.type(screen.getByLabelText("Cotización ARS por USD"), "1500");
    await user.click(screen.getByRole("button", { name: "Simular" }));
    expect((await screen.findAllByText("Sin cuenta de reserva configurada")).length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("Reserva utilizable").closest("div")?.textContent).toContain("USD 0,00");
    expect(screen.queryByText(/nuevo runway/i)).toBeNull();
  });
});
