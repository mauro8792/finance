import { Router } from "express";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { BudgetController } from "./budget.controller.js";
import { PrismaBudgetRepository } from "./budget.repository.js";
import { BudgetService } from "./budget.service.js";

export function createBudgetRouter(controller: BudgetController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  return router;
}

export const budgetRouter = createBudgetRouter(
  new BudgetController(
    new BudgetService(
      new PrismaBudgetRepository(),
      new PrismaTransactionRepository(),
      new PrismaUserRepository(),
      new PrismaCategoryRepository()
    ),
    new PrismaUserRepository()
  )
);
