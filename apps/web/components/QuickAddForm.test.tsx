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
    createTransaction.mockRejectedValueOnce(
      Object.assign(new Error("ECONNRESET"), {
        name: "ApiClientError",
        code: "VALIDATION_ERROR",
        status: 500,
      })
    );
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.type(screen.getByPlaceholderText("0,00"), "75");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-exp");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("No pudimos guardar el movimiento. Intentá nuevamente.")
    ).toBeTruthy();
    expect(screen.queryByText("ECONNRESET")).toBeNull();
    expect(screen.queryByText("VALIDATION_ERROR")).toBeNull();
    expect((screen.getByPlaceholderText("0,00") as HTMLInputElement).value).toContain("75");
  });

  it("disables submit while saving", async () => {
    const user = userEvent.setup();
    createTransaction.mockReturnValue(new Promise(() => undefined));
    renderForm();
    await screen.findByRole("button", { name: "Guardar" });
    await user.type(screen.getByPlaceholderText("0,00"), "75");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-exp");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: "Guardando…" })).toHaveProperty("disabled", true);
  });

  it("shows loading without empty or error", () => {
    getAccounts.mockReturnValue(new Promise(() => undefined));
    getCategories.mockReturnValue(new Promise(() => undefined));
    renderForm();
    expect(screen.getByText("Cargando cuentas y categorías…")).toBeTruthy();
    expect(screen.queryByText("No hay cuentas activas. Creá una cuenta antes de registrar un movimiento.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("shows a friendly load error with retry", async () => {
    const user = userEvent.setup();
    getAccounts.mockRejectedValueOnce(
      Object.assign(new Error("ECONNRESET"), { code: "VALIDATION_ERROR" })
    );
    renderForm();
    expect(
      await screen.findByText("No pudimos cargar las cuentas o categorías. Probá de nuevo.")
    ).toBeTruthy();
    expect(screen.queryByText("ECONNRESET")).toBeNull();
    expect(screen.queryByText("VALIDATION_ERROR")).toBeNull();
    getAccounts.mockResolvedValueOnce([
      { id: "acc-1", name: "Santander", currency: "ARS", isActive: true },
    ]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("treats no active accounts as empty with a CTA", async () => {
    getAccounts.mockResolvedValueOnce([
      { id: "acc-2", name: "Reserva", currency: "USD", isActive: false },
    ]);
    renderForm();
    expect(
      await screen.findByText("No hay cuentas activas. Creá una cuenta antes de registrar un movimiento.")
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir a Cuentas" }).getAttribute("href")).toBe(
      "/accounts"
    );
  });

  it("shows an API error", async () => {
    getAccounts.mockRejectedValueOnce(new Error("falló"));
    renderForm();
    expect(
      await screen.findByText("No pudimos cargar las cuentas o categorías. Probá de nuevo.")
    ).toBeTruthy();
  });
});
