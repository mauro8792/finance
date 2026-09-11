-- P1.2.1: account balance reconciliation + housing period correction audit
-- (additive only).
-- No DROP, no DELETE, no financial UPDATE, no backfill of existing rows.
--
-- ADJUSTMENT TransactionType already exists in the enum; this migration
-- introduces an auditable reconciliation entity whose transaction leg
-- participates in computeBalance without counting as income/expense.

CREATE TABLE IF NOT EXISTS "account_balance_reconciliations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "observed_balance" DECIMAL(18,2) NOT NULL,
    "previous_calculated_balance" DECIMAL(18,2) NOT NULL,
    "adjustment_amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_balance_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_balance_reconciliations_transaction_id_key"
  ON "account_balance_reconciliations"("transaction_id");

CREATE UNIQUE INDEX IF NOT EXISTS "account_balance_reconciliations_user_id_idempotency_key_key"
  ON "account_balance_reconciliations"("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "account_balance_reconciliations_user_id_account_id_idx"
  ON "account_balance_reconciliations"("user_id", "account_id");

ALTER TABLE "account_balance_reconciliations"
  DROP CONSTRAINT IF EXISTS "account_balance_reconciliations_user_id_fkey";
ALTER TABLE "account_balance_reconciliations"
  ADD CONSTRAINT "account_balance_reconciliations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_balance_reconciliations"
  DROP CONSTRAINT IF EXISTS "account_balance_reconciliations_account_id_fkey";
ALTER TABLE "account_balance_reconciliations"
  ADD CONSTRAINT "account_balance_reconciliations_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_balance_reconciliations"
  DROP CONSTRAINT IF EXISTS "account_balance_reconciliations_transaction_id_fkey";
ALTER TABLE "account_balance_reconciliations"
  ADD CONSTRAINT "account_balance_reconciliations_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Last previous period metadata when correcting historical housing payments.
ALTER TABLE "housing_payments"
  ADD COLUMN IF NOT EXISTS "previous_period_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "previous_period_month" INTEGER,
  ADD COLUMN IF NOT EXISTS "period_corrected_at" TIMESTAMPTZ;

ALTER TABLE "housing_payments"
  DROP CONSTRAINT IF EXISTS "housing_payments_previous_period_month_check";

ALTER TABLE "housing_payments"
  ADD CONSTRAINT "housing_payments_previous_period_month_check"
  CHECK (
    ("previous_period_year" IS NULL AND "previous_period_month" IS NULL)
    OR (
      "previous_period_year" IS NOT NULL
      AND "previous_period_month" IS NOT NULL
      AND "previous_period_month" >= 1
      AND "previous_period_month" <= 12
    )
  );
