import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./SiteHeader";

const DESTINATIONS: Array<[string, string]> = [
  ["Inicio", "/"],
  ["Movimientos", "/transactions"],
  ["Cuentas", "/accounts"],
  ["Tarjetas", "/cards"],
  ["Mover dinero", "/transfers"],
  ["Presupuestos", "/budgets"],
  ["Vivienda", "/housing"],
  ["Inversiones", "/investments"],
  ["Simulaciones", "/simulations"],
  ["Asistente", "/assistant"],
  ["Registrar", "/registrar"],
];

describe("SiteHeader", () => {
  it("keeps every destination reachable from the desktop nav", () => {
    render(<SiteHeader />);
    for (const [label, href] of DESTINATIONS) {
      const links = screen.getAllByRole("link", { name: label });
      expect(links.length).toBeGreaterThan(0);
      expect(links.every((link) => link.getAttribute("href") === href)).toBe(true);
    }
    expect(screen.getByText("Más")).toBeTruthy();
  });

  it("exposes the privacy toggle", () => {
    render(<SiteHeader />);
    const toggle = screen.getByRole("button", { name: "Ocultar montos" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders logout only when a handler is provided", () => {
    const { unmount } = render(<SiteHeader />);
    expect(screen.queryByRole("button", { name: "Salir" })).toBeNull();
    unmount();

    render(<SiteHeader onLogout={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salir" })).toBeTruthy();
  });
});
