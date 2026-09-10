import { Router } from "express";
import { CreditCardRecurringChargeController } from "./credit-card-recurring-charge.controller.js";
import { PrismaCreditCardRecurringChargeRepository } from "./credit-card-recurring-charge.repository.js";
import { CreditCardRecurringChargeService } from "./credit-card-recurring-charge.service.js";

export function createCreditCardRecurringChargeRouter(
  controller: CreditCardRecurringChargeController
): Router {
  const router = Router();
  router.post("/", controller.create);
  router.get("/outlook", controller.outlook);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  router.post("/:id/confirm", controller.confirm);
  return router;
}

const recurringChargeRepo = new PrismaCreditCardRecurringChargeRepository();

export const creditCardRecurringChargeRouter =
  createCreditCardRecurringChargeRouter(
    new CreditCardRecurringChargeController(
      new CreditCardRecurringChargeService(recurringChargeRepo)
    )
  );
