import express, { type Express } from "express";
import { JSON_BODY_LIMIT, getTrustProxy } from "./config/index.js";
import { corsMiddleware } from "./middlewares/cors.js";
import { csrfOriginMiddleware } from "./middlewares/csrf.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { helmetMiddleware } from "./middlewares/helmet.js";
import { noStoreMiddleware } from "./middlewares/no-store.js";
import { notFoundHandler } from "./middlewares/not-found.js";
import {
  createAiRateLimiter,
  createGlobalApiRateLimiter,
  createLoginRateLimiter,
  defaultRateLimitOptions,
  type RateLimitOptions,
} from "./middlewares/rate-limit.js";
import { requestIdMiddleware } from "./middlewares/request-id.js";
import { requestLogMiddleware } from "./middlewares/request-log.js";
import { router } from "./routes/index.js";

export type CreateAppOptions = {
  trustProxy?: boolean;
  jsonLimit?: string;
  rateLimit?: RateLimitOptions | false;
};

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const trustProxy = options.trustProxy ?? getTrustProxy();
  const jsonLimit = options.jsonLimit ?? JSON_BODY_LIMIT;
  const rateLimit = options.rateLimit === false
    ? null
    : (options.rateLimit ?? defaultRateLimitOptions(trustProxy));

  if (trustProxy) {
    app.set("trust proxy", 1);
  }

  // trust proxy → requestId → helmet → cors → json 32kb → no-store → log → csrf
  // → /api rate limit → /api/ai → /api/auth/login → router (auth + requireAuth + /health)
  app.use(requestIdMiddleware);
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: jsonLimit }));
  app.use(noStoreMiddleware);
  app.use(requestLogMiddleware);
  app.use(csrfOriginMiddleware);
  if (rateLimit) {
    app.use("/api", createGlobalApiRateLimiter(rateLimit));
    app.use("/api/ai", createAiRateLimiter(rateLimit));
    app.use("/api/auth/login", createLoginRateLimiter(rateLimit));
  }
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
