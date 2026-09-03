import { databaseNameFromUrl, getDatabaseUrl } from "../../config/index.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import type { UserRepository } from "../users/user.types.js";
import { PrismaCategoryRepository } from "./category.repository.js";
import {
  DEFAULT_EXPENSE_CATEGORY_NAMES,
  type CategoryRepository,
} from "./category.types.js";

export type EnsureSystemCategoriesResult = {
  dryRun: boolean;
  dbTarget: string;
  userCount: number;
  userId: string;
  expectedTotal: number;
  existingNames: string[];
  missingNames: string[];
  createdNames: string[];
};

export function describeDatabaseTarget(url: string): string {
  try {
    const host = new URL(url).hostname;
    const name = databaseNameFromUrl(url);
    return `${name} @ ${host}`;
  } catch {
    return "(DATABASE_URL inválida)";
  }
}

export async function ensureSystemExpenseCategories(options: {
  dryRun?: boolean;
  users?: UserRepository;
  categories?: CategoryRepository;
  databaseUrl?: string;
}): Promise<EnsureSystemCategoriesResult> {
  const dryRun = options.dryRun === true;
  const users = options.users ?? new PrismaUserRepository();
  const categories = options.categories ?? new PrismaCategoryRepository();
  const dbTarget = describeDatabaseTarget(
    options.databaseUrl ?? getDatabaseUrl()
  );

  const userCount = await users.count();
  if (userCount === 0) {
    throw new Error(
      "Ensure system categories requiere exactamente 1 usuario. Encontrados: 0. FAIL FAST: no se escribió nada."
    );
  }
  if (userCount > 1) {
    throw new Error(
      `Ensure system categories requiere exactamente 1 usuario. Encontrados: ${userCount}. FAIL FAST: no se escribió nada.`
    );
  }

  const user = await users.findFirst();
  if (!user) {
    throw new Error(
      "Ensure system categories no encontró el usuario único. FAIL FAST: no se escribió nada."
    );
  }

  const existingNames: string[] = [];
  const missingNames: string[] = [];
  const createdNames: string[] = [];

  for (const name of DEFAULT_EXPENSE_CATEGORY_NAMES) {
    const existing = await categories.findByUserIdAndName(user.id, name);
    if (existing) {
      existingNames.push(name);
      continue;
    }
    missingNames.push(name);
    if (!dryRun) {
      await categories.create({
        userId: user.id,
        name,
        type: "EXPENSE",
        isSystem: true,
        isActive: true,
      });
      createdNames.push(name);
    }
  }

  return {
    dryRun,
    dbTarget,
    userCount,
    userId: user.id,
    expectedTotal: DEFAULT_EXPENSE_CATEGORY_NAMES.length,
    existingNames,
    missingNames,
    createdNames,
  };
}

export function formatEnsureSystemCategoriesReport(
  result: EnsureSystemCategoriesResult
): string {
  const mode = result.dryRun ? "DRY-RUN (sin INSERT)" : "APPLY";
  const lines = [
    `Ensure system categories — ${mode}`,
    `DB target: ${result.dbTarget}`,
    `Users: ${result.userCount}`,
    `User id: ${result.userId}`,
    `Expected (catalog): ${result.expectedTotal}`,
    `Existing: ${result.existingNames.length}`,
    `Missing: ${result.missingNames.length}`,
  ];

  if (result.existingNames.length > 0) {
    lines.push(`Found: ${result.existingNames.join(", ")}`);
  } else {
    lines.push("Found: (none)");
  }

  if (result.missingNames.length > 0) {
    const verb = result.dryRun ? "Would create" : "Created";
    lines.push(`${verb}: ${result.missingNames.join(", ")}`);
  } else {
    lines.push(result.dryRun ? "Would create: (none)" : "Created: (none)");
  }

  if (!result.dryRun) {
    lines.push(
      `Summary: created ${result.createdNames.length}, already present ${result.existingNames.length}`
    );
  }

  return lines.join("\n");
}

export async function disconnectEnsureSystemCategories(): Promise<void> {
  await getPrismaClient().$disconnect();
}
