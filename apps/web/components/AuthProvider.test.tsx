import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, AuthProvider, useAuth } from "./AuthProvider";

const authApi = vi.hoisted(() => {
  let unauthorizedHandler: (() => void) | null = null;
  return {
    getMe: vi.fn(),
    logout: vi.fn(),
    replace: vi.fn(),
    getUnauthorizedHandler: () => unauthorizedHandler,
    setOnUnauthorized: (handler: (() => void) | null) => {
      unauthorizedHandler = handler;
    },
  };
});

let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: authApi.replace, push: authApi.replace }),
  usePathname: () => pathname,
}));

vi.mock("../lib/api", () => ({
  getMe: () => authApi.getMe(),
  logout: () => authApi.logout(),
  setOnUnauthorized: authApi.setOnUnauthorized,
}));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthGate>
          <p>datos financieros</p>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    authApi.getMe.mockReset();
    authApi.logout.mockReset();
    authApi.replace.mockReset();
    authApi.setOnUnauthorized(null);
    pathname = "/";
  });

  it("does not show financial data while auth is loading", () => {
    authApi.getMe.mockReturnValue(new Promise(() => undefined));
    renderGate();
    expect(screen.getByText("Cargando sesión")).toBeTruthy();
    expect(screen.queryByText("datos financieros")).toBeNull();
  });

  it("redirects unauthenticated users to login", async () => {
    authApi.getMe.mockRejectedValue(new Error("unauthenticated"));
    renderGate();
    await waitFor(() => {
      expect(authApi.replace).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByText("datos financieros")).toBeNull();
  });

  it("shows the app when authenticated", async () => {
    authApi.getMe.mockResolvedValue({
      user: { id: "u1", name: "Mauro", email: "a@b.co", timezone: "America/Argentina/Buenos_Aires" },
    });
    renderGate();
    expect(await screen.findByText("datos financieros")).toBeTruthy();
  });

  it("logout clears the session and goes to login", async () => {
    authApi.getMe.mockResolvedValue({
      user: { id: "u1", name: "Mauro", email: "a@b.co", timezone: "America/Argentina/Buenos_Aires" },
    });
    authApi.logout.mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["financial-summary"], { monthlyGrossExpenses: "1" });

    function LogoutProbe() {
      const { logout: signOut } = useAuth();
      return (
        <button type="button" onClick={() => void signOut()}>
          Salir
        </button>
      );
    }

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <LogoutProbe />
        </AuthProvider>
      </QueryClientProvider>
    );
    await userEvent.click(await screen.findByRole("button", { name: "Salir" }));
    await waitFor(() => {
      expect(authApi.replace).toHaveBeenCalledWith("/login");
    });
    expect(client.getQueryData(["financial-summary"])).toBeUndefined();
  });

  it("global 401 clears session cache and redirects to login", async () => {
    authApi.getMe.mockResolvedValue({
      user: { id: "u1", name: "Mauro", email: "a@b.co", timezone: "America/Argentina/Buenos_Aires" },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["financial-summary"], { monthlyGrossExpenses: "1" });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthGate>
            <p>datos financieros</p>
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    );
    expect(await screen.findByText("datos financieros")).toBeTruthy();
    authApi.getUnauthorizedHandler()?.();
    await waitFor(() => {
      expect(authApi.replace).toHaveBeenCalledWith("/login");
    });
    expect(client.getQueryData(["financial-summary"])).toBeUndefined();
    expect(screen.queryByText("datos financieros")).toBeNull();
  });
});
