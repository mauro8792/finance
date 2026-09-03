import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });
loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env"), quiet: true });

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Definí la variable de entorno antes de usar la base de datos. Ver apps/api/.env.example."
    );
  }

  return url;
}

export function databaseNameFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("La URL de base de datos no es válida.");
  }

  return decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
}

export function assertSafeTestDatabaseUrl(url: string): void {
  const name = databaseNameFromUrl(url);
  if (!name.endsWith("_test") || name === "personal_finance") {
    throw new Error(
      "DATABASE_URL_TEST debe apuntar a una base de tests (nombre terminado en _test), no a development."
    );
  }
}

export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST?.trim();

  if (!url) {
    throw new Error(
      "Falta DATABASE_URL_TEST. Los tests de integración no pueden usar la base de desarrollo. Ver apps/api/.env.example."
    );
  }

  assertSafeTestDatabaseUrl(url);
  return url;
}

export function applyTestDatabaseUrl(): string {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.PF_REQUIRE_TEST_DB = "1";
  return url;
}

export const JSON_BODY_LIMIT = "32kb";
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_GLOBAL_MAX = 120;
export const RATE_LIMIT_AI_MAX = 20;
export const RATE_LIMIT_LOGIN_MAX = 5;
export const SESSION_TTL_DAYS_DEFAULT = 7;
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME_DEFAULT = "pf_sid";
export const MIN_SESSION_SECRET_LENGTH = 32;

export function getWebOrigin(): string | null {
  const fromEnv = process.env.WEB_ORIGIN?.trim();

  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  if ((process.env.NODE_ENV ?? "development") === "production") {
    return null;
  }

  return "http://localhost:3000";
}

export function assertProductionWebOrigin(
  env: NodeJS.ProcessEnv = process.env
): void {
  if ((env.NODE_ENV ?? "development") !== "production") {
    return;
  }
  const origin = env.WEB_ORIGIN?.trim();
  if (!origin) {
    throw new Error(
      "Falta WEB_ORIGIN. En production debe ser el origen exacto del frontend. Ver apps/api/.env.example."
    );
  }
}

export function getTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRUST_PROXY === "1";
}

export function getSessionCookieName(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.SESSION_COOKIE_NAME?.trim();
  return name && name.length > 0 ? name : SESSION_COOKIE_NAME_DEFAULT;
}

export function getSessionTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SESSION_TTL_DAYS?.trim();
  if (!raw) {
    return SESSION_TTL_DAYS_DEFAULT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
    throw new Error("SESSION_TTL_DAYS debe ser un entero entre 1 y 30.");
  }
  return parsed;
}

export function getSessionSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.SESSION_SECURE?.trim();
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  return (env.NODE_ENV ?? "development") === "production";
}

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      "Falta SESSION_SECRET (mínimo 32 caracteres). Ver apps/api/.env.example."
    );
  }
  return secret;
}

export function assertProductionSessionSecret(
  env: NodeJS.ProcessEnv = process.env
): void {
  if ((env.NODE_ENV ?? "development") !== "production") {
    return;
  }
  getSessionSecret(env);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV ?? "development",
  jsonBodyLimit: JSON_BODY_LIMIT,
  get databaseUrl(): string {
    return getDatabaseUrl();
  },
  get webOrigin(): string | null {
    return getWebOrigin();
  },
  get trustProxy(): boolean {
    return getTrustProxy();
  },
};

export const isProduction = config.nodeEnv === "production";
