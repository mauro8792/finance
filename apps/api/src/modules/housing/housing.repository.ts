import type {
  HousingObligation as PrismaHousingObligation,
  HousingPayment as PrismaHousingPayment,
} from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { toCreateData, toTransaction } from "../transactions/transaction.repository.js";
import type {
  CreateHousingObligationInput,
  CreateHousingPaymentRecord,
  HousingObligation,
  HousingObligationRepository,
  HousingPayment,
  UpdateHousingObligationRecord,
} from "./housing.types.js";
import { RemainingInstallmentsConflictError } from "./housing.types.js";
import type { CreateTransactionInput } from "../transactions/transaction.types.js";

export class PrismaHousingObligationRepository implements HousingObligationRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(input: CreateHousingObligationInput): Promise<HousingObligation> {
    const record = await this.prisma.housingObligation.create({
      data: {
        userId: input.userId,
        reserveAccountId: input.reserveAccountId ?? null,
        name: input.name,
        currency: input.currency,
        installmentAmount: input.installmentAmount,
        remainingInstallments: input.remainingInstallments,
        dueDay: input.dueDay ?? null,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return toHousingObligation(record);
  }

  async findById(id: string): Promise<HousingObligation | null> {
    const record = await this.prisma.housingObligation.findUnique({ where: { id } });
    return record ? toHousingObligation(record) : null;
  }

  async findByUserId(userId: string): Promise<HousingObligation[]> {
    const records = await this.prisma.housingObligation.findMany({
      where: { userId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
    return records.map(toHousingObligation);
  }

  async update(
    id: string,
    input: UpdateHousingObligationRecord
  ): Promise<HousingObligation> {
    const record = await this.prisma.housingObligation.update({
      where: { id },
      data: {
        ...(input.reserveAccountId !== undefined
          ? { reserveAccountId: input.reserveAccountId }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.installmentAmount !== undefined
          ? { installmentAmount: input.installmentAmount }
          : {}),
        ...(input.remainingInstallments !== undefined
          ? { remainingInstallments: input.remainingInstallments }
          : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return toHousingObligation(record);
  }

  async findPaymentsByObligationId(obligationId: string): Promise<HousingPayment[]> {
    const records = await this.prisma.housingPayment.findMany({
      where: { housingObligationId: obligationId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    });
    return records.map(toHousingPayment);
  }

  async registerPaymentAtomic(
    payment: CreateHousingPaymentRecord,
    transaction: CreateTransactionInput & { id: string },
    obligationId: string
  ) {
    const records = await this.prisma.$transaction(async (tx) => {
      const createdTx = await tx.transaction.create({
        data: toCreateData(transaction),
      });
      const createdPayment = await tx.housingPayment.create({
        data: {
          id: payment.id,
          housingObligationId: payment.housingObligationId,
          transactionId: payment.transactionId,
          accountId: payment.accountId,
          amount: payment.amount,
          currency: payment.currency,
          installmentNumber: payment.installmentNumber,
          paidAt: payment.paidAt,
        },
      });
      const decremented = await tx.housingObligation.updateMany({
        where: { id: obligationId, remainingInstallments: { gt: 0 } },
        data: { remainingInstallments: { decrement: 1 } },
      });
      if (decremented.count !== 1) {
        throw new RemainingInstallmentsConflictError();
      }
      const obligation = await tx.housingObligation.findUniqueOrThrow({
        where: { id: obligationId },
      });
      return { createdTx, createdPayment, obligation };
    });

    return {
      payment: toHousingPayment(records.createdPayment),
      transaction: toTransaction(records.createdTx),
      obligation: toHousingObligation(records.obligation),
    };
  }
}

function toHousingPayment(record: PrismaHousingPayment): HousingPayment {
  return {
    id: record.id,
    housingObligationId: record.housingObligationId,
    transactionId: record.transactionId,
    accountId: record.accountId,
    amount: record.amount.toFixed(2),
    currency: record.currency as Currency,
    installmentNumber: record.installmentNumber,
    paidAt: record.paidAt,
    createdAt: record.createdAt,
  };
}

function toHousingObligation(record: PrismaHousingObligation): HousingObligation {
  return {
    id: record.id,
    userId: record.userId,
    reserveAccountId: record.reserveAccountId,
    name: record.name,
    currency: record.currency as Currency,
    installmentAmount: record.installmentAmount.toFixed(2),
    remainingInstallments: record.remainingInstallments,
    dueDay: record.dueDay,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
