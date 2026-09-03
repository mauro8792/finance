import type { ErrorRequestHandler } from "express";
import type { ApiErrorBody } from "shared";
import { AppError } from "../shared/errors/app-error.js";

type HttpError = {
  status?: number;
  statusCode?: number;
  type?: string;
  name?: string;
  message?: string;
};

function publicErrorPayload(code: string, message: string): { error: ApiErrorBody } {
  return { error: { code, message } };
}

function isPayloadTooLarge(error: HttpError): boolean {
  return error.status === 413 || error.statusCode === 413 || error.type === "entity.too.large";
}

function isJsonParseError(error: HttpError): boolean {
  return error.type === "entity.parse.failed" || error.status === 400 && error.name === "SyntaxError";
}

function logInternalError(requestId: string | undefined, error: unknown): void {
  const err = error as HttpError;
  console.error(
    JSON.stringify({
      requestId: requestId ?? null,
      level: "error",
      status: 500,
      name: err.name ?? "Error",
    })
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(publicErrorPayload(err.code, err.message));
    return;
  }

  const error = err as HttpError;

  if (isPayloadTooLarge(error)) {
    res.status(413).json(
      publicErrorPayload(
        "PAYLOAD_TOO_LARGE",
        "El cuerpo de la solicitud es demasiado grande."
      )
    );
    return;
  }

  if (isJsonParseError(error)) {
    res.status(400).json(publicErrorPayload("VALIDATION_ERROR", "Solicitud inválida."));
    return;
  }

  logInternalError(req.requestId, err);
  res.status(500).json(
    publicErrorPayload("INTERNAL_ERROR", "Error interno del servidor.")
  );
};
