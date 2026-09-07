-- CreateEnum
CREATE TYPE "credit_card_purchase_status_enum" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "credit_card_installment_status_enum" AS ENUM ('PENDING', 'RECOGNIZED', 'CANCELLED');

-- CreateTable
CREATE TABLE "credit_card_purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credit_card_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "description" VARCHAR(255),
    "currency" "currency_enum" NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "installment_amount" DECIMAL(18,2) NOT NULL,
    "installments_count" INTEGER NOT NULL DEFAULT 1,
    "purchased_at" TIMESTAMPTZ NOT NULL,
    "status" "credit_card_purchase_status_enum" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "credit_card_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_installments" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "credit_card_installment_status_enum" NOT NULL DEFAULT 'PENDING',
    "recognized_transaction_id" UUID,
    "recognized_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "credit_card_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_card_purchases_user_id_purchased_at_idx" ON "credit_card_purchases"("user_id", "purchased_at");

-- CreateIndex
CREATE INDEX "credit_card_purchases_credit_card_id_purchased_at_idx" ON "credit_card_purchases"("credit_card_id", "purchased_at");

-- CreateIndex
CREATE INDEX "credit_card_purchases_user_id_status_idx" ON "credit_card_purchases"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_installments_recognized_transaction_id_key" ON "credit_card_installments"("recognized_transaction_id");

-- CreateIndex
CREATE INDEX "credit_card_installments_purchase_id_idx" ON "credit_card_installments"("purchase_id");

-- CreateIndex
CREATE INDEX "credit_card_installments_status_idx" ON "credit_card_installments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_installments_purchase_id_installment_number_key" ON "credit_card_installments"("purchase_id", "installment_number");

-- AddForeignKey
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "credit_card_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_recognized_transaction_id_fkey" FOREIGN KEY ("recognized_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks (safe additive)
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_total_amount_positive" CHECK ("total_amount" > 0);
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_installment_amount_positive" CHECK ("installment_amount" > 0);
ALTER TABLE "credit_card_purchases" ADD CONSTRAINT "credit_card_purchases_installments_count_positive" CHECK ("installments_count" >= 1);
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "credit_card_installments" ADD CONSTRAINT "credit_card_installments_number_positive" CHECK ("installment_number" >= 1);
