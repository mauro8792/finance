import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  DEFAULT_USER_TIMEZONE,
  type CreateUserInput,
  type User,
  type UserAuthRecord,
  type UserRepository,
} from "../users/user.types.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.types.js";
import { DEFAULT_EXPENSE_CATEGORY_NAMES } from "./category.types.js";
import { ensureSystemExpenseCategories } from "./ensure-system-categories.js";

function categoryFingerprint(category: Category): string {
  return [
    category.id,
    category.userId,
    category.name,
    category.type,
    String(category.isSystem),
    String(category.isActive),
    category.createdAt.toISOString(),
    category.updatedAt.toISOString(),
  ].join("|");
}

class MemoryUsers implements UserRepository {
  readonly items: User[] = [];

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      name: input.name,
      email: input.email ?? `qa-${randomUUID()}@invalid.local`,
      timezone: input.timezone ?? DEFAULT_USER_TIMEZONE,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findFirst(): Promise<User | null> {
    return this.items[0] ?? null;
  }

  async findAuthByEmail(): Promise<UserAuthRecord | null> {
    return null;
  }

  async count(): Promise<number> {
    return this.items.length;
  }

  async setCredentials(userId: string, email: string): Promise<User> {
    const index = this.items.findIndex((item) => item.id === userId);
    if (index < 0) {
      throw new Error("missing");
    }
    const updated = { ...this.items[index]!, email };
    this.items[index] = updated;
    return updated;
  }
}

class MemoryCategories implements CategoryRepository {
  readonly items = new Map<string, Category>();
  createCalls = 0;
  updateCalls = 0;

  async create(input: CreateCategoryInput): Promise<Category> {
    this.createCalls += 1;
    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      isSystem: input.isSystem ?? false,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(category.id, category);
    return category;
  }

  async findById(id: string): Promise<Category | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Category[]> {
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async findByUserIdAndName(
    userId: string,
    name: string
  ): Promise<Category | null> {
    return (
      [...this.items.values()].find(
        (item) => item.userId === userId && item.name === name
      ) ?? null
    );
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    this.updateCalls += 1;
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated: Category = {
      ...current,
      ...input,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }
}

const DB = "postgresql://u:p@localhost:5432/personal_finance";

test("ensure-system-categories fails with 0 users", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  await assert.rejects(
    () =>
      ensureSystemExpenseCategories({
        users,
        categories,
        databaseUrl: DB,
      }),
    /Encontrados: 0/
  );
  assert.equal(categories.createCalls, 0);
});

test("ensure-system-categories fails with more than 1 user", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  await users.create({ name: "A", email: "a@example.test" });
  await users.create({ name: "B", email: "b@example.test" });
  await assert.rejects(
    () =>
      ensureSystemExpenseCategories({
        users,
        categories,
        databaseUrl: DB,
      }),
    /Encontrados: 2/
  );
  assert.equal(categories.createCalls, 0);
});

test("ensure-system-categories creates all catalog rows for empty user", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  const user = await users.create({ name: "Prod", email: "prod@example.test" });

  const result = await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });

  assert.equal(result.userId, user.id);
  assert.equal(result.createdNames.length, DEFAULT_EXPENSE_CATEGORY_NAMES.length);
  assert.equal(result.existingNames.length, 0);
  assert.equal(result.missingNames.length, DEFAULT_EXPENSE_CATEGORY_NAMES.length);
  assert.equal(categories.createCalls, DEFAULT_EXPENSE_CATEGORY_NAMES.length);
  assert.equal(categories.updateCalls, 0);

  for (const name of DEFAULT_EXPENSE_CATEGORY_NAMES) {
    const row = await categories.findByUserIdAndName(user.id, name);
    assert.ok(row);
    assert.equal(row.type, "EXPENSE");
    assert.equal(row.isSystem, true);
    assert.equal(row.isActive, true);
  }
});

test("ensure-system-categories creates only missing names", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  const user = await users.create({ name: "Prod", email: "prod@example.test" });
  await categories.create({
    userId: user.id,
    name: "Comida",
    type: "EXPENSE",
    isSystem: true,
    isActive: true,
  });
  await categories.create({
    userId: user.id,
    name: "Nafta",
    type: "EXPENSE",
    isSystem: true,
    isActive: true,
  });
  const createCallsBefore = categories.createCalls;

  const result = await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });

  assert.deepEqual(result.existingNames, ["Comida", "Nafta"]);
  assert.equal(
    result.createdNames.length,
    DEFAULT_EXPENSE_CATEGORY_NAMES.length - 2
  );
  assert.equal(
    categories.createCalls - createCallsBefore,
    DEFAULT_EXPENSE_CATEGORY_NAMES.length - 2
  );
  assert.ok(!result.createdNames.includes("Comida"));
  assert.ok(!result.createdNames.includes("Nafta"));
});

test("ensure-system-categories is idempotent when all exist", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  await users.create({ name: "Prod", email: "prod@example.test" });

  await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });
  const createCallsAfterFirst = categories.createCalls;

  const second = await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });

  assert.equal(second.createdNames.length, 0);
  assert.equal(second.existingNames.length, DEFAULT_EXPENSE_CATEGORY_NAMES.length);
  assert.equal(second.missingNames.length, 0);
  assert.equal(categories.createCalls, createCallsAfterFirst);
  assert.equal(categories.updateCalls, 0);
});

test("ensure-system-categories skips existing isSystem=false without mutating", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  const user = await users.create({ name: "Prod", email: "prod@example.test" });
  const manual = await categories.create({
    userId: user.id,
    name: "Otros",
    type: "EXPENSE",
    isSystem: false,
    isActive: true,
  });
  const before = categoryFingerprint(manual);

  const result = await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });

  const after = await categories.findByUserIdAndName(user.id, "Otros");
  assert.ok(after);
  assert.equal(categoryFingerprint(after), before);
  assert.ok(result.existingNames.includes("Otros"));
  assert.ok(!result.createdNames.includes("Otros"));
  assert.equal(categories.updateCalls, 0);
});

test("ensure-system-categories skips existing inactive without reactivating", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  const user = await users.create({ name: "Prod", email: "prod@example.test" });
  const inactive = await categories.create({
    userId: user.id,
    name: "Gym",
    type: "EXPENSE",
    isSystem: true,
    isActive: false,
  });
  const before = categoryFingerprint(inactive);

  const result = await ensureSystemExpenseCategories({
    users,
    categories,
    databaseUrl: DB,
  });

  const after = await categories.findByUserIdAndName(user.id, "Gym");
  assert.ok(after);
  assert.equal(after.isActive, false);
  assert.equal(categoryFingerprint(after), before);
  assert.ok(result.existingNames.includes("Gym"));
  assert.ok(!result.createdNames.includes("Gym"));
  assert.equal(categories.updateCalls, 0);
});

test("ensure-system-categories dry-run writes nothing", async () => {
  const users = new MemoryUsers();
  const categories = new MemoryCategories();
  await users.create({ name: "Prod", email: "prod@example.test" });

  const result = await ensureSystemExpenseCategories({
    dryRun: true,
    users,
    categories,
    databaseUrl: DB,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.createdNames.length, 0);
  assert.equal(result.missingNames.length, DEFAULT_EXPENSE_CATEGORY_NAMES.length);
  assert.equal(categories.createCalls, 0);
  assert.equal(categories.updateCalls, 0);
  assert.equal(categories.items.size, 0);
  assert.match(result.dbTarget, /personal_finance @ localhost/);
});
