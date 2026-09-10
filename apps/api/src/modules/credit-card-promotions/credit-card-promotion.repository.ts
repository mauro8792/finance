import { randomUUID } from "node:crypto";
import {
  Prisma,
  type CreditCardPromotion as PrismaPromotion,
  type CreditCardRefundExpectation as PrismaExpectation,
} from "@prisma/client";
import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import {
  monthUtcRange,
  zonedYearMonth,
} from "../../shared/time/month-range.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import {
  calculatePromotionBenefit,
  consumedCapCents,
  formatCalcMoney,
} from "./credit-card-promotion.math.js";
import type {
  CreateCreditCardPromotionInput,
  CreditCardPromotionCapPeriod,
  CreditCardPromotionRecord,
  CreditCardPromotionRepository,
  PromotionApplyResult,
  PromotionApplySourceInput,
  PromotionCalculationResult,
  PromotionPreviewResult,
  UpdateCreditCardPromotionInput,
} from "./credit-card-promotion.types.js";
import type {
  CreditCardRefundExpectationStatus,
  CreditCardRefundExpectationView,
} from "../credit-card-refunds/credit-card-refund.types.js";

type TxClient = Prisma.TransactionClient;

type LockedPromotion = {
  id: string;
  user_id: string;
  credit_card_id: string;
  name: string;
  currency: string;
  benefit_type: string;
  percentage: Prisma.Decimal | null;
  fixed_amount: Prisma.Decimal | null;
  minimum_purchase_amount: Prisma.Decimal | null;
  cap_amount: Prisma.Decimal | null;
  cap_period: string;
  valid_from: Date;
  valid_until: Date;
  is_active: boolean;
  description: string | null;
};

type LockedCard = {
  id: string;
  user_id: string;
  currency: string;
  is_active: boolean;
};

type LockedExpense = {
  id: string;
  user_id: string;
  credit_card_id: string | null;
  type: string;
  status: string;
  amount: Prisma.Decimal;
  currency: string;
  occurred_at: Date;
};

type LockedPurchase = {
  id: string;
  user_id: string;
  credit_card_id: string;
  currency: string;
  status: string;
  purchased_at: Date;
};

type ResolvedSource = {
  creditCardId: string;
  currency: Currency;
  purchaseId: string | null;
  originalExpenseTransactionId: string | null;
  occurredAt: Date;
};

