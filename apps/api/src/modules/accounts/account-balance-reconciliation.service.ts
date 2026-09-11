import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors/app-error.js";
import { requireIdempotencyKey } from "../corrections/correction.repository.js";
import {
  computeBalance,
  fromCents,
  toCents,
  type AdjustmentMetadata,
  type TransferDirection,
} from "../transactions/transaction-balance.js";
import type { TransactionRepository } from "../transactions/transaction.types.js";
import type { AccountRepository } from "./account.types.js";
import type {
  AccountBalanceReconciliation,
  AccountBalanceReconciliationRepository,
  ReconcileAccountBalanceInput,
  ReconcileAccountBalanceResult,
  ReconciliationIdempotencyPayload,
} from "./account-balance-reconciliation.types.js";

export class AccountBalanceReconciliationService {
  constructor(
    private readonly reconciliations: AccountBalanceReconciliationRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async reconcile(
    userId: string,
    input: ReconcileAccountBalanceInput
  ): Promise<ReconcileAccountBalanceResult> {
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const reason = normalizeReason(input.reason);
    const observedBalance = parseNonNegativeAmount(input.observedBalance);
    const occurredAt = input.occurredAt ?? new Date();

    const account = await this.accounts.findById(input.accountId);
    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }
    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede conciliar una cuenta inactiva.",
        400
      );
    }

    const payload: ReconciliationIdempotencyPayload = {
      accountId: account.id,
      observedBalance,
      reason,
      occurredAt: occurredAt.toISOString(),
    };

    const existing = await this.reconciliations.findByIdempotencyKey(
      userId,
      idempotencyKey
    );
    if (existing) {
      return this.replay(userId, existing, payload);
    }

    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });
    const previousCalculatedBalance = computeBalance(
      account.initialBalance,
      movements
    );
    const adjustmentCents =
      toCents(observedBalance) - toCents(previousCalculatedBalance);
    const adjustmentAmount = fromCents(adjustmentCents);

    if (adjustmentCents === 0n) {
      const raced = await this.reconciliations.findByIdempotencyKey(
        userId,
        idempotencyKey
      );
      if (raced) {
        return this.replay(userId, raced, payload);
      }
      throw new AppError(
        "VALIDATION_ERROR",
        "El saldo real coincide con el calculado; no hay nada que conciliar.",
        400
      );
    }

    const direction: TransferDirection = adjustmentCents > 0n ? "IN" : "OUT";
    const absoluteAmount = fromCents(
      adjustmentCents < 0n ? -adjustmentCents : adjustmentCents
    );

    const reconciliationId = randomUUID();
    const transactionId = randomUUID();
    const metadata: AdjustmentMetadata = {
      reconciliationId,
      direction,
      observedBalance,
      previousCalculatedBalance,
      reason,
    };

    try {
      const persisted = await this.reconciliations.createAtomic({
        reconciliation: {
          id: reconciliationId,
          userId,
          accountId: account.id,
          transactionId,
          observedBalance,
          previousCalculatedBalance,
          adjustmentAmount,
          currency: account.currency,
          reason,
          occurredAt,
          idempotencyKey,
        },
        transaction: {
          id: transactionId,
          userId,
          accountId: account.id,
          categoryId: null,
          type: "ADJUSTMENT",
          status: "ACTIVE",
          amount: absoluteAmount,
          currency: account.currency,
          description: reason,
          occurredAt,
          relatedTransactionId: null,
          reimbursementStatus: "NONE",
          metadata,
        },
      });

      return {
        created: true,
        reconciliation: persisted.reconciliation,
        transaction: persisted.transaction,
        balance: observedBalance,
      };
    } catch (error) {
      const raced = await this.reconciliations.findByIdempotencyKey(
        userId,
        idempotencyKey
      );
      if (raced) {
        return this.replay(userId, raced, payload);
      }
      throw error;
    }
  }

  private async replay(
    userId: string,
    existing: AccountBalanceReconciliation,
    payload: ReconciliationIdempotencyPayload
  ): Promise<ReconcileAccountBalanceResult> {
    assertPayloadMatch(existing, payload);
    const transaction = await this.transactions.findById(existing.transactionId);
    if (!transaction || transaction.userId !== userId) {
      throw new AppError(
        "NOT_FOUND",
        "Movimiento de conciliación no encontrado.",
        404
      );
    }
    return {
      created: false,
      reconciliation: existing,
      transaction,
      balance: existing.observedBalance,
    };
  }
}

function assertPayloadMatch(
  existing: AccountBalanceReconciliation,
  payload: ReconciliationIdempotencyPayload
): void {
  if (
    existing.accountId !== payload.accountId ||
    normalizeMoney(existing.observedBalance) !==
      normalizeMoney(payload.observedBalance) ||
    existing.reason !== payload.reason ||
    existing.occurredAt.toISOString() !== payload.occurredAt
  ) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otra conciliación.",
      409
    );
  }
}

function normalizeReason(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", "El motivo es obligatorio.", 400);
  }
  if (value.length > 255) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El motivo no puede superar 255 caracteres.",
      400
    );
  }
  return value;
}

function normalizeMoney(value: string): string {
  return fromCents(toCents(value));
}

/** Observed bank balance: >= 0, two decimals. */
export function parseNonNegativeAmount(raw: string): string {
  const value = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El saldo real debe ser un importe >= 0 con hasta 2 decimales.",
      400
    );
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
