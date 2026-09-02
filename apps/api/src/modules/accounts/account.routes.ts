import { Router } from "express";
import { PrismaUserRepository } from "../users/user.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { AccountController } from "./account.controller.js";
import { PrismaAccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";

export function createAccountRouter(controller: AccountController): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id/balance", controller.getBalance);
  router.post("/", controller.create);
  router.patch("/:id", controller.update);
  router.post("/:id/activate", controller.activate);
  router.post("/:id/deactivate", controller.deactivate);
  return router;
}

export const accountRouter = createAccountRouter(
  new AccountController(
    new AccountService(
      new PrismaAccountRepository(),
      new PrismaTransactionRepository()
    ),
    new PrismaUserRepository()
  )
);
