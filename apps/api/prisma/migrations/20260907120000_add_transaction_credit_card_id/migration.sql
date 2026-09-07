-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "credit_card_id" UUID;

-- CreateIndex
CREATE INDEX "transactions_credit_card_id_idx" ON "transactions"("credit_card_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
