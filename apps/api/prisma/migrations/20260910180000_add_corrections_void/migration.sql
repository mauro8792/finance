-- P0.15: safe void / corrections.
-- Additive only: no DROP, no DELETE, no financial UPDATE, no backfill.
--
-- REVERSED is the status used when a void is part of a compound operation
-- (transfer legs, card payments, recognized installment expenses, refund
-- accreditations). VOIDED stays the status for a plain single-movement void.
-- Postgres 16 allows ALTER TYPE ... ADD VALUE inside the migration transaction
-- as long as the new label is not referenced in the same transaction, so this
-- migration must not use the 'REVERSED' literal anywhere below.

ALTER TYPE "transaction_status_enum" ADD VALUE IF NOT EXISTS 'REVERSED';

CREATE TYPE "correction_kind_enum" AS ENUM (
  'TRANSACTION_VOID',
  'TRANSFER_VOID',
  'PAYMENT_VOID',
  'PURCHASE_VOID',
  'REFUND_ACCREDITATION_VOID'
);

CREATE TABLE "correction_operations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "kind" "correction_kind_enum" NOT NULL,
  "target_id" UUID NOT NULL,
  "result_status" "transaction_status_enum" NOT NULL,
  "result_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "correction_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correction_operations_user_id_idempotency_key_key"
  ON "correction_operations"("user_id", "idempotency_key");

CREATE INDEX "correction_operations_user_id_kind_target_id_idx"
  ON "correction_operations"("user_id", "kind", "target_id");

ALTER TABLE "correction_operations"
  ADD CONSTRAINT "correction_operations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Void markers on the compound-operation link tables. Nullable so existing
-- rows stay untouched; the partial unique index only constrains voided rows.

ALTER TABLE "transfer_links"
  ADD COLUMN "voided_at" TIMESTAMPTZ,
  ADD COLUMN "void_idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX "transfer_links_user_id_void_idempotency_key_key"
  ON "transfer_links"("user_id", "void_idempotency_key")
  WHERE "void_idempotency_key" IS NOT NULL;

ALTER TABLE "credit_card_payment_links"
  ADD COLUMN "voided_at" TIMESTAMPTZ,
  ADD COLUMN "void_idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX "credit_card_payment_links_user_id_void_idempotency_key_key"
  ON "credit_card_payment_links"("user_id", "void_idempotency_key")
  WHERE "void_idempotency_key" IS NOT NULL;

ALTER TABLE "credit_card_refund_accreditations"
  ADD COLUMN "voided_at" TIMESTAMPTZ,
  ADD COLUMN "void_idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX "ccra_user_id_void_idempotency_key_key"
  ON "credit_card_refund_accreditations"("user_id", "void_idempotency_key")
  WHERE "void_idempotency_key" IS NOT NULL;
