import type { Category as PrismaCategory } from "@prisma/client";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  Category,
  CategoryRepository,
  CategoryType,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.types.js";

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    const record = await this.prisma.category.create({
      data: {
        userId: input.userId,
        name: input.name,
        type: input.type,
        ...(input.isSystem !== undefined ? { isSystem: input.isSystem } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toCategory(record);
  }

  async findById(id: string): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({ where: { id } });
    return record ? toCategory(record) : null;
  }

  async findByUserId(userId: string): Promise<Category[]> {
    const records = await this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    return records.map(toCategory);
  }

  async findByUserIdAndName(
    userId: string,
    name: string
  ): Promise<Category | null> {
    const record = await this.prisma.category.findUnique({
      where: { userId_name: { userId, name } },
    });
    return record ? toCategory(record) : null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const record = await this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toCategory(record);
  }
}

function toCategory(record: PrismaCategory): Category {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    type: record.type as CategoryType,
    isSystem: record.isSystem,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
