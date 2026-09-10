import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Category, Transaction } from "../lib/types";
import { TransactionsPage } from "./Transactions";

const getTransactions = vi.fn();
const getAccounts = vi.fn();
const getCategories = vi.fn();
const updateTransaction = vi.fn();
const voidTransaction = vi.fn();
const voidTransfer = vi.fn();
const createTransaction = vi.fn();
const createTransfer = vi.fn();
const exportTransactionsCsv = vi.fn();

vi.mock("../lib/api", () => ({
  getTransactions: (filters: unknown) => getTransactions(filters),
  getAccounts: () => getAccounts(),
  getCategories: () => getCategories(),
  updateTransaction: (id: string, payload: unknown) => updateTransaction(id, payload),
  voidTransaction: (id: string, payload: unknown) => voidTransaction(id, payload),
  voidTransfer: (id: string, payload: unknown) => voidTransfer(id, payload),
  createTransaction: (payload: unknown) => createTransaction(payload),
  createTransfer: (payload: unknown) => createTransfer(payload),
  exportTransactionsCsv: (filters: unknown) => exportTransactionsCsv(filters),
}));

const fondo: Account = {
  id: "acc-fondo",
  name: "Fondo indemnización prueba",
  currency: "ARS",
  type: "FUND",
  isActive: true,
};

const otros: Category = {
  id: "cat-otros",
  name: "Otros",
  type: "EXPENSE",
  isActive: true,
};

const capitalCat: Category = {
  id: "cat-capital",
  name: "Capital",
  type: "INCOME",
  isActive: true,
};

function movement(partial: Partial<Transaction> & Pick<Transaction, "id" | "type">): Transaction {
  return {
    accountId: fondo.id,
    categoryId: otros.id,
    status: "ACTIVE",
    amount: "2000000.00",
    currency: "ARS",
    description: null,
    occurredAt: "2026-08-15T15:00:00.000Z",
    paymentMethod: null,
    isFixed: false,
    reimbursementStatus: "NONE",
    relatedTransactionId: null,
    metadata: null,
    ...partial,
  };
}

const capital = movement({
  id: "tx-capital",
  type: "INCOME",
  categoryId: capitalCat.id,
  amount: "40000000.00",
  occurredAt: "2026-06-10T15:00:00.000Z",
  metadata: { incomeKind: "CAPITAL" },
  description: "Indemnización",
});

const june = movement({
  id: "tx-jun",
  type: "EXPENSE",
  occurredAt: "2026-06-15T15:00:00.000Z",
  description: "Gasto junio",
});

const july = movement({
  id: "tx-jul",
  type: "EXPENSE",
  occurredAt: "2026-07-15T15:00:00.000Z",
  description: "Gasto julio",
});

const august = movement({
  id: "tx-ago",
  type: "EXPENSE",
  occurredAt: "2026-08-15T15:00:00.000Z",
  description: "Gasto agosto",
});

const transfer = movement({
  id: "tx-transfer",
  type: "TRANSFER",
  categoryId: null,
  amount: "500.00",
  occurredAt: "2026-08-20T15:00:00.000Z",
  metadata: { direction: "OUT" },
});

const voided = movement({
  id: "tx-void",
  type: "EXPENSE",
  status: "VOIDED",
  amount: "100.00",
  occurredAt: "2026-08-05T15:00:00.000Z",
  description: "Anulado de prueba",
});

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <TransactionsPage />
    </QueryClientProvider>
  );
  return { ...view, client, invalidate };
}

