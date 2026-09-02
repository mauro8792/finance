import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import type { UserRepository } from "../users/user.types.js";
import {
  CategoryIdParamsSchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} from "./category.schema.js";
import type { CategoryService } from "./category.service.js";
import type { Category } from "./category.types.js";

export class CategoryController {
  constructor(
    private readonly categories: CategoryService,
    private readonly users: UserRepository
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const items = await this.categories.list(userId);
    res.status(200).json(items.map(toCategoryResponse));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const body = parseBody(CreateCategorySchema, req.body);
    const created = await this.categories.create(userId, body);
    res.status(201).json(toCategoryResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = await this.requireUserId();
    const { id } = parseBody(CategoryIdParamsSchema, req.params);
    const body = parseBody(UpdateCategorySchema, req.body);
    const updated = await this.categories.update(userId, id, body);
    res.status(200).json(toCategoryResponse(updated));
  };

  private async requireUserId(): Promise<string> {
    const user = await this.users.findFirst();

    if (!user) {
      throw new AppError(
        "USER_NOT_CONFIGURED",
        "No hay un usuario configurado.",
        500
      );
    }

    return user.id;
  }
}

function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Solicitud inválida.",
      400
    );
  }

  return parsed.data;
}

function toCategoryResponse(category: Category) {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    type: category.type,
    isSystem: category.isSystem,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
