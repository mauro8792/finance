import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreditCardPurchaseRepository } from "../credit-card-purchases/credit-card-purchase.types.js";
import type { TransactionRepository } from "../transactions/transaction.types.js";
import {
  computeFutureInstallmentCommitment,
  computeTotalOutstandingCommitment,
} from "./credit-card-commitment.js";
import { computeCurrentCardDebt } from "./credit-card-debt.js";
import {
  CREDIT_CARD_FEE_STATUSES,
  type CreateCreditCardInput,
  type CreditCard,
  type CreditCardFeeStatus,
  type CreditCardRepository,
  type UpdateCreditCardInput,
} from "./credit-card.types.js";

export type CreditCardCommitments = {
  creditCardId: string;
  currentCardDebt: string;
  futureInstallmentCommitment: string;
  totalOutstandingCommitment: string;
};

export class CreditCardService {
  constructor(
    private readonly cards: CreditCardRepository,
    private readonly transactions: TransactionRepository | null = null,
    private readonly purchases: CreditCardPurchaseRepository | null = null
  ) {}

  async list(userId: string): Promise<CreditCard[]> {
    return this.cards.findByUserId(userId);
  }

  async getCurrentCardDebt(
    userId: string,
    id: string
  ): Promise<{ creditCardId: string; currentCardDebt: string }> {
    const commitments = await this.getCommitments(userId, id);
    return {
      creditCardId: commitments.creditCardId,
      currentCardDebt: commitments.currentCardDebt,
    };
  }

  async getCommitments(
    userId: string,
    id: string
  ): Promise<CreditCardCommitments> {
    const card = await this.requireOwned(userId, id);
    if (!this.transactions) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El cálculo de deuda no está disponible.",
        500
      );
    }
    const movements = await this.transactions.findByUserId(userId, {
      creditCardId: card.id,
      status: "ACTIVE",
    });
    const currentCardDebt = computeCurrentCardDebt(movements);

    let futureInstallmentCommitment = "0.00";
    if (this.purchases) {
      const pending =
        await this.purchases.findPendingInstallmentAmountsByCreditCardId(
          userId,
          card.id
        );
      futureInstallmentCommitment =
        computeFutureInstallmentCommitment(pending);
    }

    return {
      creditCardId: card.id,
      currentCardDebt,
      futureInstallmentCommitment,
      totalOutstandingCommitment: computeTotalOutstandingCommitment(
        currentCardDebt,
        futureInstallmentCommitment
      ),
    };
  }

  async create(
    userId: string,
    input: {
      name: string;
      issuer: string;
      brand: string;
      currency: Currency;
      closingDay?: number | null;
      dueDay?: number | null;
      feeStatus?: CreditCardFeeStatus;
      feeExpectedAmount?: string | null;
      feeNotes?: string | null;
      isPrimary?: boolean;
    }
  ): Promise<CreditCard> {
    const payload: CreateCreditCardInput = {
      userId,
      name: normalizeName(input.name, "El nombre es obligatorio."),
      issuer: normalizeName(input.issuer, "El banco/emisor es obligatorio."),
      brand: normalizeBrand(input.brand),
      currency: requireCurrency(input.currency),
      closingDay:
        input.closingDay === undefined
          ? null
          : normalizeDay(input.closingDay, "closingDay"),
      dueDay:
        input.dueDay === undefined ? null : normalizeDay(input.dueDay, "dueDay"),
      feeStatus:
        input.feeStatus !== undefined
          ? requireFeeStatus(input.feeStatus)
          : "UNKNOWN",
      ...(input.feeExpectedAmount !== undefined
        ? { feeExpectedAmount: input.feeExpectedAmount }
        : {}),
      ...(input.feeNotes !== undefined ? { feeNotes: input.feeNotes } : {}),
      isPrimary: input.isPrimary === true,
      isActive: true,
    };

    return this.cards.create(payload);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCreditCardInput
  ): Promise<CreditCard> {
    await this.requireOwned(userId, id);
    const patch: UpdateCreditCardInput = {};

    if (input.name !== undefined) {
      patch.name = normalizeName(input.name, "El nombre es obligatorio.");
    }
    if (input.issuer !== undefined) {
      patch.issuer = normalizeName(input.issuer, "El banco/emisor es obligatorio.");
    }
    if (input.brand !== undefined) {
      patch.brand = normalizeBrand(input.brand);
    }
    if (input.currency !== undefined) {
      patch.currency = requireCurrency(input.currency);
    }
    if (input.closingDay !== undefined) {
      patch.closingDay = normalizeDay(input.closingDay, "closingDay");
    }
    if (input.dueDay !== undefined) {
      patch.dueDay = normalizeDay(input.dueDay, "dueDay");
    }
    if (input.feeStatus !== undefined) {
      patch.feeStatus = requireFeeStatus(input.feeStatus);
    }
    if (input.feeExpectedAmount !== undefined) {
      patch.feeExpectedAmount = input.feeExpectedAmount;
    }
    if (input.feeNotes !== undefined) {
      patch.feeNotes = input.feeNotes;
    }
    if (input.isActive !== undefined) {
      patch.isActive = input.isActive;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Debe enviarse al menos un campo para actualizar.",
        400
      );
    }

    return this.cards.update(id, patch);
  }

  async activate(userId: string, id: string): Promise<CreditCard> {
    return this.update(userId, id, { isActive: true });
  }

  async deactivate(userId: string, id: string): Promise<CreditCard> {
    const card = await this.requireOwned(userId, id);
    return this.cards.update(id, {
      isActive: false,
      ...(card.isPrimary ? { isPrimary: false } : {}),
    });
  }

  async setPrimary(userId: string, id: string): Promise<CreditCard> {
    const card = await this.requireOwned(userId, id);
    if (!card.isActive) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Solo una tarjeta activa puede ser principal.",
        400
      );
    }
    return this.cards.setPrimary(userId, id);
  }

  private async requireOwned(userId: string, id: string): Promise<CreditCard> {
    const card = await this.cards.findById(id);
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    return card;
  }
}

function normalizeName(name: string, emptyMessage: string): string {
  const value = name.trim();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", emptyMessage, 400);
  }
  if (value.length > 120) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El texto no puede superar 120 caracteres.",
      400
    );
  }
  return value;
}

function normalizeBrand(brand: string): string {
  const value = brand.trim();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", "La marca es obligatoria.", 400);
  }
  if (value.length > 40) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La marca no puede superar 40 caracteres.",
      400
    );
  }
  return value;
}

function normalizeDay(day: number | null, field: string): number | null {
  if (day === null) {
    return null;
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${field} debe ser un día entre 1 y 31, o null.`,
      400
    );
  }
  return day;
}

function requireCurrency(currency: string): Currency {
  if ((CURRENCIES as readonly string[]).includes(currency)) {
    return currency as Currency;
  }
  throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
}

function requireFeeStatus(status: string): CreditCardFeeStatus {
  if ((CREDIT_CARD_FEE_STATUSES as readonly string[]).includes(status)) {
    return status as CreditCardFeeStatus;
  }
  throw new AppError(
    "VALIDATION_ERROR",
    "El estado de comisión debe ser HAS_FEE, WAIVED, POTENTIALLY_WAIVED o UNKNOWN.",
    400
  );
}
