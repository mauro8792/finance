import type {
  HousingObligation as PrismaHousingObligation,
  HousingPayment as PrismaHousingPayment,
  Prisma,
} from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  assertCorrectionTarget,
  findCorrectionByKey,
  isUniqueViolation,
  recordCorrection,
} from "../corrections/correction.repository.js";
import { toCreateData, toTransaction } from "../transactions/transaction.repository.js";
import type {
  CreateHousingObligationInput,
  CreateHousingPaymentRecord,
  HousingObligation,
  HousingObligationRepository,
  HousingPayment,
  UpdateHousingObligationRecord,
  VoidHousingPaymentAtomicResult,
  VoidHousingPaymentInput,
} from "./housing.types.js";
import { RemainingInstallmentsConflictError } from "./housing.types.js";
import type { CreateTransactionInput } from "../transactions/transaction.types.js";

type LockedObligation = {
  id: string;
  user_id: string;
  remaining_installments: number;
};

type LockedTx = {
  id: string;
  user_id: string;
  type: string;
  status: string;
};

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
          periodYear: payment.periodYear,
          periodMonth: payment.periodMonth,
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

  async voidPaymentAtomic(
    input: VoidHousingPaymentInput
  ): Promise<VoidHousingPaymentAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "HOUSING_PAYMENT_VOID", input.paymentId);
          return this.replayPaymentVoid(tx, input);
        }

        const obligations = await tx.$queryRaw<LockedObligation[]>`
          SELECT id, user_id, remaining_installments
          FROM housing_obligations
          WHERE id = ${input.obligationId}::uuid
          FOR UPDATE
        `;
        const obligationRow = obligations[0];
        if (!obligationRow || obligationRow.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "La obligación de vivienda no existe.", 404);
        }

        const payment = await tx.housingPayment.findUnique({
          where: { id: input.paymentId },
        });
        if (
          !payment ||
          payment.housingObligationId !== input.obligationId
        ) {
          throw new AppError("NOT_FOUND", "Pago de vivienda no encontrado.", 404);
        }

        const txs = await tx.$queryRaw<LockedTx[]>`
          SELECT id, user_id, type::text AS type, status::text AS status
          FROM transactions
          WHERE id = ${payment.transactionId}::uuid
          FOR UPDATE
        `;
        const lockedTx = txs[0];
        if (!lockedTx || lockedTx.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Pago de vivienda no encontrado.", 404);
        }

        if (payment.voidedAt != null || lockedTx.status !== "ACTIVE") {
          // Concurrent same-key void: the winner already recorded the correction.
          const lateReplay = await findCorrectionByKey(
            tx,
            input.userId,
            input.idempotencyKey
          );
          if (lateReplay) {
            assertCorrectionTarget(lateReplay, "HOUSING_PAYMENT_VOID", input.paymentId);
            return this.replayPaymentVoid(tx, input);
          }
          throw new AppError(
            "HOUSING_PAYMENT_ALREADY_VOIDED",
            "El pago de vivienda ya está anulado.",
            409
          );
        }

        const reversedTx = await tx.transaction.update({
          where: { id: payment.transactionId },
          data: { status: "REVERSED" },
        });

        const voidedPayment = await tx.housingPayment.update({
          where: { id: payment.id },
          data: {
            voidedAt: new Date(),
            voidIdempotencyKey: input.idempotencyKey,
          },
        });

        const obligation = await tx.housingObligation.update({
          where: { id: input.obligationId },
          data: { remainingInstallments: { increment: 1 } },
        });

        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "HOUSING_PAYMENT_VOID",
          targetId: input.paymentId,
          resultStatus: "REVERSED",
          result: {
            paymentId: input.paymentId,
            housingObligationId: input.obligationId,
            transactionId: payment.transactionId,
            status: "REVERSED",
          },
        });

        return {
          created: true,
          payment: toHousingPayment(voidedPayment),
          transaction: toTransaction(reversedTx),
          obligation: toHousingObligation(obligation),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await findCorrectionByKey(
          this.prisma,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "HOUSING_PAYMENT_VOID", input.paymentId);
          return this.replayPaymentVoid(this.prisma, input);
        }
      }
      throw error;
    }
  }

  private async replayPaymentVoid(
    db: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    input: VoidHousingPaymentInput
  ): Promise<VoidHousingPaymentAtomicResult> {
    const payment = await db.housingPayment.findUnique({
      where: { id: input.paymentId },
    });
    if (
      !payment ||
      payment.housingObligationId !== input.obligationId
    ) {
      throw new AppError("NOT_FOUND", "Pago de vivienda no encontrado.", 404);
    }
    const reversedTx = await db.transaction.findUniqueOrThrow({
      where: { id: payment.transactionId },
    });
    const obligation = await db.housingObligation.findUniqueOrThrow({
      where: { id: input.obligationId },
    });
    if (obligation.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "La obligación de vivienda no existe.", 404);
    }
    return {
      created: false,
      payment: toHousingPayment(payment),
      transaction: toTransaction(reversedTx),
      obligation: toHousingObligation(obligation),
    };
  }

  async updatePaymentPeriod(
    paymentId: string,
    input: {
      periodYear: number;
      periodMonth: number;
      previousPeriodYear: number | null;
      previousPeriodMonth: number | null;
      periodCorrectedAt: Date;
    }
  ): Promise<HousingPayment> {
    try {
      const record = await this.prisma.housingPayment.update({
        where: { id: paymentId },
        data: {
          periodYear: input.periodYear,
          periodMonth: input.periodMonth,
          previousPeriodYear: input.previousPeriodYear,
          previousPeriodMonth: input.previousPeriodMonth,
          periodCorrectedAt: input.periodCorrectedAt,
        },
      });
      return toHousingPayment(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          "HOUSING_PERIOD_CONFLICT",
          "Ya existe un pago activo para ese período.",
          409
        );
      }
      throw error;
    }
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
    periodYear: record.periodYear,
    periodMonth: record.periodMonth,
    previousPeriodYear: record.previousPeriodYear,
    previousPeriodMonth: record.previousPeriodMonth,
    periodCorrectedAt: record.periodCorrectedAt,
    paidAt: record.paidAt,
    voidedAt: record.voidedAt,
    voidIdempotencyKey: record.voidIdempotencyKey,
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
