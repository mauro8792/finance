import { randomUUID } from "node:crypto";
import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import type { CategoryRepository } from "../categories/category.types.js";
import type { CreditCardRepository } from "../credit-cards/credit-card.types.js";
import { sumAmounts } from "../transactions/net-expense.js";
import { EXPENSE_CATEGORY_TYPES } from "../transactions/transaction.types.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import type {
  Clock,
  RecognizeDueOptions,
  RecognizeDueResult,
} from "./credit-card-installment-recognize.types.js";
import { systemClock } from "./credit-card-installment-recognize.types.js";
import {
  buildInstallmentSchedule,
  MAX_CREDIT_CARD_INSTALLMENTS,
  splitInstallmentAmounts,
} from "./credit-card-purchase.math.js";
import type {
  CreditCardPurchaseRepository,
  PurchaseWithInstallments,
} from "./credit-card-purchase.types.js";

export type CreateCreditCardPurchaseRequest = {
  creditCardId: string;
  categoryId: string;
  description?: string;
  currency: Currency;
  totalAmount: string | number;
  purchaseDate: string;
  installmentsCount?: number;
};

/**
 * P0.7–P0.8: N-installment purchases + safe due recognition.
 * Create: #1 RECOGNIZED immediately; #2..N PENDING.
 * recognizeDueInstallments: PENDING due → RECOGNIZED + EXPENSE (idempotent).
 * Void endpoint deferred to P0.15.
 */
