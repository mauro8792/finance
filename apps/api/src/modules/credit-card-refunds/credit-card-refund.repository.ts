import { randomUUID } from "node:crypto";
import {
  Prisma,
  type CreditCardRefundAccreditation as PrismaAccreditation,
  type CreditCardRefundExpectation as PrismaExpectation,
  type Transaction as PrismaTransaction,
} from "@prisma/client";
import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  assertCorrectionTarget,
  findCorrectionByKey,
  recordCorrection,
} from "../corrections/correction.repository.js";
import { computeCurrentCardDebt } from "../credit-cards/credit-card-debt.js";
import {
  reimbursementStatusFromTotals,
  sumAmounts,
} from "../transactions/net-expense.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import { toTransaction } from "../transactions/transaction.repository.js";
import type {
  AccreditAtomicResult,
  AccreditCreditCardRefundInput,
  CancelExpectationAtomicResult,
  CreateCreditCardRefundExpectationInput,
  CreateExpectationAtomicResult,
  CreditCardRefundAccreditationRecord,
  CreditCardRefundAccreditationView,
  CreditCardRefundDestinationType,
  CreditCardRefundExpectationRecord,
  CreditCardRefundExpectationStatus,
  CreditCardRefundExpectationView,
  CreditCardRefundRepository,
  VoidAccreditationAtomicResult,
  VoidCreditCardRefundAccreditationInput,
} from "./credit-card-refund.types.js";

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

type LockedExpense = {
  id: string;
  user_id: string;
  credit_card_id: string | null;
  account_id: string | null;
  type: string;
  status: string;
  amount: Prisma.Decimal;
  currency: string;
};

type LockedPurchase = {
  id: string;
  user_id: string;
  credit_card_id: string;
  currency: string;
  status: string;
};

