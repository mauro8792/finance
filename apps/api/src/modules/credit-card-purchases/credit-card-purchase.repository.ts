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
  PurchaseWithInstallment,
} from "./credit-card-purchase.types.js";

export class PrismaCreditCardPurchaseRepository
  implements CreditCardPurchaseRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async createCashPurchaseAtomic(
    input: CreatePurchaseAtomicInput
  ): Promise<PurchaseWithInstallment> {
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

      const installment = await tx.creditCardInstallment.create({
        data: {
          id: input.installment.id,
          purchaseId: input.installment.purchaseId,
          installmentNumber: input.installment.installmentNumber,
          amount: input.installment.amount,
          status: input.installment.status,
          recognizedTransactionId: input.installment.recognizedTransactionId,
          recognizedAt: input.installment.recognizedAt,
        },
      });

      return { purchase, installment, transactionId: transaction.id };
    });

    return {
      purchase: toPurchase(records.purchase),
      installment: toInstallment(records.installment),
      transactionId: records.transactionId,
    };
  }

  async findById(id: string): Promise<PurchaseWithInstallment | null> {
    const purchase = await this.prisma.creditCardPurchase.findUnique({
      where: { id },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
    });
    if (!purchase) {
      return null;
    }
    const installment = purchase.installments[0];
    if (!installment) {
      return null;
    }
    return {
      purchase: toPurchase(purchase),
      installment: toInstallment(installment),
      transactionId: installment.recognizedTransactionId ?? "",
    };
  }

  async findByUserId(userId: string): Promise<PurchaseWithInstallment[]> {
    const purchases = await this.prisma.creditCardPurchase.findMany({
      where: { userId },
      include: { installments: { orderBy: { installmentNumber: "asc" } } },
      orderBy: { purchasedAt: "desc" },
    });

    return purchases.flatMap((purchase) => {
      const installment = purchase.installments[0];
      if (!installment) {
        return [];
      }
      return [
        {
          purchase: toPurchase(purchase),
          installment: toInstallment(installment),
          transactionId: installment.recognizedTransactionId ?? "",
        },
      ];
    });
  }
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
    recognizedTransactionId: record.recognizedTransactionId,
    recognizedAt: record.recognizedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
