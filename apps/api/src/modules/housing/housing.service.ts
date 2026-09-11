import { randomUUID } from "node:crypto";
import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import type { AccountRepository } from "../accounts/account.types.js";
import { requireIdempotencyKey } from "../corrections/correction.repository.js";
import { divideRoundHalfUp } from "../currency-exchanges/currency-exchange.math.js";
import { computeBalance, fromCents, toCents } from "../transactions/transaction-balance.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import type {
  Transaction,
  TransactionRepository,
} from "../transactions/transaction.types.js";
import type {
  HousingObligation,
  HousingObligationRepository,
  HousingPayment,
  UpdateHousingObligationRecord,
  VoidHousingPaymentAtomicResult,
} from "./housing.types.js";
import { RemainingInstallmentsConflictError } from "./housing.types.js";
import { computeNextHousingInstallment } from "./housing-next-installment.js";

export type CreateHousingObligationRequest = {
  name: string;
  currency: Currency;
  installmentAmount: string;
  remainingInstallments: number;
  dueDay?: number | null;
  reserveAccountId?: string | null;
};

export type UpdateHousingObligationRequest = {
  name?: string;
  installmentAmount?: string;
  remainingInstallments?: number;
  dueDay?: number | null;
  reserveAccountId?: string | null;
  isActive?: boolean;
};

export type RegisterHousingPaymentRequest = {
  accountId: string;
  amount?: string;
  occurredAt?: Date;
  installmentNumber?: number | null;
  periodYear?: number | null;
  periodMonth?: number | null;
};

export type RegisterHousingPaymentResult = {
  payment: HousingPayment;
  transaction: Transaction;
  remainingInstallments: number;
  isActive: boolean;
};

export type HousingCoverage = {
  housingObligationId: string;
  currency: Currency;
  reserveAccountId: string | null;
  reserveBalance: string | null;
  installmentAmount: string;
  remainingInstallments: number;
  coveredInstallments: string | null;
  nextInstallmentNumber: number | null;
  nextPeriodYear: number | null;
  nextPeriodMonth: number | null;
  nextDueDate: string | null;
  nextDueDateLabel: string | null;
};

