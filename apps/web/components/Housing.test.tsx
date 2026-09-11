import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HousingCoverage, HousingObligation, HousingPayment } from "../lib/types";
import { HousingPage } from "./Housing";

const getHousing = vi.fn();
const getAccounts = vi.fn();
const getHousingCoverage = vi.fn();
const getHousingPayments = vi.fn();
const createHousing = vi.fn();
const updateHousing = vi.fn();
const registerHousingPayment = vi.fn();
const voidHousingPayment = vi.fn();

class MockApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

vi.mock("../lib/api", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
  getHousing: () => getHousing(),
  getAccounts: () => getAccounts(),
  getHousingCoverage: (id: string) => getHousingCoverage(id),
  getHousingPayments: (id: string) => getHousingPayments(id),
  createHousing: (payload: unknown) => createHousing(payload),
  updateHousing: (id: string, payload: unknown) => updateHousing(id, payload),
  registerHousingPayment: (id: string, payload: unknown) =>
    registerHousingPayment(id, payload),
  voidHousingPayment: (obligationId: string, paymentId: string, payload: unknown) =>
    voidHousingPayment(obligationId, paymentId, payload),
}));

const accounts = [
  { id: "acc-usd", name: "Reserva USD", currency: "USD" as const, isActive: true },
  { id: "acc-ars", name: "Caja ARS", currency: "ARS" as const, isActive: true },
  { id: "acc-old", name: "Vieja USD", currency: "USD" as const, isActive: false },
];

const apto: HousingObligation = {
  id: "h-1",
  reserveAccountId: "acc-usd",
  name: "Alquiler de prueba",
  currency: "USD",
  installmentAmount: "500.00",
  remainingInstallments: 12,
  dueDay: 10,
  isActive: true,
};

const garage: HousingObligation = {
  id: "h-2",
  reserveAccountId: null,
  name: "Cochera de prueba",
  currency: "ARS",
  installmentAmount: "80000.00",
  remainingInstallments: 6,
  dueDay: null,
  isActive: true,
};

const coverageNormal: HousingCoverage = {
  housingObligationId: "h-1",
  currency: "USD",
  reserveAccountId: "acc-usd",
  reserveBalance: "2000.00",
  installmentAmount: "500.00",
  remainingInstallments: 12,
  coveredInstallments: "4.00",
};

const coverageNull: HousingCoverage = {
  housingObligationId: "h-2",
  currency: "ARS",
  reserveAccountId: null,
  reserveBalance: null,
  installmentAmount: "80000.00",
  remainingInstallments: 6,
  coveredInstallments: null,
};

const coverageZero: HousingCoverage = {
  ...coverageNormal,
  reserveBalance: "-200.00",
  coveredInstallments: "0.00",
};

const coverageFraction: HousingCoverage = {
  ...coverageNormal,
  reserveBalance: "3865.00",
  coveredInstallments: "7.73",
};

const paidAt = new Date(2026, 7, 15, 12, 0, 0).toISOString();

const payment: HousingPayment = {
  id: "pay-1",
  housingObligationId: "h-1",
  transactionId: "tx-1",
  accountId: "acc-usd",
  amount: "500.00",
  currency: "USD",
  installmentNumber: 3,
  periodYear: 2026,
  periodMonth: 10,
  paidAt,
  voidedAt: null,
};

function renderHousing() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HousingPage />
    </QueryClientProvider>
  );
}

function mockCoverageAndPayments(
  byId: Record<string, { coverage: HousingCoverage; payments: HousingPayment[] }>
) {
  getHousingCoverage.mockImplementation(async (id: string) => byId[id]!.coverage);
  getHousingPayments.mockImplementation(async (id: string) => byId[id]!.payments);
}

