import type { ErrorRequestHandler } from "express";
import type { ApiErrorBody } from "shared";
import { isProduction } from "../config/index.js";
import { AppError } from "../shared/errors/app-error.js";

type HttpError = {
  status?: number;
  statusCode?: number;
  message?: string;
  stack?: string;
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  const error = err as HttpError;
  const status = error.status ?? error.statusCode ?? 500;
  const safeStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;

  const message =
    safeStatus === 500 && isProduction
      ? "Error interno del servidor."
      : error.message || "Error interno del servidor.";

  const errorBody: ApiErrorBody = {
    code: safeStatus === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
    message,
  };

  res.status(safeStatus).json({
    error:
      isProduction || !error.stack
        ? errorBody
        : { ...errorBody, stack: error.stack },
  });
};
