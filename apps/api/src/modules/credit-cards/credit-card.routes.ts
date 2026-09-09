import { Router } from "express";
import { CreditCardPaymentController } from "../credit-card-payments/credit-card-payment.controller.js";
import { PrismaCreditCardPaymentRepository } from "../credit-card-payments/credit-card-payment.repository.js";
import { CreditCardPaymentService } from "../credit-card-payments/credit-card-payment.service.js";
import { PrismaCreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.repository.js";
import { CreditCardStatementController } from "../credit-card-statements/credit-card-statement.controller.js";
import { PrismaCreditCardStatementRepository } from "../credit-card-statements/credit-card-statement.repository.js";
import { CreditCardStatementService } from "../credit-card-statements/credit-card-statement.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { CreditCardController } from "./credit-card.controller.js";
import { PrismaCreditCardRepository } from "./credit-card.repository.js";
import { CreditCardService } from "./credit-card.service.js";

export function createCreditCardRouter(
  controller: CreditCardController,
  statements: CreditCardStatementController,
  payments: CreditCardPaymentController
): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  router.post("/:id/set-primary", controller.setPrimary);
  router.get("/:id/current-debt", controller.currentDebt);
  router.get("/:id/commitments", controller.commitments);
  router.get("/:id/statements", statements.list);
  router.post("/:id/statements/project", statements.project);
  router.get("/:id/statements/:statementId", statements.getById);
  router.post("/:id/statements/:statementId/close", statements.close);
  router.get("/:id/payments", payments.list);
  router.post("/:id/payments", payments.create);
  router.get("/:id/payments/:paymentId", payments.getById);
  return router;
}

const cardRepo = new PrismaCreditCardRepository();
const txRepo = new PrismaTransactionRepository();
const purchaseRepo = new PrismaCreditCardPurchaseRepository();
const statementRepo = new PrismaCreditCardStatementRepository();
const paymentRepo = new PrismaCreditCardPaymentRepository();

export const creditCardRouter = createCreditCardRouter(
  new CreditCardController(
    new CreditCardService(cardRepo, txRepo, purchaseRepo)
  ),
  new CreditCardStatementController(
    new CreditCardStatementService(
      statementRepo,
      cardRepo,
      txRepo,
      paymentRepo
    )
  ),
  new CreditCardPaymentController(
    new CreditCardPaymentService(paymentRepo, cardRepo, txRepo)
  )
);
