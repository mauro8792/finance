import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import { CategoryService } from "./category.service.js";
import type {
  Category,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.types.js";

class MemoryCategoryRepository implements CategoryRepository {
  private readonly items = new Map<string, Category>();

  async create(input: CreateCategoryInput): Promise<Category> {
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
    return [...this.items.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
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

const userId = randomUUID();

test("CategoryService creates a category and lists it", async () => {
  const service = new CategoryService(new MemoryCategoryRepository());

  const created = await service.create(userId, {
    name: "Nafta",
    type: "EXPENSE",
  });
  const listed = await service.list(userId);

  assert.equal(created.name, "Nafta");
  assert.equal(created.type, "EXPENSE");
  assert.equal(created.isSystem, false);
  assert.equal(created.isActive, true);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
});

test("CategoryService rejects an empty name", async () => {
  const service = new CategoryService(new MemoryCategoryRepository());

  await assert.rejects(
    () => service.create(userId, { name: "  ", type: "EXPENSE" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CategoryService rejects a duplicate name for the same user", async () => {
  const service = new CategoryService(new MemoryCategoryRepository());
  await service.create(userId, { name: "Gym", type: "EXPENSE" });

  await assert.rejects(
    () => service.create(userId, { name: "Gym", type: "EXPENSE" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CATEGORY_NAME_TAKEN" &&
      error.statusCode === 409
  );
});

test("CategoryService updates isActive and hides other users", async () => {
  const repository = new MemoryCategoryRepository();
  const service = new CategoryService(repository);
  const otherUserId = randomUUID();

  const created = await service.create(userId, {
    name: "Ocio",
    type: "EXPENSE",
  });
  await service.create(otherUserId, { name: "Ocio", type: "EXPENSE" });

  const updated = await service.update(userId, created.id, { isActive: false });
  assert.equal(updated.isActive, false);

  await assert.rejects(
    () => service.update(otherUserId, created.id, { name: "Otro" }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 404
  );

  const listed = await service.list(userId);
  assert.equal(listed.length, 1);
});

test("CategoryService rejects an empty update", async () => {
  const service = new CategoryService(new MemoryCategoryRepository());
  const created = await service.create(userId, {
    name: "Salud",
    type: "EXPENSE",
  });

  await assert.rejects(
    () => service.update(userId, created.id, {}),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});
