import { Router } from "express";
import { PrismaAccountRepository } from "../accounts/account.repository.js";
import { AccountService } from "../accounts/account.service.js";
import { PrismaCategoryRepository } from "../categories/category.repository.js";
import { CategoryService } from "../categories/category.service.js";
import { FinancialService } from "../financial/financial.service.js";
import { PrismaHousingObligationRepository } from "../housing/housing.repository.js";
import { HousingService } from "../housing/housing.service.js";
import { SimulationService } from "../simulations/simulation.service.js";
import { PrismaTransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { AiAssistantService } from "./ai-assistant.service.js";
import { AiController } from "./ai.controller.js";
import { OpenAIClient } from "./openai.client.js";
import { AiToolRegistry } from "./tools/ai-tool.registry.js";
import type { AiToolServices } from "./tools/ai-tool.types.js";
import { TransactionParserService } from "./transaction-parser.service.js";

export function createAiRouter(controller: AiController): Router {
  const router = Router();
  router.post("/parse-transaction", controller.parseTransaction);
  router.post("/chat", controller.chat);
  return router;
}

const users = new PrismaUserRepository();
const categoryRepository = new PrismaCategoryRepository();
const accountRepository = new PrismaAccountRepository();
const transactionRepository = new PrismaTransactionRepository();
const housingRepository = new PrismaHousingObligationRepository();

const categories = new CategoryService(categoryRepository);
const accounts = new AccountService(accountRepository, transactionRepository);
const transactions = new TransactionService(
  transactionRepository,
  accountRepository,
  categoryRepository
);
const financial = new FinancialService(transactionRepository, accountRepository);
const housing = new HousingService(
  housingRepository,
  accountRepository,
  transactionRepository
);
const simulations = new SimulationService(financial, housing);

const toolServices: AiToolServices = {
  financial,
  transactions,
  categories,
  accounts,
  housing,
  simulations,
};

export const aiRouter = createAiRouter(
  new AiController(
    {
      parse(text, allowedCategories) {
        return new TransactionParserService(new OpenAIClient()).parse(
          text,
          allowedCategories
        );
      },
    },
    categories,
    users,
    {
      ask(message, context) {
        const registry = new AiToolRegistry(toolServices, context);
        return new AiAssistantService(new OpenAIClient(), registry, {
          now: () => new Date(),
          timeZone: context.timeZone,
        }).ask(message);
      },
    }
  )
);