type LockedExpectation = {
  id: string;
  user_id: string;
  credit_card_id: string;
  purchase_id: string | null;
  original_expense_transaction_id: string | null;
  expected_amount: Prisma.Decimal;
  currency: string;
  status: string;
  expected_date: Date | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

type TxClient = Prisma.TransactionClient;

export class PrismaCreditCardRefundRepository
  implements CreditCardRefundRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async findExpectationById(
    id: string
  ): Promise<CreditCardRefundExpectationRecord | null> {
    const record = await this.prisma.creditCardRefundExpectation.findUnique({
      where: { id },
    });
    return record ? toExpectationRecord(record) : null;
  }

  async findExpectationsByUserId(
    userId: string
  ): Promise<CreditCardRefundExpectationRecord[]> {
    const rows = await this.prisma.creditCardRefundExpectation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toExpectationRecord);
  }

  async findAccreditationById(
    id: string
  ): Promise<CreditCardRefundAccreditationRecord | null> {
    const record = await this.prisma.creditCardRefundAccreditation.findUnique({
      where: { id },
    });
    return record ? toAccreditationRecord(record) : null;
  }

  async findAccreditationByUserAndIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CreditCardRefundAccreditationRecord | null> {
    const record = await this.prisma.creditCardRefundAccreditation.findUnique({
      where: {
        userId_idempotencyKey: { userId, idempotencyKey },
      },
    });
    return record ? toAccreditationRecord(record) : null;
  }

  async buildExpectationView(
    record: CreditCardRefundExpectationRecord
  ): Promise<CreditCardRefundExpectationView> {
    const accreditedAmount = await this.sumAccreditedForExpectation(record.id);
    return toExpectationView(record, accreditedAmount);
  }

  async createExpectationAtomic(
    input: CreateCreditCardRefundExpectationInput
  ): Promise<CreateExpectationAtomicResult> {
    return this.prisma.$transaction(async (tx) => {
      const source = await resolveExpectationSource(tx, input);
      await lockCard(tx, source.creditCardId, input.userId);

      if (source.purchaseId) {
        await lockPurchaseAndRecognizedExpenses(
          tx,
          source.purchaseId,
          input.userId
        );
      } else if (source.originalExpenseTransactionId) {
        await lockExpense(
          tx,
          source.originalExpenseTransactionId,
          input.userId
        );
      }

      const eligible = await eligibleAmountCents(tx, source);
      const committed = await committedCapacityCents(tx, source, null);
      const remaining = eligible - committed;
      const expectedCents = toCents(input.expectedAmount);
      if (expectedCents > remaining) {
        throw new AppError(
          "VALIDATION_ERROR",
          `El monto esperado supera la capacidad remanente (${fromCents(remaining)}).`,
          400
        );
      }

      const created = await tx.creditCardRefundExpectation.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          creditCardId: source.creditCardId,
          purchaseId: source.purchaseId,
          originalExpenseTransactionId: source.originalExpenseTransactionId,
          expectedAmount: input.expectedAmount,
          cancelledRemainingAmount: "0.00",
          currency: source.currency,
          status: "EXPECTED",
          expectedDate:
            input.expectedDate === undefined ? null : input.expectedDate,
          description:
            input.description === undefined ? null : input.description,
        },
      });

      return {
        expectation: toExpectationView(toExpectationRecord(created), "0.00"),
      };
    });
  }

  async cancelExpectationAtomic(
    userId: string,
    expectationId: string
  ): Promise<CancelExpectationAtomicResult> {
    return this.prisma.$transaction(async (tx) => {
      const preview = await tx.creditCardRefundExpectation.findUnique({
        where: { id: expectationId },
      });
      if (!preview || preview.userId !== userId) {
        throw new AppError("NOT_FOUND", "Expectativa no encontrada.", 404);
      }

      await lockCard(tx, preview.creditCardId, userId);
      const locked = await lockExpectation(tx, expectationId, userId);
      if (locked.status === "CANCELLED" || locked.status === "ACCREDITED") {
        throw new AppError(
          "VALIDATION_ERROR",
          "La expectativa ya está cerrada.",
          400
        );
      }

      const accreditedAmount = await sumAccreditedForExpectationTx(
        tx,
        expectationId
      );
      const accreditedCents = toCents(accreditedAmount);
      const expectedCents = toCents(locked.expected_amount.toFixed(2));
      const cancelledRemainingCents =
        expectedCents > accreditedCents ? expectedCents - accreditedCents : 0n;
      const nextStatus: CreditCardRefundExpectationStatus =
        accreditedCents === 0n ? "CANCELLED" : "ACCREDITED";

      const updated = await tx.creditCardRefundExpectation.update({
        where: { id: expectationId },
        data: {
          status: nextStatus,
          cancelledRemainingAmount: fromCents(cancelledRemainingCents),
        },
      });

      return {
        expectation: toExpectationView(
          toExpectationRecord(updated),
          accreditedAmount
        ),
      };
    });
  }

  async accreditAtomic(
    input: AccreditCreditCardRefundInput
  ): Promise<AccreditAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditCardRefundAccreditation.findUnique({
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
          const expectation =
            existing.expectationId == null
              ? null
              : await this.buildExpectationViewFromTx(
                  tx,
                  existing.expectationId
                );
          return {
            created: false,
            accreditation: toAccreditationView(existing, existing.transaction),
            expectation,
          };
        }

        const resolved = await resolveAccreditTarget(tx, input);

        // Locking order: card → expense/purchase → expectation → bank account
        await lockCard(tx, resolved.creditCardId, input.userId);

        let targetExpense: LockedExpense;
        if (resolved.purchaseId) {
          const recognized = await lockPurchaseAndRecognizedExpenses(
            tx,
            resolved.purchaseId,
            input.userId
          );
          targetExpense = pickExpenseWithCapacity(
            recognized.expenses,
            await remainingByExpenseCents(tx, recognized.expenses.map((e) => e.id)),
            toCents(input.amount)
          );
        } else {
          targetExpense = await lockExpense(
            tx,
            resolved.originalExpenseTransactionId!,
            input.userId
          );
        }

        let lockedExpectation: LockedExpectation | null = null;
        if (resolved.expectationId) {
          lockedExpectation = await lockExpectation(
            tx,
            resolved.expectationId,
            input.userId
          );
          if (
            lockedExpectation.status === "CANCELLED" ||
            lockedExpectation.status === "ACCREDITED"
          ) {
            throw new AppError(
              "VALIDATION_ERROR",
              "La expectativa no admite más acreditaciones.",
              400
            );
          }
        }

        let accountId: string | null = null;
        if (input.destinationType === "BANK_ACCOUNT") {
          if (input.accountId == null) {
            throw new AppError(
              "VALIDATION_ERROR",
              "accountId es obligatorio para destino BANK_ACCOUNT.",
              400
            );
          }
          const account = await lockAccount(tx, input.accountId, input.userId);
          if (account.currency !== resolved.currency) {
            throw new AppError(
              "CURRENCY_MISMATCH",
              "La moneda de la cuenta debe coincidir con la del gasto/compra.",
              400
            );
          }
          accountId = account.id;
        }

        const amountCents = toCents(input.amount);
        const source: RefundSource = {
          creditCardId: resolved.creditCardId,
          purchaseId: resolved.purchaseId,
          originalExpenseTransactionId: resolved.purchaseId
            ? null
            : targetExpense.id,
          currency: resolved.currency,
        };

        const eligible = await eligibleAmountCents(tx, source);
        const committed = await committedCapacityCents(
          tx,
          source,
          resolved.expectationId
        );
        if (committed + amountCents > eligible) {
          throw new AppError(
            "VALIDATION_ERROR",
            `El reintegro supera el elegible remanente (${fromCents(eligible - committed)}).`,
            400
          );
        }

        if (lockedExpectation) {
          const expAccredited = await sumAccreditedForExpectationTx(
            tx,
            lockedExpectation.id
          );
          const remainingExp =
            toCents(lockedExpectation.expected_amount.toFixed(2)) -
            toCents(expAccredited);
          if (amountCents > remainingExp) {
            throw new AppError(
              "VALIDATION_ERROR",
              `El reintegro supera el restante de la expectativa (${fromCents(remainingExp)}).`,
              400
            );
          }
        }

        const expenseRemaining = await remainingForExpenseCents(
          tx,
          targetExpense.id,
          targetExpense.amount.toFixed(2)
        );
        if (amountCents > expenseRemaining) {
          throw new AppError(
            "VALIDATION_ERROR",
            `El reintegro supera la capacidad remanente del gasto reconocido (${fromCents(expenseRemaining)}).`,
            400
          );
        }

        if (input.destinationType === "CREDIT_CARD") {
          const debtRows = await tx.transaction.findMany({
            where: {
              userId: input.userId,
              creditCardId: resolved.creditCardId,
              status: "ACTIVE",
              type: { in: ["EXPENSE", "CREDIT_CARD_PAYMENT", "REIMBURSEMENT"] },
            },
          });
          const currentDebt = computeCurrentCardDebt(
            debtRows.map((row) => toTransaction(row))
          );
          if (amountCents > toCents(currentDebt)) {
            throw new AppError(
              "VALIDATION_ERROR",
              `El reintegro a tarjeta supera la deuda actual (${currentDebt}).`,
              400
            );
          }
        }

        const occurredAt = input.occurredAt ?? new Date();
        const transactionId = randomUUID();
        const linkId = randomUUID();

        const related = await tx.transaction.findMany({
          where: {
            userId: input.userId,
            relatedTransactionId: targetExpense.id,
            type: "REIMBURSEMENT",
            status: "ACTIVE",
          },
        });
        const priorReimbursed = sumAmounts(
          related.map((row) => row.amount.toFixed(2))
        );
        const nextReimbursed = sumAmounts([
          priorReimbursed,
          input.amount,
        ]);
        const reimbursementStatus = reimbursementStatusFromTotals(
          targetExpense.amount.toFixed(2),
          nextReimbursed
        );

        const createdTx = await tx.transaction.create({
          data: {
            id: transactionId,
            userId: input.userId,
            accountId:
              input.destinationType === "BANK_ACCOUNT" ? accountId : null,
            creditCardId:
              input.destinationType === "CREDIT_CARD"
                ? resolved.creditCardId
                : null,
            categoryId: null,
            type: "REIMBURSEMENT",
            status: "ACTIVE",
            amount: input.amount,
            currency: resolved.currency as Currency,
            description:
              input.description === undefined
                ? "Reintegro de tarjeta"
                : input.description,
            occurredAt,
            paymentMethod: null,
            isFixed: false,
            reimbursementStatus: "NONE",
            relatedTransactionId: targetExpense.id,
          },
        });

        await tx.transaction.update({
          where: { id: targetExpense.id },
          data: { reimbursementStatus },
        });

        const link = await tx.creditCardRefundAccreditation.create({
          data: {
            id: linkId,
            userId: input.userId,
            transactionId,
            expectationId: resolved.expectationId,
            originalExpenseTransactionId: targetExpense.id,
            purchaseId: resolved.purchaseId,
            creditCardId: resolved.creditCardId,
            destinationType: input.destinationType,
            idempotencyKey: input.idempotencyKey,
          },
        });

        let expectationView: CreditCardRefundExpectationView | null = null;
        if (lockedExpectation) {
          const accreditedAmount = await sumAccreditedForExpectationTx(
            tx,
            lockedExpectation.id
          );
          const accreditedCents = toCents(accreditedAmount);
          const expectedCents = toCents(
            lockedExpectation.expected_amount.toFixed(2)
          );
          const nextStatus: CreditCardRefundExpectationStatus =
            accreditedCents >= expectedCents
              ? "ACCREDITED"
              : "PARTIALLY_ACCREDITED";
          const updated = await tx.creditCardRefundExpectation.update({
            where: { id: lockedExpectation.id },
            data: { status: nextStatus },
          });
          expectationView = toExpectationView(
            toExpectationRecord(updated),
            accreditedAmount
          );
        }

        return {
          created: true,
          accreditation: toAccreditationView(link, createdTx),
          expectation: expectationView,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay = await this.findAccreditationByUserAndIdempotencyKey(
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          const txRow = await this.prisma.transaction.findUniqueOrThrow({
            where: { id: replay.transactionId },
          });
          const link =
            await this.prisma.creditCardRefundAccreditation.findUniqueOrThrow({
              where: { id: replay.id },
            });
          assertIdempotentReplay({ ...link, transaction: txRow }, input);
          const expectation =
            replay.expectationId == null
              ? null
              : await this.buildExpectationView(
                  (await this.findExpectationById(replay.expectationId))!
                );
          return {
            created: false,
            accreditation: toAccreditationView(link, txRow),
            expectation,
          };
        }
      }
      throw error;
    }
  }

  async voidAccreditationAtomic(
    input: VoidCreditCardRefundAccreditationInput
  ): Promise<VoidAccreditationAtomicResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await findCorrectionByKey(
          tx,
          input.userId,
          input.idempotencyKey
        );
        if (replay) {
          assertCorrectionTarget(
            replay,
            "REFUND_ACCREDITATION_VOID",
            input.accreditationId
          );
          return this.replayAccreditationVoid(tx, input);
        }

        const link = await tx.creditCardRefundAccreditation.findUnique({
          where: { id: input.accreditationId },
        });
        if (!link || link.userId !== input.userId) {
          throw new AppError("NOT_FOUND", "Acreditación no encontrada.", 404);
        }

        // Locking order mirrors accreditAtomic: card → expense → expectation.
        await lockCardForCorrection(tx, link.creditCardId, input.userId);
        const reimbursements = await tx.$queryRaw<LockedExpense[]>`
          SELECT id, user_id, credit_card_id, account_id, type::text AS type,
                 status::text AS status, amount, currency::text AS currency
          FROM transactions
          WHERE id = ${link.transactionId}::uuid
          FOR UPDATE
        `;
        const reimbursement = reimbursements[0];
        if (!reimbursement || reimbursement.user_id !== input.userId) {
          throw new AppError("NOT_FOUND", "Acreditación no encontrada.", 404);
        }
        if (link.voidedAt != null || reimbursement.status !== "ACTIVE") {
          throw new AppError(
            "REFUND_ACCREDITATION_ALREADY_VOIDED",
            "La acreditación ya está anulada.",
            409
          );
        }

        const originalExpense = await lockExpenseForCorrection(
          tx,
          link.originalExpenseTransactionId,
          input.userId
        );
        if (link.expectationId) {
          await lockExpectation(tx, link.expectationId, input.userId);
        }

        const reversedTx = await tx.transaction.update({
          where: { id: link.transactionId },
          data: { status: "REVERSED" },
        });
        const voidedLink = await tx.creditCardRefundAccreditation.update({
          where: { id: link.id },
          data: {
            voidedAt: new Date(),
            voidIdempotencyKey: input.idempotencyKey,
          },
        });

        const remainingReimbursed = await remainingReimbursedForExpense(
          tx,
          originalExpense.id
        );
        await tx.transaction.update({
          where: { id: originalExpense.id },
          data: {
            reimbursementStatus:
              toCents(remainingReimbursed) === 0n
                ? "NONE"
                : reimbursementStatusFromTotals(
                    originalExpense.amount.toFixed(2),
                    remainingReimbursed
                  ),
          },
        });

        let expectationView: CreditCardRefundExpectationView | null = null;
        if (link.expectationId) {
          expectationView = await recomputeExpectationStatus(
            tx,
            link.expectationId
          );
        }

        await recordCorrection(tx, {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          kind: "REFUND_ACCREDITATION_VOID",
          targetId: link.id,
          resultStatus: "REVERSED",
          result: {
            accreditationId: link.id,
            transactionId: link.transactionId,
            expectationId: link.expectationId,
            expectationStatus: expectationView?.status ?? null,
            status: "REVERSED",
          },
        });

        return {
          created: true,
          accreditation: toAccreditationView(voidedLink, reversedTx),
          expectation: expectationView,
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
          assertCorrectionTarget(
            replay,
            "REFUND_ACCREDITATION_VOID",
            input.accreditationId
          );
          return this.replayAccreditationVoid(this.prisma, input);
        }
      }
      throw error;
    }
  }

  private async replayAccreditationVoid(
    db: TxClient | ReturnType<typeof getPrismaClient>,
    input: VoidCreditCardRefundAccreditationInput
  ): Promise<VoidAccreditationAtomicResult> {
    const link = await db.creditCardRefundAccreditation.findUnique({
      where: { id: input.accreditationId },
    });
    if (!link || link.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Acreditación no encontrada.", 404);
    }
    const txRow = await db.transaction.findUniqueOrThrow({
      where: { id: link.transactionId },
    });
    let expectation: CreditCardRefundExpectationView | null = null;
    if (link.expectationId) {
      const record = await db.creditCardRefundExpectation.findUniqueOrThrow({
        where: { id: link.expectationId },
      });
      expectation = toExpectationView(
        toExpectationRecord(record),
        await sumAccreditedForExpectationTx(db, link.expectationId)
      );
    }
    return {
      created: false,
      accreditation: toAccreditationView(link, txRow),
      expectation,
    };
  }

  private async sumAccreditedForExpectation(
    expectationId: string
  ): Promise<string> {
    return sumAccreditedForExpectationTx(this.prisma, expectationId);
  }

  private async buildExpectationViewFromTx(
    tx: TxClient,
    expectationId: string
  ): Promise<CreditCardRefundExpectationView> {
    const record = await tx.creditCardRefundExpectation.findUniqueOrThrow({
      where: { id: expectationId },
    });
    const accredited = await sumAccreditedForExpectationTx(tx, expectationId);
    return toExpectationView(toExpectationRecord(record), accredited);
  }
}

