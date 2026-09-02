import type { Account as PrismaAccount } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  Account,
  AccountRepository,
  AccountType,
  CreateAccountInput,
  UpdateAccountInput,
} from "./account.types.js";

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateAccountInput): Promise<Account> {
    const record = await this.prisma.account.create({
      data: {
        userId: input.userId,
        name: input.name,
        currency: input.currency,
        type: input.type,
        ...(input.initialBalance !== undefined
          ? { initialBalance: input.initialBalance }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toAccount(record);
  }

  async findById(id: string): Promise<Account | null> {
    const record = await this.prisma.account.findUnique({ where: { id } });
    return record ? toAccount(record) : null;
  }

  async findByUserId(userId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    return records.map(toAccount);
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const record = await this.prisma.account.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toAccount(record);
  }
}

function toAccount(record: PrismaAccount): Account {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    currency: record.currency as Currency,
    type: record.type as AccountType,
    initialBalance: record.initialBalance.toFixed(2),
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
