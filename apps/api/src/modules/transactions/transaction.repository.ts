import { Prisma, type Transaction as PrismaTransaction } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  CreateTransactionInput,
  FindTransactionsQuery,
  PaymentMethod,
  ReimbursementStatus,
  Transaction,
  TransactionRepository,
  TransactionStatus,
  TransactionType,
  UpdateTransactionRecord,
} from "./transaction.types.js";

export function toCreateData(input: CreateTransactionInput) {
  return {
    ...(input.id !== undefined ? { id: input.id } : {}),
    userId: input.userId,
    accountId: input.accountId,
    categoryId: input.categoryId ?? null,
    type: input.type,
    status: input.status ?? "ACTIVE",
    amount: input.amount,
    currency: input.currency,
    description: input.description ?? null,
    occurredAt: input.occurredAt,
    paymentMethod: input.paymentMethod ?? null,
    isFixed: input.isFixed ?? false,
    reimbursementStatus: input.reimbursementStatus ?? "NONE",
    relatedTransactionId: input.relatedTransactionId ?? null,
    ...(input.metadata != null
      ? { metadata: input.metadata as Prisma.InputJsonValue }
      : {}),
  };
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateTransactionInput): Promise<Transaction> {
    const record = await this.prisma.transaction.create({
      data: toCreateData(input),
    });

    return toTransaction(record);
  }

  async findByUserId(
    userId: string,
    query: FindTransactionsQuery = {}
  ): Promise<Transaction[]> {
    const records = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...(query.type !== undefined ? { type: query.type } : {}),
        ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
        ...(query.currency !== undefined ? { currency: query.currency } : {}),
        ...(query.accountId !== undefined ? { accountId: query.accountId } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.relatedTransactionId !== undefined
          ? { relatedTransactionId: query.relatedTransactionId }
          : {}),
        ...(query.occurredAtRanges !== undefined && query.occurredAtRanges.length > 0
          ? {
              OR: query.occurredAtRanges.map((range) => ({
                occurredAt: { gte: range.gte, lt: range.lt },
              })),
            }
          : query.occurredAtGte !== undefined || query.occurredAtLt !== undefined
            ? {
                occurredAt: {
                  ...(query.occurredAtGte !== undefined
                    ? { gte: query.occurredAtGte }
                    : {}),
                  ...(query.occurredAtLt !== undefined
                    ? { lt: query.occurredAtLt }
                    : {}),
                },
              }
            : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });

    return records.map(toTransaction);
  }

  async findById(id: string): Promise<Transaction | null> {
    const record = await this.prisma.transaction.findUnique({ where: { id } });
    return record ? toTransaction(record) : null;
  }

  async update(id: string, input: UpdateTransactionRecord): Promise<Transaction> {
    const record = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
        ...(input.paymentMethod !== undefined
          ? { paymentMethod: input.paymentMethod }
          : {}),
        ...(input.isFixed !== undefined ? { isFixed: input.isFixed } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.reimbursementStatus !== undefined
          ? { reimbursementStatus: input.reimbursementStatus }
          : {}),
      },
    });

    return toTransaction(record);
  }

  async createLinkedReimbursement(
    input: CreateTransactionInput & { relatedTransactionId: string },
    expense: { id: string; reimbursementStatus: ReimbursementStatus }
  ): Promise<Transaction> {
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: toCreateData({ ...input, relatedTransactionId: input.relatedTransactionId }),
      });

      await tx.transaction.update({
        where: { id: expense.id },
        data: { reimbursementStatus: expense.reimbursementStatus },
      });

      return created;
    });

    return toTransaction(record);
  }

  async createTransferPair(
    outgoing: CreateTransactionInput,
    incoming: CreateTransactionInput
  ): Promise<[Transaction, Transaction]> {
    const records = await this.prisma.$transaction(async (tx) => {
      const out = await tx.transaction.create({ data: toCreateData(outgoing) });
      const incomingLeg = await tx.transaction.create({
        data: toCreateData(incoming),
      });
      return [out, incomingLeg] as const;
    });

    return [toTransaction(records[0]), toTransaction(records[1])];
  }
}

export function toTransaction(record: PrismaTransaction): Transaction {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    categoryId: record.categoryId,
    type: record.type as TransactionType,
    status: record.status as TransactionStatus,
    amount: record.amount.toFixed(2),
    currency: record.currency as Currency,
    description: record.description,
    occurredAt: record.occurredAt,
    paymentMethod: record.paymentMethod as PaymentMethod | null,
    isFixed: record.isFixed,
    reimbursementStatus: record.reimbursementStatus as ReimbursementStatus,
    relatedTransactionId: record.relatedTransactionId,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
