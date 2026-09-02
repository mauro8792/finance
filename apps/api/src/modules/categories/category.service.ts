import { AppError } from "../../shared/errors/app-error.js";
import {
  CATEGORY_TYPES,
  type Category,
  type CategoryRepository,
  type CategoryType,
  type UpdateCategoryInput,
} from "./category.types.js";

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async list(userId: string): Promise<Category[]> {
    return this.categories.findByUserId(userId);
  }

  async create(
    userId: string,
    input: { name: string; type: CategoryType }
  ): Promise<Category> {
    const name = normalizeName(input.name);
    const type = requireCategoryType(input.type);

    await this.assertNameAvailable(userId, name);

    return this.categories.create({
      userId,
      name,
      type,
      isSystem: false,
      isActive: true,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryInput
  ): Promise<Category> {
    const category = await this.requireOwned(userId, id);
    const patch: UpdateCategoryInput = {};

    if (input.name !== undefined) {
      const name = normalizeName(input.name);
      if (name !== category.name) {
        await this.assertNameAvailable(userId, name);
      }
      patch.name = name;
    }

    if (input.type !== undefined) {
      patch.type = requireCategoryType(input.type);
    }

    if (input.isActive !== undefined) {
      patch.isActive = input.isActive;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Debe enviarse al menos un campo para actualizar.",
        400
      );
    }

    return this.categories.update(id, patch);
  }

  private async requireOwned(userId: string, id: string): Promise<Category> {
    const category = await this.categories.findById(id);

    if (!category || category.userId !== userId) {
      throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
    }

    return category;
  }

  private async assertNameAvailable(userId: string, name: string): Promise<void> {
    const existing = await this.categories.findByUserIdAndName(userId, name);

    if (existing) {
      throw new AppError(
        "CATEGORY_NAME_TAKEN",
        "Ya existe una categoría con ese nombre.",
        409
      );
    }
  }
}

function normalizeName(name: string): string {
  const value = name.trim();

  if (!value) {
    throw new AppError("VALIDATION_ERROR", "El nombre es obligatorio.", 400);
  }

  if (value.length > 120) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El nombre no puede superar 120 caracteres.",
      400
    );
  }

  return value;
}

function requireCategoryType(type: string): CategoryType {
  if ((CATEGORY_TYPES as readonly string[]).includes(type)) {
    return type as CategoryType;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "El tipo de categoría debe ser EXPENSE, INCOME o BOTH.",
    400
  );
}
