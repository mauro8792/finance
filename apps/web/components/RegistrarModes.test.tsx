import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegistrarModes } from "./RegistrarModes";

vi.mock("../lib/api", () => ({
  ApiClientError: class ApiClientError extends Error {
    status = 400;
    code = "VALIDATION_ERROR";
  },
  getAccounts: () =>
    Promise.resolve([{ id: "acc-1", name: "Santander", currency: "ARS", isActive: true }]),
  getCategories: () =>
    Promise.resolve([{ id: "cat-exp", name: "Comida", type: "EXPENSE", isActive: true }]),
  getCreditCards: () => Promise.resolve([]),
  createTransaction: vi.fn(),
  createTransfer: vi.fn(),
  parseTransaction: vi.fn(),
}));

function renderModes() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RegistrarModes />
    </QueryClientProvider>
  );
}

describe("RegistrarModes", () => {
  it("opens Texto / voz by default and hides the manual form", async () => {
    renderModes();
    expect(screen.getByRole("tab", { name: "Texto / voz" }).getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(await screen.findByRole("button", { name: "Interpretar" })).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Registrar movimiento" })).toBeNull();
  });

  it("shows only the manual form after switching tabs and keeps typed text", async () => {
    const user = userEvent.setup();
    renderModes();
    const input = await screen.findByLabelText("¿Qué movimiento querés registrar?");
    await user.type(input, "gasté 24000 en supermercado");
    await user.click(screen.getByRole("tab", { name: "Manual" }));
    expect(await screen.findByRole("form", { name: "Registrar movimiento" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Interpretar" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Texto / voz" }));
    expect(screen.getByDisplayValue("gasté 24000 en supermercado")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Registrar movimiento" })).toBeNull();
  });
});