describe("HousingPage", () => {
  beforeEach(() => {
    getHousing.mockReset();
    getAccounts.mockReset();
    getHousingCoverage.mockReset();
    getHousingPayments.mockReset();
    createHousing.mockReset();
    updateHousing.mockReset();
    registerHousingPayment.mockReset();
    voidHousingPayment.mockReset();
    getAccounts.mockResolvedValue(accounts);
  });

  it("shows a loading state", () => {
    getHousing.mockReturnValue(new Promise(() => undefined));
    renderHousing();
    expect(screen.getByLabelText("Cargando vivienda")).toBeTruthy();
    expect(screen.queryByText("Aún no configuraste tu vivienda.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the empty state without treating it as an error", async () => {
    getHousing.mockResolvedValue([]);
    renderHousing();
    expect(await screen.findByText("Aún no configuraste tu vivienda.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Configurar vivienda" }).length).toBeGreaterThan(
      0
    );
  });

  it("recovers from a list error", async () => {
    const user = userEvent.setup();
    getHousing.mockRejectedValueOnce(new Error("fail"));
    renderHousing();
    expect(await screen.findByText("No pudimos cargar tu vivienda. Probá de nuevo.")).toBeTruthy();
    getHousing.mockResolvedValueOnce([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Alquiler de prueba")).toBeTruthy();
  });

  it("renders one obligation with cuota, pendientes, dueDay and active state", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Alquiler de prueba")).toBeTruthy();
    expect(screen.getByText("USD 500,00")).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getByText("Día 10")).toBeTruthy();
    expect(screen.getAllByText("Activa").length).toBeGreaterThan(0);
    expect(screen.getByText("Reserva USD")).toBeTruthy();
  });

  it("renders several obligations when the API returns more than one", async () => {
    getHousing.mockResolvedValue([apto, garage]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
      "h-2": { coverage: coverageNull, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Alquiler de prueba")).toBeTruthy();
    expect(screen.getByText("Cochera de prueba")).toBeTruthy();
    expect(screen.getByText("$ 80.000,00")).toBeTruthy();
    expect(screen.getByText("Sin día configurado")).toBeTruthy();
  });

  it("shows inactive badge and hides the payment CTA", async () => {
    getHousing.mockResolvedValue([{ ...apto, isActive: false }]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    expect((await screen.findAllByText("Inactiva")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Registrar cuota" })).toBeNull();
    expect(await screen.findByText("USD 2.000,00")).toBeTruthy();
    expect(screen.getByText("Aún no registraste pagos.")).toBeTruthy();
  });

  it("shows reserve null copy on the card", async () => {
    getHousing.mockResolvedValue([garage]);
    mockCoverageAndPayments({
      "h-2": { coverage: coverageNull, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Sin cuenta de reserva")).toBeTruthy();
  });

  it("renders normal coverage from the backend DTO", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("USD 2.000,00")).toBeTruthy();
    expect(screen.getByText("4,00 de 12 cuotas cubiertas")).toBeTruthy();
  });

  it("keeps the exact covered installments and caps only the bar width", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageFraction, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("7,73 de 12 cuotas cubiertas")).toBeTruthy();
    expect(screen.getByText("USD 3.865,00")).toBeTruthy();
    expect(screen.queryByText("8 de 12 cuotas cubiertas")).toBeNull();
  });

  it("exposes the privacy toggle and the monthly installment", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Cuota mensual")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar montos" })).toBeTruthy();
    expect(screen.getByText("Próximo vencimiento")).toBeTruthy();
  });

  it("shows coverage null without inventing 0 cuotas", async () => {
    getHousing.mockResolvedValue([garage]);
    mockCoverageAndPayments({
      "h-2": { coverage: coverageNull, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Sin cuenta de reserva configurada")).toBeTruthy();
    expect(screen.queryByText(/cuotas cubiertas/)).toBeNull();
  });

  it("shows coverage 0 and a negative reserve as returned by the API", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageZero, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("-USD 200,00")).toBeTruthy();
    expect(screen.getByText("0,00 de 12 cuotas cubiertas")).toBeTruthy();
  });

  it("creates a housing obligation with the real contract", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([]);
    createHousing.mockResolvedValue(apto);
    renderHousing();
    await screen.findByText("Aún no configuraste tu vivienda.");
    await user.click(screen.getAllByRole("button", { name: "Configurar vivienda" })[0]!);
    expect(await screen.findByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Moneda")).toBeTruthy();
    expect(screen.getByLabelText("Cuota mensual")).toBeTruthy();
    expect(screen.getByLabelText("Cuotas pendientes")).toBeTruthy();
    expect(screen.getByLabelText("Día de vencimiento")).toBeTruthy();
    expect(screen.getByLabelText("Cuenta de reserva")).toBeTruthy();

    await user.type(screen.getByLabelText("Nombre"), "Alquiler de prueba");
    await user.selectOptions(screen.getByLabelText("Moneda"), "USD");
    expect(screen.getByRole("option", { name: "Reserva USD" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Caja ARS" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Cuenta de reserva"), "acc-usd");
    await user.type(screen.getByLabelText("Cuota mensual"), "500");
    await user.type(screen.getByLabelText("Cuotas pendientes"), "12");
    await user.type(screen.getByLabelText("Día de vencimiento"), "10");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createHousing).toHaveBeenCalledWith({
        name: "Alquiler de prueba",
        currency: "USD",
        installmentAmount: "500.00",
        remainingInstallments: 12,
        dueDay: 10,
        reserveAccountId: "acc-usd",
      });
    });
  });

  it("edits editable fields and does not expose currency", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    updateHousing.mockResolvedValue({ ...apto, name: "Alquiler actualizado" });
    renderHousing();
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar vivienda")).toBeTruthy();
    expect(screen.queryByLabelText("Moneda")).toBeNull();
    expect(screen.getByText("Moneda: USD")).toBeTruthy();

    const name = screen.getByLabelText("Nombre");
    await user.clear(name);
    await user.type(name, "Alquiler actualizado");
    const remaining = screen.getByLabelText("Cuotas pendientes");
    await user.clear(remaining);
    await user.type(remaining, "11");
    expect(
      screen.getByText("Cambiar las cuotas pendientes afecta la cobertura y las proyecciones.")
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(updateHousing).toHaveBeenCalledWith("h-1", {
        name: "Alquiler actualizado",
        installmentAmount: "500.00",
        remainingInstallments: 11,
        dueDay: 10,
        reserveAccountId: "acc-usd",
        isActive: true,
      });
    });
  });

  it("opens the payment form with installmentAmount as visual default", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    await user.click(await screen.findByRole("button", { name: "Registrar cuota" }));
    expect(await screen.findByLabelText("Cuenta de pago")).toBeTruthy();
    expect((screen.getByLabelText("Monto") as HTMLInputElement).value).toBe("500.00");
    expect(screen.getByLabelText("Fecha de pago")).toBeTruthy();
    expect(screen.getByLabelText("Año del período")).toBeTruthy();
    expect(screen.getByLabelText("Mes del período")).toBeTruthy();
    expect(screen.getByLabelText("Número de cuota")).toBeTruthy();
  });

  it("registers a payment and refetches housing data", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    registerHousingPayment.mockResolvedValue({
      payment,
      remainingInstallments: 11,
      isActive: true,
    });
    renderHousing();
    await user.click(await screen.findByRole("button", { name: "Registrar cuota" }));
    await user.selectOptions(screen.getByLabelText("Cuenta de pago"), "acc-usd");
    await user.clear(screen.getByLabelText("Año del período"));
    await user.type(screen.getByLabelText("Año del período"), "2026");
    await user.selectOptions(screen.getByLabelText("Mes del período"), "10");
    await user.type(screen.getByLabelText("Número de cuota"), "3");
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));

    await waitFor(() => {
      expect(registerHousingPayment).toHaveBeenCalledWith(
        "h-1",
        expect.objectContaining({
          accountId: "acc-usd",
          amount: "500.00",
          installmentNumber: 3,
          periodYear: 2026,
          periodMonth: 10,
        })
      );
    });
    expect(getHousing.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getHousingCoverage.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getHousingPayments.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows period in history and voids a payment with confirm copy", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [payment] },
    });
    voidHousingPayment.mockResolvedValue({
      payment: { ...payment, voidedAt: "2026-09-11T12:00:00.000Z" },
      remainingInstallments: 12,
      isActive: true,
    });
    vi.stubGlobal("crypto", { randomUUID: () => "void-key-1" });

    renderHousing();
    expect(await screen.findByText("Octubre 2026")).toBeTruthy();
    expect(screen.getByText(/Pagada el/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular registro" }));
    expect(
      screen.getByText("El registro original se conservará en el historial.")
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar anulación" }));

    await waitFor(() => {
      expect(voidHousingPayment).toHaveBeenCalledWith("h-1", "pay-1", {
        idempotencyKey: "void-key-1",
      });
    });
  });

  it("shows a readable payment backend error", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    registerHousingPayment.mockRejectedValue(
      new MockApiError(400, "INSUFFICIENT_BALANCE", "La cuenta no tiene saldo suficiente.")
    );
    renderHousing();
    await user.click(await screen.findByRole("button", { name: "Registrar cuota" }));
    await user.selectOptions(screen.getByLabelText("Cuenta de pago"), "acc-usd");
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(await screen.findByText("La cuenta no tiene saldo suficiente.")).toBeTruthy();
    expect(screen.queryByText("INSUFFICIENT_BALANCE")).toBeNull();
  });

  it("shows empty payment history", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": { coverage: coverageNormal, payments: [] },
    });
    renderHousing();
    expect(await screen.findByText("Aún no registraste pagos.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retries coverage without hiding payment history", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    getHousingCoverage.mockRejectedValueOnce(new Error("ECONNRESET"));
    getHousingPayments.mockResolvedValue([]);
    renderHousing();
    expect(await screen.findByText("No pudimos cargar la cobertura. Probá de nuevo.")).toBeTruthy();
    expect(screen.queryByText("ECONNRESET")).toBeNull();
    expect(screen.getByText("Aún no registraste pagos.")).toBeTruthy();
    getHousingCoverage.mockResolvedValueOnce(coverageNormal);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("USD 2.000,00")).toBeTruthy();
  });

  it("retries payment history without using empty copy", async () => {
    const user = userEvent.setup();
    getHousing.mockResolvedValue([apto]);
    getHousingCoverage.mockResolvedValue(coverageNormal);
    getHousingPayments.mockRejectedValueOnce(new Error("fail"));
    renderHousing();
    expect(await screen.findByText("No pudimos cargar el historial. Probá de nuevo.")).toBeTruthy();
    expect(screen.queryByText("Aún no registraste pagos.")).toBeNull();
    getHousingPayments.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Aún no registraste pagos.")).toBeTruthy();
  });

  it("renders populated history and hides empty installment numbers", async () => {
    getHousing.mockResolvedValue([apto]);
    mockCoverageAndPayments({
      "h-1": {
        coverage: coverageNormal,
        payments: [
          payment,
          {
            ...payment,
            id: "pay-2",
            installmentNumber: null,
            periodYear: null,
            periodMonth: null,
            amount: "400.00",
          },
          {
            ...payment,
            id: "pay-3",
            installmentNumber: 5,
            periodYear: null,
            periodMonth: null,
            amount: "300.00",
          },
        ],
      },
    });
    renderHousing();
    expect((await screen.findAllByText(/Pagada el 15 ago 2026/)).length).toBe(3);
    expect(screen.getAllByText("USD 500,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Octubre 2026")).toBeTruthy();
    expect(screen.getByText("Cuota 5")).toBeTruthy();
    expect(screen.getByText("USD 400,00")).toBeTruthy();
    expect(screen.getAllByText(/^Cuota \d+$/).length).toBe(1);
  });
});
