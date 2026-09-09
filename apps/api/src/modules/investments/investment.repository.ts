import type { Investment as PrismaInvestment } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  toCreateData,
  toTransaction,
} from "../transactions/transaction.repository.js";
import type { CreateTransactionInput, Transaction } from "../transactions/transaction.types.js";
import type {
  CreateInvestmentRecord,
  Investment,
  InvestmentRepository,
  InvestmentStatus,
  InvestmentType,
  RenewAtomicInput,
  UpdateActiveCaucionRecord,
} from "./investment.types.js";
import { AppError } from "../../shared/errors/app-error.js";

export class PrismaInvestmentRepository implements InvestmentRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async createCaucionAtomic(
    investment: CreateInvestmentRecord,
    transaction: CreateTransactionInput & { id: string }
  ): Promise<{ investment: Investment; transaction: Transaction }> {
    const records = await this.prisma.$transaction(async (tx) => {
      const createdInvestment = await tx.investment.create({
        data: {
          id: investment.id,
          userId: investment.userId,
          accountId: investment.accountId,
          type: investment.type,
          status: investment.status,
          currency: investment.currency,
          principal: investment.principal,
          annualRate: investment.annualRate,
          startDate: investment.startDate,
          maturityDate: investment.maturityDate,
          expectedReturn: investment.expectedReturn,
          notes: investment.notes,
        },
      });
      const createdTx = await tx.transaction.create({
        data: toCreateData(transaction),
      });
      return { createdInvestment, createdTx };
    });

    return {
      investment: toInvestment(records.createdInvestment),
      transaction: toTransaction(records.createdTx),
    };
  }

  async matureAtomic(
    investmentId: string,
    patch: { status: "MATURED"; actualReturn: string },
    principalReturn: CreateTransactionInput & { id: string },
    investmentReturn: (CreateTransactionInput & { id: string }) | null
  ): Promise<{
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
  }> {
    const records = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM investments WHERE id = ${investmentId}::uuid FOR UPDATE
      `;
      const current = await tx.investment.findUnique({ where: { id: investmentId } });
      if (!current || current.status !== "ACTIVE") {
        throw new AppError(
          "INVESTMENT_NOT_ACTIVE",
          "La caución ya no está ACTIVE.",
          409
        );
      }
      if (current.principal.toFixed(2) !== principalReturn.amount) {
        throw new AppError(
          "VALIDATION_ERROR",
          "El capital de la caución cambió; reintentá el vencimiento.",
          409
        );
      }
      const createdPrincipal = await tx.transaction.create({
        data: toCreateData(principalReturn),
      });
      const createdReturn = investmentReturn
        ? await tx.transaction.create({
            data: toCreateData(investmentReturn),
          })
        : null;
      const updatedRows = await tx.investment.updateMany({
        where: { id: investmentId, status: "ACTIVE" },
        data: {
          status: patch.status,
          actualReturn: patch.actualReturn,
        },
      });
      if (updatedRows.count !== 1) {
        throw new AppError(
          "INVESTMENT_NOT_ACTIVE",
          "La caución ya no está ACTIVE.",
          409
        );
      }
      const updated = await tx.investment.findUniqueOrThrow({
        where: { id: investmentId },
      });
      return { createdPrincipal, createdReturn, updated };
    });

    return {
      investment: toInvestment(records.updated),
      principalReturn: toTransaction(records.createdPrincipal),
      investmentReturn: records.createdReturn
        ? toTransaction(records.createdReturn)
        : null,
    };
  }

  async renewAtomic(input: RenewAtomicInput): Promise<{
    original: Investment;
    investment: Investment;
    principalReturn: Transaction;
    investmentReturn: Transaction | null;
    outflow: Transaction;
  }> {
    const records = await this.prisma.$transaction(async (tx) => {
      const createdPrincipal = await tx.transaction.create({
        data: toCreateData(input.principalReturn),
      });
      const createdReturn = input.investmentReturn
        ? await tx.transaction.create({
            data: toCreateData(input.investmentReturn),
          })
        : null;
      const original = await tx.investment.update({
        where: { id: input.originalId },
        data: {
          status: input.originalPatch.status,
          actualReturn: input.originalPatch.actualReturn,
        },
      });
      const createdInvestment = await tx.investment.create({
        data: {
          id: input.newInvestment.id,
          userId: input.newInvestment.userId,
          accountId: input.newInvestment.accountId,
          renewedFromInvestmentId: input.newInvestment.renewedFromInvestmentId,
          type: input.newInvestment.type,
          status: input.newInvestment.status,
          currency: input.newInvestment.currency,
          principal: input.newInvestment.principal,
          annualRate: input.newInvestment.annualRate,
          startDate: input.newInvestment.startDate,
          maturityDate: input.newInvestment.maturityDate,
          expectedReturn: input.newInvestment.expectedReturn,
          notes: input.newInvestment.notes,
        },
      });
      const createdOutflow = await tx.transaction.create({
        data: toCreateData(input.outflow),
      });
      return {
        createdPrincipal,
        createdReturn,
        original,
        createdInvestment,
        createdOutflow,
      };
    });

    return {
      original: toInvestment(records.original),
      investment: toInvestment(records.createdInvestment),
      principalReturn: toTransaction(records.createdPrincipal),
      investmentReturn: records.createdReturn
        ? toTransaction(records.createdReturn)
        : null,
      outflow: toTransaction(records.createdOutflow),
    };
  }

  async updateActiveCaucionAtomic(
    investmentId: string,
    patch: UpdateActiveCaucionRecord
  ): Promise<{ investment: Investment; outflow: Transaction }> {
    const records = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; status: string; user_id: string }>
      >`
        SELECT id, status::text AS status, user_id
        FROM investments
        WHERE id = ${investmentId}::uuid
        FOR UPDATE
      `;
      const row = locked[0];
      if (!row) {
        throw new AppError("NOT_FOUND", "Inversión no encontrada.", 404);
      }
      if (row.status !== "ACTIVE") {
        throw new AppError(
          "INVESTMENT_NOT_ACTIVE",
          "Sólo una inversión ACTIVE puede editarse.",
          409
        );
      }

      const outflows = await tx.transaction.findMany({
        where: {
          type: "INVESTMENT_OUTFLOW",
          status: "ACTIVE",
          metadata: {
            path: ["investmentId"],
            equals: investmentId,
          },
        },
      });
      if (outflows.length !== 1) {
        throw new AppError(
          "VALIDATION_ERROR",
          "No hay un INVESTMENT_OUTFLOW único vinculado a esta caución.",
          409
        );
      }
      const outflow = outflows[0]!;

      const updatedRows = await tx.investment.updateMany({
        where: { id: investmentId, status: "ACTIVE" },
        data: {
          principal: patch.principal,
          annualRate: patch.annualRate,
          startDate: patch.startDate,
          maturityDate: patch.maturityDate,
          expectedReturn: patch.expectedReturn,
          notes: patch.notes,
        },
      });
      if (updatedRows.count !== 1) {
        throw new AppError(
          "INVESTMENT_NOT_ACTIVE",
          "La caución ya no está ACTIVE.",
          409
        );
      }

      const updatedOutflow = await tx.transaction.update({
        where: { id: outflow.id },
        data: {
          amount: patch.principal,
          occurredAt: patch.startDate,
        },
      });

      const updatedInvestment = await tx.investment.findUniqueOrThrow({
        where: { id: investmentId },
      });

      return { updatedInvestment, updatedOutflow };
    });

    return {
      investment: toInvestment(records.updatedInvestment),
      outflow: toTransaction(records.updatedOutflow),
    };
  }

  async findById(id: string): Promise<Investment | null> {
    const record = await this.prisma.investment.findUnique({ where: { id } });
    return record ? toInvestment(record) : null;
  }

  async findByUserId(userId: string): Promise<Investment[]> {
    const records = await this.prisma.investment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toInvestment);
  }
}

function toInvestment(record: PrismaInvestment): Investment {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    renewedFromInvestmentId: record.renewedFromInvestmentId,
    type: record.type as InvestmentType,
    status: record.status as InvestmentStatus,
    currency: record.currency as Currency,
    principal: record.principal.toFixed(2),
    annualRate: record.annualRate === null ? null : record.annualRate.toFixed(6),
    startDate: record.startDate,
    maturityDate: record.maturityDate,
    expectedReturn: record.expectedReturn === null ? null : record.expectedReturn.toFixed(2),
    actualReturn: record.actualReturn === null ? null : record.actualReturn.toFixed(2),
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
