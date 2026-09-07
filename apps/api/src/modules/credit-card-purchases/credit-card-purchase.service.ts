import { randomUUID } from "node:crypto";
import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import type { CategoryRepository } from "../categories/category.types.js";
import type { CreditCardRepository } from "../credit-cards/credit-card.types.js";
import { EXPENSE_CATEGORY_TYPES } from "../transactions/transaction.types.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import type {
  CreditCardPurchaseRepository,
  PurchaseWithInstallment,
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
 * P0.6: cash purchase (1 installment) atomically creates
 * Purchase + Installment(1/1, RECOGNIZED) + EXPENSE.
 * Financial impact comes only from the Transaction.
 * Void endpoint deferred to P0.15.
 */
export class CreditCardPurchaseService {
  constructor(
    private readonly purchases: CreditCardPurchaseRepository,
    private readonly cards: CreditCardRepository,
    private readonly categories: CategoryRepository
  ) {}

  async list(userId: string): Promise<PurchaseWithInstallment[]> {
    return this.purchases.findByUserId(userId);
  }

  async getById(userId: string, id: string): Promise<PurchaseWithInstallment> {
    const item = await this.purchases.findById(id);
    if (!item || item.purchase.userId !== userId) {
      throw new AppError("NOT_FOUND", "Compra no encontrada.", 404);
    }
    return item;
  }

  async create(
    userId: string,
    input: CreateCreditCardPurchaseRequest
  ): Promise<PurchaseWithInstallment> {
    const installmentsCount = input.installmentsCount ?? 1;
    if (installmentsCount !== 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "En P0.6 installmentsCount debe ser 1.",
        400
      );
    }

    const amount = parsePositiveAmount(String(input.totalAmount));
    const card = await this.requireActiveOwnedCard(userId, input.creditCardId);
    const currency = requireMatchingCurrency(input.currency, card.currency);
    const category = await this.requireActiveExpenseCategory(
      userId,
      input.categoryId
    );
    const purchasedAt = parsePurchaseDate(input.purchaseDate);
    const description = normalizeDescription(input.description);

    const purchaseId = randomUUID();
    const installmentId = randomUUID();
    const transactionId = randomUUID();

    return this.purchases.createCashPurchaseAtomic({
      purchase: {
        id: purchaseId,
        userId,
        creditCardId: card.id,
        categoryId: category.id,
        description,
        currency,
        totalAmount: amount,
        installmentAmount: amount,
        installmentsCount: 1,
        purchasedAt,
        status: "ACTIVE",
      },
      installment: {
        id: installmentId,
        purchaseId,
        installmentNumber: 1,
        amount,
        status: "RECOGNIZED",
        recognizedTransactionId: transactionId,
        recognizedAt: purchasedAt,
      },
      transaction: {
        id: transactionId,
        userId,
        accountId: null,
        creditCardId: card.id,
        categoryId: category.id,
        type: "EXPENSE",
        status: "ACTIVE",
        amount,
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
