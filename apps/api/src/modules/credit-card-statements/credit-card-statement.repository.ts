import type { CreditCardStatement as PrismaStatement } from "@prisma/client";
import type { Currency } from "shared";
import { getPrismaClient } from "../../shared/db/prisma.js";
import type {
  CloseStatementRecord,
  CreateStatementRecord,
  CreditCardStatement,
  CreditCardStatementRepository,
  CreditCardStatementStatus,
} from "./credit-card-statement.types.js";

export class PrismaCreditCardStatementRepository
  implements CreditCardStatementRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async createProjected(
    input: CreateStatementRecord
  ): Promise<CreditCardStatement> {
    const record = await this.prisma.creditCardStatement.create({
      data: {
        id: input.id,
        userId: input.userId,
        creditCardId: input.creditCardId,
        currency: input.currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        closingDate: input.closingDate,
        dueDate: input.dueDate,
        status: "PROJECTED",
      },
    });
    return toStatement(record);
  }

  async findById(id: string): Promise<CreditCardStatement | null> {
    const record = await this.prisma.creditCardStatement.findUnique({
      where: { id },
    });
    return record ? toStatement(record) : null;
  }

  async findByCreditCardAndClosingDate(
    creditCardId: string,
    closingDate: Date
  ): Promise<CreditCardStatement | null> {
    const record = await this.prisma.creditCardStatement.findUnique({
      where: {
        creditCardId_closingDate: { creditCardId, closingDate },
      },
    });
    return record ? toStatement(record) : null;
  }

  async findByCreditCardId(
    creditCardId: string
  ): Promise<CreditCardStatement[]> {
    const rows = await this.prisma.creditCardStatement.findMany({
      where: { creditCardId },
      orderBy: { closingDate: "desc" },
    });
    return rows.map(toStatement);
  }

  async close(
    id: string,
    input: CloseStatementRecord
  ): Promise<CreditCardStatement> {
    const updated = await this.prisma.creditCardStatement.updateMany({
      where: { id, status: "PROJECTED" },
      data: {
        status: "CLOSED",
        closedProjectedAmount: input.closedProjectedAmount,
        actualAmount: input.actualAmount,
        closedAt: input.closedAt,
      },
    });
    if (updated.count !== 1) {
      throw new StatementCloseConflictError(id);
    }
    const record = await this.prisma.creditCardStatement.findUniqueOrThrow({
      where: { id },
    });
    return toStatement(record);
  }
}

export class StatementCloseConflictError extends Error {
  constructor(id: string) {
    super(`Statement close conflict: ${id}`);
    this.name = "StatementCloseConflictError";
  }
}

function toStatement(record: PrismaStatement): CreditCardStatement {
  return {
    id: record.id,
    userId: record.userId,
    creditCardId: record.creditCardId,
    currency: record.currency as Currency,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    closingDate: record.closingDate,
    dueDate: record.dueDate,
    status: record.status as CreditCardStatementStatus,
    closedProjectedAmount:
      record.closedProjectedAmount?.toFixed(2) ?? null,
    actualAmount: record.actualAmount?.toFixed(2) ?? null,
    closedAt: record.closedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
