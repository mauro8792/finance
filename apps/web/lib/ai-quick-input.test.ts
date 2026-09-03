import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ApiClientError } from "./api";
import {
  canConfirmAiDraft,
  formatProposalAmount,
  matchByExactName,
  parseTransactionErrorMessage,
  resolveAiDraft,
  splitProposals,
  toCreateRequest,
  itemsFromParse,
  allProposalsSettled,
  completionMessage,
} from "./ai-quick-input";
import type { Account, AIParsedTransaction, Category } from "./types";

const accounts: Account[] = [
  { id: "acc-ars", name: "Santander", currency: "ARS", isActive: true },
  { id: "acc-usd", name: "Reserva USD", currency: "USD", isActive: true },
  { id: "acc-dup", name: "Santander", currency: "ARS", isActive: true },
  { id: "acc-old", name: "Vieja", currency: "ARS", isActive: false },
];

const uniqueAccounts: Account[] = [
  { id: "acc-ars", name: "Santander", currency: "ARS", isActive: true },
  { id: "acc-usd", name: "Reserva USD", currency: "USD", isActive: true },
];

const categories: Category[] = [
  { id: "cat-super", name: "Supermercado", type: "EXPENSE", isActive: true },
  { id: "cat-comida", name: "Comida", type: "EXPENSE", isActive: true },
  { id: "cat-sueldo", name: "Sueldo", type: "INCOME", isActive: true },
  { id: "cat-sub", name: "Suscripción", type: "EXPENSE", isActive: true },
];

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

