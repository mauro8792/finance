import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionCard } from "./ActionCard";
import { PageHeader } from "./PageHeader";
import { Skeleton } from "./Skeleton";
import { SummaryCard } from "./SummaryCard";

describe("Skeleton", () => {
  it("announces the loading state", () => {
    render(<Skeleton count={3} label="Cargando cuentas" />);
    const status = screen.getByRole("status", { name: "Cargando cuentas" });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.childElementCount).toBe(3);
  });
});

describe("PageHeader", () => {
  it("renders title, description and actions", () => {
    render(
      <PageHeader
        title="Cuentas"
        description="Tus saldos disponibles"
        actions={<button type="button">Nueva</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Cuentas" })).toBeTruthy();
    expect(screen.getByText("Tus saldos disponibles")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva" })).toBeTruthy();
  });
});

describe("ActionCard", () => {
  it("renders a link when href is provided", () => {
    render(<ActionCard label="Registrar" href="/registrar" hint="Gasto o ingreso" />);
    expect(screen.getByRole("link", { name: /Registrar/ }).getAttribute("href")).toBe(
      "/registrar"
    );
    expect(screen.getByText("Gasto o ingreso")).toBeTruthy();
  });

  it("renders a button when only onClick is provided", () => {
    render(<ActionCard label="Abrir" onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Abrir" })).toBeTruthy();
  });
});

describe("SummaryCard", () => {
  it("renders the label, formatted amount and hint", () => {
    render(<SummaryCard label="Saldo" amount="12500.00" currency="ARS" hint="Al día de hoy" />);
    expect(screen.getByText("Saldo")).toBeTruthy();
    expect(screen.getByText("$ 12.500,00")).toBeTruthy();
    expect(screen.getByText("Al día de hoy")).toBeTruthy();
  });
});
