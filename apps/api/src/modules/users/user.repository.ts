import { randomUUID } from "node:crypto";
import type { User as PrismaUser } from "@prisma/client";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type { CreateUserInput, User, UserAuthRecord, UserRepository } from "./user.types.js";

const UNUSABLE_PASSWORD_HASH = "invalid";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateUserInput): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email?.trim().toLowerCase() || `qa-${randomUUID()}@invalid.local`,
        passwordHash: UNUSABLE_PASSWORD_HASH,
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

  async findAuthByEmail(email: string): Promise<UserAuthRecord | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!record) {
      return null;
    }
    return { user: toUser(record), passwordHash: record.passwordHash };
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }

  async setCredentials(userId: string, email: string, passwordHash: string): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id: userId },
      data: { email, passwordHash },
    });
    return toUser(record);
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
