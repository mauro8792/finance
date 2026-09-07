import { Router } from "express";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { CreditCardController } from "./credit-card.controller.js";
import { PrismaCreditCardRepository } from "./credit-card.repository.js";
import { CreditCardService } from "./credit-card.service.js";

export function createCreditCardRouter(controller: CreditCardController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  router.post("/:id/set-primary", controller.setPrimary);
  router.get("/:id/current-debt", controller.currentDebt);
  router.get("/:id/commitments", controller.commitments);
  return router;
}

export const creditCardRouter = createCreditCardRouter(
  new CreditCardController(
    new CreditCardService(
      new PrismaCreditCardRepository(),
      new PrismaTransactionRepository(),
      new PrismaCreditCardPurchaseRepository()
    )
  )
);
