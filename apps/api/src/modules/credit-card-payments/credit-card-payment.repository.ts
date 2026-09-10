import { randomUUID } from "node:crypto";
import {
  Prisma,
  type CreditCardPaymentLink as PrismaPaymentLink,
  type Transaction as PrismaTransaction,
} from "@prisma/client";
import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  assertCorrectionTarget,
  findCorrectionByKey,
  isUniqueViolation,
  recordCorrection,
} from "../corrections/correction.repository.js";
import {
  computeCurrentCardDebt,
  deriveStatementPaymentStatus,
  statementTargetAmount,
} from "../credit-cards/credit-card-debt.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import { toTransaction } from "../transactions/transaction.repository.js";
import type {
  CreateCreditCardPaymentInput,
  CreatePaymentAtomicResult,
  CreditCardPaymentLinkRecord,
  CreditCardPaymentRepository,
  CreditCardPaymentView,
  VoidCreditCardPaymentInput,
  VoidPaymentAtomicResult,
} from "./credit-card-payment.types.js";

type LockedCard = {
  id: string;
  user_id: string;
  currency: string;
  is_active: boolean;
};

type LockedAccount = {
  id: string;
  user_id: string;
  currency: string;
  is_active: boolean;
};

type LockedPayment = {
  id: string;
  user_id: string;
  type: string;
  status: string;
};

type LockedStatement = {
  id: string;
  user_id: string;
  credit_card_id: string;
  status: string;
  closed_projected_amount: Prisma.Decimal | null;
  actual_amount: Prisma.Decimal | null;
};

