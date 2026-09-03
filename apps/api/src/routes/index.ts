import { Router } from "express";
import { accountRouter } from "../modules/accounts/account.routes.js";
import { budgetRouter } from "../modules/budgets/budget.routes.js";
import { categoryRouter } from "../modules/categories/category.routes.js";
import { currencyExchangeRouter } from "../modules/currency-exchanges/currency-exchange.routes.js";
import { financialRouter } from "../modules/financial/financial.routes.js";
import { housingRouter } from "../modules/housing/housing.routes.js";
import { investmentRouter } from "../modules/investments/investment.routes.js";
import { simulationRouter } from "../modules/simulations/simulation.routes.js";
import { aiRouter } from "../modules/ai/ai.routes.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import {
  transactionRouter,
  transferRouter,
} from "../modules/transactions/transaction.routes.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { healthRouter } from "./health.js";

export const router = Router();

router.use(healthRouter);
router.use("/api/auth", authRouter);
router.use("/api", requireAuth);
router.use("/api/accounts", accountRouter);
router.use("/api/categories", categoryRouter);
router.use("/api/transactions", transactionRouter);
router.use("/api/transfers", transferRouter);
router.use("/api/currency-exchanges", currencyExchangeRouter);
router.use("/api/financial", financialRouter);
router.use("/api/budgets", budgetRouter);
router.use("/api/housing", housingRouter);
router.use("/api/investments", investmentRouter);
router.use("/api/simulations", simulationRouter);
router.use("/api/ai", aiRouter);
