import { Router } from "express";
import { CreditCardPromotionController } from "./credit-card-promotion.controller.js";
import { PrismaCreditCardPromotionRepository } from "./credit-card-promotion.repository.js";
import { CreditCardPromotionService } from "./credit-card-promotion.service.js";

export function createCreditCardPromotionRouter(
  controller: CreditCardPromotionController
): Router {
  const router = Router();
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  router.post("/:id/preview", controller.preview);
  router.post("/:id/apply", controller.apply);
  return router;
}

const promotionRepo = new PrismaCreditCardPromotionRepository();

export const creditCardPromotionRouter = createCreditCardPromotionRouter(
  new CreditCardPromotionController(
    new CreditCardPromotionService(promotionRepo)
  )
);