export class PrismaCreditCardPaymentRepository
  implements CreditCardPaymentRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async findByTransactionId(
    transactionId: string
  ): Promise<CreditCardPaymentLinkRecord | null> {
    const record = await this.prisma.creditCardPaymentLink.findUnique({
      where: { transactionId },
    });
    return record ? toLink(record) : null;
  }

  async findByUserAndIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CreditCardPaymentLinkRecord | null> {
    const record = await this.prisma.creditCardPaymentLink.findUnique({
      where: {
        userId_idempotencyKey: { userId, idempotencyKey },
      },
    });
    return record ? toLink(record) : null;
  }

  async findByCreditCardId(
    creditCardId: string
  ): Promise<CreditCardPaymentLinkRecord[]> {
    const rows = await this.prisma.creditCardPaymentLink.findMany({
      where: { creditCardId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toLink);
  }

  async findByStatementId(
    statementId: string
  ): Promise<CreditCardPaymentLinkRecord[]> {
    const rows = await this.prisma.creditCardPaymentLink.findMany({
      where: { statementId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toLink);
  }

  async createPaymentAtomic(
    input: CreateCreditCardPaymentInput
  ): Promise<CreatePaymentAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditCardPaymentLink.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { transaction: true },
        });
        if (existing) {
          assertIdempotentReplay(existing, input);
          return {
            created: false,
            payment: toPaymentView(existing, existing.transaction),
          };
        }

        const cards = await tx.$queryRaw<LockedCard[]>`
          SELECT id, user_id, currency::text AS currency, is_active
          FROM credit_cards
          WHERE id = ${input.creditCardId}::uuid
          FOR UPDATE
        `;
        const card = cards[0];
        if (!card || card.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
        }
        if (!card.is_active) {
          throw new AppError(
            "VALIDATION_ERROR",
            "No se puede pagar una tarjeta inactiva.",
            400
          );
        }

        const accounts = await tx.$queryRaw<LockedAccount[]>`
          SELECT id, user_id, currency::text AS currency, is_active
          FROM accounts
          WHERE id = ${input.accountId}::uuid
          FOR UPDATE
        `;
        const account = accounts[0];
        if (!account || account.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
        }
        if (!account.is_active) {
          throw new AppError(
            "VALIDATION_ERROR",
            "La cuenta origen debe estar activa.",
            400
          );
        }
        if (account.currency !== card.currency) {
          throw new AppError(
            "VALIDATION_ERROR",
            "La moneda de la cuenta debe coincidir con la de la tarjeta (sin FX en P0.10).",
            400
          );
        }

        const debtRows = await tx.transaction.findMany({
          where: {
            userId: input.userId,
            creditCardId: card.id,
            status: "ACTIVE",
            type: { in: ["EXPENSE", "CREDIT_CARD_PAYMENT", "REIMBURSEMENT"] },
          },
        });
        const currentDebt = computeCurrentCardDebt(
          debtRows.map((row) => toTransaction(row))
        );
        const amountCents = toCents(input.amount);
        if (amountCents > toCents(currentDebt)) {
          throw new AppError(
            "VALIDATION_ERROR",
            `El pago supera la deuda actual (${currentDebt}).`,
            400
          );
        }

        let statementId: string | null = input.statementId ?? null;
        if (statementId) {
          const statements = await tx.$queryRaw<LockedStatement[]>`
            SELECT id, user_id, credit_card_id, status::text AS status,
                   closed_projected_amount, actual_amount
            FROM credit_card_statements
            WHERE id = ${statementId}::uuid
            FOR UPDATE
          `;
          const statement = statements[0];
          if (
            !statement ||
            statement.user_id !== input.userId ||
            statement.credit_card_id !== card.id
          ) {
            throw new AppError("NOT_FOUND", "Resumen no encontrado.", 404);
          }
          if (
            statement.status !== "CLOSED" &&
            statement.status !== "PARTIALLY_PAID"
          ) {
            throw new AppError(
              "VALIDATION_ERROR",
              "Solo se puede pagar un statement CLOSED o PARTIALLY_PAID.",
              400
            );
          }

          const target = statementTargetAmount({
            actualAmount: statement.actual_amount?.toFixed(2) ?? null,
            closedProjectedAmount:
              statement.closed_projected_amount?.toFixed(2) ?? null,
          });
          if (target == null || toCents(target) <= 0n) {
            throw new AppError(
              "VALIDATION_ERROR",
              "El statement no tiene monto objetivo pagable.",
              400
            );
          }

          const priorLinks = await tx.creditCardPaymentLink.findMany({
            where: { statementId: statement.id },
            include: { transaction: true },
          });
          const paidCents = priorLinks
            .filter((link) => link.transaction.status === "ACTIVE")
            .reduce(
              (acc, link) => acc + toCents(link.transaction.amount.toFixed(2)),
              0n
            );
          const remaining = toCents(target) - paidCents;
          if (remaining <= 0n) {
            throw new AppError(
              "VALIDATION_ERROR",
              "El statement ya está completamente pagado.",
              400
            );
          }
          if (amountCents > remaining) {
            throw new AppError(
              "VALIDATION_ERROR",
              `El pago supera el saldo pendiente del statement (${fromCents(remaining)}).`,
              400
            );
          }
        }

        const occurredAt = input.occurredAt ?? new Date();
        const transactionId = randomUUID();
        const linkId = randomUUID();

        const createdTx = await tx.transaction.create({
          data: {
            id: transactionId,
            userId: input.userId,
            accountId: account.id,
            creditCardId: card.id,
            categoryId: null,
            type: "CREDIT_CARD_PAYMENT",
            status: "ACTIVE",
            amount: input.amount,
            currency: card.currency as Currency,
            description:
              input.description === undefined
                ? "Pago de tarjeta"
                : input.description,
            occurredAt,
            paymentMethod: null,
            isFixed: false,
            reimbursementStatus: "NONE",
            relatedTransactionId: null,
          },
        });

        const link = await tx.creditCardPaymentLink.create({
          data: {
            id: linkId,
            userId: input.userId,
            transactionId,
            creditCardId: card.id,
            statementId,
            idempotencyKey: input.idempotencyKey,
          },
        });

        if (statementId) {
          const allLinks = await tx.creditCardPaymentLink.findMany({
            where: { statementId },
            include: { transaction: true },
          });
          const paidAmount = fromCents(
            allLinks
              .filter((row) => row.transaction.status === "ACTIVE")
              .reduce(
                (acc, row) =>
                  acc + toCents(row.transaction.amount.toFixed(2)),
                0n
              )
          );
          const statement = await tx.creditCardStatement.findUniqueOrThrow({
            where: { id: statementId },
          });
          const target = statementTargetAmount({
            actualAmount: statement.actualAmount?.toFixed(2) ?? null,
            closedProjectedAmount:
              statement.closedProjectedAmount?.toFixed(2) ?? null,
          });
          if (target == null) {
            throw new AppError(
              "VALIDATION_ERROR",
              "El statement no tiene monto objetivo pagable.",
              500
            );
          }
          const nextStatus = deriveStatementPaymentStatus({
            paidAmount,
            targetAmount: target,
          });
          await tx.creditCardStatement.update({
            where: { id: statementId },
            data: { status: nextStatus },
          });
        }

        return {
          created: true,
          payment: toPaymentView(link, createdTx),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.findByUserAndIdempotencyKey(
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          const tx = await this.prisma.transaction.findUniqueOrThrow({
            where: { id: replay.transactionId },
          });
          const link = await this.prisma.creditCardPaymentLink.findUniqueOrThrow(
            {
              where: { id: replay.id },
            }
          );
          assertIdempotentReplay(
            { ...link, transaction: tx },
            input
          );
          return {
            created: false,
            payment: toPaymentView(link, tx),
          };
        }
      }
      throw error;
    }
  }

  async voidPaymentAtomic(
    input: VoidCreditCardPaymentInput
  ): Promise<VoidPaymentAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(replay, "PAYMENT_VOID", input.paymentId);
          return this.replayPaymentVoid(tx, input);
        }

        // Same lock order as createPaymentAtomic: card first.
        const cards = await tx.$queryRaw<LockedCard[]>`
          SELECT id, user_id, currency::text AS currency, is_active
          FROM credit_cards
          WHERE id = ${input.creditCardId}::uuid
          FOR UPDATE
        `;
        const card = cards[0];
        if (!card || card.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
        }

        const link = await tx.creditCardPaymentLink.findUnique({
          where: { transactionId: input.paymentId },
        });
        if (
          !link ||
          link.userId !== input.userId ||
          link.creditCardId !== card.id
        ) {
          throw new AppError("NOT_FOUND", "Pago no encontrado.", 404);
        }

        const payments = await tx.$queryRaw<LockedPayment[]>`
          SELECT id, user_id, type::text AS type, status::text AS status
          FROM transactions
          WHERE id = ${input.paymentId}::uuid
          FOR UPDATE
        `;
        const payment = payments[0];
        if (!payment || payment.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Pago no encontrado.", 404);
        }
        if (link.voidedAt != null || payment.status !== "ACTIVE") {
          throw new AppError(
            "PAYMENT_ALREADY_VOIDED",
            "El pago ya está anulado.",
            409
          );
        }

        const reversedTx = await tx.transaction.update({
          where: { id: input.paymentId },
          data: { status: "REVERSED" },
        });
        const voidedLink = await tx.creditCardPaymentLink.update({
          where: { id: link.id },
          data: {
            voidedAt: new Date(),
            voidIdempotencyKey: input.idempotencyKey,
          },
        });

        const statementStatus = link.statementId
          ? await recomputeStatementPaymentStatus(tx, link.statementId)
          : null;

        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "PAYMENT_VOID",
          targetId: input.paymentId,
          resultStatus: "REVERSED",
          result: {
            paymentId: input.paymentId,
            creditCardId: card.id,
            statementId: link.statementId,
            statementStatus,
            status: "REVERSED",
          },
        });

        return {
          created: true,
          payment: toPaymentView(voidedLink, reversedTx),
          statementStatus,
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
          assertCorrectionTarget(replay, "PAYMENT_VOID", input.paymentId);
          return this.replayPaymentVoid(this.prisma, input);
        }
      }
      throw error;
    }
  }

  private async replayPaymentVoid(
    db: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
    input: VoidCreditCardPaymentInput
  ): Promise<VoidPaymentAtomicResult> {
    const link = await db.creditCardPaymentLink.findUnique({
      where: { transactionId: input.paymentId },
    });
    if (!link || link.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Pago no encontrado.", 404);
    }
    const tx = await db.transaction.findUniqueOrThrow({
      where: { id: input.paymentId },
    });
    const statement = link.statementId
      ? await db.creditCardStatement.findUnique({
          where: { id: link.statementId },
        })
      : null;
    return {
      created: false,
      payment: toPaymentView(link, tx),
      statementStatus: statement?.status ?? null,
    };
  }
}

