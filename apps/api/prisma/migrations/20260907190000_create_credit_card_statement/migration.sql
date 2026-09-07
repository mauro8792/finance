-- P0.9: CreditCardStatement (grouping/projection/snapshot). Additive only.
-- Statement is NOT a debt ledger (F9). No Transaction.statement_id.

CREATE TYPE "credit_card_statement_status_enum" AS ENUM (
  'PROJECTED',
  'CLOSED',
  'PARTIALLY_PAID',
  'PAID'
);

CREATE TABLE "credit_card_statements" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "credit_card_id" UUID NOT NULL,
  "currency" "currency_enum" NOT NULL,
  "period_start" TIMESTAMPTZ NOT NULL,
  "period_end" TIMESTAMPTZ NOT NULL,
  "closing_date" TIMESTAMPTZ NOT NULL,
  "due_date" TIMESTAMPTZ,
  "status" "credit_card_statement_status_enum" NOT NULL DEFAULT 'PROJECTED',
  "closed_projected_amount" DECIMAL(18,2),
  "actual_amount" DECIMAL(18,2),
  "closed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "credit_card_statements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_card_statements_credit_card_id_closing_date_key"
  ON "credit_card_statements"("credit_card_id", "closing_date");

CREATE INDEX "credit_card_statements_user_id_closing_date_idx"
  ON "credit_card_statements"("user_id", "closing_date");

CREATE INDEX "credit_card_statements_credit_card_id_status_idx"
  ON "credit_card_statements"("credit_card_id", "status");

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_period_order"
  CHECK ("period_start" <= "period_end");

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_period_end_is_closing"
  CHECK ("period_end" = "closing_date");

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_amounts_non_negative"
  CHECK (
    ("closed_projected_amount" IS NULL OR "closed_projected_amount" >= 0)
    AND ("actual_amount" IS NULL OR "actual_amount" >= 0)
  );

ALTER TABLE "credit_card_statements"
  ADD CONSTRAINT "credit_card_statements_closed_consistency"
  CHECK (
    (
      "status" = 'PROJECTED'
      AND "closed_at" IS NULL
      AND "closed_projected_amount" IS NULL
    )
    OR (
      "status" IN ('CLOSED', 'PARTIALLY_PAID', 'PAID')
      AND "closed_at" IS NOT NULL
      AND "closed_projected_amount" IS NOT NULL
    )
  );
