import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const login = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => "/login",
}));

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    login: (...args: unknown[]) => login(...args),
  };
});

vi.mock("../../components/AuthProvider", () => ({
  useAuth: () => ({
    status: "unauthenticated",
    user: null,
    refresh,
    logout: vi.fn(),
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
    refresh.mockReset();
    replace.mockReset();
  });

  it("shows a friendly error when credentials are invalid", async () => {
    const { ApiClientError } = await import("../../lib/api");
    login.mockRejectedValue(
      new ApiClientError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos.")
    );
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "qa@example.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "twelvechars!!");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Email o contraseña incorrectos.");
  });
});
