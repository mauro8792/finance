import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaCreditCardRepository } from "../credit-cards/credit-card.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { TransactionController } from "./transaction.controller.js";
import { PrismaTransactionRepository } from "./transaction.repository.js";
import { TransactionService } from "./transaction.service.js";

export function createTransactionRouter(
  controller: TransactionController
): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/export", controller.exportCsv);
  router.post("/", controller.createExpense);
  router.patch("/:id", controller.update);
  router.post("/:id/void", controller.void);
  router.post("/:id/reimbursements", controller.registerReimbursement);
  return router;
}

export const transactionController = new TransactionController(
  new TransactionService(
    new PrismaTransactionRepository(),
    new PrismaAccountRepository(),
    new PrismaCategoryRepository(),
    new PrismaCreditCardRepository()
  ),
  new PrismaUserRepository()
);

export const transactionRouter = createTransactionRouter(transactionController);

export function createTransferRouter(controller: TransactionController): Router {
  const router = Router();
  router.post("/", controller.createTransfer);
  router.get("/", controller.listTransfers);
  router.get("/:id", controller.getTransfer);
  return router;
}

export const transferRouter = createTransferRouter(transactionController);
