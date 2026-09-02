import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { CurrencyExchangeController } from "./currency-exchange.controller.js";
import { PrismaCurrencyExchangeRepository } from "./currency-exchange.repository.js";
import { CurrencyExchangeService } from "./currency-exchange.service.js";

export function createCurrencyExchangeRouter(
  controller: CurrencyExchangeController
): Router {
  const router = Router();
  router.post("/", controller.create);
  return router;
}

export const currencyExchangeRouter = createCurrencyExchangeRouter(
  new CurrencyExchangeController(
    new CurrencyExchangeService(
      new PrismaCurrencyExchangeRepository(),
      new PrismaAccountRepository(),
      new PrismaTransactionRepository()
    ),
    new PrismaUserRepository()
  )
);
