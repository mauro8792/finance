import type { FinancialService } from "../../financial/financial.service.js";
import type { HousingService } from "../../housing/housing.service.js";
import type { AccountService } from "../../accounts/account.service.js";
import type { CategoryService } from "../../categories/category.service.js";
import type { TransactionService } from "../../transactions/transaction.service.js";
import type { SimulationService } from "../../simulations/simulation.service.js";
import type { AllowedToolName } from "./ai-tool.schemas.js";

export type AiToolContext = {
  userId: string;
  timeZone: string;
};

export type AiToolServices = {
  financial: Pick<FinancialService, "getFinancialSummary">;
  transactions: Pick<TransactionService, "list">;
  categories: Pick<CategoryService, "list">;
  accounts: Pick<AccountService, "list" | "getBalance">;
  housing: Pick<HousingService, "list" | "getCoverage">;
  simulations: Pick<
    SimulationService,
    "simulateMonthsWithoutIncome" | "simulateNewJobScenario" | "simulateHousingReserve"
  >;
};

export type AiToolDefinition = {
  type: "function";
  name: AllowedToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export type AiToolSuccess = {
  ok: true;
  data: unknown;
};

export type AiToolFailure = {
  ok: false;
  error: string;
};

export type AiToolResult = AiToolSuccess | AiToolFailure;
