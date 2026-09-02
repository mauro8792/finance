import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Investment } from "../lib/types";
import { InvestmentsPage } from "./Investments";

const getInvestments = vi.fn();
const getAccounts = vi.fn();
const createInvestment = vi.fn();
const matureInvestment = vi.fn();
const renewInvestment = vi.fn();

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
  getInvestments: () => getInvestments(),
  getAccounts: () => getAccounts(),
  createInvestment: (payload: unknown) => createInvestment(payload),
  matureInvestment: (id: string, payload: unknown) => matureInvestment(id, payload),
  renewInvestment: (id: string, payload: unknown) => renewInvestment(id, payload),
}));

const accounts = [
  { id: "acc-ars", name: "Caja ARS", currency: "ARS" as const, isActive: true },
  { id: "acc-usd", name: "Caja USD", currency: "USD" as const, isActive: true },
  { id: "acc-old", name: "Vieja ARS", currency: "ARS" as const, isActive: false },
];

const active: Investment = {
  id: "inv-active",
  accountId: "acc-ars",
  type: "CAUCION",
  status: "ACTIVE",
  currency: "ARS",
  principal: "100000.00",
  annualRate: "0.300000",
  startDate: "2026-09-01T15:00:00.000Z",
  maturityDate: "2026-09-08T15:00:00.000Z",
  expectedReturn: "575.34",
  actualReturn: null,
  notes: "QA caución",
  renewedFromInvestmentId: null,
  createdAt: "2026-09-01T15:00:00.000Z",
  updatedAt: "2026-09-01T15:00:00.000Z",
};

const matured: Investment = {
  ...active,
  id: "inv-matured",
  status: "MATURED",
  actualReturn: "560.00",
  notes: null,
};

const renewedOriginal: Investment = {
  ...active,
  id: "inv-original",
  status: "RENEWED",
  actualReturn: "560.00",
  notes: null,
};

const renewedNew: Investment = {
  ...active,
  id: "inv-new",
  principal: "70000.00",
  annualRate: "0.280000",
  expectedReturn: "375.89",
  startDate: "2026-09-08T15:00:00.000Z",
  maturityDate: "2026-09-15T15:00:00.000Z",
  renewedFromInvestmentId: "inv-original",
  notes: null,
};

function renderInvestments() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InvestmentsPage />
    </QueryClientProvider>
  );
}

