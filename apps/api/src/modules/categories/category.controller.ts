import type { Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../../shared/errors/app-error.js";
import { getAuthUserId } from "../auth/auth-request.js";
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

  list = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const items = await this.categories.list(userId);
    res.status(200).json(items.map(toCategoryResponse));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const body = parseBody(CreateCategorySchema, req.body);
    const created = await this.categories.create(userId, body);
    res.status(201).json(toCategoryResponse(created));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthUserId(req);
    const { id } = parseBody(CategoryIdParamsSchema, req.params);
    const body = parseBody(UpdateCategorySchema, req.body);
    const updated = await this.categories.update(userId, id, body);
    res.status(200).json(toCategoryResponse(updated));
  };
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