type RefundSource = {
  creditCardId: string;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  currency: Currency;
};

async function resolveExpectationSource(
  tx: TxClient,
  input: CreateCreditCardRefundExpectationInput
): Promise<RefundSource> {
  const hasPurchase = input.purchaseId != null;
  const hasExpense = input.originalExpenseTransactionId != null;
  if (hasPurchase === hasExpense) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Debe indicar exactamente uno de purchaseId u originalExpenseTransactionId.",
      400
    );
  }

  if (input.purchaseId) {
    const purchase = await tx.creditCardPurchase.findUnique({
      where: { id: input.purchaseId },
    });
    if (!purchase || purchase.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
    }
    if (purchase.status !== "ACTIVE") {
      throw new AppError(
        "VALIDATION_ERROR",
        "La compra debe estar ACTIVE.",
        400
      );
    }
    return {
      creditCardId: purchase.creditCardId,
      purchaseId: purchase.id,
      originalExpenseTransactionId: null,
      currency: purchase.currency as Currency,
    };
  }

  const expense = await tx.transaction.findUnique({
    where: { id: input.originalExpenseTransactionId! },
  });
  if (!expense || expense.userId !== input.userId) {
    throw new AppError("NOT_FOUND", "Gasto original no encontrado.", 404);
  }
  if (expense.type !== "EXPENSE" || expense.status !== "ACTIVE") {
    throw new AppError(
      "VALIDATION_ERROR",
      "El gasto original debe ser EXPENSE ACTIVE.",
      400
    );
  }
  if (expense.creditCardId == null) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El gasto original debe estar vinculado a una tarjeta.",
      400
    );
  }
  return {
    creditCardId: expense.creditCardId,
    purchaseId: null,
    originalExpenseTransactionId: expense.id,
    currency: expense.currency as Currency,
  };
}

