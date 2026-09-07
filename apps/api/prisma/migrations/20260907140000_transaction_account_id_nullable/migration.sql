-- AlterTable: allow EXPENSE funded by CreditCard without a bank Account (P0.5 F1).
-- Existing rows keep their account_id values; no backfill.
ALTER TABLE "transactions" ALTER COLUMN "account_id" DROP NOT NULL;