export class PrismaCreditCardPromotionRepository
  implements CreditCardPromotionRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async findById(id: string): Promise<CreditCardPromotionRecord | null> {
    const row = await this.prisma.creditCardPromotion.findUnique({
      where: { id },
    });
    return row ? toPromotionRecord(row) : null;
  }

  async findByUserId(userId: string): Promise<CreditCardPromotionRecord[]> {
    const rows = await this.prisma.creditCardPromotion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toPromotionRecord);
  }

  async create(
    input: CreateCreditCardPromotionInput
  ): Promise<CreditCardPromotionRecord> {
    assertPromotionShape(input);
    const card = await this.prisma.creditCard.findUnique({
      where: { id: input.creditCardId },
    });
    if (!card || card.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    if (card.currency !== input.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la promoción debe coincidir con la tarjeta.",
        400
      );
    }

    const created = await this.prisma.creditCardPromotion.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        creditCardId: input.creditCardId,
        name: input.name,
        currency: input.currency,
        benefitType: input.benefitType,
        percentage: input.percentage ?? null,
        fixedAmount: input.fixedAmount ?? null,
        minimumPurchaseAmount: input.minimumPurchaseAmount ?? null,
        capAmount: input.capAmount ?? null,
        capPeriod: input.capPeriod,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        isActive: input.isActive ?? true,
        description: input.description ?? null,
      },
    });
    return toPromotionRecord(created);
  }

  async update(
    input: UpdateCreditCardPromotionInput
  ): Promise<CreditCardPromotionRecord> {
    const existing = await this.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Promoción no encontrada.", 404);
    }

    const merged = {
      benefitType: input.benefitType ?? existing.benefitType,
      percentage:
        input.percentage !== undefined
          ? input.percentage
          : existing.percentage,
      fixedAmount:
        input.fixedAmount !== undefined
          ? input.fixedAmount
          : existing.fixedAmount,
      minimumPurchaseAmount:
        input.minimumPurchaseAmount !== undefined
          ? input.minimumPurchaseAmount
          : existing.minimumPurchaseAmount,
      capAmount:
        input.capAmount !== undefined ? input.capAmount : existing.capAmount,
      capPeriod: input.capPeriod ?? existing.capPeriod,
      validFrom: input.validFrom ?? existing.validFrom,
      validUntil: input.validUntil ?? existing.validUntil,
    };
    assertPromotionShape(merged);

    const updated = await this.prisma.creditCardPromotion.update({
      where: { id: input.id },
      data: {
        name: input.name ?? existing.name,
        benefitType: merged.benefitType,
        percentage: merged.percentage,
        fixedAmount: merged.fixedAmount,
        minimumPurchaseAmount: merged.minimumPurchaseAmount,
        capAmount: merged.capAmount,
        capPeriod: merged.capPeriod,
        validFrom: merged.validFrom,
        validUntil: merged.validUntil,
        description:
          input.description !== undefined
            ? input.description
            : existing.description,
      },
    });
    return toPromotionRecord(updated);
  }

  async setActive(
    userId: string,
    id: string,
    isActive: boolean
  ): Promise<CreditCardPromotionRecord> {
    const existing = await this.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("NOT_FOUND", "Promoción no encontrada.", 404);
    }
    const updated = await this.prisma.creditCardPromotion.update({
      where: { id },
      data: { isActive },
    });
    return toPromotionRecord(updated);
  }

  async preview(
    input: PromotionApplySourceInput
  ): Promise<PromotionPreviewResult> {
    return this.prisma.$transaction(async (tx) => {
      const calc = await this.computeCalculation(tx, input, {
        lockForApply: false,
      });
      return { calculation: calc };
    });
  }

  async apply(input: PromotionApplySourceInput): Promise<PromotionApplyResult> {
    if (!input.idempotencyKey) {
      throw new AppError(
        "VALIDATION_ERROR",
        "idempotencyKey es obligatorio para apply.",
        400
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditCardPromotionApplication.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: input.userId,
              idempotencyKey: input.idempotencyKey!,
            },
          },
          include: { expectation: true },
        });
        if (existing) {
          assertApplyIdempotentReplay(existing, input);
          const calc = await this.computeCalculation(tx, input, {
            lockForApply: false,
            skipValidationThrows: true,
          });
          const accredited = await sumAccreditedForExpectationTx(
            tx,
            existing.expectationId
          );
          return {
            created: false,
            expectation: toExpectationView(
              toExpectationRecord(existing.expectation),
              accredited
            ),
            calculation: calc,
          };
        }

        const calc = await this.computeCalculation(tx, input, {
          lockForApply: true,
        });
        if (!calc.eligible || toCents(calc.expectedAmount) <= 0n) {
          if (calc.limitedBy === "MINIMUM_PURCHASE") {
            throw new AppError(
              "BELOW_MINIMUM",
              "La compra no alcanza el mínimo de la promoción.",
              400
            );
          }
          throw new AppError(
            "VALIDATION_ERROR",
            "No hay beneficio aplicable para esta fuente.",
            400
          );
        }

        const expectationId = randomUUID();
        const created = await tx.creditCardRefundExpectation.create({
          data: {
            id: expectationId,
            userId: input.userId,
            creditCardId: calc.creditCardId,
            purchaseId: calc.purchaseId,
            originalExpenseTransactionId: calc.originalExpenseTransactionId,
            expectedAmount: calc.expectedAmount,
            cancelledRemainingAmount: "0.00",
            currency: calc.currency,
            status: "EXPECTED",
            description:
              input.description === undefined ? null : input.description,
            promotionId: input.promotionId,
            calculationEligibleBase: calc.eligibleBase,
            calculationRawBenefit: calc.rawBenefit,
            calculationCapApplied: calc.capApplied,
            calculationLimitedBy: calc.limitedBy,
            calculationPercentage: calc.percentage,
            calculationFixedAmount: calc.fixedAmount,
            calculationPromotionName: calc.promotionName,
          },
        });

        await tx.creditCardPromotionApplication.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            promotionId: input.promotionId,
            expectationId,
            purchaseId: calc.purchaseId,
            originalExpenseTransactionId: calc.originalExpenseTransactionId,
            idempotencyKey: input.idempotencyKey!,
          },
        });

        return {
          created: true,
          expectation: toExpectationView(toExpectationRecord(created), "0.00"),
          calculation: calc,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La promoción ya fue aplicada a esta fuente o idempotencyKey.",
          409
        );
      }
      throw error;
    }
  }

  private async computeCalculation(
    tx: TxClient,
    input: PromotionApplySourceInput,
    opts: { lockForApply: boolean; skipValidationThrows?: boolean }
  ): Promise<PromotionCalculationResult> {
    const promotion = opts.lockForApply
      ? await lockPromotion(tx, input.promotionId, input.userId)
      : await loadPromotion(tx, input.promotionId, input.userId);

    if (opts.lockForApply) {
      await lockCard(tx, promotion.credit_card_id, input.userId);
    } else {
      await assertCard(tx, promotion.credit_card_id, input.userId);
    }

    const source = await resolveSource(tx, input, {
      lock: opts.lockForApply,
    });

    if (!opts.skipValidationThrows) {
      assertPromotionApplicable(promotion, source);
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
    });
    const eligibleBaseCents = await eligibleAmountCents(tx, source);
    const committed = await committedCapacityCents(tx, source, null);
    const sourceRemainingCents =
      eligibleBaseCents > committed ? eligibleBaseCents - committed : 0n;

    const sharedCapRemainingCents = await computeSharedCapRemainingCents(
      tx,
      promotion,
      source.occurredAt,
      user.timezone
    );

    const benefit = calculatePromotionBenefit({
      benefitType: promotion.benefit_type as "PERCENTAGE" | "FIXED_AMOUNT",
      percentage:
        promotion.percentage == null ? null : promotion.percentage.toFixed(6),
      fixedAmount:
        promotion.fixed_amount == null
          ? null
          : promotion.fixed_amount.toFixed(2),
      minimumPurchaseAmount:
        promotion.minimum_purchase_amount == null
          ? null
          : promotion.minimum_purchase_amount.toFixed(2),
      capAmount:
        promotion.cap_amount == null ? null : promotion.cap_amount.toFixed(2),
      capPeriod: promotion.cap_period as CreditCardPromotionCapPeriod,
      eligibleBaseCents,
      sourceRemainingCents,
      sharedCapRemainingCents,
      promotionName: promotion.name,
    });

    return {
      eligible: benefit.eligible,
      expectedAmount: formatCalcMoney(benefit.expectedCents),
      eligibleBase: formatCalcMoney(benefit.eligibleBaseCents),
      rawBenefit: formatCalcMoney(benefit.rawBenefitCents),
      capApplied:
        benefit.capAppliedCents == null
          ? null
          : formatCalcMoney(benefit.capAppliedCents),
      limitedBy: benefit.limitedBy,
      percentage: benefit.percentage,
      fixedAmount: benefit.fixedAmount,
      promotionName: benefit.promotionName,
      sharedCapRemaining:
        sharedCapRemainingCents == null
          ? null
          : formatCalcMoney(sharedCapRemainingCents),
      sourceRemaining: formatCalcMoney(sourceRemainingCents),
      currency: source.currency,
      creditCardId: source.creditCardId,
      purchaseId: source.purchaseId,
      originalExpenseTransactionId: source.originalExpenseTransactionId,
      sourceOccurredAt: source.occurredAt,
    };
  }
}

