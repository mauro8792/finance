import type { RequestHandler } from "express";
import { getWebOrigin } from "../config/index.js";
import { readCookie } from "../modules/auth/session-cookie.js";
import { AppError } from "../shared/errors/app-error.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const csrfOriginMiddleware: RequestHandler = (req, _res, next) => {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const allowed = getWebOrigin();
  const hasSessionCookie = Boolean(readCookie(req));

  if (origin) {
    if (!allowed || origin !== allowed) {
      next(new AppError("CSRF_REJECTED", "Origen no permitido.", 403));
      return;
    }
    next();
    return;
  }

  if (hasSessionCookie) {
    next(new AppError("CSRF_REJECTED", "Origen no permitido.", 403));
    return;
  }

  next();
};
