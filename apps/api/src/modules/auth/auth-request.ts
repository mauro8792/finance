import type { Request } from "express";
import { AppError } from "../../shared/errors/app-error.js";

export function getAuthUserId(req: Request): string {
  const userId = req.auth?.userId;
  if (!userId) {
    throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
  }
  return userId;
}

export function getAuthSessionId(req: Request): string {
  const sessionId = req.auth?.sessionId;
  if (!sessionId) {
    throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
  }
  return sessionId;
}