function assertPromotionShape(input: {
  benefitType: string;
  percentage?: string | null;
  fixedAmount?: string | null;
  minimumPurchaseAmount?: string | null;
  capAmount?: string | null;
  capPeriod: string;
  validFrom: Date;
  validUntil: Date;
}): void {
  if (input.benefitType === "PERCENTAGE") {
    if (input.percentage == null || input.fixedAmount != null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "PERCENTAGE requiere percentage y fixedAmount null.",
        400
      );
    }
  } else if (input.benefitType === "FIXED_AMOUNT") {
    if (input.fixedAmount == null || input.percentage != null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "FIXED_AMOUNT requiere fixedAmount y percentage null.",
        400
      );
    }
  } else {
    throw new AppError("VALIDATION_ERROR", "benefitType inválido.", 400);
  }

  const hasCap = input.capAmount != null;
  if (hasCap === (input.capPeriod === "NONE")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "capAmount y capPeriod inconsistentes.",
      400
    );
  }
  if (
    input.minimumPurchaseAmount != null &&
    toCents(input.minimumPurchaseAmount) <= 0n
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "minimumPurchaseAmount debe ser > 0.",
      400
    );
  }
  if (input.capAmount != null && toCents(input.capAmount) <= 0n) {
    throw new AppError("VALIDATION_ERROR", "capAmount debe ser > 0.", 400);
  }
  if (input.validFrom.getTime() > input.validUntil.getTime()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "validFrom debe ser ≤ validUntil.",
      400
    );
  }
}

