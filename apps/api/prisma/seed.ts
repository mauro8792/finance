import { DEFAULT_EXPENSE_CATEGORY_NAMES } from "../src/modules/categories/category.types.js";
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

  let created = 0;

  for (const name of DEFAULT_EXPENSE_CATEGORY_NAMES) {
    const existing = await categories.findByUserIdAndName(user.id, name);

    if (existing) {
      continue;
    }

    await categories.create({
      userId: user.id,
      name,
      type: "EXPENSE",
      isSystem: true,
      isActive: true,
    });
    created += 1;
  }

  console.log(
    `Seed: system expense categories ready (created ${created}, total ${DEFAULT_EXPENSE_CATEGORY_NAMES.length})`
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