/**
 * Statement payment status is derived from the remaining ACTIVE payments only,
 * so reversing one payment can move PAID → PARTIALLY_PAID → CLOSED.
 * Snapshots (closedProjectedAmount / actualAmount) are never rewritten.
 */
async function recomputeStatementPaymentStatus(
  tx: Prisma.TransactionClient,
  statementId: string
): Promise<string | null> {
  const statement = await tx.creditCardStatement.findUnique({
    where: { id: statementId },
  });
  if (!statement) {
    return null;
  }
  const target = statementTargetAmount({
    actualAmount: statement.actualAmount?.toFixed(2) ?? null,
    closedProjectedAmount: statement.closedProjectedAmount?.toFixed(2) ?? null,
  });
  if (target == null) {
    return statement.status;
  }
  const links = await tx.creditCardPaymentLink.findMany({
    where: { statementId },
    include: { transaction: true },
  });
  const paidAmount = fromCents(
    links
      .filter((row) => row.transaction.status === "ACTIVE")
      .reduce((acc, row) => acc + toCents(row.transaction.amount.toFixed(2)), 0n)
  );
  const nextStatus = deriveStatementPaymentStatus({
    paidAmount,
    targetAmount: target,
  });
  const updated = await tx.creditCardStatement.update({
    where: { id: statementId },
    data: { status: nextStatus },
  });
  return updated.status;
}

