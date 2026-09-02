import { Router } from "express";
import { HEALTH_STATUS_OK } from "shared";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: HEALTH_STATUS_OK });
});