async function resolveAccreditTarget(
  tx: TxClient,
  input: AccreditCreditCardRefundInput
): Promise<{
  expectationId: string | null;
  creditCardId: string;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  currency: Currency;
}> {
  if (input.expectationId) {
    const expectation = await tx.creditCardRefundExpectation.findUnique({
      where: { id: input.expectationId },
    });
    if (!expectation || expectation.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Expectativa no encontrada.", 404);
    }
    return {
      expectationId: expectation.id,
      creditCardId: expectation.creditCardId,
      purchaseId: expectation.purchaseId,
      originalExpenseTransactionId: expectation.originalExpenseTransactionId,
      currency: expectation.currency as Currency,
    };
  }

  const source = await resolveExpectationSource(tx, {
    userId: input.userId,
    purchaseId: input.purchaseId,
    originalExpenseTransactionId: input.originalExpenseTransactionId,
    expectedAmount: input.amount,
  });
  return {
    expectationId: null,
    creditCardId: source.creditCardId,
    purchaseId: source.purchaseId,
    originalExpenseTransactionId: source.originalExpenseTransactionId,
    currency: source.currency,
  };
}

async function lockCard(
  tx: TxClient,
  creditCardId: string,
  userId: string
): Promise<LockedCard> {
  const cards = await tx.$queryRaw<LockedCard[]>`
    SELECT id, user_id, currency::text AS currency, is_active
    FROM credit_cards
    WHERE id = ${creditCardId}::uuid
    FOR UPDATE
  `;
  const card = cards[0];
  if (!card || card.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
  }
  if (!card.is_active) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No se puede operar sobre una tarjeta inactiva.",
      400
    );
  }
  return card;
}

