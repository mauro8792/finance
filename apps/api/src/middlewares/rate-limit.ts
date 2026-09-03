import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import {
  RATE_LIMIT_AI_MAX,
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_LOGIN_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../config/index.js";

// Memory store: válido para una instancia. Varias instancias (M10.6) necesitan store compartido.
// TRUST_PROXY=1 solo cuando hay un proxy real (Render). Sin eso, Express ignora X-Forwarded-For
// y express-rate-limit no valida ese header, para no permitir spoofing de IP.

export type RateLimitOptions = {
  windowMs: number;
  globalMax: number;
  aiMax: number;
  loginMax: number;
  trustProxy: boolean;
};

export const RATE_LIMIT_MESSAGE =
  "Demasiadas solicitudes. Probá de nuevo en unos minutos.";

function tooManyRequestsHandler(
  _req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1]
): void {
  res.status(429).json({
    error: {
      code: "RATE_LIMIT",
      message: RATE_LIMIT_MESSAGE,
    },
  });
}

export function createGlobalApiRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: options.trustProxy,
    },
    handler: tooManyRequestsHandler,
  });
}

export function createAiRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.aiMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: options.trustProxy,
    },
    handler: tooManyRequestsHandler,
  });
}

export function createLoginRateLimiter(options: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.loginMax,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: options.trustProxy,
    },
    handler: tooManyRequestsHandler,
  });
}

export function defaultRateLimitOptions(trustProxy: boolean): RateLimitOptions {
  return {
    windowMs: RATE_LIMIT_WINDOW_MS,
    globalMax: RATE_LIMIT_GLOBAL_MAX,
    aiMax: RATE_LIMIT_AI_MAX,
    loginMax: RATE_LIMIT_LOGIN_MAX,
    trustProxy,
  };
}