describe("ai-quick-input adapter", () => {
  it("matches category by exact name, not fuzzy fragments", () => {
    assert.equal(matchByExactName(categories, "Supermercado")?.id, "cat-super");
    assert.equal(matchByExactName(categories, "supermercado")?.id, "cat-super");
    assert.equal(matchByExactName(categories, "super"), null);
  });

  it("does not pick an account when the hint is missing", () => {
    const draft = resolveAiDraft(expense(), uniqueAccounts, categories);
    assert.equal(draft.accountId, "");
    assert.equal(draft.categoryId, "cat-super");
    assert.equal(canConfirmAiDraft(draft), false);
  });

  it("matches a unique account name in the same currency", () => {
    const draft = resolveAiDraft(
      expense({ accountHint: "Santander" }),
      uniqueAccounts,
      categories
    );
    assert.equal(draft.accountId, "acc-ars");
    assert.equal(canConfirmAiDraft(draft), true);
  });

  it("allows CAPITAL income without category and omits categoryId in the payload", () => {
    const draft = resolveAiDraft(
      {
        type: "INCOME",
        amount: "370214.59",
        currency: "ARS",
        categoryHint: null,
        accountHint: "Santander",
        description: "Saldo inicial",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: "CAPITAL",
      },
      uniqueAccounts,
      categories
    );
    assert.equal(draft.categoryId, "");
    assert.equal(canConfirmAiDraft(draft), true);
    const payload = toCreateRequest(draft, uniqueAccounts[0]!);
    assert.equal(payload && "type" in payload ? payload.type : undefined, "INCOME");
    assert.ok(payload && "incomeKind" in payload && payload.incomeKind === "CAPITAL");
    assert.equal("categoryId" in (payload ?? {}) ? payload?.categoryId : undefined, undefined);
  });

  it("rejects OPERATING income without category", () => {
    const draft = resolveAiDraft(
      {
        type: "INCOME",
        amount: "1000.00",
        currency: "ARS",
        categoryHint: null,
        accountHint: "Santander",
        description: "Sueldo",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: "OPERATING",
      },
      uniqueAccounts,
      categories
    );
    assert.equal(canConfirmAiDraft(draft), false);
  });

  it("does not pick a duplicated account name", () => {
    const draft = resolveAiDraft(expense({ accountHint: "Santander" }), accounts, categories);
    assert.equal(draft.accountId, "");
  });

  it("preselects Comida from a canonical categoryHint", () => {
    const draft = resolveAiDraft(
      expense({ categoryHint: "Comida", description: "panadería", amount: "15000.00" }),
      uniqueAccounts,
      categories
    );
    assert.equal(draft.categoryId, "cat-comida");
    assert.equal(draft.categoryName, "Comida");
    assert.equal(draft.accountId, "");
  });

  it("does not preselect a category when categoryHint is null", () => {
    const draft = resolveAiDraft(expense({ categoryHint: null }), uniqueAccounts, categories);
    assert.equal(draft.categoryId, "");
    assert.equal(draft.categoryName, null);
  });

  it("does not preselect when two categories share the same name", () => {
    const draft = resolveAiDraft(expense({ categoryHint: "Comida" }), uniqueAccounts, [
      { id: "cat-1", name: "Comida", type: "EXPENSE", isActive: true },
      { id: "cat-2", name: "Comida", type: "EXPENSE", isActive: true },
    ]);
    assert.equal(draft.categoryId, "");
    assert.equal(draft.categoryName, null);
  });

  it("does not match an ARS account for a USD proposal", () => {
    const draft = resolveAiDraft(
      expense({
        amount: "50.00",
        currency: "USD",
        categoryHint: "Suscripción",
        description: "suscripción",
      }),
      uniqueAccounts,
      categories
    );
    assert.equal(draft.currency, "USD");
    assert.equal(draft.accountId, "");
    assert.equal(draft.categoryId, "cat-sub");
    assert.equal(formatProposalAmount(draft.amount, draft.currency), "USD 50,00");
  });

  it("builds a create payload without converting currency", () => {
    const draft = resolveAiDraft(
      expense({ accountHint: "Santander" }),
      uniqueAccounts,
      categories
    );
    const payload = toCreateRequest(draft, uniqueAccounts[0]);
    assert.deepEqual(payload, {
      amount: "75000.00",
      currency: "ARS",
      accountId: "acc-ars",
      categoryId: "cat-super",
      description: "Supermercado",
    });
  });

  it("keeps extra proposals instead of dropping them", () => {
    const split = splitProposals({
      transactions: [expense(), expense({ amount: "54000.00", description: "Gym" })],
      ambiguities: [],
    });
    assert.equal(split.primary?.amount, "75000.00");
    assert.equal(split.extras.length, 1);
    assert.equal(split.extras[0]?.description, "Gym");
  });

  it("builds independent UI items for each parsed proposal", () => {
    const items = itemsFromParse([
      expense({ amount: "15000.00", categoryHint: "Comida" }),
      expense({ amount: "30000.00", categoryHint: "Transporte" }),
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.status, "pending");
    assert.equal(items[1]?.status, "pending");
    assert.equal(allProposalsSettled(items), false);
    assert.equal(completionMessage(items), null);
    assert.equal(
      completionMessage([
        { ...items[0]!, status: "saved" },
        { ...items[1]!, status: "discarded" },
      ]),
      "Gasto registrado."
    );
    assert.equal(
      completionMessage([
        { ...items[0]!, status: "saved" },
        { ...items[1]!, status: "saved" },
      ]),
      "2 movimientos registrados."
    );
    assert.equal(
      allProposalsSettled([
        { ...items[0]!, status: "saved" },
        { ...items[1]!, status: "discarded" },
      ]),
      true
    );
  });

  it("maps parser HTTP errors without leaking provider details", () => {
    assert.equal(
      parseTransactionErrorMessage(new ApiClientError(429, "RATE_LIMIT", "sk-secret")),
      "Demasiadas solicitudes. Probá de nuevo en un momento."
    );
    assert.equal(
      parseTransactionErrorMessage(new ApiClientError(503, "AI_UNAVAILABLE", "sk-secret")),
      "El asistente no está disponible temporalmente. Podés registrar el movimiento a mano."
    );
    assert.doesNotMatch(
      parseTransactionErrorMessage(new ApiClientError(500, "INTERNAL_ERROR", "sk-secret")),
      /sk-/
    );
  });
});
