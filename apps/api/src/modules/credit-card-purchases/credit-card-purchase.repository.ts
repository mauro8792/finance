import type {
  CreditCardInstallment as PrismaInstallment,
  CreditCardPurchase as PrismaPurchase,
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
import type { CorrectionOperation } from "../corrections/correction.types.js";
import { toCreateData } from "../transactions/transaction.repository.js";
import type {
  DueInstallmentCandidate,
  RecognizeInstallmentOutcome,
} from "./credit-card-installment-recognize.types.js";
import type {
  CreatePurchaseAtomicInput,
  CreditCardInstallment,
  CreditCardInstallmentStatus,
  CreditCardPurchase,
  CreditCardPurchaseRepository,
  CreditCardPurchaseStatus,
  PurchaseWithInstallments,
  VoidCreditCardPurchaseInput,
  VoidPurchaseAtomicResult,
} from "./credit-card-purchase.types.js";

type LockedPurchaseRow = {
  id: string;
  user_id: string;
  credit_card_id: string;
  status: string;
};

type LockedDueRow = {
  id: string;
  amount: Prisma.Decimal;
  scheduled_for: Date;
  installment_number: number;
  user_id: string;
  credit_card_id: string;
  category_id: string;
  currency: string;
  description: string | null;
  installments_count: number;
};

export class RecognizeClaimLostError extends Error {
  constructor(installmentId: string) {
    super(`Installment claim lost: ${installmentId}`);
    this.name = "RecognizeClaimLostError";
  }
}

export class PrismaCreditCardPurchaseRepository
  implements CreditCardPurchaseRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async createPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallments> {
    const records = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.creditCardPurchase.create({
        data: {
          id: input.purchase.id,
          userId: input.purchase.userId,
          creditCardId: input.purchase.creditCardId,
          categoryId: input.purchase.categoryId,
          description: input.purchase.description,
          currency: input.purchase.currency,
          totalAmount: input.purchase.totalAmount,
          installmentAmount: input.purchase.installmentAmount,
          installmentsCount: input.purchase.installmentsCount,
          purchasedAt: input.purchase.purchasedAt,
          status: input.purchase.status,
        },
      });

      const transaction = await tx.transaction.create({
        data: toCreateData(input.transaction),
      });

      const installments = [];
      for (const item of input.installments) {
        const recognizedTransactionId =
          item.status === "RECOGNIZED" ? transaction.id : null;
        const installment = await tx.creditCardInstallment.create({
          data: {
            id: item.id,
            purchaseId: item.purchaseId,
            installmentNumber: item.installmentNumber,
            amount: item.amount,
            status: item.status,
            scheduledFor: item.scheduledFor,
            recognizedTransactionId,
            recognizedAt: item.recognizedAt,
          },
        });
        installments.push(installment);
      }

      return { purchase, installments, transactionId: transaction.id };
    });

    const mapped = records.installments.map(toInstallment);
    return {
      purchase: toPurchase(records.purchase),
      installments: mapped,
      recognizedTransactionId: records.transactionId,
    };
  }

  async findById(id: string): Promise<PurchaseWithInstallments | null> {
    const purchase = await this.prisma.creditCardPurchase.findUnique({
      where: { id },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
    if (!purchase || purchase.installments.length === 0) {
      return null;
    }
    return toPurchaseWithInstallments(purchase);
  }

  async findByUserId(userId: string): Promise<PurchaseWithInstallments[]> {
    const purchases = await this.prisma.creditCardPurchase.findMany({
      where: { userId },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
      orderBy: { purchasedAt: "desc" },
    });

    return purchases
      .filter((purchase) => purchase.installments.length > 0)
      .map(toPurchaseWithInstallments);
  }

  async findPendingInstallmentAmountsByCreditCardId(
    userId: string,
    creditCardId: string
  ): Promise<
    Array<{
      amount: string;
      status: CreditCardInstallmentStatus;
      currency: import("shared").Currency;
    }>
  > {
    const rows = await this.prisma.creditCardInstallment.findMany({
      where: {
        status: "PENDING",
        purchase: {
          userId,
          creditCardId,
          status: "ACTIVE",
        },
      },
      select: {
        amount: true,
        status: true,
        purchase: { select: { currency: true } },
      },
    });
    return rows.map((row) => ({
      amount: row.amount.toFixed(2),
      status: row.status as CreditCardInstallmentStatus,
      currency: row.purchase.currency as import("shared").Currency,
    }));
  }

  async findDueInstallmentCandidates(
    asOf: Date,
    userId?: string
  ): Promise<DueInstallmentCandidate[]> {
    const rows = await this.prisma.creditCardInstallment.findMany({
      where: {
        status: "PENDING",
        recognizedTransactionId: null,
        scheduledFor: { lte: asOf },
        purchase: {
          status: "ACTIVE",
          ...(userId !== undefined ? { userId } : {}),
        },
      },
      include: {
        purchase: {
          select: {
            id: true,
            userId: true,
            creditCardId: true,
            categoryId: true,
            currency: true,
            description: true,
            installmentsCount: true,
          },
        },
      },
      orderBy: [
        { scheduledFor: "asc" },
        { purchaseId: "asc" },
        { installmentNumber: "asc" },
      ],
    });

    return rows.map((row) => ({
      installmentId: row.id,
      purchaseId: row.purchaseId,
      userId: row.purchase.userId,
      creditCardId: row.purchase.creditCardId,
      categoryId: row.purchase.categoryId,
      currency: row.purchase.currency as Currency,
      description: row.purchase.description,
      installmentNumber: row.installmentNumber,
      installmentsCount: row.purchase.installmentsCount,
      amount: row.amount.toFixed(2),
      scheduledFor: row.scheduledFor,
    }));
  }

  async recognizeInstallmentAtomic(input: {
    installmentId: string;
    recognizedAt: Date;
    transactionId: string;
  }): Promise<RecognizeInstallmentOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedDueRow[]>`
          SELECT
            i.id,
            i.amount,
            i.scheduled_for,
            i.installment_number,
            p.user_id,
            p.credit_card_id,
            p.category_id,
            p.currency::text AS currency,
            p.description,
            p.installments_count
          FROM credit_card_installments i
          INNER JOIN credit_card_purchases p ON p.id = i.purchase_id
          WHERE i.id = ${input.installmentId}::uuid
            AND i.status = 'PENDING'
            AND i.recognized_transaction_id IS NULL
            AND p.status = 'ACTIVE'
          FOR UPDATE OF i SKIP LOCKED
        `;

        if (locked.length === 0) {
          return "skipped";
        }

        const row = locked[0]!;
        const amount = row.amount.toFixed(2);
        const description =
          row.description?.trim() ||
          `Cuota ${row.installment_number}/${row.installments_count}`;

        await tx.transaction.create({
          data: toCreateData({
            id: input.transactionId,
            userId: row.user_id,
            accountId: null,
            creditCardId: row.credit_card_id,
            categoryId: row.category_id,
            type: "EXPENSE",
            status: "ACTIVE",
            amount,
            currency: row.currency as Currency,
            description,
            occurredAt: row.scheduled_for,
            paymentMethod: null,
            isFixed: false,
            reimbursementStatus: "NONE",
          }),
        });

        const updated = await tx.creditCardInstallment.updateMany({
          where: {
            id: input.installmentId,
            status: "PENDING",
            recognizedTransactionId: null,
          },
          data: {
            status: "RECOGNIZED",
            recognizedTransactionId: input.transactionId,
            recognizedAt: input.recognizedAt,
          },
        });

        if (updated.count !== 1) {
          throw new RecognizeClaimLostError(input.installmentId);
        }

        return "recognized";
      });
    } catch (error) {
      if (error instanceof RecognizeClaimLostError) {
        return "skipped";
      }
      throw error;
    }
  }

  async voidPurchaseAtomic(
    input: VoidCreditCardPurchaseInput
  ): Promise<VoidPurchaseAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "PURCHASE_VOID", input.purchaseId);
          return this.replayPurchaseVoid(tx, input, replay);
        }

        const locked = await tx.$queryRaw<LockedPurchaseRow[]>`
          SELECT id, user_id, credit_card_id, status::text AS status
          FROM credit_card_purchases
          WHERE id = ${input.purchaseId}::uuid
          FOR UPDATE
        `;
        const purchase = locked[0];
        if (!purchase || purchase.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
        }
        if (purchase.status !== "ACTIVE") {
          throw new AppError(
            "PURCHASE_ALREADY_VOIDED",
            "La compra ya está anulada.",
            409
          );
        }

        const installments = await tx.creditCardInstallment.findMany({
          where: { purchaseId: purchase.id },
          orderBy: { installmentNumber: "asc" },
        });
        const recognized = installments.filter(
          (row) => row.recognizedTransactionId != null
        );
        const recognizedExpenseIds = recognized
          .map((row) => row.recognizedTransactionId)
          .filter((id): id is string => id != null);

        /**
         * An accredited refund already credited money against a recognized
         * expense. Reversing the expense underneath it would leave the
         * reimbursement dangling, so the refund must be voided first.
         */
        if (recognizedExpenseIds.length > 0) {
          const activeReimbursements = await tx.transaction.count({
            where: {
              relatedTransactionId: { in: recognizedExpenseIds },
              type: "REIMBURSEMENT",
              status: "ACTIVE",
            },
          });
          if (activeReimbursements > 0) {
            throw new AppError(
              "PURCHASE_HAS_ACTIVE_REFUNDS",
              "Anulá primero los reintegros acreditados de la compra.",
              409
            );
          }
        }

        if (recognizedExpenseIds.length > 0) {
          await tx.transaction.updateMany({
            where: { id: { in: recognizedExpenseIds }, status: "ACTIVE" },
            data: { status: "REVERSED" },
          });
        }

        /**
         * Recognized installments first lose their recognition (back to
         * PENDING semantics) and, because the purchase itself is voided, every
         * installment ends CANCELLED so the scheduler never picks them up.
         */
        const cancelled = await tx.creditCardInstallment.updateMany({
          where: { purchaseId: purchase.id, status: { not: "CANCELLED" } },
          data: {
            status: "CANCELLED",
            recognizedTransactionId: null,
            recognizedAt: null,
          },
        });

        await tx.creditCardPurchase.update({
          where: { id: purchase.id },
          data: { status: "VOIDED" },
        });

        const resultStatus =
          recognizedExpenseIds.length > 0 ? "REVERSED" : "VOIDED";
        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "PURCHASE_VOID",
          targetId: purchase.id,
          resultStatus,
          result: {
            purchaseId: purchase.id,
            creditCardId: purchase.credit_card_id,
            reversedTransactionIds: recognizedExpenseIds,
            cancelledInstallmentsCount: cancelled.count,
            status: resultStatus,
          },
        });

        return {
          created: true,
          purchase: await loadPurchaseWithInstallments(tx, purchase.id),
          reversedTransactionIds: recognizedExpenseIds,
          cancelledInstallmentsCount: cancelled.count,
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
          assertCorrectionTarget(replay, "PURCHASE_VOID", input.purchaseId);
          return this.replayPurchaseVoid(this.prisma, input, replay);
        }
      }
      throw error;
    }
  }

  private async replayPurchaseVoid(
    db: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    input: VoidCreditCardPurchaseInput,
    correction: CorrectionOperation
  ): Promise<VoidPurchaseAtomicResult> {
    const recorded = (correction.result ?? {}) as {
      reversedTransactionIds?: unknown;
      cancelledInstallmentsCount?: unknown;
    };
    return {
      created: false,
      purchase: await loadPurchaseWithInstallments(db, input.purchaseId),
      reversedTransactionIds: Array.isArray(recorded.reversedTransactionIds)
        ? recorded.reversedTransactionIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
      cancelledInstallmentsCount:
        typeof recorded.cancelledInstallmentsCount === "number"
          ? recorded.cancelledInstallmentsCount
          : 0,
    };
  }
}

