import type { Request, Response } from "express";
import type { ApiErrorResponse } from "shared";

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    error: {
      code: "NOT_FOUND",
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
    },
  };

  res.status(404).json(body);
}
