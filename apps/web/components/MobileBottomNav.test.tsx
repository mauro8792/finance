import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

describe("MobileBottomNav", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("shows the primary destinations", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal móvil" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Registrar" }).getAttribute("href")).toBe(
      "/registrar"
    );
    expect(screen.getByRole("link", { name: "Movimientos" }).getAttribute("href")).toBe(
      "/transactions"
    );
    expect(screen.getByRole("link", { name: "Cuentas" }).getAttribute("href")).toBe(
      "/accounts"
    );
  });

  it("marks the active destination", () => {
    pathname = "/transactions";
    render(<MobileBottomNav />);
    expect(
      screen.getByRole("link", { name: "Movimientos" }).getAttribute("aria-current")
    ).toBe("page");
    expect(screen.getByRole("link", { name: "Inicio" }).getAttribute("aria-current")).toBeNull();
  });

  it("opens the Más sheet with the secondary sections and closes on navigate", async () => {
    render(<MobileBottomNav />);
    await userEvent.click(screen.getByRole("button", { name: "Más" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    for (const [label, href] of [
      ["Inversiones", "/investments"],
      ["Vivienda", "/housing"],
      ["Tarjetas", "/cards"],
      ["Mover dinero", "/transfers"],
      ["Presupuestos", "/budgets"],
      ["Simulaciones", "/simulations"],
      ["Asistente", "/assistant"],
    ]) {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }

    await userEvent.click(screen.getByRole("link", { name: "Inversiones" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers logout inside the sheet when available", async () => {
    const onLogout = vi.fn();
    render(<MobileBottomNav onLogout={onLogout} />);
    await userEvent.click(screen.getByRole("button", { name: "Más" }));
    await userEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not render logout without a handler", async () => {
    render(<MobileBottomNav />);
    await userEvent.click(screen.getByRole("button", { name: "Más" }));
    expect(screen.queryByRole("button", { name: "Salir" })).toBeNull();
  });
});
