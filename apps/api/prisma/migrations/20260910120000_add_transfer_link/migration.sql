-- P0.12.1: transfer idempotency link (logical transfer = two TRANSFER legs).
-- Additive only. Does not alter existing Transaction rows.

CREATE TABLE "transfer_links" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "source_account_id" UUID NOT NULL,
  "destination_account_id" UUID NOT NULL,
  "out_transaction_id" UUID NOT NULL,
  "in_transaction_id" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "currency" "currency_enum" NOT NULL,
  "description" VARCHAR(255),
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "client_sent_occurred_at" BOOLEAN NOT NULL DEFAULT false,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transfer_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transfer_links_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "transfer_links_accounts_distinct_check" CHECK (
    "source_account_id" <> "destination_account_id"
  )
);

CREATE UNIQUE INDEX "transfer_links_transfer_id_key"
  ON "transfer_links"("transfer_id");

CREATE UNIQUE INDEX "transfer_links_out_transaction_id_key"
  ON "transfer_links"("out_transaction_id");

CREATE UNIQUE INDEX "transfer_links_in_transaction_id_key"
  ON "transfer_links"("in_transaction_id");

CREATE UNIQUE INDEX "transfer_links_user_id_idempotency_key_key"
  ON "transfer_links"("user_id", "idempotency_key");

CREATE INDEX "transfer_links_user_id_occurred_at_idx"
  ON "transfer_links"("user_id", "occurred_at");

ALTER TABLE "transfer_links"
  ADD CONSTRAINT "transfer_links_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_links"
  ADD CONSTRAINT "transfer_links_source_account_id_fkey"
  FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_links"
  ADD CONSTRAINT "transfer_links_destination_account_id_fkey"
  FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_links"
  ADD CONSTRAINT "transfer_links_out_transaction_id_fkey"
  FOREIGN KEY ("out_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_links"
  ADD CONSTRAINT "transfer_links_in_transaction_id_fkey"
  FOREIGN KEY ("in_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
