import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickAddForm } from "./QuickAddForm";

const getAccounts = vi.fn();
const getCategories = vi.fn();
const createTransaction = vi.fn();

vi.mock("../lib/api", () => ({
  ApiClientError: class ApiClientError extends Error {
    status = 400;
    code = "VALIDATION_ERROR";
  },
  getAccounts: () => getAccounts(),
  getCategories: () => getCategories(),
  createTransaction: (payload: unknown) => createTransaction(payload),
}));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickAddForm />
    </QueryClientProvider>
  );
}

describe("QuickAddForm", () => {
  beforeEach(() => {
    getAccounts.mockResolvedValue([
      { id: "acc-1", name: "Santander", currency: "ARS", isActive: true },
      { id: "acc-2", name: "Reserva", currency: "USD", isActive: false },
    ]);
    getCategories.mockResolvedValue([
      { id: "cat-exp", name: "Comida", type: "EXPENSE", isActive: true },
      { id: "cat-inc", name: "Sueldo", type: "INCOME", isActive: true },
      { id: "cat-off", name: "Vieja", type: "EXPENSE", isActive: false },
    ]);
    createTransaction.mockImplementation(async (payload: { type?: string; amount: string; currency: string; accountId: string; categoryId: string; incomeKind?: string }) => ({
      id: "tx-1",
      type: payload.type === "INCOME" ? "INCOME" : "EXPENSE",
      status: "ACTIVE",
      amount: payload.amount,
      currency: payload.currency,
      accountId: payload.accountId,
      categoryId: payload.categoryId,
      metadata: payload.incomeKind ? { incomeKind: payload.incomeKind } : null,
    }));
  });

  it("renders expense fields by default and hides incomeKind", async () => {
    renderForm();
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.getByText("Medio de pago")).toBeTruthy();
    expect(screen.queryByText("Tipo de ingreso")).toBeNull();
    expect(screen.queryByText("Reserva — USD")).toBeNull();
    expect(screen.getByRole("option", { name: "Comida" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Sueldo" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Vieja" })).toBeNull();
  });

  it("switches to income and shows incomeKind", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.click(screen.getByRole("button", { name: "Ingreso" }));
    expect(screen.getByText("Tipo de ingreso")).toBeTruthy();
    expect(screen.getByText("Ingreso normal")).toBeTruthy();
    expect(screen.getByText("Capital")).toBeTruthy();
    expect(screen.queryByText("Medio de pago")).toBeNull();
    expect(screen.getByRole("option", { name: "Sueldo" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Comida" })).toBeNull();
  });

  it("submits an expense", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.type(screen.getByPlaceholderText("0,00"), "75");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-exp");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "75.00",
          currency: "ARS",
          accountId: "acc-1",
          categoryId: "cat-exp",
        })
      )
    );
    expect(createTransaction.mock.calls.at(-1)?.[0].type).toBeUndefined();
    expect(await screen.findByText("Gasto registrado.")).toBeTruthy();
  });

  it("submits OPERATING income", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.click(screen.getByRole("button", { name: "Ingreso" }));
    await user.type(screen.getByPlaceholderText("0,00"), "1000");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-inc");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "INCOME",
          incomeKind: "OPERATING",
          amount: "1000.00",
        })
      )
    );
    expect(await screen.findByText("Ingreso registrado.")).toBeTruthy();
  });

  it("submits CAPITAL income", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.click(screen.getByRole("button", { name: "Ingreso" }));
    await user.click(screen.getByRole("radio", { name: /Capital/i }));
    await user.type(screen.getByPlaceholderText("0,00"), "500");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-inc");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "INCOME",
          incomeKind: "CAPITAL",
          amount: "500.00",
        })
      )
    );
  });

  it("shows a submit API error", async () => {
    createTransaction.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.type(screen.getByPlaceholderText("0,00"), "75");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-exp");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("No se pudo guardar el movimiento.")
    ).toBeTruthy();
  });

  it("shows an API error", async () => {
    getAccounts.mockRejectedValueOnce(new Error("falló"));
    renderForm();
    expect(
      await screen.findByText("No se pudieron cargar las cuentas o categorías.")
    ).toBeTruthy();
  });
});
