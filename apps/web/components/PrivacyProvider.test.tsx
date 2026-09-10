import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PRIVACY_KEY } from "../lib/privacy";
import { PrivacyProvider } from "./PrivacyProvider";
import { PrivacyToggle } from "./PrivacyToggle";
import { Money } from "./ui/Money";

function renderWithPrivacy() {
  return render(
    <PrivacyProvider>
      <PrivacyToggle />
      <Money amount="12500.00" currency="ARS" />
      <Money amount="1200.00" currency="USD" />
    </PrivacyProvider>
  );
}

describe("PrivacyProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows amounts by default", () => {
    renderWithPrivacy();
    expect(screen.getByText("$ 12.500,00")).toBeTruthy();
    expect(screen.getByText("USD 1.200,00")).toBeTruthy();
  });

  it("masks amounts when toggled and persists the preference", async () => {
    renderWithPrivacy();
    await userEvent.click(screen.getByRole("button", { name: "Ocultar montos" }));

    expect(screen.getByText("$ ••••••")).toBeTruthy();
    expect(screen.getByText("USD ••••••")).toBeTruthy();
    expect(localStorage.getItem(PRIVACY_KEY)).toBe("1");

    const toggle = screen.getByRole("button", { name: "Mostrar montos" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("restores the stored preference on mount", async () => {
    localStorage.setItem(PRIVACY_KEY, "1");
    renderWithPrivacy();
    expect(await screen.findByText("$ ••••••")).toBeTruthy();
  });
});

describe("Money without provider", () => {
  it("renders the formatted amount", () => {
    render(<Money amount="500.50" currency="ARS" />);
    expect(screen.getByText("$ 500,50")).toBeTruthy();
  });
});