function assertPromotionApplicable(
  promotion: LockedPromotion,
  source: ResolvedSource
): void {
  if (!promotion.is_active) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La promoción está inactiva.",
      400
    );
  }
  if (promotion.credit_card_id !== source.creditCardId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La promoción no corresponde a la tarjeta de la fuente.",
      400
    );
  }
  if (promotion.currency !== source.currency) {
    throw new AppError(
      "CURRENCY_MISMATCH",
      "La moneda de la promoción no coincide con la fuente.",
      400
    );
  }
  const at = source.occurredAt.getTime();
  if (
    at < promotion.valid_from.getTime() ||
    at > promotion.valid_until.getTime()
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La fuente está fuera de la vigencia de la promoción.",
      400
    );
  }
}

async function loadPromotion(
  tx: TxClient,
  promotionId: string,
  userId: string
): Promise<LockedPromotion> {
  const rows = await tx.$queryRaw<LockedPromotion[]>`
    SELECT id, user_id, credit_card_id, name, currency::text AS currency,
           benefit_type::text AS benefit_type, percentage, fixed_amount,
           minimum_purchase_amount, cap_amount, cap_period::text AS cap_period,
           valid_from, valid_until, is_active, description
    FROM credit_card_promotions
    WHERE id = ${promotionId}::uuid
  `;
  const promotion = rows[0];
  if (!promotion || promotion.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Promoción no encontrada.", 404);
  }
  return promotion;
}

async function lockPromotion(
  tx: TxClient,
  promotionId: string,
  userId: string
): Promise<LockedPromotion> {
  const rows = await tx.$queryRaw<LockedPromotion[]>`
    SELECT id, user_id, credit_card_id, name, currency::text AS currency,
           benefit_type::text AS benefit_type, percentage, fixed_amount,
           minimum_purchase_amount, cap_amount, cap_period::text AS cap_period,
           valid_from, valid_until, is_active, description
    FROM credit_card_promotions
    WHERE id = ${promotionId}::uuid
    FOR UPDATE
  `;
  const promotion = rows[0];
  if (!promotion || promotion.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Promoción no encontrada.", 404);
  }
  return promotion;
}

async function assertCard(
  tx: TxClient,
  creditCardId: string,
  userId: string
): Promise<void> {
  const card = await tx.creditCard.findUnique({ where: { id: creditCardId } });
  if (!card || card.userId !== userId) {
    throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
  }
  if (!card.isActive) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No se puede operar sobre una tarjeta inactiva.",
      400
    );
  }
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

