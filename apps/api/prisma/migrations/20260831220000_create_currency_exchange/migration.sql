-- AlterEnum
ALTER TYPE "transaction_type_enum" ADD VALUE 'CURRENCY_EXCHANGE';

-- CreateTable
CREATE TABLE "currency_exchanges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "from_currency" "currency_enum" NOT NULL,
    "to_currency" "currency_enum" NOT NULL,
    "from_amount" DECIMAL(18,2) NOT NULL,
    "to_amount" DECIMAL(18,2) NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "currency_exchanges_user_id_occurred_at_idx" ON "currency_exchanges"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "currency_exchanges_from_account_id_occurred_at_idx" ON "currency_exchanges"("from_account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "currency_exchanges_to_account_id_occurred_at_idx" ON "currency_exchanges"("to_account_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_from_amount_positive" CHECK ("from_amount" > 0);
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_to_amount_positive" CHECK ("to_amount" > 0);
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_exchange_rate_positive" CHECK ("exchange_rate" > 0);
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_currencies_distinct" CHECK ("from_currency" <> "to_currency");
ALTER TABLE "currency_exchanges" ADD CONSTRAINT "currency_exchanges_accounts_distinct" CHECK ("from_account_id" <> "to_account_id");