function assertIdempotentReplay(
  existing: {
    creditCardId: string;
    statementId: string | null;
    transaction: PrismaTransaction;
  },
  input: CreateCreditCardPaymentInput
): void {
  const tx = existing.transaction;
  /**
   * Canonical payload for idempotency (financial effect + association):
   * creditCardId, accountId, amount, statementId,
   * and occurredAt when the client sends it explicitly.
   */
  const sameCore =
    existing.creditCardId === input.creditCardId &&
    tx.accountId === input.accountId &&
    tx.amount.toFixed(2) === input.amount &&
    (existing.statementId ?? null) === (input.statementId ?? null);

  const sameOccurredAt =
    input.occurredAt === undefined ||
    tx.occurredAt.getTime() === input.occurredAt.getTime();

  if (!sameCore || !sameOccurredAt) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otro payload de pago.",
      409
    );
  }
}

function toLink(record: PrismaPaymentLink): CreditCardPaymentLinkRecord {
  return {
    id: record.id,
    userId: record.userId,
    transactionId: record.transactionId,
    creditCardId: record.creditCardId,
    statementId: record.statementId,
    idempotencyKey: record.idempotencyKey,
    voidedAt: record.voidedAt,
    voidIdempotencyKey: record.voidIdempotencyKey,
    createdAt: record.createdAt,
  };
}

function toPaymentView(
  link: Pick<
    PrismaPaymentLink,
    | "transactionId"
    | "creditCardId"
    | "statementId"
    | "idempotencyKey"
    | "voidedAt"
  >,
  tx: PrismaTransaction
): CreditCardPaymentView {
  if (tx.accountId == null) {
    throw new AppError(
      "INVALID_CREDIT_CARD_PAYMENT",
      "CREDIT_CARD_PAYMENT sin accountId.",
      500
    );
  }
  return {
    id: link.transactionId,
    creditCardId: link.creditCardId,
    statementId: link.statementId,
    accountId: tx.accountId,
    amount: tx.amount.toFixed(2),
    currency: tx.currency as CreditCardPaymentView["currency"],
    occurredAt: tx.occurredAt,
    description: tx.description,
    status: tx.status as CreditCardPaymentView["status"],
    idempotencyKey: link.idempotencyKey,
    voidedAt: link.voidedAt,
  };
}
