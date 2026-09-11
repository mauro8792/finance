-- P1.2: housing prepaid period + safe void (additive only).
-- No DROP, no DELETE, no financial UPDATE, no backfill of existing rows.
--
-- period_year / period_month separate "cuota/período pagado" from paid_at
-- (fecha real de caja). Both nullable so existing payments stay valid.
--
-- HOUSING_PAYMENT_VOID follows P0.15 correction_operations idempotency.
-- void markers on housing_payments mirror other compound void paths.

ALTER TYPE "correction_kind_enum" ADD VALUE IF NOT EXISTS 'HOUSING_PAYMENT_VOID';

ALTER TABLE "housing_payments"
  ADD COLUMN IF NOT EXISTS "period_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "period_month" INTEGER,
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "void_idempotency_key" VARCHAR(128);

ALTER TABLE "housing_payments"
  DROP CONSTRAINT IF EXISTS "housing_payments_period_month_check";

ALTER TABLE "housing_payments"
  ADD CONSTRAINT "housing_payments_period_month_check"
  CHECK (
    ("period_year" IS NULL AND "period_month" IS NULL)
    OR (
      "period_year" IS NOT NULL
      AND "period_month" IS NOT NULL
      AND "period_month" >= 1
      AND "period_month" <= 12
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "housing_payments_void_idempotency_key_key"
  ON "housing_payments"("void_idempotency_key")
  WHERE "void_idempotency_key" IS NOT NULL;

-- One active payment per obligation period (prepaid installments).
CREATE UNIQUE INDEX IF NOT EXISTS "housing_payments_obligation_period_active_key"
  ON "housing_payments"("housing_obligation_id", "period_year", "period_month")
  WHERE "period_year" IS NOT NULL
    AND "period_month" IS NOT NULL
    AND "voided_at" IS NULL;
