-- P0.10: CREDIT_CARD_PAYMENT + payment↔statement link (additive, no backfill).
-- Amount SoT remains transactions; link table holds statementId + idempotency only.

ALTER TYPE "transaction_type_enum" ADD VALUE 'CREDIT_CARD_PAYMENT';

CREATE TABLE "credit_card_payment_links" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "credit_card_id" UUID NOT NULL,
  "statement_id" UUID,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_card_payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_card_payment_links_transaction_id_key"
  ON "credit_card_payment_links"("transaction_id");

CREATE UNIQUE INDEX "credit_card_payment_links_user_id_idempotency_key_key"
  ON "credit_card_payment_links"("user_id", "idempotency_key");

CREATE INDEX "credit_card_payment_links_credit_card_id_created_at_idx"
  ON "credit_card_payment_links"("credit_card_id", "created_at");

CREATE INDEX "credit_card_payment_links_statement_id_idx"
  ON "credit_card_payment_links"("statement_id");

ALTER TABLE "credit_card_payment_links"
  ADD CONSTRAINT "credit_card_payment_links_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_links"
  ADD CONSTRAINT "credit_card_payment_links_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_links"
  ADD CONSTRAINT "credit_card_payment_links_credit_card_id_fkey"
  FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_card_payment_links"
  ADD CONSTRAINT "credit_card_payment_links_statement_id_fkey"
  FOREIGN KEY ("statement_id") REFERENCES "credit_card_statements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