/**
 * P0.15: corrections must stay possible on an inactive card, so this variant
 * of lockCard only checks ownership.
 */
async function lockCardForCorrection(
  tx: TxClient,
  creditCardId: string,
  userId: string
): Promise<LockedCard> {
  const cards = await tx.$queryRaw<LockedCard[]>`
    SELECT id, user_id, currency::text AS currency, is_active
    FROM credit_cards
    WHERE id = ${creditCardId}::uuid
    FOR UPDATE
  `;
  const card = cards[0];
  if (!card || card.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
  }
  return card;
}

/** Locks the original expense without requiring it to still be ACTIVE. */
async function lockExpenseForCorrection(
  tx: TxClient,
  expenseId: string,
  userId: string
): Promise<LockedExpense> {
  const rows = await tx.$queryRaw<LockedExpense[]>`
    SELECT id, user_id, credit_card_id, account_id, type::text AS type,
           status::text AS status, amount, currency::text AS currency
    FROM transactions
    WHERE id = ${expenseId}::uuid
    FOR UPDATE
  `;
  const expense = rows[0];
  if (!expense || expense.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Gasto original no encontrado.", 404);
  }
  return expense;
}

async function remainingReimbursedForExpense(
  tx: TxClient,
  expenseId: string
): Promise<string> {
  const rows = await tx.transaction.findMany({
    where: {
      relatedTransactionId: expenseId,
      type: "REIMBURSEMENT",
      status: "ACTIVE",
    },
  });
  if (rows.length === 0) {
    return "0.00";
  }
  return sumAmounts(rows.map((row) => row.amount.toFixed(2)));
}

