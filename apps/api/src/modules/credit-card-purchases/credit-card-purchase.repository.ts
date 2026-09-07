import type {
  CreditCardInstallment as PrismaInstallment,
  CreditCardPurchase as PrismaPurchase,
} from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { toCreateData } from "../transactions/transaction.repository.js";
import type {
  CreatePurchaseAtomicInput,
  CreditCardInstallment,
  CreditCardInstallmentStatus,
  CreditCardPurchase,
  CreditCardPurchaseRepository,
  CreditCardPurchaseStatus,
  PurchaseWithInstallments,
} from "./credit-card-purchase.types.js";

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
  ): Promise<Array<{ amount: string; status: CreditCardInstallmentStatus }>> {
    const rows = await this.prisma.creditCardInstallment.findMany({
      where: {
        status: "PENDING",
        purchase: {
          userId,
          creditCardId,
          status: "ACTIVE",
        },
      },
      select: { amount: true, status: true },
    });
    return rows.map((row) => ({
      amount: row.amount.toFixed(2),
      status: row.status as CreditCardInstallmentStatus,
    }));
  }
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
