import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../lib/types";
import { TransfersPage } from "./Transfers";

const getAccounts = vi.fn();
const getAccountBalance = vi.fn();
const createTransfer = vi.fn();
const createCurrencyExchange = vi.fn();
const createTransaction = vi.fn();

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
  getAccounts: () => getAccounts(),
  getAccountBalance: (id: string) => getAccountBalance(id),
  createTransfer: (payload: unknown) => createTransfer(payload),
  createCurrencyExchange: (payload: unknown) => createCurrencyExchange(payload),
  createTransaction: (payload: unknown) => createTransaction(payload),
}));

const fondo: Account = {
  id: "acc-fondo",
  name: "Fondo indemnización prueba",
  currency: "ARS",
  type: "FUND",
  isActive: true,
};

const caja: Account = {
  id: "acc-caja",
  name: "Caja ARS",
  currency: "ARS",
  type: "CASH",
  isActive: true,
};

const reserva: Account = {
  id: "acc-reserva",
  name: "Reserva vivienda",
  currency: "USD",
  type: "HOUSING_RESERVE",
  isActive: true,
};

const inactiva: Account = {
  id: "acc-old",
  name: "Vieja USD",
  currency: "USD",
  type: "CASH",
  isActive: false,
};

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <TransfersPage />
    </QueryClientProvider>
  );
  return { ...view, invalidate };
}