/**
 * EXPECTED / PARTIALLY_ACCREDITED / ACCREDITED derived from the remaining
 * ACTIVE accreditations. An expectation already closed by cancellation
 * (cancelledRemainingAmount > 0) is never resurrected to EXPECTED.
 */
async function recomputeExpectationStatus(
  tx: TxClient,
  expectationId: string
): Promise<CreditCardRefundExpectationView> {
  const record = await tx.creditCardRefundExpectation.findUniqueOrThrow({
    where: { id: expectationId },
  });
  const accreditedAmount = await sumAccreditedForExpectationTx(
    tx,
    expectationId
  );
  const accreditedCents = toCents(accreditedAmount);
  const expectedCents = toCents(record.expectedAmount.toFixed(2));
  const closedByCancel = toCents(record.cancelledRemainingAmount.toFixed(2)) > 0n;

  let nextStatus: CreditCardRefundExpectationStatus;
  if (closedByCancel) {
    nextStatus = accreditedCents === 0n ? "CANCELLED" : "ACCREDITED";
  } else if (accreditedCents === 0n) {
    nextStatus = "EXPECTED";
  } else if (accreditedCents >= expectedCents) {
    nextStatus = "ACCREDITED";
  } else {
    nextStatus = "PARTIALLY_ACCREDITED";
  }

  const updated = await tx.creditCardRefundExpectation.update({
    where: { id: expectationId },
    data: { status: nextStatus },
  });
  return toExpectationView(toExpectationRecord(updated), accreditedAmount);
}

async function lockAccount(
  tx: TxClient,
  accountId: string,
  userId: string
): Promise<LockedAccount> {
  const accounts = await tx.$queryRaw<LockedAccount[]>`
    SELECT id, user_id, currency::text AS currency, is_active
    FROM accounts
    WHERE id = ${accountId}::uuid
    FOR UPDATE
  `;
  const account = accounts[0];
  if (!account || account.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
  }
  if (!account.is_active) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La cuenta destino debe estar activa.",
      400
    );
  }
  return account;
}

async function lockExpense(
  tx: TxClient,
  expenseId: string,
  userId: string
): Promise<LockedExpense> {
  const rows = await tx.$queryRaw<LockedExpense[]>`
    SELECT id, user_id, credit_card_id, account_id, type::text AS type,
           status::text AS status, amount, currency::text AS currency
    FROM transactions
    WHERE id = ${expenseId}::uuid
    FOR UPDATE
  `;
  const expense = rows[0];
  if (!expense || expense.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Gasto original no encontrado.", 404);
  }
  if (expense.type !== "EXPENSE" || expense.status !== "ACTIVE") {
    throw new AppError(
      "VALIDATION_ERROR",
      "El gasto original debe ser EXPENSE ACTIVE.",
      400
    );
  }
  if (expense.credit_card_id == null) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El gasto original debe estar vinculado a una tarjeta.",
      400
    );
  }
  return expense;
}

async function lockExpectation(
  tx: TxClient,
  expectationId: string,
  userId: string
): Promise<LockedExpectation> {
  const rows = await tx.$queryRaw<LockedExpectation[]>`
    SELECT id, user_id, credit_card_id, purchase_id, original_expense_transaction_id,
           expected_amount, currency::text AS currency, status::text AS status,
           expected_date, description, created_at, updated_at
    FROM credit_card_refund_expectations
    WHERE id = ${expectationId}::uuid
    FOR UPDATE
  `;
  const expectation = rows[0];
  if (!expectation || expectation.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Expectativa no encontrada.", 404);
  }
  return expectation;
}

async function lockPurchaseAndRecognizedExpenses(
  tx: TxClient,
  purchaseId: string,
  userId: string
): Promise<{ purchase: LockedPurchase; expenses: LockedExpense[] }> {
  const purchases = await tx.$queryRaw<LockedPurchase[]>`
    SELECT id, user_id, credit_card_id, currency::text AS currency, status::text AS status
    FROM credit_card_purchases
    WHERE id = ${purchaseId}::uuid
    FOR UPDATE
  `;
  const purchase = purchases[0];
  if (!purchase || purchase.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
  }
  if (purchase.status !== "ACTIVE") {
    throw new AppError(
      "VALIDATION_ERROR",
      "La compra debe estar ACTIVE.",
      400
    );
  }

  const installments = await tx.creditCardInstallment.findMany({
    where: {
      purchaseId,
      status: "RECOGNIZED",
      recognizedTransactionId: { not: null },
    },
    orderBy: { installmentNumber: "asc" },
  });
  const expenseIds = installments
    .map((row) => row.recognizedTransactionId)
    .filter((id): id is string => id != null);

  const expenses: LockedExpense[] = [];
  for (const expenseId of expenseIds) {
    expenses.push(await lockExpense(tx, expenseId, userId));
  }
  if (expenses.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La compra no tiene cuotas reconocidas acreditables.",
      400
    );
  }
  return { purchase, expenses };
}

