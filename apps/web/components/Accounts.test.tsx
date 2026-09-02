import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../lib/types";
import { AccountsPage } from "./Accounts";

const getAccounts = vi.fn();
const getAccountBalance = vi.fn();
const createAccount = vi.fn();
const updateAccount = vi.fn();
const activateAccount = vi.fn();
const deactivateAccount = vi.fn();

vi.mock("../lib/api", () => ({
  getAccounts: () => getAccounts(),
  getAccountBalance: (id: string) => getAccountBalance(id),
  createAccount: (payload: unknown) => createAccount(payload),
  updateAccount: (id: string, payload: unknown) => updateAccount(id, payload),
  activateAccount: (id: string) => activateAccount(id),
  deactivateAccount: (id: string) => deactivateAccount(id),
}));

const fondo: Account = {
  id: "acc-fondo",
  name: "QA Fondo",
  currency: "ARS",
  type: "FUND",
  isActive: true,
};

const inactive: Account = {
  id: "acc-old",
  name: "Caja vieja",
  currency: "USD",
  type: "CASH",
  isActive: false,
};

function renderAccounts(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <AccountsPage />
    </QueryClientProvider>
  );
  return { ...view, client, invalidate };
}

describe("AccountsPage", () => {
  beforeEach(() => {
    getAccounts.mockReset();
    getAccountBalance.mockReset();
    createAccount.mockReset();
    updateAccount.mockReset();
    activateAccount.mockReset();
    deactivateAccount.mockReset();
    getAccountBalance.mockImplementation(async (id: string) => ({
      accountId: id,
      currency: id === "acc-old" ? "USD" : "ARS",
      balance: id === "acc-fondo" ? "100000.00" : "0.00",
    }));
  });

  it("renders the accounts heading", () => {
    getAccounts.mockReturnValue(new Promise(() => undefined));
    renderAccounts();
    expect(screen.getByRole("heading", { name: "Cuentas" })).toBeTruthy();
  });

  it("shows a loading state without the empty copy", () => {
    getAccounts.mockReturnValue(new Promise(() => undefined));
    renderAccounts();
    expect(screen.getByText("Cargando cuentas")).toBeTruthy();
    expect(screen.queryByText("Aún no creaste cuentas.")).toBeNull();
  });

  it("shows the empty state", async () => {
    getAccounts.mockResolvedValue([]);
    renderAccounts();
    expect(await screen.findByText("Aún no creaste cuentas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("recovers from a list error", async () => {
    const user = userEvent.setup();
    getAccounts.mockRejectedValueOnce(new Error("fail"));
    renderAccounts();
    expect(await screen.findByText("No pudimos cargar tus cuentas. Probá de nuevo.")).toBeTruthy();
    getAccounts.mockResolvedValueOnce([fondo]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("QA Fondo")).toBeTruthy();
  });

  it("renders cards with name, currency, type label, balance and status", async () => {
    getAccounts.mockResolvedValue([fondo, inactive]);
    renderAccounts();
    expect(await screen.findByText("QA Fondo")).toBeTruthy();
    expect(screen.getByText("Caja vieja")).toBeTruthy();
    expect(screen.getByText("ARS · Fondo")).toBeTruthy();
    expect(screen.getByText("USD · Efectivo")).toBeTruthy();
    expect(await screen.findByText("$ 100.000,00")).toBeTruthy();
    expect(screen.getByText("USD 0,00")).toBeTruthy();
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getByText("Inactiva")).toBeTruthy();
  });

  it("submits create without an initial balance and invalidates accounts", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([]);
    createAccount.mockResolvedValue(fondo);
    const { invalidate } = renderAccounts();
    await screen.findByText("Aún no creaste cuentas.");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await user.type(screen.getByLabelText("Nombre"), "QA Fondo");
    await user.selectOptions(screen.getByLabelText("Tipo"), "FUND");
    await user.selectOptions(screen.getByLabelText("Moneda"), "ARS");
    getAccounts.mockResolvedValue([fondo]);
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => {
      expect(createAccount).toHaveBeenCalledWith({
        name: "QA Fondo",
        type: "FUND",
        currency: "ARS",
      });
    });
    expect(createAccount.mock.calls[0][0]).not.toHaveProperty("initialBalance");
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-balances"] });
    expect(await screen.findByText("QA Fondo")).toBeTruthy();
  });

  it("edits name and type without sending currency", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo]);
    updateAccount.mockResolvedValue({ ...fondo, name: "Fondo QA" });
    renderAccounts();
    expect(await screen.findByText("QA Fondo")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Moneda: ARS. No se puede cambiar.")).toBeTruthy();
    await user.clear(screen.getByLabelText("Nombre"));
    await user.type(screen.getByLabelText("Nombre"), "Fondo QA");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(updateAccount).toHaveBeenCalledWith("acc-fondo", {
        name: "Fondo QA",
        type: "FUND",
      });
    });
  });

  it("deactivates and activates an account", async () => {
    const user = userEvent.setup();
    getAccounts.mockResolvedValue([fondo]);
    deactivateAccount.mockResolvedValue({ ...fondo, isActive: false });
    renderAccounts();
    expect(await screen.findByText("Activa")).toBeTruthy();
    getAccounts.mockResolvedValue([{ ...fondo, isActive: false }]);
    await user.click(screen.getByRole("button", { name: "Desactivar cuenta" }));
    await waitFor(() => {
      expect(deactivateAccount).toHaveBeenCalledWith("acc-fondo");
    });
    expect(await screen.findByText("Inactiva")).toBeTruthy();
    activateAccount.mockResolvedValue(fondo);
    getAccounts.mockResolvedValue([fondo]);
    await user.click(screen.getByRole("button", { name: "Activar cuenta" }));
    await waitFor(() => {
      expect(activateAccount).toHaveBeenCalledWith("acc-fondo");
    });
  });
});
