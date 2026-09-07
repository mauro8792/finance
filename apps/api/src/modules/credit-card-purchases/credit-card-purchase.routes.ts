import { Router } from "express";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { CreditCardPurchaseController } from "./credit-card-purchase.controller.js";
import { PrismaCreditCardPurchaseRepository } from "./credit-card-purchase.repository.js";
import { CreditCardPurchaseService } from "./credit-card-purchase.service.js";

export function createCreditCardPurchaseRouter(
  controller: CreditCardPurchaseController
): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.post("/", controller.create);
  return router;
}

export const creditCardPurchaseRouter = createCreditCardPurchaseRouter(
  new CreditCardPurchaseController(
    new CreditCardPurchaseService(
      new PrismaCreditCardPurchaseRepository(),
      new PrismaCreditCardRepository(),
      new PrismaCategoryRepository()
    )
  )
);
