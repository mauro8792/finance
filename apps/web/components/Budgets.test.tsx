import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BudgetView } from "../lib/types";
import { Budgets } from "./Budgets";

const getBudgets = vi.fn();
const getCategories = vi.fn();
const createBudget = vi.fn();
const updateBudget = vi.fn();

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
  getBudgets: (year: number, month: number) => getBudgets(year, month),
  getCategories: () => getCategories(),
  createBudget: (payload: unknown) => createBudget(payload),
  updateBudget: (id: string, amount: string) => updateBudget(id, amount),
}));

const comida: BudgetView = {
  id: "bud-1",
  category: { id: "cat-comida", name: "Comida" },
  currency: "ARS",
  amount: "300000.00",
  year: 2026,
  month: 8,
  consumption: "120000.00",
  available: "180000.00",
  usedPercent: "40.00",
  spendingPace: {
    elapsedDays: 15,
    totalDays: 31,
    monthProgress: "48.39",
    budgetProgress: "40.00",
    aboveExpectedPace: false,
  },
};

function renderBudgets() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Budgets year={2026} month={8} />
    </QueryClientProvider>
  );
}

describe("Budgets", () => {
  beforeEach(() => {
    getBudgets.mockReset();
    getCategories.mockReset();
    createBudget.mockReset();
    updateBudget.mockReset();
    getCategories.mockResolvedValue([
      { id: "cat-comida", name: "Comida", type: "EXPENSE", isActive: true },
      { id: "cat-nafta", name: "Nafta", type: "EXPENSE", isActive: true },
      { id: "cat-sueldo", name: "Sueldo", type: "INCOME", isActive: true },
    ]);
  });

  it("shows a loading state", () => {
    getBudgets.mockReturnValue(new Promise(() => undefined));
    renderBudgets();
    expect(screen.getByText("Cargando presupuestos")).toBeTruthy();
  });

  it("shows an empty state with a create CTA", async () => {
    getBudgets.mockResolvedValue([]);
    renderBudgets();
    expect(await screen.findByText("Aún no tenés presupuestos para este mes.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Crear presupuesto" }).length).toBeGreaterThan(0);
  });

  it("recovers from a list error", async () => {
    const user = userEvent.setup();
    getBudgets.mockRejectedValueOnce(new Error("fail"));
    renderBudgets();
    expect(await screen.findByText("No pudimos cargar tus presupuestos. Probá de nuevo.")).toBeTruthy();
    getBudgets.mockResolvedValueOnce([comida]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Comida")).toBeTruthy();
  });

  it("renders amount, consumption, available, usedPercent and on-track pace", async () => {
    getBudgets.mockResolvedValue([comida]);
    renderBudgets();
    expect(await screen.findByText("Comida")).toBeTruthy();
    expect(screen.getByText("ARS")).toBeTruthy();
    expect(screen.getByText("$ 120.000,00 de $ 300.000,00")).toBeTruthy();
    expect(screen.getByText("$ 180.000,00")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("En línea")).toBeTruthy();
    expect(screen.getByText("Día 15 de 31")).toBeTruthy();
  });

  it("shows above-pace copy, over-budget percent and negative available", async () => {
    getBudgets.mockResolvedValue([
      {
        ...comida,
        consumption: "400000.00",
        available: "-100000.00",
        usedPercent: "133.33",
        spendingPace: {
          ...comida.spendingPace,
          aboveExpectedPace: true,
        },
      },
    ]);
    renderBudgets();
    expect(await screen.findByText("Más rápido de lo esperado")).toBeTruthy();
    expect(screen.getByText("133,33%")).toBeTruthy();
    expect(screen.getByText("-$ 100.000,00")).toBeTruthy();
  });

  it("opens the create form with valid categories and posts the payload", async () => {
    const user = userEvent.setup();
    getBudgets.mockResolvedValue([]);
    createBudget.mockResolvedValue(comida);
    renderBudgets();
    await screen.findByText("Aún no tenés presupuestos para este mes.");
    await user.click(screen.getAllByRole("button", { name: "Crear presupuesto" })[0]!);
    expect(await screen.findByLabelText("Categoría")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Nafta" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Comida" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Sueldo" })).toBeNull();

    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-nafta");
    await user.clear(screen.getByLabelText("Monto"));
    await user.type(screen.getByLabelText("Monto"), "200000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(createBudget).toHaveBeenCalledWith({
        categoryId: "cat-nafta",
        amount: "200000.00",
        currency: "ARS",
        year: 2026,
        month: 8,
      });
    });
    expect(getBudgets).toHaveBeenCalledTimes(2);
  });

  it("does not submit amount 0 and keeps the form on a duplicate 409", async () => {
    const user = userEvent.setup();
    getBudgets.mockResolvedValue([]);
    createBudget.mockRejectedValue(
      new MockApiError(409, "BUDGET_DUPLICATE", "Ya existe un presupuesto")
    );
    renderBudgets();
    await screen.findByText("Aún no tenés presupuestos para este mes.");
    await user.click(screen.getAllByRole("button", { name: "Crear presupuesto" })[0]!);
    const save = await screen.findByRole("button", { name: "Guardar" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-nafta");
    await user.type(screen.getByLabelText("Monto"), "0");
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    await user.clear(screen.getByLabelText("Monto"));
    await user.type(screen.getByLabelText("Monto"), "100");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      await screen.findByText("Ya existe un presupuesto para esa categoría y moneda este mes.")
    ).toBeTruthy();
    expect(screen.getByLabelText("Categoría")).toBeTruthy();
  });

  it("edits only the amount and patches the budget", async () => {
    const user = userEvent.setup();
    getBudgets.mockResolvedValue([comida]);
    updateBudget.mockResolvedValue({ ...comida, amount: "350000.00" });
    renderBudgets();
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar monto")).toBeTruthy();
    expect(screen.queryByLabelText("Categoría")).toBeNull();
    expect(screen.queryByLabelText("Moneda")).toBeNull();
    expect(screen.getByText("Comida · ARS")).toBeTruthy();

    const amount = screen.getByLabelText("Monto");
    await user.clear(amount);
    await user.type(amount, "0");
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    await user.clear(amount);
    await user.type(amount, "350000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(updateBudget).toHaveBeenCalledWith("bud-1", "350000.00");
    });
    expect(getBudgets).toHaveBeenCalledTimes(2);
  });
});
