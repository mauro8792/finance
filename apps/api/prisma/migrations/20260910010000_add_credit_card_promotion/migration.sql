-- P0.12: Credit card promotions / refund caps (additive).
-- Apply creates EXPECTED expectation only (no financial impact).
-- Cap consumption: expected_amount - cancelled_remaining_amount.

CREATE TYPE "credit_card_promotion_benefit_type_enum" AS ENUM (
  'PERCENTAGE',
  'FIXED_AMOUNT'
);

CREATE TYPE "credit_card_promotion_cap_period_enum" AS ENUM (
  'NONE',
  'PER_PURCHASE',
  'MONTHLY',
  'PROMOTION_PERIOD'
);

ALTER TABLE "credit_card_refund_expectations"
  ADD COLUMN "cancelled_remaining_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "promotion_id" UUID,
  ADD COLUMN "calculation_eligible_base" DECIMAL(18, 2),
  ADD COLUMN "calculation_raw_benefit" DECIMAL(18, 2),
  ADD COLUMN "calculation_cap_applied" DECIMAL(18, 2),
  ADD COLUMN "calculation_limited_by" VARCHAR(40),
  ADD COLUMN "calculation_percentage" DECIMAL(18, 6),
  ADD COLUMN "calculation_fixed_amount" DECIMAL(18, 2),
  ADD COLUMN "calculation_promotion_name" VARCHAR(120);

CREATE TABLE "credit_card_promotions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credit_card_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "currency" "currency_enum" NOT NULL,
  "benefit_type" "credit_card_promotion_benefit_type_enum" NOT NULL,
  "percentage" DECIMAL(18, 6),
  "fixed_amount" DECIMAL(18, 2),
  "minimum_purchase_amount" DECIMAL(18, 2),
  "cap_amount" DECIMAL(18, 2),
  "cap_period" "credit_card_promotion_cap_period_enum" NOT NULL DEFAULT 'NONE',
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_until" TIMESTAMPTZ NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "description" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "credit_card_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_card_promotions_benefit_check" CHECK (
    (
      "benefit_type" = 'PERCENTAGE'
      AND "percentage" IS NOT NULL
      AND "fixed_amount" IS NULL
      AND "percentage" > 0
      AND "percentage" <= 1
    )
    OR
    (
      "benefit_type" = 'FIXED_AMOUNT'
      AND "fixed_amount" IS NOT NULL
      AND "percentage" IS NULL
      AND "fixed_amount" > 0
    )
  ),
  CONSTRAINT "credit_card_promotions_cap_check" CHECK (
    ("cap_amount" IS NULL AND "cap_period" = 'NONE')
    OR
    ("cap_amount" IS NOT NULL AND "cap_period" <> 'NONE')
  ),
  CONSTRAINT "credit_card_promotions_valid_range_check" CHECK ("valid_from" <= "valid_until"),
  CONSTRAINT "credit_card_promotions_minimum_check" CHECK (
    "minimum_purchase_amount" IS NULL OR "minimum_purchase_amount" > 0
  ),
  CONSTRAINT "credit_card_promotions_cap_amount_check" CHECK (
    "cap_amount" IS NULL OR "cap_amount" > 0
  )
);

CREATE INDEX "credit_card_promotions_user_id_is_active_idx"
  ON "credit_card_promotions"("user_id", "is_active");

CREATE INDEX "credit_card_promotions_credit_card_id_valid_from_valid_until_idx"
  ON "credit_card_promotions"("credit_card_id", "valid_from", "valid_until");

ALTER TABLE "credit_card_promotions"
  ADD CONSTRAINT "credit_card_promotions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_promotions"
  ADD CONSTRAINT "credit_card_promotions_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_refund_expectations"
  ADD CONSTRAINT "credit_card_refund_expectations_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "credit_card_promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "credit_card_refund_expectations_promotion_id_idx"
  ON "credit_card_refund_expectations"("promotion_id");

CREATE TABLE "credit_card_promotion_applications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "promotion_id" UUID NOT NULL,
  "expectation_id" UUID NOT NULL,
  "purchase_id" UUID,
  "original_expense_transaction_id" UUID,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_card_promotion_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_card_promotion_applications_expectation_id_key"
  ON "credit_card_promotion_applications"("expectation_id");

CREATE UNIQUE INDEX "credit_card_promotion_applications_user_id_idempotency_key_key"
  ON "credit_card_promotion_applications"("user_id", "idempotency_key");

-- One promotion application per source (partial uniques).
CREATE UNIQUE INDEX "credit_card_promotion_applications_promotion_purchase_uidx"
  ON "credit_card_promotion_applications"("promotion_id", "purchase_id")
  WHERE "purchase_id" IS NOT NULL;

CREATE UNIQUE INDEX "credit_card_promotion_applications_promotion_expense_uidx"
  ON "credit_card_promotion_applications"("promotion_id", "original_expense_transaction_id")
  WHERE "original_expense_transaction_id" IS NOT NULL;

CREATE INDEX "credit_card_promotion_applications_promotion_id_idx"
  ON "credit_card_promotion_applications"("promotion_id");

CREATE INDEX "credit_card_promotion_applications_purchase_id_idx"
  ON "credit_card_promotion_applications"("purchase_id");

CREATE INDEX "credit_card_promotion_applications_original_expense_transaction_id_idx"
  ON "credit_card_promotion_applications"("original_expense_transaction_id");

ALTER TABLE "credit_card_promotion_applications"
  ADD CONSTRAINT "credit_card_promotion_applications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_promotion_applications"
  ADD CONSTRAINT "credit_card_promotion_applications_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "credit_card_promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_promotion_applications"
  ADD CONSTRAINT "credit_card_promotion_applications_expectation_id_fkey"
  FOREIGN KEY ("expectation_id") REFERENCES "credit_card_refund_expectations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_promotion_applications"
  ADD CONSTRAINT "credit_card_promotion_applications_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_promotion_applications"
  ADD CONSTRAINT "credit_card_promotion_applications_original_expense_transaction_id_fkey"
  FOREIGN KEY ("original_expense_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