export class HousingService {
  constructor(
    private readonly housing: HousingObligationRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async list(userId: string): Promise<HousingObligation[]> {
    return this.housing.findByUserId(userId);
  }

  async getById(userId: string, id: string): Promise<HousingObligation> {
    return this.requireOwned(userId, id);
  }

  async listPayments(userId: string, id: string): Promise<HousingPayment[]> {
    await this.requireOwned(userId, id);
    return this.housing.findPaymentsByObligationId(id);
  }

  async getCoverage(userId: string, id: string): Promise<HousingCoverage> {
    const obligation = await this.requireOwned(userId, id);
    const payments = await this.housing.findPaymentsByObligationId(id);
    const next = computeNextHousingInstallment(payments, obligation.dueDay);

    const base = {
      housingObligationId: obligation.id,
      currency: obligation.currency,
      installmentAmount: obligation.installmentAmount,
      remainingInstallments: obligation.remainingInstallments,
      nextInstallmentNumber: next.installmentNumber,
      nextPeriodYear: next.periodYear,
      nextPeriodMonth: next.periodMonth,
      nextDueDate: next.dueDate,
      nextDueDateLabel: next.dueDateLabel,
    };

    if (obligation.reserveAccountId === null) {
      return {
        ...base,
        reserveAccountId: null,
        reserveBalance: null,
        coveredInstallments: null,
      };
    }

    const account = await this.accounts.findById(obligation.reserveAccountId);
    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }

    if (account.currency !== obligation.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La cuenta reserva debe usar la misma moneda que la obligación.",
        400
      );
    }

    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });
    const reserveBalance = computeBalance(account.initialBalance, movements);
    const coveredInstallments =
      toCents(reserveBalance) <= 0n
        ? "0.00"
        : fromCents(
            divideRoundHalfUp(
              toCents(reserveBalance) * 100n,
              toCents(obligation.installmentAmount)
            )
          );

    return {
      ...base,
      reserveAccountId: account.id,
      reserveBalance,
      coveredInstallments,
    };
  }

  async create(
    userId: string,
    input: CreateHousingObligationRequest
  ): Promise<HousingObligation> {
    const currency = requireCurrency(input.currency);
    const reserveAccountId = await this.requireReserveAccount(
      userId,
      currency,
      input.reserveAccountId
    );

    return this.housing.create({
      userId,
      name: normalizeName(input.name),
      currency,
      installmentAmount: parsePositiveAmount(input.installmentAmount),
      remainingInstallments: requireRemainingInstallments(input.remainingInstallments),
      dueDay: requireDueDay(input.dueDay),
      reserveAccountId,
      isActive: true,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateHousingObligationRequest
  ): Promise<HousingObligation> {
    const current = await this.requireOwned(userId, id);
    const patch: UpdateHousingObligationRecord = {};

    if (input.name !== undefined) {
      patch.name = normalizeName(input.name);
    }

    if (input.installmentAmount !== undefined) {
      patch.installmentAmount = parsePositiveAmount(input.installmentAmount);
    }

    if (input.remainingInstallments !== undefined) {
      patch.remainingInstallments = requireRemainingInstallments(
        input.remainingInstallments
      );
    }

    if (input.dueDay !== undefined) {
      patch.dueDay = requireDueDay(input.dueDay);
    }

    if (input.reserveAccountId !== undefined) {
      patch.reserveAccountId = await this.requireReserveAccount(
        userId,
        current.currency,
        input.reserveAccountId
      );
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

    return this.housing.update(current.id, patch);
  }

  async registerPayment(
    userId: string,
    obligationId: string,
    input: RegisterHousingPaymentRequest
  ): Promise<RegisterHousingPaymentResult> {
    const obligation = await this.requireOwned(userId, obligationId);

    if (!obligation.isActive) {
      throw new AppError(
        "HOUSING_OBLIGATION_INACTIVE",
        "No se puede registrar un pago sobre una obligación inactiva.",
        400
      );
    }

    if (obligation.remainingInstallments <= 0) {
      throw new AppError(
        "NO_REMAINING_INSTALLMENTS",
        "La obligación no tiene cuotas pendientes.",
        400
      );
    }

    const account = await this.requirePaymentAccount(userId, input.accountId);
    if (account.currency !== obligation.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la cuenta debe coincidir con la de la obligación.",
        400
      );
    }

    const amount = parsePositiveAmount(input.amount ?? obligation.installmentAmount);
    const installmentNumber = requireInstallmentNumber(input.installmentNumber);
    const { periodYear, periodMonth } = requirePeriod(
      input.periodYear,
      input.periodMonth
    );
    const paidAt = input.occurredAt ?? new Date();
    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });
    const available = computeBalance(account.initialBalance, movements);
    if (toCents(available) < toCents(amount)) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "La cuenta no tiene saldo suficiente.",
        400
      );
    }

    const paymentId = randomUUID();
    const transactionId = randomUUID();

    try {
      const persisted = await this.housing.registerPaymentAtomic(
        {
          id: paymentId,
          housingObligationId: obligation.id,
          transactionId,
          accountId: account.id,
          amount,
          currency: obligation.currency,
          installmentNumber,
          periodYear,
          periodMonth,
          paidAt,
        },
        {
          id: transactionId,
          userId,
          accountId: account.id,
          categoryId: null,
          type: "HOUSING_PAYMENT",
          status: "ACTIVE",
          amount,
          currency: obligation.currency,
          occurredAt: paidAt,
          relatedTransactionId: null,
          reimbursementStatus: "NONE",
          metadata: {
            housingPaymentId: paymentId,
            housingObligationId: obligation.id,
          },
        },
        obligation.id
      );

      return {
        payment: persisted.payment,
        transaction: persisted.transaction,
        remainingInstallments: persisted.obligation.remainingInstallments,
        isActive: persisted.obligation.isActive,
      };
    } catch (error) {
      if (error instanceof RemainingInstallmentsConflictError) {
        throw new AppError(
          "NO_REMAINING_INSTALLMENTS",
          "La obligación no tiene cuotas pendientes.",
          400
        );
      }
      throw error;
    }
  }

  /** P1.2: dedicated housing payment void; restores reserve via REVERSED status. */
  async voidPayment(
    userId: string,
    obligationId: string,
    paymentId: string,
    input: { idempotencyKey: string }
  ): Promise<VoidHousingPaymentAtomicResult> {
    const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);
    await this.requireOwned(userId, obligationId);
    return this.housing.voidPaymentAtomic({
      userId,
      obligationId,
      paymentId,
      idempotencyKey,
    });
  }

  /**
   * P1.2.1: correct period metadata only. No amount/paidAt/balance impact.
   * VOIDED rows may also receive periods for audit clarity.
   */
  async updatePaymentPeriod(
    userId: string,
    obligationId: string,
    paymentId: string,
    input: { periodYear: number; periodMonth: number }
  ): Promise<HousingPayment> {
    await this.requireOwned(userId, obligationId);
    const payments = await this.housing.findPaymentsByObligationId(obligationId);
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) {
      throw new AppError("NOT_FOUND", "Pago de vivienda no encontrado.", 404);
    }

    const { periodYear, periodMonth } = requirePeriod(
      input.periodYear,
      input.periodMonth
    );
    if (periodYear === null || periodMonth === null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "periodYear y periodMonth son obligatorios.",
        400
      );
    }

    if (
      payment.periodYear === periodYear &&
      payment.periodMonth === periodMonth
    ) {
      return payment;
    }

    return this.housing.updatePaymentPeriod(paymentId, {
      periodYear,
      periodMonth,
      previousPeriodYear: payment.periodYear,
      previousPeriodMonth: payment.periodMonth,
      periodCorrectedAt: new Date(),
    });
  }

  private async requireOwned(userId: string, id: string): Promise<HousingObligation> {
    const obligation = await this.housing.findById(id);
    if (!obligation || obligation.userId !== userId) {
      throw new AppError("NOT_FOUND", "La obligación de vivienda no existe.", 404);
    }
    return obligation;
  }

  private async requireReserveAccount(
    userId: string,
    currency: Currency,
    reserveAccountId: string | null | undefined
  ): Promise<string | null> {
    if (reserveAccountId === undefined || reserveAccountId === null) {
      return null;
    }

    const account = await this.accounts.findById(reserveAccountId);
    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }

    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede usar una cuenta inactiva como reserva de vivienda.",
        400
      );
    }

    if (account.currency !== currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La cuenta reserva debe usar la misma moneda que la obligación.",
        400
      );
    }

    return account.id;
  }

  private async requirePaymentAccount(userId: string, accountId: string) {
    const account = await this.accounts.findById(accountId);
    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }
    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede registrar un movimiento sobre una cuenta inactiva.",
        400
      );
    }
    return account;
  }
}