async function loadPurchaseWithInstallments(
  db: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
  purchaseId: string
): Promise<PurchaseWithInstallments> {
  const record = await db.creditCardPurchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { installments: { orderBy: { installmentNumber: "asc" } } },
  });
  return toPurchaseWithInstallments(record);
}

function toPurchaseWithInstallments(
  purchase: PrismaPurchase & { installments: PrismaInstallment[] }
): PurchaseWithInstallments {
  const installments = purchase.installments.map(toInstallment);
  const recognized = installments.find(
    (item) => item.status === "RECOGNIZED" && item.recognizedTransactionId
  );
  return {
    purchase: toPurchase(purchase),
    installments,
    recognizedTransactionId: recognized?.recognizedTransactionId ?? null,
  };
}

function toPurchase(record: PrismaPurchase): CreditCardPurchase {
  return {
    id: record.id,
    userId: record.userId,
    creditCardId: record.creditCardId,
    categoryId: record.categoryId,
    description: record.description,
    currency: record.currency as Currency,
    totalAmount: record.totalAmount.toFixed(2),
    installmentAmount: record.installmentAmount.toFixed(2),
    installmentsCount: record.installmentsCount,
    purchasedAt: record.purchasedAt,
    status: record.status as CreditCardPurchaseStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toInstallment(record: PrismaInstallment): CreditCardInstallment {
  return {
    id: record.id,
    purchaseId: record.purchaseId,
    installmentNumber: record.installmentNumber,
    amount: record.amount.toFixed(2),
    status: record.status as CreditCardInstallmentStatus,
    scheduledFor: record.scheduledFor,
    recognizedTransactionId: record.recognizedTransactionId,
    recognizedAt: record.recognizedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