describe("InvestmentsPage", () => {
  beforeEach(() => {
    getInvestments.mockReset();
    getAccounts.mockReset();
    createInvestment.mockReset();
    matureInvestment.mockReset();
    renewInvestment.mockReset();
    getAccounts.mockResolvedValue(accounts);
  });

  it("shows a loading state without the empty copy", () => {
    getInvestments.mockReturnValue(new Promise(() => undefined));
    renderInvestments();
    expect(screen.getByText("Cargando inversiones")).toBeTruthy();
    expect(screen.queryByText("Aún no registraste inversiones.")).toBeNull();
  });

  it("shows the empty state without treating it as an error", async () => {
    getInvestments.mockResolvedValue([]);
    renderInvestments();
    expect(await screen.findByText("Aún no registraste inversiones.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Crear inversión" })).toBeTruthy();
  });

  it("recovers from a list error", async () => {
    const user = userEvent.setup();
    getInvestments.mockRejectedValueOnce(new Error("fail"));
    renderInvestments();
    expect(
      await screen.findByText("No pudimos cargar tus inversiones. Probá de nuevo.")
    ).toBeTruthy();
    getInvestments.mockResolvedValueOnce([active]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Activa")).toBeTruthy();
  });

  it("renders one investment with principal, rate, dates, expected return and status", async () => {
    getInvestments.mockResolvedValue([active]);
    renderInvestments();
    expect(await screen.findByText("Activa")).toBeTruthy();
    expect(screen.getAllByText("$ 100.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText("$ 575,34")).toBeTruthy();
    expect(screen.getByText("Caja ARS")).toBeTruthy();
    expect(screen.getByText("QA caución")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar vencimiento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Renovar" })).toBeTruthy();
  });

  it("renders several investments and keeps history after renewal", async () => {
    getInvestments.mockResolvedValue([renewedNew, renewedOriginal]);
    renderInvestments();
    expect(await screen.findByText("Activas")).toBeTruthy();
    expect(screen.getByText("Finalizadas")).toBeTruthy();
    expect(screen.getByText("Renovada")).toBeTruthy();
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getAllByText("$ 70.000,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Renovada desde una inversión anterior")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar vencimiento" })).toBeTruthy();
    const finishedCard = screen.getByText("Renovada").closest("article");
    expect(finishedCard?.querySelector("button")).toBeNull();
  });

  it("does not show mature or renew actions for MATURED or CANCELLED investments", async () => {
    getInvestments.mockResolvedValue([
      matured,
      { ...matured, id: "inv-cancelled", status: "CANCELLED", actualReturn: null },
    ]);
    renderInvestments();
    expect(await screen.findByText("Vencida")).toBeTruthy();
    expect(screen.getByText("Cancelada")).toBeTruthy();
    expect(screen.getByText("$ 560,00")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar vencimiento" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Renovar" })).toBeNull();
  });

  it("opens create, filters accounts, converts percent and submits the API contract", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([]);
    createInvestment.mockResolvedValue(active);
    renderInvestments();
    await screen.findByText("Aún no registraste inversiones.");
    await user.click(screen.getByRole("button", { name: "Crear inversión" }));
    expect(await screen.findByLabelText("Cuenta origen")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Moneda"), "USD");
    expect(screen.getByRole("option", { name: "Caja USD" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Caja ARS" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Vieja ARS" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Moneda"), "ARS");
    await user.selectOptions(screen.getByLabelText("Cuenta origen"), "acc-ars");
    await user.type(screen.getByLabelText("Capital"), "100000");
    await user.type(screen.getByLabelText("Tasa anual (%)"), "30");
    fireEvent.change(screen.getByLabelText("Fecha inicio"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Fecha vencimiento"), {
      target: { value: "2026-09-08" },
    });
    expect(await screen.findByText("Días: 7")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(createInvestment).toHaveBeenCalledWith({
        accountId: "acc-ars",
        currency: "ARS",
        principal: "100000.00",
        annualRate: "0.300000",
        startDate: "2026-09-01T15:00:00.000Z",
        maturityDate: "2026-09-08T15:00:00.000Z",
      });
    });
  });

  it("shows a create error without exposing backend codes", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([]);
    createInvestment.mockRejectedValue(
      Object.assign(new Error("INSUFFICIENT_BALANCE"), {
        code: "INSUFFICIENT_BALANCE",
      })
    );
    renderInvestments();
    await user.click(await screen.findByRole("button", { name: "Crear inversión" }));
    await user.selectOptions(screen.getByLabelText("Cuenta origen"), "acc-ars");
    await user.type(screen.getByLabelText("Capital"), "100000");
    await user.type(screen.getByLabelText("Tasa anual (%)"), "30");
    fireEvent.change(screen.getByLabelText("Fecha inicio"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Fecha vencimiento"), {
      target: { value: "2026-09-08" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("La cuenta no tiene saldo suficiente.")).toBeTruthy();
    expect(screen.queryByText("INSUFFICIENT_BALANCE")).toBeNull();
  });

  it("submits maturity only for an ACTIVE investment", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([active]);
    matureInvestment.mockResolvedValue(matured);
    renderInvestments();
    await user.click(await screen.findByRole("button", { name: "Registrar vencimiento" }));
    expect(screen.getByText("Capital retornado: $ 100.000,00")).toBeTruthy();
    expect(screen.getByText("Esperado: $ 575,34")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Cuenta destino"), "acc-ars");
    await user.type(screen.getByLabelText("Interés real"), "560");
    fireEvent.change(screen.getByLabelText("Fecha de la operación"), {
      target: { value: "2026-09-08" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => {
      expect(matureInvestment).toHaveBeenCalledWith("inv-active", {
        destinationAccountId: "acc-ars",
        capitalReturned: "100000.00",
        actualReturn: "560.00",
        occurredAt: "2026-09-08T15:00:00.000Z",
      });
    });
  });

  it("shows a maturity error in Spanish", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([active]);
    matureInvestment.mockRejectedValue(
      Object.assign(new Error("INVESTMENT_NOT_ACTIVE"), {
        code: "INVESTMENT_NOT_ACTIVE",
      })
    );
    renderInvestments();
    await user.click(await screen.findByRole("button", { name: "Registrar vencimiento" }));
    await user.selectOptions(screen.getByLabelText("Cuenta destino"), "acc-ars");
    await user.type(screen.getByLabelText("Interés real"), "560");
    fireEvent.change(screen.getByLabelText("Fecha de la operación"), {
      target: { value: "2026-09-08" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(
      await screen.findByText("Sólo una inversión activa puede usar esta acción.")
    ).toBeTruthy();
    expect(screen.queryByText("INVESTMENT_NOT_ACTIVE")).toBeNull();
  });

  it("submits a full renewal converting the new percent rate", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([active]);
    renewInvestment.mockResolvedValue({
      original: renewedOriginal,
      investment: { ...renewedNew, principal: "100000.00" },
      occurredAt: "2026-09-08T15:00:00.000Z",
    });
    renderInvestments();
    await user.click(await screen.findByRole("button", { name: "Renovar" }));
    expect(screen.getByRole("button", { name: "Todo" })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Cuenta para la renovación"), "acc-ars");
    await user.type(screen.getByLabelText("Interés real obtenido"), "560");
    await user.type(screen.getByLabelText("Nueva tasa anual (%)"), "30");
    fireEvent.change(screen.getByLabelText("Fecha efectiva"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.change(screen.getByLabelText("Nuevo vencimiento"), {
      target: { value: "2026-09-15" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar renovación" }));
    await waitFor(() => {
      expect(renewInvestment).toHaveBeenCalledWith("inv-active", {
        accountId: "acc-ars",
        renewalPrincipal: "100000.00",
        actualReturn: "560.00",
        annualRate: "0.300000",
        occurredAt: "2026-09-08T15:00:00.000Z",
        maturityDate: "2026-09-15T15:00:00.000Z",
      });
    });
  });

  it("submits a partial renewal", async () => {
    const user = userEvent.setup();
    getInvestments.mockResolvedValue([active]);
    renewInvestment.mockResolvedValue({
      original: renewedOriginal,
      investment: renewedNew,
      occurredAt: "2026-09-08T15:00:00.000Z",
    });
    renderInvestments();
    await user.click(await screen.findByRole("button", { name: "Renovar" }));
    await user.click(screen.getByRole("button", { name: "Parcial" }));
    await user.type(screen.getByLabelText("Monto a renovar"), "70000");
    await user.selectOptions(screen.getByLabelText("Cuenta para la renovación"), "acc-ars");
    await user.type(screen.getByLabelText("Interés real obtenido"), "560");
    await user.type(screen.getByLabelText("Nueva tasa anual (%)"), "28");
    fireEvent.change(screen.getByLabelText("Fecha efectiva"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.change(screen.getByLabelText("Nuevo vencimiento"), {
      target: { value: "2026-09-15" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar renovación" }));
    await waitFor(() => {
      expect(renewInvestment).toHaveBeenCalledWith("inv-active", {
        accountId: "acc-ars",
        renewalPrincipal: "70000.00",
        actualReturn: "560.00",
        annualRate: "0.280000",
        occurredAt: "2026-09-08T15:00:00.000Z",
        maturityDate: "2026-09-15T15:00:00.000Z",
      });
    });
  });
});
