import type { RequestHandler } from "express";

export const requestLogMiddleware: RequestHandler = (req, res, next) => {
  const started = Date.now();
  const method = req.method;
  const path = req.path;
  const requestId = req.requestId;
  res.on("finish", () => {
    console.info(
      JSON.stringify({
        requestId,
        method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      })
    );
  });
  next();
};
