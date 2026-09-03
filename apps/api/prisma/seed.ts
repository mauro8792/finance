import { ensureSystemExpenseCategories } from "../src/modules/categories/ensure-system-categories.js";
import { PrismaCategoryRepository } from "../src/modules/categories/category.repository.js";
import { PrismaUserRepository } from "../src/modules/users/user.repository.js";
import { UserService } from "../src/modules/users/user.service.js";
import { getPrismaClient } from "../src/shared/db/prisma.js";

async function seed(): Promise<void> {
  const users = new PrismaUserRepository();
  const categories = new PrismaCategoryRepository();

  let user = await users.findFirst();

  if (!user) {
    user = await new UserService(users).create({ name: "Usuario demo" });
    console.log(
      `Seed: created demo user (${user.id}). Password unusable until auth:bootstrap.`
    );
  } else {
    console.log(`Seed: user already exists (${user.id}); not creating another.`);
  }

  const result = await ensureSystemExpenseCategories({
    users,
    categories,
  });

  console.log(
    `Seed: system expense categories ready (created ${result.createdNames.length}, total ${result.expectedTotal})`
  );
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrismaClient().$disconnect();
  });
