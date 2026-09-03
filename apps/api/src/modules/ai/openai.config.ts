import { OpenAIClientError } from "./openai.errors.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;

export function getOpenAIApiKey(
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new OpenAIClientError(
      "CONFIGURATION",
      "Falta OPENAI_API_KEY. Definí la variable de entorno en el backend. Ver apps/api/.env.example."
    );
  }
  return key;
}

export function getOpenAIModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.OPENAI_MODEL?.trim();
  if (!model) {
    throw new OpenAIClientError(
      "CONFIGURATION",
      "Falta OPENAI_MODEL. Definí el modelo server-side. No hay default en la spec."
    );
  }
  return model;
}

export function getOpenAITimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInteger(env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "OPENAI_TIMEOUT_MS");
}

export function getOpenAIMaxRetries(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInteger(env.OPENAI_MAX_RETRIES, DEFAULT_MAX_RETRIES, "OPENAI_MAX_RETRIES", true);
}

function readPositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  allowZero = false
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new OpenAIClientError(
      "CONFIGURATION",
      `${name} debe ser un entero ${allowZero ? "mayor o igual a 0" : "positivo"}.`
    );
  }
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value < 1)) {
    throw new OpenAIClientError(
      "CONFIGURATION",
      `${name} debe ser un entero ${allowZero ? "mayor o igual a 0" : "positivo"}.`
    );
  }
  return value;
}