function requireInstallmentNumber(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "installmentNumber debe ser un entero.",
      400
    );
  }
  return value;
}

const MIN_PERIOD_YEAR = 1970;
const MAX_PERIOD_YEAR = 2100;

/** Both null, or both set with month 1–12 and a reasonable year. */
function requirePeriod(
  periodYear: number | null | undefined,
  periodMonth: number | null | undefined
): { periodYear: number | null; periodMonth: number | null } {
  const yearUnset = periodYear === undefined || periodYear === null;
  const monthUnset = periodMonth === undefined || periodMonth === null;

  if (yearUnset && monthUnset) {
    return { periodYear: null, periodMonth: null };
  }

  if (yearUnset || monthUnset) {
    throw new AppError(
      "VALIDATION_ERROR",
      "periodYear y periodMonth deben enviarse juntos o ambos omitirse.",
      400
    );
  }

  if (!Number.isInteger(periodYear) || periodYear < MIN_PERIOD_YEAR || periodYear > MAX_PERIOD_YEAR) {
    throw new AppError(
      "VALIDATION_ERROR",
      `periodYear debe ser un entero entre ${MIN_PERIOD_YEAR} y ${MAX_PERIOD_YEAR}.`,
      400
    );
  }

  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new AppError(
      "VALIDATION_ERROR",
      "periodMonth debe estar entre 1 y 12.",
      400
    );
  }

  return { periodYear, periodMonth };
}

function normalizeName(name: string): string {
  const value = name.trim();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", "El nombre es obligatorio.", 400);
  }
  if (value.length > 120) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El nombre no puede superar 120 caracteres.",
      400
    );
  }
  return value;
}

function requireCurrency(currency: string): Currency {
  if ((CURRENCIES as readonly string[]).includes(currency)) {
    return currency as Currency;
  }
  throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
}

function requireRemainingInstallments(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "remainingInstallments debe ser un entero mayor o igual a 0.",
      400
    );
  }
  return value;
}

function requireDueDay(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new AppError(
      "VALIDATION_ERROR",
      "dueDay debe estar entre 1 y 31.",
      400
    );
  }
  return value;
}
