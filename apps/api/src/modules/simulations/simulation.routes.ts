import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { FinancialService } from "../financial/financial.service.js";
import { PrismaHousingObligationRepository } from "../housing/housing.repository.js";
import { HousingService } from "../housing/housing.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { SimulationController } from "./simulation.controller.js";
import { SimulationService } from "./simulation.service.js";

export function createSimulationRouter(controller: SimulationController): Router {
  const router = Router();
  router.post("/", controller.create);
  return router;
}

const accounts = new PrismaAccountRepository();
const transactions = new PrismaTransactionRepository();

export const simulationRouter = createSimulationRouter(
  new SimulationController(
    new SimulationService(
      new FinancialService(transactions, accounts),
      new HousingService(
        new PrismaHousingObligationRepository(),
        accounts,
        transactions
      )
    ),
    new PrismaUserRepository()
  )
);
