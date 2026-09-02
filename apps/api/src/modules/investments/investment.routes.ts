import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { InvestmentController } from "./investment.controller.js";
import { PrismaInvestmentRepository } from "./investment.repository.js";
import { InvestmentService } from "./investment.service.js";

export function createInvestmentRouter(controller: InvestmentController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.createCaucion);
  router.post("/:id/mature", controller.mature);
  router.post("/:id/renew", controller.renew);
  return router;
}

export const investmentRouter = createInvestmentRouter(
  new InvestmentController(
    new InvestmentService(
      new PrismaInvestmentRepository(),
      new PrismaAccountRepository(),
      new PrismaTransactionRepository()
    ),
    new PrismaUserRepository()
  )
);