describe("TransactionsPage", () => {
  beforeEach(() => {
    getTransactions.mockReset();
    getAccounts.mockReset();
    getCategories.mockReset();
    updateTransaction.mockReset();
    voidTransaction.mockReset();
    exportTransactionsCsv.mockReset();
    exportTransactionsCsv.mockResolvedValue(undefined);
    getAccounts.mockResolvedValue([fondo]);
    getCategories.mockResolvedValue([otros, capitalCat]);
  });

  it("renders the movements heading and route content", () => {
    getTransactions.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole("heading", { name: "Movimientos" })).toBeTruthy();
  });

  it("shows a loading state without the empty copy", () => {
    getTransactions.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByLabelText("Cargando movimientos")).toBeTruthy();
    expect(screen.queryByText("Aún no registraste movimientos.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the empty state with a link to registrar", async () => {
    getTransactions.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Aún no registraste movimientos.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Registrar movimiento" }).getAttribute("href")).toBe(
      "/registrar"
    );
  });

  it("recovers from a list error without raw codes", async () => {
    const user = userEvent.setup();
    getTransactions.mockRejectedValueOnce(new Error("ECONNRESET"));
    renderPage();
    expect(await screen.findByText("No pudimos cargar tus movimientos. Probá de nuevo.")).toBeTruthy();
    expect(screen.queryByText("ECONNRESET")).toBeNull();
    getTransactions.mockResolvedValueOnce([august]);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Gasto agosto")).toBeTruthy();
  });

  it("lists date, type, amount, currency, account, category, incomeKind and status", async () => {
    getTransactions.mockResolvedValue([capital, august, voided]);
    renderPage();
    expect(await screen.findByText("15/08/2026")).toBeTruthy();
    expect(screen.getByText("10/06/2026")).toBeTruthy();
    expect(screen.getByText("Ingreso · Capital")).toBeTruthy();
    expect(screen.getAllByText("Capital").length).toBeGreaterThan(0);
    expect(screen.getByText("+ $ 40.000.000,00")).toBeTruthy();
    expect(screen.getByText("- $ 2.000.000,00")).toBeTruthy();
    expect(screen.getAllByText("Fondo indemnización prueba").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Otros").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Anulado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gasto").length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Ver detalle" })[0]);
    expect(screen.getAllByText("ARS").length).toBeGreaterThan(0);
  });

  it("filters by June without year and keeps a distinct query key", async () => {
    const user = userEvent.setup();
    getTransactions.mockResolvedValue([capital, june, july, august]);
    renderPage();
    expect(await screen.findByText("Gasto agosto")).toBeTruthy();
    expect(getTransactions).toHaveBeenCalledWith({});
    getTransactions.mockResolvedValue([june]);
    await user.selectOptions(screen.getByLabelText("Mes"), "6");
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalledWith({ month: 6 });
    });
    expect(await screen.findByText("15/06/2026")).toBeTruthy();
    expect(screen.queryByText("15/07/2026")).toBeNull();
    expect(screen.queryByText("15/08/2026")).toBeNull();
    getTransactions.mockResolvedValue([july]);
    await user.selectOptions(screen.getByLabelText("Mes"), "7");
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalledWith({ month: 7 });
    });
    expect(await screen.findByText("15/07/2026")).toBeTruthy();
    getTransactions.mockResolvedValue([august]);
    await user.selectOptions(screen.getByLabelText("Año"), "2026");
    await user.selectOptions(screen.getByLabelText("Mes"), "8");
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalledWith({ year: 2026, month: 8 });
    });
    expect(await screen.findByText("15/08/2026")).toBeTruthy();
  });

  it("edits an allowed expense and invalidates related queries", async () => {
    const user = userEvent.setup();
    getTransactions.mockResolvedValue([august]);
    updateTransaction.mockResolvedValue({
      ...august,
      amount: "2100000.00",
      description: "Gasto agosto editado",
    });
    const { invalidate } = renderPage();
    expect(await screen.findByText("Gasto agosto")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const amount = screen.getByLabelText("Importe");
    await user.clear(amount);
    await user.type(amount, "2100000.00");
    const description = screen.getByLabelText("Descripción");
    await user.clear(description);
    await user.type(description, "Gasto agosto editado");
    getTransactions.mockResolvedValue([
      { ...august, amount: "2100000.00", description: "Gasto agosto editado" },
    ]);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => {
      expect(updateTransaction).toHaveBeenCalled();
    });
    expect(updateTransaction.mock.calls[0][0]).toBe("tx-ago");
    expect(updateTransaction.mock.calls[0][1]).toMatchObject({
      amount: "2100000.00",
      description: "Gasto agosto editado",
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-balances"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["financial-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
  });

  it("hides edit and void on immutable movements", async () => {
    getTransactions.mockResolvedValue([transfer]);
    renderPage();
    expect(await screen.findByText("Transferencia")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  it("groups paired transfer legs into one card", async () => {
    const caja: Account = {
      id: "acc-caja",
      name: "Caja ARS",
      currency: "ARS",
      type: "CASH",
      isActive: true,
    };
    getAccounts.mockResolvedValue([fondo, caja]);
    getTransactions.mockResolvedValue([
      movement({
        id: "tx-out",
        type: "TRANSFER",
        accountId: fondo.id,
        categoryId: null,
        amount: "500.00",
        occurredAt: "2026-08-20T15:00:00.000Z",
        metadata: { transferId: "tr-1", direction: "OUT" },
      }),
      movement({
        id: "tx-in",
        type: "TRANSFER",
        accountId: caja.id,
        categoryId: null,
        amount: "500.00",
        occurredAt: "2026-08-20T15:00:00.000Z",
        metadata: { transferId: "tr-1", direction: "IN" },
      }),
    ]);
    renderPage();
    expect(await screen.findByText("Fondo indemnización prueba → Caja ARS")).toBeTruthy();
    expect(screen.getByText("$ 500,00")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Ver detalle" }).length).toBe(1);
  });

  it("voids the whole transfer from the grouped card", async () => {
    const user = userEvent.setup();
    const caja: Account = {
      id: "acc-caja",
      name: "Caja ARS",
      currency: "ARS",
      type: "CASH",
      isActive: true,
    };
    const legs = (status: Transaction["status"]) => [
      movement({
        id: "tx-out",
        type: "TRANSFER",
        status,
        accountId: fondo.id,
        categoryId: null,
        amount: "500.00",
        occurredAt: "2026-08-20T15:00:00.000Z",
        metadata: { transferId: "tr-1", direction: "OUT" },
      }),
      movement({
        id: "tx-in",
        type: "TRANSFER",
        status,
        accountId: caja.id,
        categoryId: null,
        amount: "500.00",
        occurredAt: "2026-08-20T15:00:00.000Z",
        metadata: { transferId: "tr-1", direction: "IN" },
      }),
    ];
    getAccounts.mockResolvedValue([fondo, caja]);
    getTransactions.mockResolvedValue(legs("ACTIVE"));
    voidTransfer.mockResolvedValue({ transferId: "tr-1" });
    renderPage();

    expect(await screen.findByText("Fondo indemnización prueba → Caja ARS")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular transferencia" }));
    expect(
      screen.getByText(/El movimiento original se conserva por historial\./)
    ).toBeTruthy();

    getTransactions.mockResolvedValue(legs("REVERSED"));
    await user.click(screen.getByRole("button", { name: "Confirmar anulación" }));

    await waitFor(() => {
      expect(voidTransfer).toHaveBeenCalledWith("tr-1", {
        idempotencyKey: expect.any(String),
      });
    });
    expect((await screen.findAllByText("Reversado")).length).toBeGreaterThan(0);
    // Nunca se anula una pata sola.
    expect(voidTransaction).not.toHaveBeenCalled();
  });

  it("voids an allowed movement after confirmation", async () => {
    const user = userEvent.setup();
    getTransactions.mockResolvedValue([august]);
    voidTransaction.mockResolvedValue({ ...august, status: "VOIDED" });
    const { invalidate } = renderPage();
    expect(await screen.findByText("Gasto agosto")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    expect(screen.getByText(/¿Querés anular este movimiento\?/)).toBeTruthy();
    expect(
      screen.getByText(/El movimiento original se conserva por historial\./)
    ).toBeTruthy();
    getTransactions.mockResolvedValue([{ ...august, status: "VOIDED" }]);
    await user.click(screen.getByRole("button", { name: "Confirmar anulación" }));
    await waitFor(() => {
      expect(voidTransaction).toHaveBeenCalledWith("tx-ago", {
        idempotencyKey: expect.any(String),
      });
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    });
    expect((await screen.findAllByText("Anulado")).length).toBeGreaterThan(0);
  });

  it("keeps VOIDED history visible when the status filter is all", async () => {
    getTransactions.mockResolvedValue([august, voided]);
    renderPage();
    expect(await screen.findByText("Gasto agosto")).toBeTruthy();
    expect(screen.getByText("Anulado de prueba")).toBeTruthy();
    expect(screen.getAllByText("Anulado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
  });

  it("shows Exportar CSV even with an empty list", async () => {
    getTransactions.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole("button", { name: "Exportar CSV" })).toBeTruthy();
  });

  it("exports once with the active filters and blocks a second click", async () => {
    const user = userEvent.setup();
    getTransactions.mockResolvedValue([]);
    let resolveExport: (() => void) | undefined;
    exportTransactionsCsv.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExport = resolve;
      })
    );
    renderPage();
    await user.selectOptions(screen.getByLabelText("Mes"), "6");
    await waitFor(() => {
      expect(getTransactions).toHaveBeenCalledWith({ month: 6 });
    });
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(exportTransactionsCsv).toHaveBeenCalledTimes(1);
    expect(exportTransactionsCsv).toHaveBeenCalledWith({ month: 6 });
    expect(screen.getByRole("button", { name: "Exportando…" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Exportando…" }));
    expect(exportTransactionsCsv).toHaveBeenCalledTimes(1);
    resolveExport?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Exportar CSV" })).toHaveProperty(
        "disabled",
        false
      );
    });
  });

  it("shows a friendly export error", async () => {
    const user = userEvent.setup();
    getTransactions.mockResolvedValue([]);
    exportTransactionsCsv.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Exportar CSV" }));
    expect(await screen.findByText("No pudimos exportar los movimientos. Probá de nuevo.")).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
  });
});
