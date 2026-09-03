import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../lib/api";
import { AiQuickInput } from "./AiQuickInput";
import type { AIParsedTransaction } from "../lib/types";

const getAccounts = vi.fn();
const getCategories = vi.fn();
const createTransaction = vi.fn();
const parseTransaction = vi.fn();

vi.mock("../lib/api", () => {
  class MockApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  }
  return {
    ApiClientError: MockApiClientError,
    getAccounts: () => getAccounts(),
    getCategories: () => getCategories(),
    createTransaction: (payload: unknown) => createTransaction(payload),
    parseTransaction: (payload: unknown) => parseTransaction(payload),
  };
});

function expense(overrides: Partial<AIParsedTransaction> = {}): AIParsedTransaction {
  return {
    type: "EXPENSE",
    amount: "75000.00",
    currency: "ARS",
    categoryHint: "Supermercado",
    accountHint: null,
    description: "Supermercado",
    occurredAt: null,
    paymentMethod: null,
    incomeKind: null,
    ...overrides,
  };
}

function renderQuick() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <AiQuickInput />
    </QueryClientProvider>
  );
  return { invalidate };
}

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: { results: Array<{ 0: { transcript: string } }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeSpeechRecognition.latest = this;
  }
}

describe("AiQuickInput", () => {
  beforeEach(() => {
    getAccounts.mockReset();
    getCategories.mockReset();
    createTransaction.mockReset();
    parseTransaction.mockReset();
    getAccounts.mockResolvedValue([
      { id: "acc-ars", name: "Santander", currency: "ARS", isActive: true },
      { id: "acc-usd", name: "Caja USD", currency: "USD", isActive: true },
    ]);
    getCategories.mockResolvedValue([
      { id: "cat-super", name: "Supermercado", type: "EXPENSE", isActive: true },
      { id: "cat-comida", name: "Comida", type: "EXPENSE", isActive: true },
      { id: "cat-transporte", name: "Transporte", type: "EXPENSE", isActive: true },
      { id: "cat-sueldo", name: "Sueldo", type: "INCOME", isActive: true },
      { id: "cat-sub", name: "Suscripción", type: "EXPENSE", isActive: true },
    ]);
    createTransaction.mockResolvedValue({
      id: "tx-1",
      type: "EXPENSE",
      status: "ACTIVE",
      amount: "75000.00",
      currency: "ARS",
    });
    parseTransaction.mockResolvedValue({
      transactions: [expense({ accountHint: "Santander" })],
      ambiguities: [],
    });
  });

  afterEach(() => {
    FakeSpeechRecognition.latest = null;
    vi.unstubAllGlobals();
  });

  it("renders the quick input", async () => {
    renderQuick();
    expect(await screen.findByLabelText("¿Qué movimiento querés registrar?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ej: gasté 75 mil en el supermercado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeTruthy();
    expect(screen.queryByText(/OPENAI_API_KEY|sk-/i)).toBeNull();
  });

  it("does not submit empty or whitespace text", async () => {
    const user = userEvent.setup();
    renderQuick();
    const submit = await screen.findByRole("button", { name: "Interpretar" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("¿Qué movimiento querés registrar?"), "   ");
    expect(
      (screen.getByRole("button", { name: "Interpretar" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(parseTransaction).not.toHaveBeenCalled();
  });

  it("shows loading while interpreting", async () => {
    let resolveParse: (value: unknown) => void = () => undefined;
    parseTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveParse = resolve;
        })
    );
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByRole("button", { name: "Interpretando…" })).toBeTruthy();
    expect(screen.getByLabelText("¿Qué movimiento querés registrar?")).toHaveProperty(
      "value",
      "gasté 75 mil en el super"
    );
    resolveParse({
      transactions: [expense({ accountHint: "Santander" })],
      ambiguities: [],
    });
    expect(await screen.findByText("Movimiento interpretado")).toBeTruthy();
  });

  it("shows an ARS expense preview", async () => {
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Gasto")).toBeTruthy();
    expect(screen.getByText("$ 75.000,00")).toBeTruthy();
    expect(screen.getAllByText("Supermercado").length).toBeGreaterThan(0);
    expect(parseTransaction).toHaveBeenCalledWith({ text: "gasté 75 mil en el super" });
  });

  it("shows an ARS income preview", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          type: "INCOME",
          amount: "500000.00",
          categoryHint: "Sueldo",
          description: "Sueldo",
          incomeKind: "OPERATING",
        }),
      ],
      ambiguities: ["La moneda y la cuenta receptora no están especificadas."],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "me depositaron 500 mil de sueldo"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Ingreso")).toBeTruthy();
    expect(screen.getByText("$ 500.000,00")).toBeTruthy();
    expect(screen.getByText("Ingreso normal")).toBeTruthy();
    expect(
      screen.getByText("La moneda y la cuenta receptora no están especificadas.")
    ).toBeTruthy();
  });

  it("shows a USD preview without converting to ARS", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "50.00",
          currency: "USD",
          categoryHint: "suscripción",
          description: "suscripción",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "pagué 50 dólares de una suscripción"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("USD 50,00")).toBeTruthy();
    expect(screen.queryByText("$ 50,00")).toBeNull();
  });

  it("shows ambiguities without breaking the preview", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [expense({ accountHint: "Santander" })],
      ambiguities: ["La moneda y el medio de pago no están especificados."],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "Gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Observaciones")).toBeTruthy();
    expect(
      screen.getByText("La moneda y el medio de pago no están especificados.")
    ).toBeTruthy();
    expect(screen.getByText("Gasto")).toBeTruthy();
  });

  it("omits null fields instead of showing empty rows", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          description: null,
          occurredAt: null,
          paymentMethod: null,
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Movimiento interpretado")).toBeTruthy();
    expect(screen.queryByText("Medio de pago")).toBeNull();
    expect(screen.queryByText("Fecha")).toBeNull();
  });

  it("opens the existing form when editing", async () => {
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    await screen.findByRole("button", { name: "Editar" });
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(
      await screen.findByRole("form", { name: "Revisar movimiento interpretado" })
    ).toBeTruthy();
    expect(screen.getByDisplayValue("75000.00")).toBeTruthy();
  });

  it("preselects Comida from a canonical AI categoryHint", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: null,
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en la panadería"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Comida")).toBeTruthy();
    expect(screen.getByText("Sin seleccionar")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByLabelText("Categoría")).toHaveProperty("value", "cat-comida");
    expect(screen.getByLabelText("Cuenta")).toHaveProperty("value", "");
    expect(screen.queryByText(/Categoría sugerida:/)).toBeNull();
  });

  it("requires a manual category when categoryHint is null", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          categoryHint: null,
          description: "algo",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en algo"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Elegí una categoría antes de guardar.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByLabelText("Categoría")).toHaveProperty("value", "");
  });

  it("requires a manual category when the name is not unique", async () => {
    getCategories.mockResolvedValue([
      { id: "cat-1", name: "Comida", type: "EXPENSE", isActive: true },
      { id: "cat-2", name: "Comida", type: "EXPENSE", isActive: true },
    ]);
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en la panadería"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Elegí una categoría antes de guardar.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Categoría sugerida: Comida")).toBeTruthy();
    expect(screen.getByLabelText("Categoría")).toHaveProperty("value", "");
  });

  it("cancels back to the input and keeps the text", async () => {
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    await screen.findByRole("button", { name: "Cancelar" });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("¿Qué movimiento querés registrar?")).toHaveProperty(
      "value",
      "gasté 75 mil en el super"
    );
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("maps 429 to a friendly message", async () => {
    parseTransaction.mockRejectedValue(new ApiClientError(429, "RATE_LIMIT", "sk-secret"));
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(
      await screen.findByText("Demasiadas solicitudes. Probá de nuevo en un momento.")
    ).toBeTruthy();
    expect(screen.queryByText(/sk-/)).toBeNull();
  });

  it("maps 503 to a friendly message", async () => {
    parseTransaction.mockRejectedValue(
      new ApiClientError(503, "AI_UNAVAILABLE", "raw provider")
    );
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(
      await screen.findByText(
        "El asistente no está disponible temporalmente. Podés registrar el movimiento a mano."
      )
    ).toBeTruthy();
  });

  it("maps a generic error without provider details", async () => {
    parseTransaction.mockRejectedValue(new Error("openai exploded"));
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("No se pudo interpretar el movimiento.")).toBeTruthy();
    expect(screen.queryByText(/openai/i)).toBeNull();
  });

  it("never sends more than the text and never mentions an API key", async () => {
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    await screen.findByText("Movimiento interpretado");
    expect(parseTransaction).toHaveBeenCalledTimes(1);
    expect(parseTransaction).toHaveBeenCalledWith({ text: "gasté 75 mil en el super" });
    expect(JSON.stringify(parseTransaction.mock.calls)).not.toMatch(/OPENAI|sk-/i);
  });

  it("shows two independent proposal cards without Guardar todos", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("2 movimientos interpretados")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Movimiento 1" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Movimiento 2" })).toBeTruthy();
    expect(screen.getByText("$ 15.000,00")).toBeTruthy();
    expect(screen.getByText("$ 30.000,00")).toBeTruthy();
    expect(screen.getByText("Comida")).toBeTruthy();
    expect(screen.getByText("Transporte")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Descartar" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Guardar todos" })).toBeNull();
  });

  it("confirms through POST /api/transactions and invalidates queries", async () => {
    const { invalidate } = renderQuick();
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 75 mil en el super"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    await screen.findByRole("button", { name: "Guardar" });
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "75000.00",
          currency: "ARS",
          accountId: "acc-ars",
          categoryId: "cat-super",
        })
      )
    );
    expect(parseTransaction.mock.calls.at(-1)?.[0]).toEqual({
      text: "gasté 75 mil en el super",
    });
    expect(await screen.findByText("Gasto registrado.")).toBeTruthy();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-balances"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["financial-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
  });

  it("saves the first proposal without persisting the second", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const first = await screen.findByRole("article", { name: "Movimiento 1" });
    const second = screen.getByRole("article", { name: "Movimiento 2" });
    await user.click(within(first).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "15000.00", categoryId: "cat-comida" })
    );
    expect(await within(first).findByText("Guardado")).toBeTruthy();
    expect(within(second).getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(screen.queryByText("Gasto registrado.")).toBeNull();
  });

  it("saves the second proposal only", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const second = await screen.findByRole("article", { name: "Movimiento 2" });
    await user.click(within(second).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "30000.00", categoryId: "cat-transporte" })
    );
    expect(await within(second).findByText("Guardado")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Movimiento 1" })).getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("discards one proposal without losing the other", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const first = await screen.findByRole("article", { name: "Movimiento 1" });
    await user.click(within(first).getByRole("button", { name: "Descartar" }));
    expect(await within(first).findByText("Descartado")).toBeTruthy();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: "Movimiento 2" })).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Movimiento 2" })).getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("edits one proposal without hiding the other", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const second = await screen.findByRole("article", { name: "Movimiento 2" });
    await user.click(within(second).getByRole("button", { name: "Editar" }));
    expect(
      await within(second).findByRole("form", { name: "Revisar movimiento interpretado" })
    ).toBeTruthy();
    expect(screen.getByRole("article", { name: "Movimiento 1" })).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Movimiento 1" })).queryByRole("form")
    ).toBeNull();
  });

  it("requires account and category independently per proposal", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: null,
          description: "nafta",
          accountHint: null,
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const first = await screen.findByRole("article", { name: "Movimiento 1" });
    const second = screen.getByRole("article", { name: "Movimiento 2" });
    expect(within(first).getByRole("button", { name: "Guardar" })).not.toHaveProperty(
      "disabled",
      true
    );
    expect(within(second).getByText("Elegí una cuenta antes de guardar.")).toBeTruthy();
    expect(
      (within(second).getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("shows mixed income and expense proposals", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          type: "INCOME",
          amount: "500000.00",
          categoryHint: "Sueldo",
          description: "sueldo",
          incomeKind: "OPERATING",
        }),
        expense({
          amount: "20000.00",
          categoryHint: "Comida",
          description: "comida",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "cobré 500 mil de sueldo y gasté 20 mil en comida"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Ingreso")).toBeTruthy();
    expect(screen.getByText("Gasto")).toBeTruthy();
    expect(screen.getByText("$ 500.000,00")).toBeTruthy();
    expect(screen.getByText("$ 20.000,00")).toBeTruthy();
  });

  it("shows mixed currencies without converting", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          currency: "ARS",
          categoryHint: "Comida",
          description: "panadería",
        }),
        expense({
          amount: "50.00",
          currency: "USD",
          categoryHint: "Suscripción",
          description: "suscripción",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil pesos en panadería y 50 dólares en una suscripción"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("$ 15.000,00")).toBeTruthy();
    expect(screen.getByText("USD 50,00")).toBeTruthy();
    expect(screen.queryByText("$ 50,00")).toBeNull();
  });

  it("keeps other proposals when one save fails and allows retry", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    createTransaction
      .mockResolvedValueOnce({
        id: "tx-1",
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "15000.00",
        currency: "ARS",
      })
      .mockRejectedValueOnce(new ApiClientError(500, "INTERNAL_ERROR", "boom"))
      .mockResolvedValueOnce({
        id: "tx-2",
        type: "EXPENSE",
        status: "ACTIVE",
        amount: "30000.00",
        currency: "ARS",
      });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const first = await screen.findByRole("article", { name: "Movimiento 1" });
    const second = screen.getByRole("article", { name: "Movimiento 2" });
    await user.click(within(first).getByRole("button", { name: "Guardar" }));
    expect(await within(first).findByText("Guardado")).toBeTruthy();
    await user.click(within(second).getByRole("button", { name: "Guardar" }));
    expect(await within(second).findByText("No se pudo guardar el movimiento.")).toBeTruthy();
    expect(within(first).getByText("Guardado")).toBeTruthy();
    await user.click(within(second).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("2 movimientos registrados.")).toBeTruthy();
  });

  it("does not allow double submit of a saved proposal", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: [],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    const first = await screen.findByRole("article", { name: "Movimiento 1" });
    await user.click(within(first).getByRole("button", { name: "Guardar" }));
    expect(await within(first).findByText("Guardado")).toBeTruthy();
    expect(within(first).queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(createTransaction).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly empty state and keeps the text editable", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [],
      ambiguities: ["no se detectó un movimiento"],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "hola"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(
      await screen.findByText("No pude identificar movimientos para registrar.")
    ).toBeTruthy();
    expect(screen.getByText("no se detectó un movimiento")).toBeTruthy();
    expect(screen.getByLabelText("¿Qué movimiento querés registrar?")).toHaveProperty(
      "value",
      "hola"
    );
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeTruthy();
  });

  it("shows global parser ambiguities without hiding valid proposals", async () => {
    parseTransaction.mockResolvedValue({
      transactions: [
        expense({
          amount: "15000.00",
          categoryHint: "Comida",
          description: "panadería",
          accountHint: "Santander",
        }),
        expense({
          amount: "30000.00",
          categoryHint: "Transporte",
          description: "nafta",
          accountHint: "Santander",
        }),
      ],
      ambiguities: ["La moneda y el medio de pago no están especificados."],
    });
    const user = userEvent.setup();
    renderQuick();
    await user.type(
      await screen.findByLabelText("¿Qué movimiento querés registrar?"),
      "gasté 15 mil en panadería y 30 mil en nafta"
    );
    await user.click(screen.getByRole("button", { name: "Interpretar" }));
    expect(await screen.findByText("Observaciones")).toBeTruthy();
    expect(
      screen.getByText("La moneda y el medio de pago no están especificados.")
    ).toBeTruthy();
    expect(screen.getByRole("article", { name: "Movimiento 1" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Movimiento 2" })).toBeTruthy();
  });

  it("does not show a microphone when speech recognition is unavailable", async () => {
    renderQuick();
    expect(await screen.findByRole("button", { name: "Interpretar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dictar" })).toBeNull();
  });

  it("writes dictation into the existing input", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const user = userEvent.setup();
    renderQuick();
    const mic = await screen.findByRole("button", { name: "Dictar" });
    await user.click(mic);
    expect(screen.getByRole("button", { name: "Detener dictado" })).toBeTruthy();
    expect(screen.getByText("Escuchando…")).toBeTruthy();
    act(() => {
      FakeSpeechRecognition.latest?.onresult?.({
        results: [{ 0: { transcript: "Gasté 24000 en supermercado con Santander" } }],
      });
    });
    expect(
      screen.getByDisplayValue("Gasté 24000 en supermercado con Santander")
    ).toBeTruthy();
  });

  it("shows a speech permission error without hiding Interpretar", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeSpeechRecognition);
    const user = userEvent.setup();
    renderQuick();
    await user.click(await screen.findByRole("button", { name: "Dictar" }));
    act(() => {
      FakeSpeechRecognition.latest?.onerror?.({ error: "not-allowed" });
    });
    expect(screen.getByText("No se pudo usar el micrófono. Podés seguir escribiendo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeTruthy();
    expect(screen.getByLabelText("¿Qué movimiento querés registrar?")).toBeTruthy();
  });
});
