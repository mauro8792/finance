import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { FinancialController } from "./financial.controller.js";
import { FinancialService } from "./financial.service.js";

export function createFinancialRouter(controller: FinancialController): Router {
  const router = Router();
  router.get("/summary", controller.getSummary);
  return router;
}

export const financialRouter = createFinancialRouter(
  new FinancialController(
    new FinancialService(
      new PrismaTransactionRepository(),
      new PrismaAccountRepository()
    ),
    new PrismaUserRepository()
  )
);
