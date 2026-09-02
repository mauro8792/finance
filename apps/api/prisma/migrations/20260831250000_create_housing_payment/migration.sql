-- AlterEnum
ALTER TYPE "transaction_type_enum" ADD VALUE 'HOUSING_PAYMENT';

-- CreateTable
CREATE TABLE "housing_payments" (
    "id" UUID NOT NULL,
    "housing_obligation_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "installment_number" INTEGER,
    "paid_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housing_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "housing_payments_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "housing_payments_transaction_id_key" ON "housing_payments"("transaction_id");

-- CreateIndex
CREATE INDEX "housing_payments_housing_obligation_id_paid_at_idx" ON "housing_payments"("housing_obligation_id", "paid_at");

-- AddForeignKey
ALTER TABLE "housing_payments" ADD CONSTRAINT "housing_payments_housing_obligation_id_fkey" FOREIGN KEY ("housing_obligation_id") REFERENCES "housing_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_payments" ADD CONSTRAINT "housing_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_payments" ADD CONSTRAINT "housing_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
