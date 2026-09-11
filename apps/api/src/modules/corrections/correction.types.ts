import type { TransactionStatus } from "../transactions/transaction.types.js";

export const CORRECTION_KINDS = [
  "TRANSACTION_VOID",
  "TRANSFER_VOID",
  "PAYMENT_VOID",
  "PURCHASE_VOID",
  "REFUND_ACCREDITATION_VOID",
  "HOUSING_PAYMENT_VOID",
] as const;

export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

/** Status left on the affected transaction legs by a correction. */
export type CorrectionResultStatus = Extract<
  TransactionStatus,
  "VOIDED" | "REVERSED"
>;

export type CorrectionOperation = {
  id: string;
  userId: string;
  idempotencyKey: string;
  kind: CorrectionKind;
  targetId: string;
  resultStatus: CorrectionResultStatus;
  result: unknown | null;
  createdAt: Date;
};

export interface CorrectionRepository {
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string
  ): Promise<CorrectionOperation | null>;
  findByTarget(
    userId: string,
    kind: CorrectionKind,
    targetId: string
  ): Promise<CorrectionOperation[]>;
}
