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

export const config = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV ?? "development",
  get databaseUrl(): string {
    return getDatabaseUrl();
  },
  get webOrigin(): string | null {
    return getWebOrigin();
  },
};

export const isProduction = config.nodeEnv === "production";
