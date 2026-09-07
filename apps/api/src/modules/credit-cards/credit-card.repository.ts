import type { CreditCard as PrismaCreditCard } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardFeeStatus,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "./credit-card.types.js";

export class PrismaCreditCardRepository implements CreditCardRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    const isPrimary = input.isPrimary === true;

    const record = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.creditCard.updateMany({
          where: { userId: input.userId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.creditCard.create({
        data: {
          userId: input.userId,
          name: input.name,
          issuer: input.issuer,
          brand: input.brand,
          currency: input.currency,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          isPrimary,
          closingDay: input.closingDay === undefined ? null : input.closingDay,
          dueDay: input.dueDay === undefined ? null : input.dueDay,
          ...(input.feeStatus !== undefined ? { feeStatus: input.feeStatus } : {}),
        },
      });
    });

    return toCreditCard(record);
  }

  async findById(id: string): Promise<CreditCard | null> {
    const record = await this.prisma.creditCard.findUnique({ where: { id } });
    return record ? toCreditCard(record) : null;
  }

  async findByUserId(userId: string): Promise<CreditCard[]> {
    const records = await this.prisma.creditCard.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return records.map(toCreditCard);
  }

  async update(id: string, input: UpdateCreditCardInput): Promise<CreditCard> {
    const record = await this.prisma.creditCard.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        ...(input.closingDay !== undefined ? { closingDay: input.closingDay } : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        ...(input.feeStatus !== undefined ? { feeStatus: input.feeStatus } : {}),
      },
    });
    return toCreditCard(record);
  }

  async setPrimary(userId: string, id: string): Promise<CreditCard> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.creditCard.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.creditCard.update({
        where: { id },
        data: { isPrimary: true },
      });
    });
    return toCreditCard(record);
  }
}

function toCreditCard(record: PrismaCreditCard): CreditCard {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    issuer: record.issuer,
    brand: record.brand,
    currency: record.currency as Currency,
    isActive: record.isActive,
    isPrimary: record.isPrimary,
    closingDay: record.closingDay,
    dueDay: record.dueDay,
    feeStatus: record.feeStatus as CreditCardFeeStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
