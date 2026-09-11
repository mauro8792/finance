import type {
  AccountBalanceReconciliation as PrismaReconciliation,
  Prisma,
} from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { isUniqueViolation } from "../corrections/correction.repository.js";
import { toCreateData, toTransaction } from "../transactions/transaction.repository.js";
import type { Transaction } from "../transactions/transaction.types.js";
import type {
  AccountBalanceReconciliation,
  AccountBalanceReconciliationRepository,
  CreateReconciliationAtomicInput,
} from "./account-balance-reconciliation.types.js";

export class PrismaAccountBalanceReconciliationRepository
  implements AccountBalanceReconciliationRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<AccountBalanceReconciliation | null> {
    const record = await this.prisma.accountBalanceReconciliation.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    return record ? toReconciliation(record) : null;
  }

  async findById(id: string): Promise<AccountBalanceReconciliation | null> {
    const record = await this.prisma.accountBalanceReconciliation.findUnique({
      where: { id },
    });
    return record ? toReconciliation(record) : null;
  }

  async createAtomic(
    input: CreateReconciliationAtomicInput
  ): Promise<{
    reconciliation: AccountBalanceReconciliation;
    transaction: Transaction;
  }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: toCreateData(input.transaction),
        });
        const reconciliation = await tx.accountBalanceReconciliation.create({
          data: {
            id: input.reconciliation.id,
            userId: input.reconciliation.userId,
            accountId: input.reconciliation.accountId,
            transactionId: input.reconciliation.transactionId,
            observedBalance: input.reconciliation.observedBalance,
            previousCalculatedBalance: input.reconciliation.previousCalculatedBalance,
            adjustmentAmount: input.reconciliation.adjustmentAmount,
            currency: input.reconciliation.currency,
            reason: input.reconciliation.reason,
            occurredAt: input.reconciliation.occurredAt,
            idempotencyKey: input.reconciliation.idempotencyKey,
          },
        });
        return {
          reconciliation: toReconciliation(reconciliation),
          transaction: toTransaction(transaction),
        };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      throw error;
    }
  }
}

export function toReconciliation(
  record: PrismaReconciliation
): AccountBalanceReconciliation {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    transactionId: record.transactionId,
    observedBalance: decimalToString(record.observedBalance),
    previousCalculatedBalance: decimalToString(record.previousCalculatedBalance),
    adjustmentAmount: decimalToString(record.adjustmentAmount),
    currency: record.currency as Currency,
    reason: record.reason,
    occurredAt: record.occurredAt,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt,
  };
}

function decimalToString(value: Prisma.Decimal | string): string {
  if (typeof value === "string") {
    return value;
  }
  return value.toFixed(2);
}
