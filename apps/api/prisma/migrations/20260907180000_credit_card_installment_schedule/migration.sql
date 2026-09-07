-- P0.7: scheduled recognition date + recognition/transaction consistency check.
-- Additive only. Tables were empty in Neon at P0.6 close; no backfill of financial data.

ALTER TABLE "credit_card_installments"
ADD COLUMN "scheduled_for" TIMESTAMPTZ;

-- Safe when table is empty (prod) or after tests cleaned rows.
UPDATE "credit_card_installments"
SET "scheduled_for" = COALESCE("recognized_at", "created_at")
WHERE "scheduled_for" IS NULL;

ALTER TABLE "credit_card_installments"
ALTER COLUMN "scheduled_for" SET NOT NULL;

CREATE INDEX "credit_card_installments_scheduled_for_idx"
ON "credit_card_installments"("scheduled_for");

ALTER TABLE "credit_card_installments"
ADD CONSTRAINT "credit_card_installments_recognition_consistency"
CHECK (
  (
    "status" = 'RECOGNIZED'
    AND "recognized_transaction_id" IS NOT NULL
  )
  OR (
    "status" IN ('PENDING', 'CANCELLED')
    AND "recognized_transaction_id" IS NULL
  )
);
