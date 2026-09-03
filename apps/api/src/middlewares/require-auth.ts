import type { RequestHandler } from "express";
import { AppError } from "../shared/errors/app-error.js";
import { readCookie } from "../modules/auth/session-cookie.js";
import { SessionService } from "../modules/auth/session.service.js";

const sessions = new SessionService();

export function createRequireAuth(sessionService: SessionService = sessions): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = readCookie(req);
      const session = token ? await sessionService.findValidByToken(token) : null;
      if (!session) {
        throw new AppError("UNAUTHENTICATED", "Necesitás iniciar sesión.", 401);
      }
      const touched = await sessionService.touch(session);
      req.auth = { userId: touched.userId, sessionId: touched.id };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAuth = createRequireAuth();

export function stubAuth(userId: string, sessionId = "test-session"): RequestHandler {
  return (req, _res, next) => {
    req.auth = { userId, sessionId };
    next();
  };
}
