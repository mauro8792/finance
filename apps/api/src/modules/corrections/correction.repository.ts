import { randomUUID } from "node:crypto";
import { Prisma, type CorrectionOperation as PrismaCorrection } from "@prisma/client";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CorrectionKind,
  CorrectionOperation,
  CorrectionRepository,
  CorrectionResultStatus,
} from "./correction.types.js";

type TxClient = Prisma.TransactionClient;

export const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * P0.15: every void path shares this unit of idempotency.
 * UNIQUE(user_id, idempotency_key) turns a concurrent double-void with the
 * same key into one applied correction plus one replay.
 */
export function requireIdempotencyKey(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (value.length < MIN_IDEMPOTENCY_KEY_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      `idempotencyKey es obligatorio (mínimo ${MIN_IDEMPOTENCY_KEY_LENGTH} caracteres).`,
      400
    );
  }
  if (value.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      "idempotencyKey demasiado largo.",
      400
    );
  }
  return value;
}

export async function findCorrectionByKey(
  db: TxClient | ReturnType<typeof getPrismaClient>,
  userId: string,
  idempotencyKey: string
): Promise<CorrectionOperation | null> {
  const record = await db.correctionOperation.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  return record ? toCorrection(record) : null;
}

/**
 * A key is bound to the first (kind, target) it corrected. Reusing it for any
 * other correction is a client bug, not a replay.
 */
export function assertCorrectionTarget(
  existing: CorrectionOperation,
  kind: CorrectionKind,
  targetId: string
): void {
  if (existing.kind !== kind || existing.targetId !== targetId) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "idempotencyKey ya usado con otra corrección.",
      409
    );
  }
}

export async function recordCorrection(
  tx: TxClient,
  input: {
    userId: string;
    idempotencyKey: string;
    kind: CorrectionKind;
    targetId: string;
    resultStatus: CorrectionResultStatus;
    result?: unknown;
  }
): Promise<CorrectionOperation> {
  const record = await tx.correctionOperation.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      targetId: input.targetId,
      resultStatus: input.resultStatus,
      ...(input.result === undefined
        ? {}
        : { resultJson: input.result as Prisma.InputJsonValue }),
    },
  });
  return toCorrection(record);
}

export function isUniqueViolation(error: unknown): boolean {
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

export class PrismaCorrectionRepository implements CorrectionRepository {
  constructor(private readonly prisma = getPrismaClient()) {}

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CorrectionOperation | null> {
    return findCorrectionByKey(this.prisma, userId, idempotencyKey);
  }

  async findByTarget(
    userId: string,
    kind: CorrectionKind,
    targetId: string
  ): Promise<CorrectionOperation[]> {
    const rows = await this.prisma.correctionOperation.findMany({
      where: { userId, kind, targetId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toCorrection);
  }
}

function toCorrection(record: PrismaCorrection): CorrectionOperation {
  return {
    id: record.id,
    userId: record.userId,
    idempotencyKey: record.idempotencyKey,
    kind: record.kind as CorrectionKind,
    targetId: record.targetId,
    resultStatus: record.resultStatus as CorrectionResultStatus,
    result: record.resultJson ?? null,
    createdAt: record.createdAt,
  };
}