async function eligibleAmountCents(
  tx: TxClient,
  source: RefundSource
): Promise<bigint> {
  if (source.purchaseId) {
    const installments = await tx.creditCardInstallment.findMany({
      where: {
        purchaseId: source.purchaseId,
        status: "RECOGNIZED",
        recognizedTransactionId: { not: null },
      },
      include: { recognizedTransaction: true },
    });
    let total = 0n;
    for (const row of installments) {
      const expense = row.recognizedTransaction;
      if (
        expense &&
        expense.status === "ACTIVE" &&
        expense.type === "EXPENSE"
      ) {
        total += toCents(expense.amount.toFixed(2));
      }
    }
    return total;
  }

  const expense = await tx.transaction.findUniqueOrThrow({
    where: { id: source.originalExpenseTransactionId! },
  });
  return toCents(expense.amount.toFixed(2));
}

/** Accredited reimbursements + remaining of other open expectations. */
async function committedCapacityCents(
  tx: TxClient,
  source: RefundSource,
  excludeExpectationId: string | null
): Promise<bigint> {
  const accredited = await accreditedAgainstSourceCents(tx, source);

  const openStatuses: CreditCardRefundExpectationStatus[] = [
    "EXPECTED",
    "PARTIALLY_ACCREDITED",
  ];
  const expectations = await tx.creditCardRefundExpectation.findMany({
    where: source.purchaseId
      ? {
          purchaseId: source.purchaseId,
          status: { in: openStatuses },
          ...(excludeExpectationId
            ? { id: { not: excludeExpectationId } }
            : {}),
        }
      : {
          originalExpenseTransactionId: source.originalExpenseTransactionId!,
          status: { in: openStatuses },
          ...(excludeExpectationId
            ? { id: { not: excludeExpectationId } }
            : {}),
        },
  });

  let remainingExpected = 0n;
  for (const expectation of expectations) {
    const accreditedForExp = await sumAccreditedForExpectationTx(
      tx,
      expectation.id
    );
    const rem =
      toCents(expectation.expectedAmount.toFixed(2)) -
      toCents(accreditedForExp);
    if (rem > 0n) {
      remainingExpected += rem;
    }
  }

  return accredited + remainingExpected;
}

async function accreditedAgainstSourceCents(
  tx: TxClient,
  source: RefundSource
): Promise<bigint> {
  if (source.purchaseId) {
    const installments = await tx.creditCardInstallment.findMany({
      where: {
        purchaseId: source.purchaseId,
        status: "RECOGNIZED",
        recognizedTransactionId: { not: null },
      },
    });
    const expenseIds = installments
      .map((row) => row.recognizedTransactionId)
      .filter((id): id is string => id != null);
    if (expenseIds.length === 0) {
      return 0n;
    }
    const reimbursements = await tx.transaction.findMany({
      where: {
        relatedTransactionId: { in: expenseIds },
        type: "REIMBURSEMENT",
        status: "ACTIVE",
      },
    });
    return reimbursements.reduce(
      (acc, row) => acc + toCents(row.amount.toFixed(2)),
      0n
    );
  }

  const reimbursements = await tx.transaction.findMany({
    where: {
      relatedTransactionId: source.originalExpenseTransactionId!,
      type: "REIMBURSEMENT",
      status: "ACTIVE",
    },
  });
  return reimbursements.reduce(
    (acc, row) => acc + toCents(row.amount.toFixed(2)),
    0n
  );
}

async function sumAccreditedForExpectationTx(
  db: TxClient | ReturnType<typeof getPrismaClient>,
  expectationId: string
): Promise<string> {
  const links = await db.creditCardRefundAccreditation.findMany({
    where: { expectationId },
    include: { transaction: true },
  });
  const active = links.filter((link) => link.transaction.status === "ACTIVE");
  if (active.length === 0) {
    return "0.00";
  }
  return sumAmounts(active.map((link) => link.transaction.amount.toFixed(2)));
}

async function remainingForExpenseCents(
  tx: TxClient,
  expenseId: string,
  expenseAmount: string
): Promise<bigint> {
  const related = await tx.transaction.findMany({
    where: {
      relatedTransactionId: expenseId,
      type: "REIMBURSEMENT",
      status: "ACTIVE",
    },
  });
  const reimbursed = related.reduce(
    (acc, row) => acc + toCents(row.amount.toFixed(2)),
    0n
  );
  return toCents(expenseAmount) - reimbursed;
}

async function remainingByExpenseCents(
  tx: TxClient,
  expenseIds: string[]
): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();
  for (const id of expenseIds) {
    const expense = await tx.transaction.findUniqueOrThrow({ where: { id } });
    map.set(
      id,
      await remainingForExpenseCents(tx, id, expense.amount.toFixed(2))
    );
  }
  return map;
}

