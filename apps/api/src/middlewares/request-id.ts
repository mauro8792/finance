import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const INCOMING_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const value = raw?.trim() ?? "";
  if (INCOMING_ID.test(value)) {
    return value;
  }
  return randomUUID();
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = resolveRequestId(req.headers["x-request-id"]);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
