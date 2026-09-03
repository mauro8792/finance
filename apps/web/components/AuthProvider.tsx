"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMe, logout as logoutRequest, setOnUnauthorized } from "../lib/api";
import type { AuthUser } from "../lib/types";
import { LoadingState } from "./QueryStatus";
import { SiteHeader } from "./SiteHeader";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const clearSession = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    try {
      const result = await getMe();
      setUser(result.user);
      setStatus("authenticated");
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    setOnUnauthorized(() => {
      clearSession();
      if (pathname !== "/login") {
        router.replace("/login");
      }
    });
    return () => setOnUnauthorized(null);
  }, [clearSession, pathname, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }, [clearSession, router]);

  const value = useMemo(
    () => ({ status, user, logout, refresh }),
    [status, user, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth requiere AuthProvider.");
  }
  return context;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (status === "unauthenticated" && !isLogin) {
      router.replace("/login");
    }
    if (status === "authenticated" && isLogin) {
      router.replace("/");
    }
  }, [isLogin, router, status]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (status === "loading" || status === "unauthenticated") {
    return <LoadingState label="Cargando sesión" />;
  }

  return <>{children}</>;
}

export function AuthHeader() {
  const pathname = usePathname();
  const { status, logout } = useAuth();
  if (pathname === "/login") {
    return null;
  }
  return (
    <SiteHeader onLogout={status === "authenticated" ? () => void logout() : undefined} />
  );
}
