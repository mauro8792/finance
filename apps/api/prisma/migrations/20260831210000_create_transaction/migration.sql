-- CreateEnum
CREATE TYPE "transaction_type_enum" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'REIMBURSEMENT', 'ADJUSTMENT', 'INVESTMENT_OUTFLOW', 'INVESTMENT_RETURN');

-- CreateEnum
CREATE TYPE "transaction_status_enum" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "payment_method_enum" AS ENUM ('CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "reimbursement_status_enum" AS ENUM ('NONE', 'PENDING', 'PARTIAL', 'COMPLETED');

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "type" "transaction_type_enum" NOT NULL,
    "status" "transaction_status_enum" NOT NULL DEFAULT 'ACTIVE',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "description" VARCHAR(255),
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "payment_method" "payment_method_enum",
    "is_fixed" BOOLEAN NOT NULL DEFAULT false,
    "reimbursement_status" "reimbursement_status_enum" NOT NULL DEFAULT 'NONE',
    "related_transaction_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_idx" ON "transactions"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_account_id_occurred_at_idx" ON "transactions"("account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_category_id_occurred_at_idx" ON "transactions"("category_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_occurred_at_idx" ON "transactions"("user_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_related_transaction_id_idx" ON "transactions"("related_transaction_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0);
