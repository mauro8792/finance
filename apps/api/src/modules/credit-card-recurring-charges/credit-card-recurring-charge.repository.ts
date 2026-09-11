import { randomUUID } from "node:crypto";
import {
  Prisma,
  type CreditCardRecurringCharge as PrismaRecurringCharge,
  type CreditCardRecurringChargeOccurrence as PrismaOccurrence,
  type Transaction as PrismaTransaction,
} from "@prisma/client";
import type { Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { fromCents, toCents } from "../transactions/transaction-balance.js";
import type {
  ConfirmRecurringChargeInput,
  ConfirmRecurringChargeResult,
  CreateCreditCardRecurringChargeInput,
  CreditCardRecurringChargeFrequency,
  CreditCardRecurringChargeKind,
  CreditCardRecurringChargeOccurrenceView,
  CreditCardRecurringChargeRecord,
  CreditCardRecurringChargeRepository,
  RecurringChargeOutlookResult,
  UpdateCreditCardRecurringChargeInput,
} from "./credit-card-recurring-charge.types.js";

type TxClient = Prisma.TransactionClient;

type LockedCard = {
  id: string;
  user_id: string;
  currency: string;
  is_active: boolean;
};

type LockedTemplate = {
  id: string;
  user_id: string;
  credit_card_id: string;
  kind: string;
  category_id: string;
  description: string;
  expected_amount: Prisma.Decimal | null;
  currency: string;
  frequency: string;
  day_of_month_hint: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export class PrismaCreditCardRecurringChargeRepository
  implements CreditCardRecurringChargeRepository
{
  constructor(private readonly prisma = getPrismaClient()) {}

  async findById(
    id: string
  ): Promise<CreditCardRecurringChargeRecord | null> {
    const row = await this.prisma.creditCardRecurringCharge.findUnique({
      where: { id },
    });
    return row ? toTemplateRecord(row) : null;
  }

  async findByUserId(
    userId: string,
    creditCardId?: string
  ): Promise<CreditCardRecurringChargeRecord[]> {
    const rows = await this.prisma.creditCardRecurringCharge.findMany({
      where: {
        userId,
        ...(creditCardId ? { creditCardId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toTemplateRecord);
  }

  async create(
    input: CreateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord> {
    const card = await this.prisma.creditCard.findUnique({
      where: { id: input.creditCardId },
    });
    if (!card || card.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }
    await assertExpenseCategory(
      this.prisma,
      input.userId,
      input.categoryId
    );

    const created = await this.prisma.creditCardRecurringCharge.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        creditCardId: input.creditCardId,
        kind: input.kind,
        categoryId: input.categoryId,
        description: input.description,
        expectedAmount: input.expectedAmount ?? null,
        currency: input.currency ?? card.currency,
        frequency: "MONTHLY",
        dayOfMonthHint:
          input.dayOfMonthHint === undefined ? null : input.dayOfMonthHint,
        isActive: input.isActive ?? true,
        notes: input.notes === undefined ? null : input.notes,
      },
    });
    return toTemplateRecord(created);
  }

  async update(
    input: UpdateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord> {
    const existing = await this.findById(input.id);
    if (!existing || existing.userId !== input.userId) {
      throw new AppError("NOT_FOUND", "Cargo recurrente no encontrado.", 404);
    }
    if (input.categoryId) {
      await assertExpenseCategory(
        this.prisma,
        input.userId,
        input.categoryId
      );
    }

    const updated = await this.prisma.creditCardRecurringCharge.update({
      where: { id: input.id },
      data: {
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.expectedAmount !== undefined
          ? { expectedAmount: input.expectedAmount }
          : {}),
        ...(input.dayOfMonthHint !== undefined
          ? { dayOfMonthHint: input.dayOfMonthHint }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return toTemplateRecord(updated);
  }

  async setActive(
    userId: string,
    id: string,
    isActive: boolean
  ): Promise<CreditCardRecurringChargeRecord> {
    const existing = await this.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cargo recurrente no encontrado.", 404);
    }
    const updated = await this.prisma.creditCardRecurringCharge.update({
      where: { id },
      data: { isActive },
    });
    return toTemplateRecord(updated);
  }

  async confirmAtomic(
    input: ConfirmRecurringChargeInput
  ): Promise<ConfirmRecurringChargeResult> {
    assertOccurrenceKey(input.occurrenceKey);
    if (toCents(input.amount) <= 0n) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El monto debe ser mayor a 0.",
        400
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingByKey = await tx.creditCardRecurringChargeOccurrence.findUnique(
          {
            where: {
              userId_idempotencyKey: {
                userId: input.userId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: { transaction: true },
          }
        );
        if (existingByKey) {
          assertIdempotentReplay(existingByKey, input);
          return {
            created: false,
            occurrence: toOccurrenceView(existingByKey, existingByKey.transaction),
          };
        }

        const template = await lockTemplate(
          tx,
          input.recurringChargeId,
          input.userId
        );
        if (!template.is_active) {
          throw new AppError(
            "VALIDATION_ERROR",
            "El cargo recurrente está inactivo.",
            400
          );
        }

        await lockCard(tx, template.credit_card_id, input.userId);
        await assertExpenseCategory(
          tx,
          input.userId,
          template.category_id
        );

        const existingOccurrence =
          await tx.creditCardRecurringChargeOccurrence.findUnique({
            where: {
              recurringChargeId_occurrenceKey: {
                recurringChargeId: input.recurringChargeId,
                occurrenceKey: input.occurrenceKey,
              },
            },
            include: { transaction: true },
          });
        if (existingOccurrence) {
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            "Ya existe una ocurrencia confirmada para este período.",
            409
          );
        }

        const description = resolveConfirmDescription(
          input.description,
          template.description
        );
        const occurredAt = input.occurredAt ?? new Date();
        const transactionId = randomUUID();
        const occurrenceId = randomUUID();

        const createdTx = await tx.transaction.create({
          data: {
            id: transactionId,
            userId: input.userId,
            accountId: null,
            creditCardId: template.credit_card_id,
            categoryId: template.category_id,
            type: "EXPENSE",
            status: "ACTIVE",
            amount: input.amount,
            currency: template.currency as Currency,
            description,
            occurredAt,
            paymentMethod: null,
            isFixed: false,
            reimbursementStatus: "NONE",
            relatedTransactionId: null,
            metadata: {
              recurringChargeId: input.recurringChargeId,
              occurrenceKey: input.occurrenceKey,
              kind: template.kind,
            },
          },
        });

        const occurrence = await tx.creditCardRecurringChargeOccurrence.create({
          data: {
            id: occurrenceId,
            userId: input.userId,
            recurringChargeId: input.recurringChargeId,
            occurrenceKey: input.occurrenceKey,
            idempotencyKey: input.idempotencyKey,
            transactionId,
            amount: input.amount,
            occurredAt,
          },
        });

        return {
          created: true,
          occurrence: toOccurrenceView(occurrence, createdTx),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const replay =
          await this.prisma.creditCardRecurringChargeOccurrence.findUnique({
            where: {
              userId_idempotencyKey: {
                userId: input.userId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: { transaction: true },
          });
        if (replay) {
          assertIdempotentReplay(replay, input);
          return {
            created: false,
            occurrence: toOccurrenceView(replay, replay.transaction),
          };
        }

        const byPeriod =
          await this.prisma.creditCardRecurringChargeOccurrence.findUnique({
            where: {
              recurringChargeId_occurrenceKey: {
                recurringChargeId: input.recurringChargeId,
                occurrenceKey: input.occurrenceKey,
              },
            },
            include: { transaction: true },
          });
        if (byPeriod) {
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            "Ya existe una ocurrencia confirmada para este período.",
            409
          );
        }
      }
      throw error;
    }
  }

  async outlook(
    userId: string,
    creditCardId: string,
    year: number,
    month: number
  ): Promise<RecurringChargeOutlookResult> {
    const card = await this.prisma.creditCard.findUnique({
      where: { id: creditCardId },
    });
    if (!card || card.userId !== userId) {
      throw new AppError("NOT_FOUND", "Tarjeta no encontrada.", 404);
    }

    const occurrenceKey = formatOccurrenceKey(year, month);
    const templates = await this.prisma.creditCardRecurringCharge.findMany({
      where: { userId, creditCardId, isActive: true },
      orderBy: { description: "asc" },
    });

    const occurrences =
      await this.prisma.creditCardRecurringChargeOccurrence.findMany({
        where: {
          userId,
          recurringChargeId: { in: templates.map((row) => row.id) },
          occurrenceKey,
        },
        include: { transaction: true },
      });
    const byTemplate = new Map(
      occurrences.map((row) => [row.recurringChargeId, row])
    );

    let expectedSumFixedCents = 0n;
    let variableCountPending = 0;

    const items = templates.map((template) => {
      const occurrenceRow = byTemplate.get(template.id);
      const hasOccurrence = occurrenceRow != null;
      if (!hasOccurrence) {
        if (template.expectedAmount == null) {
          variableCountPending += 1;
        } else {
          expectedSumFixedCents += toCents(
            template.expectedAmount.toFixed(2)
          );
        }
      }

      return {
        template: toTemplateRecord(template),
        occurrenceKey,
        hasOccurrence,
        occurrence: occurrenceRow
          ? toOccurrenceView(occurrenceRow, occurrenceRow.transaction)
          : null,
      };
    });

    return {
      creditCardId,
      occurrenceKey,
      year,
      month,
      items,
      expectedSumFixed: fromCents(expectedSumFixedCents),
      variableCountPending,
    };
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

async function lockTemplate(
  tx: TxClient,
  id: string,
  userId: string
): Promise<LockedTemplate> {
  const rows = await tx.$queryRaw<LockedTemplate[]>`
    SELECT id, user_id, credit_card_id, kind::text AS kind, category_id,
           description, expected_amount, currency::text AS currency,
           frequency::text AS frequency, day_of_month_hint, is_active, notes,
           created_at, updated_at
    FROM credit_card_recurring_charges
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;
  const template = rows[0];
  if (!template || template.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Cargo recurrente no encontrado.", 404);
  }
  return template;
}

async function assertExpenseCategory(
  db: TxClient | ReturnType<typeof getPrismaClient>,
  userId: string,
  categoryId: string
): Promise<void> {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category || category.userId !== userId) {
    throw new AppError("NOT_FOUND", "Categoría no encontrada.", 404);
  }
  if (category.type !== "EXPENSE" && category.type !== "BOTH") {
    throw new AppError(
      "VALIDATION_ERROR",
      "La categoría debe ser EXPENSE o BOTH.",
      400
    );
  }
}

function assertOccurrenceKey(value: string): void {
  const pattern: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!pattern.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "occurrenceKey debe tener formato YYYY-MM.",
      400
    );
  }
}

function formatOccurrenceKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (description == null) {
    return null;
  }
  const value = description.trim();
  return value.length === 0 ? null : value;
}

function resolveConfirmDescription(
  inputDescription: string | null | undefined,
  templateDescription: string
): string | null {
  if (inputDescription !== undefined) {
    return normalizeDescription(inputDescription);
  }
  return normalizeDescription(templateDescription);
}

function assertIdempotentReplay(
  existing: {
    recurringChargeId: string;
    occurrenceKey: string;
    amount: Prisma.Decimal;
    occurredAt: Date;
    transaction: PrismaTransaction;
  },
  input: ConfirmRecurringChargeInput
): void {
  const description = resolveConfirmDescription(
    input.description,
    existing.transaction.description ?? ""
  );
  const txDescription = normalizeDescription(existing.transaction.description);

  const sameCore =
    existing.recurringChargeId === input.recurringChargeId &&
    existing.occurrenceKey === input.occurrenceKey &&
    existing.amount.toFixed(2) === input.amount &&
    txDescription === description;

  const sameOccurredAt =
    input.occurredAt === undefined ||
    existing.occurredAt.getTime() === input.occurredAt.getTime();

  if (!sameCore || !sameOccurredAt) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otro payload de confirmación.",
      409
    );
  }
}

function toTemplateRecord(
  row: PrismaRecurringCharge
): CreditCardRecurringChargeRecord {
  return {
    id: row.id,
    userId: row.userId,
    creditCardId: row.creditCardId,
    kind: row.kind as CreditCardRecurringChargeKind,
    categoryId: row.categoryId,
    description: row.description,
    expectedAmount:
      row.expectedAmount == null ? null : row.expectedAmount.toFixed(2),
    currency: row.currency as Currency,
    frequency: row.frequency as CreditCardRecurringChargeFrequency,
    dayOfMonthHint: row.dayOfMonthHint,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOccurrenceView(
  occurrence: Pick<
    PrismaOccurrence,
    | "id"
    | "recurringChargeId"
    | "occurrenceKey"
    | "transactionId"
    | "amount"
    | "occurredAt"
    | "idempotencyKey"
  >,
  tx: PrismaTransaction
): CreditCardRecurringChargeOccurrenceView {
  return {
    id: occurrence.id,
    recurringChargeId: occurrence.recurringChargeId,
    occurrenceKey: occurrence.occurrenceKey,
    transactionId: occurrence.transactionId,
    amount: occurrence.amount.toFixed(2),
    currency: tx.currency as Currency,
    occurredAt: occurrence.occurredAt,
    description: tx.description,
    idempotencyKey: occurrence.idempotencyKey,
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
