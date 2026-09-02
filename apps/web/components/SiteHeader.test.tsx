import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("links Inicio, Movimientos, Cuentas, Mover dinero, Presupuestos, Vivienda, Inversiones, Simulaciones and Registrar", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Registrar" }).getAttribute("href")).toBe(
      "/registrar"
    );
    const movements = screen.getAllByRole("link", { name: "Movimientos" });
    expect(movements.length).toBeGreaterThan(0);
    expect(movements.every((link) => link.getAttribute("href") === "/transactions")).toBe(
      true
    );
    const mover = screen.getAllByRole("link", { name: "Mover dinero" });
    expect(mover.length).toBeGreaterThan(0);
    expect(mover.every((link) => link.getAttribute("href") === "/transfers")).toBe(true);
    const accounts = screen.getAllByRole("link", { name: "Cuentas" });
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.every((link) => link.getAttribute("href") === "/accounts")).toBe(true);
    const budgets = screen.getAllByRole("link", { name: "Presupuestos" });
    expect(budgets.every((link) => link.getAttribute("href") === "/budgets")).toBe(true);
    const housing = screen.getAllByRole("link", { name: "Vivienda" });
    expect(housing.length).toBeGreaterThan(0);
    expect(housing.every((link) => link.getAttribute("href") === "/housing")).toBe(true);
    const investments = screen.getAllByRole("link", { name: "Inversiones" });
    expect(investments.length).toBeGreaterThan(0);
    expect(investments.every((link) => link.getAttribute("href") === "/investments")).toBe(true);
    const simulations = screen.getAllByRole("link", { name: "Simulaciones" });
    expect(simulations.length).toBeGreaterThan(0);
    expect(simulations.every((link) => link.getAttribute("href") === "/simulations")).toBe(true);
    expect(screen.getByText("Más")).toBeTruthy();
  });
});
