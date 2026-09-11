import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreditCard,
  CreditCardCommitments,
  RecurringChargeOutlook,
} from "../lib/types";
import { CreditCardsPage } from "./CreditCards";

const getCreditCards = vi.fn();
const getCreditCardCommitments = vi.fn();
const getRecurringChargeOutlook = vi.fn();
const getCategories = vi.fn();
const confirmRecurringCharge = vi.fn();
const createCreditCard = vi.fn();
const createRecurringCharge = vi.fn();
const updateCreditCard = vi.fn();

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
  getCreditCards: () => getCreditCards(),
  getCreditCardCommitments: (id: string) => getCreditCardCommitments(id),
  getRecurringChargeOutlook: (creditCardId: string, year: number, month: number) =>
    getRecurringChargeOutlook(creditCardId, year, month),
  getCategories: () => getCategories(),
  confirmRecurringCharge: (id: string, payload: unknown) =>
    confirmRecurringCharge(id, payload),
  createCreditCard: (payload: unknown) => createCreditCard(payload),
  createRecurringCharge: (payload: unknown) => createRecurringCharge(payload),
  updateCreditCard: (id: string, payload: unknown) => updateCreditCard(id, payload),
}));

const primaryCard: CreditCard = {
  id: "card-1",
  userId: "user-1",
  name: "Visa Galicia",
  issuer: "Galicia",
  brand: "Visa",
  currency: "ARS",
  isActive: true,
  isPrimary: true,
  closingDay: 15,
  dueDay: 22,
  feeStatus: "WAIVED",
  feeExpectedAmount: null,
  feeNotes: null,
  configComplete: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const incompleteCard: CreditCard = {
  ...primaryCard,
  id: "card-incomplete",
  name: "Amex sin config",
  brand: "American Express",
  closingDay: null,
  dueDay: null,
  configComplete: false,
  isPrimary: false,
  feeStatus: "UNKNOWN",
};

const secondCard: CreditCard = {
  ...primaryCard,
  id: "card-2",
  name: "Mastercard BBVA",
  brand: "Mastercard",
  issuer: "BBVA",
  isPrimary: false,
};

const commitments: CreditCardCommitments = {
  creditCardId: "card-1",
  currentCardDebt: "45000.00",
  currentCardDebtByCurrency: [
    { currency: "ARS", amount: "45000.00" },
    { currency: "USD", amount: "120.00" },
  ],
  futureInstallmentCommitment: "12000.00",
  totalOutstandingCommitment: "57000.00",
};

const outlook: RecurringChargeOutlook = {
  creditCardId: "card-1",
  occurrenceKey: "2026-09",
  year: 2026,
  month: 9,
  expectedSumFixed: "3500.00",
  variableCountPending: 1,
  items: [
    {
      template: {
        id: "rc-1",
        creditCardId: "card-1",
        kind: "RECURRING_SERVICE",
        categoryId: "cat-stream",
        description: "Netflix",
        expectedAmount: "3500.00",
        currency: "ARS",
        frequency: "MONTHLY",
        dayOfMonthHint: null,
        isActive: true,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      occurrenceKey: "2026-09",
      hasOccurrence: false,
      occurrence: null,
    },
    {
      template: {
        id: "rc-2",
        creditCardId: "card-1",
        kind: "RECURRING_SERVICE",
        categoryId: "cat-music",
        description: "Spotify",
        expectedAmount: "2500.00",
        currency: "ARS",
        frequency: "MONTHLY",
        dayOfMonthHint: null,
        isActive: true,
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      occurrenceKey: "2026-09",
      hasOccurrence: true,
      occurrence: {
        id: "occ-1",
        recurringChargeId: "rc-2",
        occurrenceKey: "2026-09",
        transactionId: "tx-1",
        amount: "2500.00",
        currency: "ARS",
        occurredAt: "2026-09-05T12:00:00.000Z",
        description: null,
        idempotencyKey: "key-1",
      },
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreditCardsPage />
    </QueryClientProvider>
  );
}

describe("CreditCardsPage", () => {
  beforeEach(() => {
    getCreditCards.mockReset();
    getCreditCardCommitments.mockReset();
    getRecurringChargeOutlook.mockReset();
    getCategories.mockReset();
    confirmRecurringCharge.mockReset();
    createCreditCard.mockReset();
    createRecurringCharge.mockReset();
    updateCreditCard.mockReset();

    getCategories.mockResolvedValue([
      { id: "cat-stream", name: "Streaming", type: "EXPENSE", isActive: true },
    ]);

    vi.stubGlobal("crypto", {
      randomUUID: () => "uuid-test-1234",
    });
  });

  it("shows empty state when there are no cards", async () => {
    getCreditCards.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No tenés tarjetas cargadas")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Agregar tarjeta/ }).length).toBeGreaterThan(
      0
    );
  });

  it("keeps + Agregar tarjeta visible with existing cards", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();
    expect(await screen.findByText("Netflix")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Agregar tarjeta" })).toBeTruthy();
  });

  it("renders hero with name, issuer, debt and Bonificada fee label", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();

    expect(await screen.findByRole("button", { name: "Tarjeta Visa Galicia" })).toBeTruthy();
    expect(screen.getAllByText("Visa Galicia").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Galicia · Visa · ARS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 45.000,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bonificada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Principal").length).toBeGreaterThan(0);
  });

  it("shows multi-currency debt without summing ARS and USD", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();
    expect(await screen.findByText("$ 45.000,00")).toBeTruthy();
    expect(screen.getByText("USD 120,00")).toBeTruthy();
    expect(screen.queryByText("$ 45.120,00")).toBeNull();
  });

  it("shows Configuración incompleta badge when closing/due missing", async () => {
    getCreditCards.mockResolvedValue([incompleteCard]);
    getCreditCardCommitments.mockResolvedValue({
      ...commitments,
      creditCardId: incompleteCard.id,
      currentCardDebtByCurrency: [{ currency: "ARS", amount: "0.00" }],
    });
    getRecurringChargeOutlook.mockResolvedValue({ ...outlook, items: [] });

    renderPage();
    expect(await screen.findByText("Configuración incompleta")).toBeTruthy();
  });

  it("uses brand selector and stores custom brand when Otra", async () => {
    getCreditCards.mockResolvedValue([]);
    createCreditCard.mockResolvedValue(primaryCard);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "+ Agregar tarjeta" }));
    expect(await screen.findByLabelText("Marca")).toBeTruthy();
    await user.type(screen.getByLabelText("Nombre"), "Naranja X");
    await user.type(screen.getByLabelText("Emisor"), "Naranja");
    await user.selectOptions(screen.getByLabelText("Marca"), "Otra");
    await user.type(screen.getByLabelText("Nombre de marca"), "Naranja X");
    await user.click(screen.getByRole("button", { name: "Guardar tarjeta" }));

    await waitFor(() => {
      expect(createCreditCard).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Naranja X",
          brand: "Naranja X",
        })
      );
    });
  });

  it("edits card via updateCreditCard without currency field", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);
    updateCreditCard.mockResolvedValue({ ...primaryCard, name: "Visa Galicia Gold" });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Editar tarjeta" }));
    expect(await screen.findByText(/Moneda: ARS/)).toBeTruthy();
    expect(screen.queryByLabelText("Moneda")).toBeNull();

    const nameInput = screen.getByLabelText("Nombre") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Visa Galicia Gold");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(updateCreditCard).toHaveBeenCalledWith(
        "card-1",
        expect.objectContaining({
          name: "Visa Galicia Gold",
          brand: "Visa",
        })
      );
      expect(updateCreditCard.mock.calls[0]?.[1]).not.toHaveProperty("currency");
    });
  });

  it("can open add form when a second card already exists", async () => {
    getCreditCards.mockResolvedValue([primaryCard, secondCard]);
    getCreditCardCommitments.mockImplementation(async (id: string) => ({
      ...commitments,
      creditCardId: id,
    }));
    getRecurringChargeOutlook.mockResolvedValue(outlook);
    const user = userEvent.setup();

    renderPage();
    expect(await screen.findByRole("button", { name: "Tarjeta Mastercard BBVA" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ Agregar tarjeta" }));
    expect(await screen.findByRole("heading", { name: "Agregar tarjeta" })).toBeTruthy();
  });

  it("lists recurrentes with expected vs confirmed status", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();

    expect(await screen.findByText("Netflix")).toBeTruthy();
    expect(screen.getByText(/Estimado mensual · Todavía no registrado/)).toBeTruthy();
    expect(screen.getByText("Spotify")).toBeTruthy();
    expect(screen.getByText(/Registrado este mes/)).toBeTruthy();
    expect(screen.getAllByText("$ 2.500,00").length).toBeGreaterThan(0);
  });

  it("renders the page header with the privacy toggle", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();

    expect(screen.getByRole("heading", { name: "Tarjetas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar montos" })).toBeTruthy();
    expect(await screen.findByText("Netflix")).toBeTruthy();
  });

  it("does not merge estimated pending into current debt display", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();
    await screen.findByText("Recurrentes estimados pendientes");

    await waitFor(() => {
      expect(screen.getAllByText("$ 3.500,00").length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText("Deuda actual").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$ 45.000,00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$ 48.500,00")).toBeNull();
  });

  it("does not duplicate debt/closing/due metrics below the hero", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);

    renderPage();
    await screen.findByText("Recurrentes estimados pendientes");

    expect(screen.getAllByText("Deuda actual")).toHaveLength(1);
    expect(screen.getAllByText("Próximo cierre")).toHaveLength(1);
    expect(screen.getAllByText("Próximo vencimiento")).toHaveLength(1);
  });

  it("opens confirm sheet and calls confirmRecurringCharge", async () => {
    getCreditCards.mockResolvedValue([primaryCard]);
    getCreditCardCommitments.mockResolvedValue(commitments);
    getRecurringChargeOutlook.mockResolvedValue(outlook);
    confirmRecurringCharge.mockResolvedValue({
      created: true,
      occurrence: outlook.items[0]!.occurrence,
    });

    const user = userEvent.setup();
    renderPage();

    const registerButtons = await screen.findAllByRole("button", {
      name: "Registrar este mes",
    });
    await user.click(registerButtons[0]!);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText("Recién al confirmar se registra el gasto real en la tarjeta.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Registrar cargo" }));

    await waitFor(() => {
      expect(confirmRecurringCharge).toHaveBeenCalledWith(
        "rc-1",
        expect.objectContaining({
          amount: "3500.00",
          idempotencyKey: "uuid-test-1234",
          occurrenceKey: expect.stringMatching(/^\d{4}-\d{2}$/),
        })
      );
    });
  });
});
