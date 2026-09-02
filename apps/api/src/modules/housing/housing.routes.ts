import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { HousingController } from "./housing.controller.js";
import { PrismaHousingObligationRepository } from "./housing.repository.js";
import { HousingService } from "./housing.service.js";

export function createHousingRouter(controller: HousingController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:id/coverage", controller.getCoverage);
  router.get("/:id/payments", controller.listPayments);
  router.post("/:id/payments", controller.registerPayment);
  router.get("/:id", controller.getById);
  router.patch("/:id", controller.update);
  return router;
}

export const housingRouter = createHousingRouter(
  new HousingController(
    new HousingService(
      new PrismaHousingObligationRepository(),
      new PrismaAccountRepository(),
      new PrismaTransactionRepository()
    ),
    new PrismaUserRepository()
  )
);