async function resolveSource(
  tx: TxClient,
  input: PromotionApplySourceInput,
  opts: { lock: boolean }
): Promise<ResolvedSource> {
  const hasPurchase =
    input.purchaseId != null && input.purchaseId.length > 0;
  const hasExpense =
    input.originalExpenseTransactionId != null &&
    input.originalExpenseTransactionId.length > 0;
  if (hasPurchase === hasExpense) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Debe indicar exactamente uno de purchaseId u originalExpenseTransactionId.",
      400
    );
  }

  if (hasPurchase) {
    const purchase = opts.lock
      ? await lockPurchase(tx, input.purchaseId!, input.userId)
      : await loadPurchase(tx, input.purchaseId!, input.userId);
    if (opts.lock) {
      await lockRecognizedExpenses(tx, purchase.id, input.userId);
    }
    return {
      creditCardId: purchase.credit_card_id,
      currency: purchase.currency as Currency,
      purchaseId: purchase.id,
      originalExpenseTransactionId: null,
      occurredAt: purchase.purchased_at,
    };
  }

  const expense = opts.lock
    ? await lockExpense(tx, input.originalExpenseTransactionId!, input.userId)
    : await loadExpense(tx, input.originalExpenseTransactionId!, input.userId);
  return {
    creditCardId: expense.credit_card_id!,
    currency: expense.currency as Currency,
    purchaseId: null,
    originalExpenseTransactionId: expense.id,
    occurredAt: expense.occurred_at,
  };
}

async function loadPurchase(
  tx: TxClient,
  purchaseId: string,
  userId: string
): Promise<LockedPurchase> {
  const rows = await tx.$queryRaw<LockedPurchase[]>`
    SELECT id, user_id, credit_card_id, currency::text AS currency,
           status::text AS status, purchased_at
    FROM credit_card_purchases
    WHERE id = ${purchaseId}::uuid
  `;
  const purchase = rows[0];
  if (!purchase || purchase.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
  }
  if (purchase.status !== "ACTIVE") {
    throw new AppError("VALIDATION_ERROR", "La compra debe estar ACTIVE.", 400);
  }
  return purchase;
}

async function lockPurchase(
  tx: TxClient,
  purchaseId: string,
  userId: string
): Promise<LockedPurchase> {
  const rows = await tx.$queryRaw<LockedPurchase[]>`
    SELECT id, user_id, credit_card_id, currency::text AS currency,
           status::text AS status, purchased_at
    FROM credit_card_purchases
    WHERE id = ${purchaseId}::uuid
    FOR UPDATE
  `;
  const purchase = rows[0];
  if (!purchase || purchase.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
  }
  if (purchase.status !== "ACTIVE") {
    throw new AppError("VALIDATION_ERROR", "La compra debe estar ACTIVE.", 400);
  }
  return purchase;
}

async function lockRecognizedExpenses(
  tx: TxClient,
  purchaseId: string,
  userId: string
): Promise<LockedExpense[]> {
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
  return expenses;
}

async function loadExpense(
  tx: TxClient,
  expenseId: string,
  userId: string
): Promise<LockedExpense> {
  const rows = await tx.$queryRaw<LockedExpense[]>`
    SELECT id, user_id, credit_card_id, type::text AS type,
           status::text AS status, amount, currency::text AS currency, occurred_at
    FROM transactions
    WHERE id = ${expenseId}::uuid
  `;
  return assertExpense(rows[0], userId);
}

async function lockExpense(
  tx: TxClient,
  expenseId: string,
  userId: string
): Promise<LockedExpense> {
  const rows = await tx.$queryRaw<LockedExpense[]>`
    SELECT id, user_id, credit_card_id, type::text AS type,
           status::text AS status, amount, currency::text AS currency, occurred_at
    FROM transactions
    WHERE id = ${expenseId}::uuid
    FOR UPDATE
  `;
  return assertExpense(rows[0], userId);
}

