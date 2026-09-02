import type { User as PrismaUser } from "@prisma/client";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type { CreateUserInput, User, UserRepository } from "./user.types.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateUserInput): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    });

    return toUser(record);
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? toUser(record) : null;
  }

  async findFirst(): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
    });
    return record ? toUser(record) : null;
  }
}

function toUser(record: PrismaUser): User {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    timezone: record.timezone,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
