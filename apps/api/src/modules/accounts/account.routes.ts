import { Router } from "express";
import { PrismaUserRepository } from "../users/user.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaAccountBalanceReconciliationRepository } from "./account-balance-reconciliation.repository.js";
import { AccountBalanceReconciliationService } from "./account-balance-reconciliation.service.js";
import { AccountController } from "./account.controller.js";
import { PrismaAccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";

export function createAccountRouter(controller: AccountController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id/balance", controller.getBalance);
  router.post("/:id/reconcile-balance", controller.reconcileBalance);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  return router;
}

const accountRepo = new PrismaAccountRepository();
const txRepo = new PrismaTransactionRepository();
const reconciliationService = new AccountBalanceReconciliationService(
  new PrismaAccountBalanceReconciliationRepository(),
  accountRepo,
  txRepo
);

export const accountRouter = createAccountRouter(
  new AccountController(
    new AccountService(accountRepo, txRepo),
    new PrismaUserRepository(),
    reconciliationService
  )
);