function assertExpense(
  expense: LockedExpense | undefined,
  userId: string
): LockedExpense {
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

async function eligibleAmountCents(
  tx: TxClient,
  source: ResolvedSource
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

async function committedCapacityCents(
  tx: TxClient,
  source: ResolvedSource,
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
  source: ResolvedSource
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

async function computeSharedCapRemainingCents(
  tx: TxClient,
  promotion: LockedPromotion,
  sourceOccurredAt: Date,
  timeZone: string
): Promise<bigint | null> {
  const period = promotion.cap_period as CreditCardPromotionCapPeriod;
  if (period === "NONE" || period === "PER_PURCHASE") {
    return null;
  }
  if (promotion.cap_amount == null) {
    return null;
  }

  const capCents = toCents(promotion.cap_amount.toFixed(2));
  const linked = await tx.creditCardRefundExpectation.findMany({
    where: { promotionId: promotion.id },
  });

  let consumed = 0n;
  if (period === "PROMOTION_PERIOD") {
    for (const row of linked) {
      consumed += consumedCapCents(
        row.expectedAmount.toFixed(2),
        row.cancelledRemainingAmount.toFixed(2)
      );
    }
  } else {
    // MONTHLY: only expectations whose source occurredAt falls in same user month.
    const { year, month } = zonedYearMonth(sourceOccurredAt, timeZone);
    const range = monthUtcRange(year, month, timeZone);
    for (const row of linked) {
      const occurredAt = await sourceOccurredAtForExpectation(tx, row);
      if (
        occurredAt.getTime() >= range.start.getTime() &&
        occurredAt.getTime() < range.endExclusive.getTime()
      ) {
        consumed += consumedCapCents(
          row.expectedAmount.toFixed(2),
          row.cancelledRemainingAmount.toFixed(2)
        );
      }
    }
  }

  return consumed >= capCents ? 0n : capCents - consumed;
}

async function sourceOccurredAtForExpectation(
  tx: TxClient,
  expectation: {
    purchaseId: string | null;
    originalExpenseTransactionId: string | null;
  }
): Promise<Date> {
  if (expectation.purchaseId) {
    const purchase = await tx.creditCardPurchase.findUniqueOrThrow({
      where: { id: expectation.purchaseId },
    });
    return purchase.purchasedAt;
  }
  const expense = await tx.transaction.findUniqueOrThrow({
    where: { id: expectation.originalExpenseTransactionId! },
  });
  return expense.occurredAt;
}

async function sumAccreditedForExpectationTx(
  db: TxClient,
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
  let total = 0n;
  for (const link of active) {
    total += toCents(link.transaction.amount.toFixed(2));
  }
  return fromCents(total);
}

function assertApplyIdempotentReplay(
  existing: {
    promotionId: string;
    purchaseId: string | null;
    originalExpenseTransactionId: string | null;
  },
  input: PromotionApplySourceInput
): void {
  const same =
    existing.promotionId === input.promotionId &&
    (existing.purchaseId ?? null) === (input.purchaseId ?? null) &&
    (existing.originalExpenseTransactionId ?? null) ===
      (input.originalExpenseTransactionId ?? null);
  if (!same) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otro payload de apply.",
      409
    );
  }
}

function toPromotionRecord(row: PrismaPromotion): CreditCardPromotionRecord {
  return {
    id: row.id,
    userId: row.userId,
    creditCardId: row.creditCardId,
    name: row.name,
    currency: row.currency as Currency,
    benefitType: row.benefitType,
    percentage: row.percentage == null ? null : row.percentage.toFixed(6),
    fixedAmount: row.fixedAmount == null ? null : row.fixedAmount.toFixed(2),
    minimumPurchaseAmount:
      row.minimumPurchaseAmount == null
        ? null
        : row.minimumPurchaseAmount.toFixed(2),
    capAmount: row.capAmount == null ? null : row.capAmount.toFixed(2),
    capPeriod: row.capPeriod,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    isActive: row.isActive,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

function toExpectationRecord(record: PrismaExpectation) {
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

function toExpectationView(
  record: ReturnType<typeof toExpectationRecord>,
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
