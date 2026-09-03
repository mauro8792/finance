import type { RequestHandler } from "express";

export const noStoreMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};