export class CreditCardPurchaseService {
  constructor(
    private readonly purchases: CreditCardPurchaseRepository,
    private readonly cards: CreditCardRepository,
    private readonly categories: CategoryRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async list(userId: string): Promise<PurchaseWithInstallments[]> {
    return this.purchases.findByUserId(userId);
  }

  async getById(userId: string, id: string): Promise<PurchaseWithInstallments> {
    const item = await this.purchases.findById(id);
    if (!item || item.purchase.userId !== userId) {
      throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
    }
    return item;
  }

  /**
   * Recognize all eligible PENDING installments with scheduledFor <= asOf.
   * Unit of work = one installment (DB transaction + FOR UPDATE SKIP LOCKED).
   * Partial success: prior units stay committed; unexpected error stops and reports.
   */
  async recognizeDueInstallments(
    options: RecognizeDueOptions = {}
  ): Promise<RecognizeDueResult> {
    const asOf = options.asOf ?? this.clock.now();
    const dryRun = options.dryRun === true;
    const candidates = await this.purchases.findDueInstallmentCandidates(
      asOf,
      options.userId
    );

    const totalsAccumulator = new Map<string, string[]>();
    for (const candidate of candidates) {
      const list = totalsAccumulator.get(candidate.currency) ?? [];
      list.push(candidate.amount);
      totalsAccumulator.set(candidate.currency, list);
    }
    const totalsByCurrency: Record<string, string> = {};
    for (const [currency, amounts] of totalsAccumulator) {
      totalsByCurrency[currency] = sumAmounts(amounts);
    }

    const purchasesAffected = new Set(candidates.map((c) => c.purchaseId)).size;
    const cardsAffected = new Set(candidates.map((c) => c.creditCardId)).size;

    if (dryRun) {
      return {
        asOf: asOf.toISOString(),
        dryRun: true,
        eligible: candidates.length,
        recognized: 0,
        skipped: 0,
        failed: 0,
        totalsByCurrency,
        purchasesAffected,
        cardsAffected,
      };
    }

    const recognizedAt = this.clock.now();
    let recognized = 0;
    let skipped = 0;
    let failed = 0;
    let failureMessage: string | undefined;

    for (const candidate of candidates) {
      try {
        const outcome = await this.purchases.recognizeInstallmentAtomic({
          installmentId: candidate.installmentId,
          recognizedAt,
          transactionId: randomUUID(),
        });
        if (outcome === "recognized") {
          recognized += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        failureMessage =
          error instanceof Error ? error.message : "Recognition failed";
        return {
          asOf: asOf.toISOString(),
          dryRun: false,
          eligible: candidates.length,
          recognized,
          skipped,
          failed,
          totalsByCurrency,
          purchasesAffected,
          cardsAffected,
          failureMessage,
        };
      }
    }

    return {
      asOf: asOf.toISOString(),
      dryRun: false,
      eligible: candidates.length,
      recognized,
      skipped,
      failed,
      totalsByCurrency,
      purchasesAffected,
      cardsAffected,
    };
  }

  async create(
    userId: string,
    input: CreateCreditCardPurchaseRequest
  ): Promise<PurchaseWithInstallments> {
    const installmentsCount = input.installmentsCount ?? 1;
    if (
      !Number.isInteger(installmentsCount) ||
      installmentsCount < 1 ||
      installmentsCount > MAX_CREDIT_CARD_INSTALLMENTS
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `installmentsCount debe ser un entero entre 1 y ${MAX_CREDIT_CARD_INSTALLMENTS}.`,
        400
      );
    }

    const totalAmount = parsePositiveAmount(String(input.totalAmount));
    const card = await this.requireActiveOwnedCard(userId, input.creditCardId);
    const currency = requireMatchingCurrency(input.currency, card.currency);
    const category = await this.requireActiveExpenseCategory(
      userId,
      input.categoryId
    );
    const purchasedAt = parsePurchaseDate(input.purchaseDate);
    const description = normalizeDescription(input.description);

    const amounts = splitInstallmentAmounts(totalAmount, installmentsCount);
    const schedule = buildInstallmentSchedule(purchasedAt, installmentsCount);
    const nominalInstallmentAmount = amounts[0]!;

    const purchaseId = randomUUID();
    const transactionId = randomUUID();
    const firstAmount = amounts[0]!;

    const installments = amounts.map((amount, index) => {
      const installmentNumber = index + 1;
      const isFirst = installmentNumber === 1;
      return {
        id: randomUUID(),
        purchaseId,
        installmentNumber,
        amount,
        status: isFirst ? ("RECOGNIZED" as const) : ("PENDING" as const),
        scheduledFor: schedule[index]!,
        recognizedTransactionId: isFirst ? transactionId : null,
        recognizedAt: isFirst ? purchasedAt : null,
      };
    });

    return this.purchases.createPurchaseAtomic({
      purchase: {
        id: purchaseId,
        userId,
        creditCardId: card.id,
        categoryId: category.id,
        description,
        currency,
        totalAmount,
        installmentAmount: nominalInstallmentAmount,
        installmentsCount,
        purchasedAt,
        status: "ACTIVE",
      },
      installments,
      transaction: {
        id: transactionId,
        userId,
        accountId: null,
        creditCardId: card.id,
        categoryId: category.id,
        type: "EXPENSE",
        status: "ACTIVE",
        amount: firstAmount,
        currency,
        description,
        occurredAt: purchasedAt,
        paymentMethod: null,
        isFixed: false,
        reimbursementStatus: "NONE",
      },
    });
  }

  private async requireActiveOwnedCard(userId: string, creditCardId: string) {
    const card = await this.cards.findById(creditCardId);
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    if (!card.isActive) {
      throw new AppError(
        "CREDIT_CARD_INACTIVE",
        "No se puede registrar una compra sobre una tarjeta inactiva.",
        400
      );
    }
    return card;
  }

  private async requireActiveExpenseCategory(userId: string, categoryId: string) {
    const category = await this.categories.findById(categoryId);
    if (!category || category.userId !== userId) {
      throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
    }
    if (!category.isActive) {
      throw new AppError(
        "CATEGORY_INACTIVE",
        "No se puede registrar una compra con una categoría inactiva.",
        400
      );
    }
    if (!(EXPENSE_CATEGORY_TYPES as readonly string[]).includes(category.type)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Una compra sólo puede usar categorías EXPENSE o BOTH.",
        400
      );
    }
    return category;
  }
}

function requireMatchingCurrency(
  requested: Currency,
  cardCurrency: Currency
): Currency {
  if (!(CURRENCIES as readonly string[]).includes(requested)) {
    throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
  }
  if (requested !== cardCurrency) {
    throw new AppError(
      "CURRENCY_MISMATCH",
      "La moneda de la compra debe coincidir con la moneda de la tarjeta.",
      400
    );
  }
  return cardCurrency;
}

function parsePurchaseDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00.000Z`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      "VALIDATION_ERROR",
      "purchaseDate debe ser una fecha ISO válida.",
      400
    );
  }
  return parsed;
}

function normalizeDescription(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
