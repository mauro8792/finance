-- P0.13: Credit card recurring charge templates + confirmed occurrences (additive).

CREATE TYPE "credit_card_recurring_charge_kind_enum" AS ENUM (
  'MAINTENANCE',
  'RECURRING_SERVICE',
  'INSURANCE',
  'OTHER'
);

CREATE TYPE "credit_card_recurring_charge_frequency_enum" AS ENUM (
  'MONTHLY'
);

ALTER TABLE "credit_cards"
  ADD COLUMN "fee_expected_amount" DECIMAL(18, 2),
  ADD COLUMN "fee_notes" VARCHAR(500);

ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_fee_expected_amount_check"
  CHECK ("fee_expected_amount" IS NULL OR "fee_expected_amount" > 0);

CREATE TABLE "credit_card_recurring_charges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credit_card_id" UUID NOT NULL,
  "kind" "credit_card_recurring_charge_kind_enum" NOT NULL,
  "category_id" UUID NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "expected_amount" DECIMAL(18, 2),
  "currency" "currency_enum" NOT NULL,
  "frequency" "credit_card_recurring_charge_frequency_enum" NOT NULL DEFAULT 'MONTHLY',
  "day_of_month_hint" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "credit_card_recurring_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_card_recurring_charges_expected_amount_check" CHECK (
    "expected_amount" IS NULL OR "expected_amount" > 0
  ),
  CONSTRAINT "credit_card_recurring_charges_day_hint_check" CHECK (
    "day_of_month_hint" IS NULL
    OR ("day_of_month_hint" >= 1 AND "day_of_month_hint" <= 31)
  )
);

CREATE INDEX "credit_card_recurring_charges_user_id_credit_card_id_idx"
  ON "credit_card_recurring_charges"("user_id", "credit_card_id");

CREATE INDEX "credit_card_recurring_charges_credit_card_id_is_active_idx"
  ON "credit_card_recurring_charges"("credit_card_id", "is_active");

ALTER TABLE "credit_card_recurring_charges"
  ADD CONSTRAINT "credit_card_recurring_charges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_recurring_charges"
  ADD CONSTRAINT "credit_card_recurring_charges_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_recurring_charges"
  ADD CONSTRAINT "credit_card_recurring_charges_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "credit_card_recurring_charge_occurrences" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "recurring_charge_id" UUID NOT NULL,
  "occurrence_key" VARCHAR(32) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "transaction_id" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_card_recurring_charge_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_card_recurring_charge_occurrences_amount_check" CHECK (
    "amount" > 0
  )
);

CREATE UNIQUE INDEX "credit_card_recurring_charge_occurrences_transaction_id_key"
  ON "credit_card_recurring_charge_occurrences"("transaction_id");

CREATE UNIQUE INDEX "credit_card_recurring_charge_occurrences_recurring_charge_id_occurrence_key_key"
  ON "credit_card_recurring_charge_occurrences"("recurring_charge_id", "occurrence_key");

CREATE UNIQUE INDEX "credit_card_recurring_charge_occurrences_user_id_idempotency_key_key"
  ON "credit_card_recurring_charge_occurrences"("user_id", "idempotency_key");

CREATE INDEX "credit_card_recurring_charge_occurrences_user_id_recurring_charge_id_idx"
  ON "credit_card_recurring_charge_occurrences"("user_id", "recurring_charge_id");

ALTER TABLE "credit_card_recurring_charge_occurrences"
  ADD CONSTRAINT "credit_card_recurring_charge_occurrences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_recurring_charge_occurrences"
  ADD CONSTRAINT "credit_card_recurring_charge_occurrences_recurring_charge_id_fkey"
  FOREIGN KEY ("recurring_charge_id") REFERENCES "credit_card_recurring_charges"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_recurring_charge_occurrences"
  ADD CONSTRAINT "credit_card_recurring_charge_occurrences_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
