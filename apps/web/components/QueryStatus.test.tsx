import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./QueryStatus";

describe("QueryStatus", () => {
  it("renders a loading state without empty or error semantics", () => {
    render(<LoadingState label="Cargando cuentas y categorías…" />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Cargando cuentas y categorías…")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("renders an error with retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="No pudimos cargar tus cuentas. Probá de nuevo." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("No pudimos cargar tus cuentas. Probá de nuevo.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty without treating it as an error", () => {
    render(<EmptyState message="Aún no creaste cuentas." />);
    expect(screen.getByText("Aún no creaste cuentas.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders empty with a CTA link", () => {
    render(
      <EmptyState
        message="No hay cuentas activas."
        action={{ href: "/accounts", label: "Ir a Cuentas" }}
      />
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir a Cuentas" }).getAttribute("href")).toBe(
      "/accounts"
    );
  });

  it("renders empty with a CTA button", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState message="Aún no tenés presupuestos para este mes." action={{ label: "Crear presupuesto", onClick }} />
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Crear presupuesto" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
