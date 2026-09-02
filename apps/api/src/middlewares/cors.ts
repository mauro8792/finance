import type { RequestHandler } from "express";
import { getWebOrigin } from "../config/index.js";

export const corsMiddleware: RequestHandler = (req, res, next) => {
  const allowed = getWebOrigin();
  const origin = req.headers.origin;

  if (allowed && origin === allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
};
