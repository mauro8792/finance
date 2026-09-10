import { Router } from "express";
import { CreditCardRefundController } from "./credit-card-refund.controller.js";
import { PrismaCreditCardRefundRepository } from "./credit-card-refund.repository.js";
import { CreditCardRefundService } from "./credit-card-refund.service.js";

export function createCreditCardRefundRouter(
  controller: CreditCardRefundController
): Router {
  const router = Router();
  router.post("/expected", controller.createExpected);
  router.get("/expected", controller.listExpected);
  router.get("/expected/:id", controller.getExpected);
  router.post("/expected/:id/cancel", controller.cancelExpected);
  router.post("/accredit", controller.accredit);
  router.post("/accreditations/:id/void", controller.voidAccreditation);
  return router;
}

const refundRepo = new PrismaCreditCardRefundRepository();

export const creditCardRefundRouter = createCreditCardRefundRouter(
  new CreditCardRefundController(new CreditCardRefundService(refundRepo))
);
