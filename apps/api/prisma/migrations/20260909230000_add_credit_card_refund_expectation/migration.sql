-- P0.11: Expected/accredited credit card refunds (additive).
-- EXPECTED has no financial impact; accreditation creates REIMBURSEMENT (SoT).

CREATE TYPE "credit_card_refund_expectation_status_enum" AS ENUM (
  'EXPECTED',
  'PARTIALLY_ACCREDITED',
  'ACCREDITED',
  'CANCELLED'
);

CREATE TYPE "credit_card_refund_destination_type_enum" AS ENUM (
  'BANK_ACCOUNT',
  'CREDIT_CARD'
);

CREATE TABLE "credit_card_refund_expectations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credit_card_id" UUID NOT NULL,
  "purchase_id" UUID,
  "original_expense_transaction_id" UUID,
  "expected_amount" DECIMAL(18, 2) NOT NULL,
  "currency" "currency_enum" NOT NULL,
  "status" "credit_card_refund_expectation_status_enum" NOT NULL DEFAULT 'EXPECTED',
  "expected_date" TIMESTAMPTZ,
  "description" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "credit_card_refund_expectations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_card_refund_expectations_xor_source"
    CHECK (
      ("purchase_id" IS NOT NULL AND "original_expense_transaction_id" IS NULL)
      OR
      ("purchase_id" IS NULL AND "original_expense_transaction_id" IS NOT NULL)
    )
);

CREATE INDEX "credit_card_refund_expectations_user_id_status_idx"
  ON "credit_card_refund_expectations"("user_id", "status");

CREATE INDEX "credit_card_refund_expectations_credit_card_id_created_at_idx"
  ON "credit_card_refund_expectations"("credit_card_id", "created_at");

CREATE INDEX "credit_card_refund_expectations_purchase_id_idx"
  ON "credit_card_refund_expectations"("purchase_id");

CREATE INDEX "credit_card_refund_expectations_original_expense_transaction_id_idx"
  ON "credit_card_refund_expectations"("original_expense_transaction_id");

ALTER TABLE "credit_card_refund_expectations"
  ADD CONSTRAINT "credit_card_refund_expectations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_expectations"
  ADD CONSTRAINT "credit_card_refund_expectations_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_expectations"
  ADD CONSTRAINT "credit_card_refund_expectations_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_expectations"
  ADD CONSTRAINT "credit_card_refund_expectations_original_expense_transaction_id_fkey"
  FOREIGN KEY ("original_expense_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "credit_card_refund_accreditations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "expectation_id" UUID,
  "original_expense_transaction_id" UUID NOT NULL,
  "purchase_id" UUID,
  "credit_card_id" UUID NOT NULL,
  "destination_type" "credit_card_refund_destination_type_enum" NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_card_refund_accreditations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_card_refund_accreditations_transaction_id_key"
  ON "credit_card_refund_accreditations"("transaction_id");

CREATE UNIQUE INDEX "credit_card_refund_accreditations_user_id_idempotency_key_key"
  ON "credit_card_refund_accreditations"("user_id", "idempotency_key");

CREATE INDEX "credit_card_refund_accreditations_expectation_id_idx"
  ON "credit_card_refund_accreditations"("expectation_id");

CREATE INDEX "credit_card_refund_accreditations_credit_card_id_created_at_idx"
  ON "credit_card_refund_accreditations"("credit_card_id", "created_at");

CREATE INDEX "credit_card_refund_accreditations_original_expense_transaction_id_idx"
  ON "credit_card_refund_accreditations"("original_expense_transaction_id");

CREATE INDEX "credit_card_refund_accreditations_purchase_id_idx"
  ON "credit_card_refund_accreditations"("purchase_id");

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_expectation_id_fkey"
  FOREIGN KEY ("expectation_id") REFERENCES "credit_card_refund_expectations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_original_expense_transaction_id_fkey"
  FOREIGN KEY ("original_expense_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_accreditations"
  ADD CONSTRAINT "credit_card_refund_accreditations_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
