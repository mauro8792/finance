import { Prisma, type Transaction as PrismaTransaction } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
import type {
  CreateTransferAtomicInput,
  CreateTransactionInput,
  FindTransactionsQuery,
  PaymentMethod,
  ReimbursementStatus,
  Transaction,
  TransactionRepository,
  TransactionStatus,
  TransactionType,
  TransferCreateResult,
  TransferView,
  UpdateTransactionRecord,
  VoidTransactionAtomicInput,
  VoidTransactionResult,
  VoidTransferAtomicInput,
  VoidTransferResult,
} from "./transaction.types.js";

export function toCreateData(input: CreateTransactionInput) {
  return {
    ...(input.id !== undefined ? { id: input.id } : {}),
    userId: input.userId,
    accountId: input.accountId,
    creditCardId: input.creditCardId ?? null,
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
        ...(query.creditCardId !== undefined
          ? { creditCardId: query.creditCardId }
          : {}),
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

  async createTransferAtomic(
    input: CreateTransferAtomicInput
  ): Promise<TransferCreateResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.transferLink.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: {
            outTransaction: true,
            inTransaction: true,
          },
        });
        if (existing) {
          assertTransferIdempotentReplay(existing, input);
          return {
            created: false,
            transferId: existing.transferId,
            out: toTransaction(existing.outTransaction),
            in: toTransaction(existing.inTransaction),
          };
        }

        const [firstId, secondId] =
          input.sourceAccountId < input.destinationAccountId
            ? [input.sourceAccountId, input.destinationAccountId]
            : [input.destinationAccountId, input.sourceAccountId];

        await lockAccount(tx, firstId);
        await lockAccount(tx, secondId);

        const source = await tx.account.findUnique({
          where: { id: input.sourceAccountId },
        });
        const destination = await tx.account.findUnique({
          where: { id: input.destinationAccountId },
        });
        if (!source || source.userId !== input.userId) {
          throw new AppError("NOT_FOUND", "Cuenta origen no encontrada.", 404);
        }
        if (!destination || destination.userId !== input.userId) {
          throw new AppError("NOT_FOUND", "Cuenta destino no encontrada.", 404);
        }
        if (!source.isActive) {
          throw new AppError(
            "VALIDATION_ERROR",
            "No se puede operar sobre una cuenta origen inactiva.",
            400
          );
        }
        if (!destination.isActive) {
          throw new AppError(
            "VALIDATION_ERROR",
            "No se puede operar sobre una cuenta destino inactiva.",
            400
          );
        }
        if (source.id === destination.id) {
          throw new AppError(
            "VALIDATION_ERROR",
            "La cuenta origen y la cuenta destino deben ser distintas.",
            400
          );
        }
        if (source.currency !== destination.currency) {
          throw new AppError(
            "CURRENCY_MISMATCH",
            "La transferencia requiere la misma moneda en ambas cuentas.",
            400
          );
        }

        const transferId = randomUUID();
        const outId = randomUUID();
        const inId = randomUUID();
        const shared = {
          userId: input.userId,
          categoryId: null,
          type: "TRANSFER" as const,
          status: "ACTIVE" as const,
          amount: input.amount,
          currency: source.currency,
          description: input.description,
          occurredAt: input.occurredAt,
          relatedTransactionId: null,
        };

        const out = await tx.transaction.create({
          data: toCreateData({
            ...shared,
            id: outId,
            accountId: source.id,
            metadata: { transferId, direction: "OUT" },
          }),
        });
        const incoming = await tx.transaction.create({
          data: toCreateData({
            ...shared,
            id: inId,
            accountId: destination.id,
            metadata: { transferId, direction: "IN" },
          }),
        });

        await tx.transferLink.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            transferId,
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            outTransactionId: out.id,
            inTransactionId: incoming.id,
            amount: input.amount,
            currency: source.currency,
            description: input.description,
            occurredAt: input.occurredAt,
            clientSentOccurredAt: input.clientSentOccurredAt,
            idempotencyKey: input.idempotencyKey,
          },
        });

        return {
          created: true,
          transferId,
          out: toTransaction(out),
          in: toTransaction(incoming),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.transferLink.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: {
            outTransaction: true,
            inTransaction: true,
          },
        });
        if (existing) {
          assertTransferIdempotentReplay(existing, input);
          return {
            created: false,
            transferId: existing.transferId,
            out: toTransaction(existing.outTransaction),
            in: toTransaction(existing.inTransaction),
          };
        }
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "idempotencyKey ya usado con otro payload de transferencia.",
          409
        );
      }
      throw error;
    }
  }

  async listTransfers(userId: string): Promise<TransferView[]> {
    const rows = await this.prisma.transferLink.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
    });
    return rows.map(toTransferView);
  }

  async findTransferById(
    userId: string,
    transferId: string
  ): Promise<TransferView | null> {
    const row = await this.prisma.transferLink.findFirst({
      where: { userId, transferId },
    });
    return row ? toTransferView(row) : null;
  }

  async voidTransactionAtomic(
    input: VoidTransactionAtomicInput
  ): Promise<VoidTransactionResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "TRANSACTION_VOID", input.transactionId);
          return this.replayTransactionVoid(tx, input, replay);
        }

        const locked = await lockTransaction(tx, input.transactionId);
        if (locked.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Movimiento no encontrado.", 404);
        }
        if (locked.status !== "ACTIVE") {
          throw new AppError(
            "TRANSACTION_ALREADY_VOIDED",
            "El movimiento ya está anulado.",
            409
          );
        }

        /**
         * A card EXPENSE recognized from an installment is reversed, not
         * plainly voided: the installment goes back to PENDING so the
         * scheduler can recognize it again after the correction.
         */
        const installment = await tx.creditCardInstallment.findUnique({
          where: { recognizedTransactionId: input.transactionId },
        });

        const resultStatus = installment ? "REVERSED" : "VOIDED";
        const updated = await tx.transaction.update({
          where: { id: input.transactionId },
          data: { status: resultStatus },
        });

        if (installment) {
          await tx.creditCardInstallment.update({
            where: { id: installment.id },
            data: {
              status: "PENDING",
              recognizedTransactionId: null,
              recognizedAt: null,
            },
          });
        }

        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "TRANSACTION_VOID",
          targetId: input.transactionId,
          resultStatus,
          result: {
            transactionId: input.transactionId,
            status: resultStatus,
            installmentId: installment?.id ?? null,
            purchaseId: installment?.purchaseId ?? null,
          },
        });

        return {
          created: true,
          transaction: toTransaction(updated),
          resultStatus,
          installmentId: installment?.id ?? null,
          purchaseId: installment?.purchaseId ?? null,
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
          assertCorrectionTarget(replay, "TRANSACTION_VOID", input.transactionId);
          return this.replayTransactionVoid(this.prisma, input, replay);
        }
      }
      throw error;
    }
  }

  async voidTransferAtomic(
    input: VoidTransferAtomicInput
  ): Promise<VoidTransferResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "TRANSFER_VOID", input.transferId);
          return this.replayTransferVoid(tx, input);
        }

        const link = await tx.transferLink.findFirst({
          where: { userId: input.userId, transferId: input.transferId },
        });
        if (!link) {
          throw new AppError("NOT_FOUND", "Transferencia no encontrada.", 404);
        }

        // Both legs under one lock: never leave a half-voided transfer.
        const [firstId, secondId] =
          link.outTransactionId < link.inTransactionId
            ? [link.outTransactionId, link.inTransactionId]
            : [link.inTransactionId, link.outTransactionId];
        const first = await lockTransaction(tx, firstId);
        const second = await lockTransaction(tx, secondId);

        if (
          first.user_id !== input.userId ||
          second.user_id !== input.userId
        ) {
          throw new AppError("NOT_FOUND", "Transferencia no encontrada.", 404);
        }
        if (link.voidedAt != null || first.status !== "ACTIVE" || second.status !== "ACTIVE") {
          throw new AppError(
            "TRANSFER_ALREADY_VOIDED",
            "La transferencia ya está anulada.",
            409
          );
        }

        await tx.transaction.updateMany({
          where: {
            id: { in: [link.outTransactionId, link.inTransactionId] },
            status: "ACTIVE",
          },
          data: { status: "REVERSED" },
        });

        const voidedAt = new Date();
        const updatedLink = await tx.transferLink.update({
          where: { id: link.id },
          data: { voidedAt, voidIdempotencyKey: input.idempotencyKey },
        });

        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "TRANSFER_VOID",
          targetId: input.transferId,
          resultStatus: "REVERSED",
          result: {
            transferId: input.transferId,
            outTransactionId: link.outTransactionId,
            inTransactionId: link.inTransactionId,
            status: "REVERSED",
          },
        });

        const out = await tx.transaction.findUniqueOrThrow({
          where: { id: link.outTransactionId },
        });
        const incoming = await tx.transaction.findUniqueOrThrow({
          where: { id: link.inTransactionId },
        });

        return {
          created: true,
          transfer: toTransferView(updatedLink),
          out: toTransaction(out),
          in: toTransaction(incoming),
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
          assertCorrectionTarget(replay, "TRANSFER_VOID", input.transferId);
          return this.replayTransferVoid(this.prisma, input);
        }
      }
      throw error;
    }
  }

  private async replayTransactionVoid(
    db: TxClient | ReturnType<typeof getPrismaClient>,
    input: VoidTransactionAtomicInput,
    correction: CorrectionOperation
  ): Promise<VoidTransactionResult> {
    const current = await db.transaction.findUniqueOrThrow({
      where: { id: input.transactionId },
    });
    const recorded = (correction.result ?? {}) as {
      installmentId?: unknown;
      purchaseId?: unknown;
    };
    return {
      created: false,
      transaction: toTransaction(current),
      resultStatus: correction.resultStatus,
      installmentId:
        typeof recorded.installmentId === "string" ? recorded.installmentId : null,
      purchaseId:
        typeof recorded.purchaseId === "string" ? recorded.purchaseId : null,
    };
  }

  private async replayTransferVoid(
    db: TxClient | ReturnType<typeof getPrismaClient>,
    input: VoidTransferAtomicInput
  ): Promise<VoidTransferResult> {
    const link = await db.transferLink.findFirst({
      where: { userId: input.userId, transferId: input.transferId },
    });
    if (!link) {
      throw new AppError("NOT_FOUND", "Transferencia no encontrada.", 404);
    }
    const out = await db.transaction.findUniqueOrThrow({
      where: { id: link.outTransactionId },
    });
    const incoming = await db.transaction.findUniqueOrThrow({
      where: { id: link.inTransactionId },
    });
    return {
      created: false,
      transfer: toTransferView(link),
      out: toTransaction(out),
      in: toTransaction(incoming),
    };
  }
}