describe("TransfersPage", () => {
  beforeEach(() => {
    getAccounts.mockReset();
    getAccountBalance.mockReset();
    createTransfer.mockReset();
    createCurrencyExchange.mockReset();
    createTransaction.mockReset();
    getAccountBalance.mockImplementation(async (id: string) => ({
      accountId: id,
      currency: id === "acc-reserva" ? "USD" : "ARS",
      balance: id === "acc-fondo" ? "34000000.00" : "0.00",
    }));
  });

  it("renders the mover dinero heading with the privacy toggle", () => {
    getAccounts.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("heading", { name: "Mover dinero" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar montos" })).toBeTruthy();
  });

  it("separates transfer and currency exchange with a pressed mode selector", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja, reserva]);
    renderPage();
    const transfer = await screen.findByRole("button", { name: "Transferencia" });
    const exchange = screen.getByRole("button", { name: "Cambio de moneda" });
    expect(transfer.getAttribute("aria-pressed")).toBe("true");
    expect(exchange.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Misma moneda/)).toBeTruthy();
    await user.click(exchange);
    expect(screen.getByRole("button", { name: "Cambio de moneda" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText(/Distinta moneda/)).toBeTruthy();
  });

  it("labels the money flow as Desde and Hacia", async () => {
    getAccounts.mockResolvedValue([fondo, caja]);
    renderPage();
    expect(await screen.findByText("Desde")).toBeTruthy();
    expect(screen.getByText("Hacia")).toBeTruthy();
  });

  it("shows loading without the empty copy", () => {
    getAccounts.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText("Cargando cuentas")).toBeTruthy();
    expect(screen.queryByText("Necesitás al menos una cuenta activa para mover dinero.")).toBeNull();
  });

  it("recovers from an accounts error", async () => {
    const user = userEvent.setup();
    getAccounts.mockRejectedValueOnce(new Error("fail"));
    renderPage();
    expect(await screen.findByText("No pudimos cargar tus cuentas. Probá de nuevo.")).toBeTruthy();
    getAccounts.mockResolvedValueOnce([fondo, caja, reserva]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText("Cuenta origen")).toBeTruthy();
  });

  it("shows empty with a CTA when there are no active accounts", async () => {
    getAccounts.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText("Necesitás al menos una cuenta activa para mover dinero.")
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir a Cuentas" }).getAttribute("href")).toBe(
      "/accounts"
    );
  });

  it("shows only one form at a time", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja, reserva]);
    renderPage();
    expect(await screen.findByLabelText("Importe")).toBeTruthy();
    expect(screen.queryByLabelText("Cotización ARS por USD")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cambio de moneda" }));
    expect(await screen.findByLabelText("Cotización ARS por USD")).toBeTruthy();
    expect(screen.queryByLabelText("Importe")).toBeNull();
    expect(screen.getByText("ARS necesarios por cada USD 1.")).toBeTruthy();
  });

  it("lists only active accounts", async () => {
    getAccounts.mockResolvedValue([fondo, caja, reserva, inactiva]);
    renderPage();
    const source = await screen.findByLabelText("Cuenta origen");
    expect(source.textContent).toContain("Fondo indemnización prueba");
    expect(source.textContent).toContain("Caja ARS");
    expect(source.textContent).not.toContain("Vieja USD");
  });

  it("submits a same-currency transfer and invalidates queries", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja, reserva]);
    createTransfer.mockResolvedValue({
      transferId: "tr-1",
      out: { type: "TRANSFER", amount: "1000.00", currency: "ARS" },
      in: { type: "TRANSFER", amount: "1000.00", currency: "ARS" },
    });
    const { invalidate } = renderPage();
    expect(await screen.findByText(/Disponible/)).toBeTruthy();
    expect(screen.getByText("$ 34.000.000,00")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Cuenta destino"), "acc-caja");
    await user.type(screen.getByLabelText("Importe"), "1000");
    await user.click(screen.getByRole("button", { name: "Transferir" }));
    await waitFor(() => {
      expect(createTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAccountId: "acc-fondo",
          destinationAccountId: "acc-caja",
          amount: "1000.00",
          idempotencyKey: expect.any(String),
        })
      );
    });
    expect(createTransfer.mock.calls[0][0]).not.toHaveProperty("type");
    expect(createTransaction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-balances"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["financial-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["housing"] });
    expect(await screen.findByText(/Transferencia registrada/)).toBeTruthy();
  });

  it("does not offer the same account as transfer destination", async () => {
    getAccounts.mockResolvedValue([fondo, caja]);
    renderPage();
    const destination = await screen.findByLabelText("Cuenta destino");
    expect(destination.textContent).toContain("Caja ARS");
    expect(destination.textContent).not.toContain("Fondo indemnización prueba");
  });

  it("previews ARS to USD 13.200.000 / 1.500 as 8.800 and submits the FX payload", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja, reserva]);
    createCurrencyExchange.mockResolvedValue({
      exchange: {
        fromAmount: "13200000.00",
        fromCurrency: "ARS",
        toAmount: "8800.00",
        toCurrency: "USD",
        exchangeRate: "1500.000000",
      },
      out: { type: "CURRENCY_EXCHANGE" },
      in: { type: "CURRENCY_EXCHANGE" },
    });
    const { invalidate } = renderPage();
    await screen.findByRole("button", { name: "Cambio de moneda" });
    await user.click(screen.getByRole("button", { name: "Cambio de moneda" }));
    await user.selectOptions(screen.getByLabelText("Cuenta destino"), "acc-reserva");
    await user.type(screen.getByLabelText("Importe origen"), "13200000");
    await user.type(screen.getByLabelText("Cotización ARS por USD"), "1500");
    expect(await screen.findByText("Entregás")).toBeTruthy();
    expect(screen.getByText("$ 13.200.000,00")).toBeTruthy();
    expect(screen.getByText("Recibís")).toBeTruthy();
    expect(screen.getByText("USD 8.800,00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Registrar cambio" }));
    await waitFor(() => {
      expect(createCurrencyExchange).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: "acc-fondo",
          toAccountId: "acc-reserva",
          fromAmount: "13200000.00",
          exchangeRate: "1500.000000",
        })
      );
    });
    expect(createCurrencyExchange.mock.calls[0][0]).not.toHaveProperty("toAmount");
    expect(createCurrencyExchange.mock.calls[0][0]).not.toHaveProperty("type");
    expect(createTransaction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-balances"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["financial-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["housing"] });
  });

  it("submits USD to ARS without creating expense or income", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, reserva]);
    createCurrencyExchange.mockResolvedValue({
      exchange: {
        fromAmount: "100.00",
        fromCurrency: "USD",
        toAmount: "150000.00",
        toCurrency: "ARS",
        exchangeRate: "1500.000000",
      },
      out: { type: "CURRENCY_EXCHANGE" },
      in: { type: "CURRENCY_EXCHANGE" },
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Cambio de moneda" }));
    await user.selectOptions(screen.getByLabelText("Cuenta origen"), "acc-reserva");
    await user.selectOptions(screen.getByLabelText("Cuenta destino"), "acc-fondo");
    await user.type(screen.getByLabelText("Importe origen"), "100");
    await user.type(screen.getByLabelText("Cotización ARS por USD"), "1500");
    expect(await screen.findByText("USD 100,00")).toBeTruthy();
    expect(screen.getByText("$ 150.000,00")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Registrar cambio" }));
    await waitFor(() => {
      expect(createCurrencyExchange).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: "acc-reserva",
          toAccountId: "acc-fondo",
          fromAmount: "100.00",
        })
      );
    });
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("blocks double submit while the transfer is pending", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja]);
    createTransfer.mockReturnValue(new Promise(() => undefined));
    renderPage();
    await user.type(await screen.findByLabelText("Importe"), "10");
    await user.click(screen.getByRole("button", { name: "Transferir" }));
    await user.click(screen.getByRole("button", { name: "Transferir" }));
    await waitFor(() => {
      expect(createTransfer).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a Spanish backend error without raw codes", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo, caja]);
    createTransfer.mockRejectedValue(
      new MockApiError(400, "INSUFFICIENT_BALANCE", "La cuenta origen no tiene saldo suficiente.")
    );
    renderPage();
    await user.type(await screen.findByLabelText("Importe"), "10");
    await user.click(screen.getByRole("button", { name: "Transferir" }));
    expect(
      await screen.findByText("La cuenta origen no tiene saldo suficiente.")
    ).toBeTruthy();
    expect(screen.queryByText("INSUFFICIENT_BALANCE")).toBeNull();
  });
});