function pickExpenseWithCapacity(
  expenses: LockedExpense[],
  remaining: Map<string, bigint>,
  amountCents: bigint
): LockedExpense {
  for (const expense of expenses) {
    const rem = remaining.get(expense.id) ?? 0n;
    if (rem >= amountCents) {
      return expense;
    }
  }
  throw new AppError(
    "VALIDATION_ERROR",
    "El monto supera la capacidad remanente de un solo gasto reconocido; acredite en partes.",
    400
  );
}

function assertIdempotentReplay(
  existing: {
    expectationId: string | null;
    originalExpenseTransactionId: string;
    purchaseId: string | null;
    creditCardId: string;
    destinationType: string;
    transaction: PrismaTransaction;
  },
  input: AccreditCreditCardRefundInput
): void {
  const tx = existing.transaction;
  const sameCore =
    (existing.expectationId ?? null) === (input.expectationId ?? null) &&
    tx.amount.toFixed(2) === input.amount &&
    existing.destinationType === input.destinationType &&
    (input.destinationType === "BANK_ACCOUNT"
      ? tx.accountId === (input.accountId ?? null)
      : tx.accountId == null && tx.creditCardId === existing.creditCardId);

  const sameOccurredAt =
    input.occurredAt === undefined ||
    tx.occurredAt.getTime() === input.occurredAt.getTime();

  if (!sameCore || !sameOccurredAt) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otro payload de acreditación.",
      409
    );
  }
}

function decimalOrNull(
  value: Prisma.Decimal | null | undefined,
  scale: 2 | 6
): string | null {
  if (value == null) {
    return null;
  }
  return scale === 6 ? value.toFixed(6) : value.toFixed(2);
}

function toExpectationRecord(
  record: PrismaExpectation
): CreditCardRefundExpectationRecord {
  return {
    id: record.id,
    userId: record.userId,
    creditCardId: record.creditCardId,
    purchaseId: record.purchaseId,
    originalExpenseTransactionId: record.originalExpenseTransactionId,
    expectedAmount: record.expectedAmount.toFixed(2),
    cancelledRemainingAmount: record.cancelledRemainingAmount.toFixed(2),
    currency: record.currency as Currency,
    status: record.status as CreditCardRefundExpectationStatus,
    expectedDate: record.expectedDate,
    description: record.description,
    promotionId: record.promotionId,
    calculationEligibleBase: decimalOrNull(record.calculationEligibleBase, 2),
    calculationRawBenefit: decimalOrNull(record.calculationRawBenefit, 2),
    calculationCapApplied: decimalOrNull(record.calculationCapApplied, 2),
    calculationLimitedBy: record.calculationLimitedBy,
    calculationPercentage: decimalOrNull(record.calculationPercentage, 6),
    calculationFixedAmount: decimalOrNull(record.calculationFixedAmount, 2),
    calculationPromotionName: record.calculationPromotionName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAccreditationRecord(
  record: PrismaAccreditation
): CreditCardRefundAccreditationRecord {
  return {
    id: record.id,
    userId: record.userId,
    transactionId: record.transactionId,
    expectationId: record.expectationId,
    originalExpenseTransactionId: record.originalExpenseTransactionId,
    purchaseId: record.purchaseId,
    creditCardId: record.creditCardId,
    destinationType: record.destinationType as CreditCardRefundDestinationType,
    idempotencyKey: record.idempotencyKey,
    voidedAt: record.voidedAt,
    voidIdempotencyKey: record.voidIdempotencyKey,
    createdAt: record.createdAt,
  };
}

function toExpectationView(
  record: CreditCardRefundExpectationRecord,
  accreditedAmount: string
): CreditCardRefundExpectationView {
  const open =
    record.status === "EXPECTED" || record.status === "PARTIALLY_ACCREDITED";
  const remainingCents = open
    ? toCents(record.expectedAmount) - toCents(accreditedAmount)
    : 0n;
  return {
    ...record,
    accreditedAmount,
    remainingExpected: fromCents(remainingCents < 0n ? 0n : remainingCents),
  };
}

function toAccreditationView(
  link: Pick<
    PrismaAccreditation,
    | "id"
    | "transactionId"
    | "expectationId"
    | "originalExpenseTransactionId"
    | "purchaseId"
    | "creditCardId"
    | "destinationType"
    | "idempotencyKey"
    | "voidedAt"
  >,
  tx: PrismaTransaction
): CreditCardRefundAccreditationView {
  return {
    id: link.id,
    transactionId: link.transactionId,
    expectationId: link.expectationId,
    originalExpenseTransactionId: link.originalExpenseTransactionId,
    purchaseId: link.purchaseId,
    creditCardId: link.creditCardId,
    destinationType: link.destinationType as CreditCardRefundDestinationType,
    accountId: tx.accountId,
    amount: tx.amount.toFixed(2),
    currency: tx.currency as Currency,
    occurredAt: tx.occurredAt,
    description: tx.description,
    status: tx.status as CreditCardRefundAccreditationView["status"],
    idempotencyKey: link.idempotencyKey,
    voidedAt: link.voidedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