export function toTransaction(record: PrismaTransaction): Transaction {
  return {
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    creditCardId: record.creditCardId,
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

type TxClient = Prisma.TransactionClient;

type LockedAccount = { id: string };

type LockedTransaction = {
  id: string;
  user_id: string;
  type: string;
  status: string;
};

async function lockAccount(tx: TxClient, accountId: string): Promise<void> {
  const rows = await tx.$queryRaw<LockedAccount[]>`
    SELECT id
    FROM accounts
    WHERE id = ${accountId}::uuid
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
  }
}

async function lockTransaction(
  tx: TxClient,
  transactionId: string
): Promise<LockedTransaction> {
  const rows = await tx.$queryRaw<LockedTransaction[]>`
    SELECT id, user_id, type::text AS type, status::text AS status
    FROM transactions
    WHERE id = ${transactionId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "Movimiento no encontrado.", 404);
  }
  return row;
}

function assertTransferIdempotentReplay(
  existing: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: { toFixed(digits: number): string };
    description: string | null;
    occurredAt: Date;
    clientSentOccurredAt: boolean;
  },
  input: CreateTransferAtomicInput
): void {
  /**
   * Canonical payload:
   * sourceAccountId, destinationAccountId, amount,
   * description (normalized null),
   * occurredAt only when the client sent it.
   */
  const sameCore =
    existing.sourceAccountId === input.sourceAccountId &&
    existing.destinationAccountId === input.destinationAccountId &&
    existing.amount.toFixed(2) === input.amount &&
    (existing.description ?? null) === (input.description ?? null);

  const sameOccurredAt =
    !input.clientSentOccurredAt ||
    (existing.clientSentOccurredAt &&
      existing.occurredAt.getTime() === input.occurredAt.getTime());

  if (!sameCore || !sameOccurredAt) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otro payload de transferencia.",
      409
    );
  }
}

function toTransferView(row: {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: { toFixed(digits: number): string };
  currency: string;
  description: string | null;
  occurredAt: Date;
  outTransactionId: string;
  inTransactionId: string;
  voidedAt: Date | null;
  createdAt: Date;
}): TransferView {
  return {
    transferId: row.transferId,
    sourceAccountId: row.sourceAccountId,
    destinationAccountId: row.destinationAccountId,
    amount: row.amount.toFixed(2),
    currency: row.currency as Currency,
    description: row.description,
    occurredAt: row.occurredAt,
    outTransactionId: row.outTransactionId,
    inTransactionId: row.inTransactionId,
    voidedAt: row.voidedAt,
    createdAt: row.createdAt,
  };
}
