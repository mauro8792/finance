-- CreateTable
CREATE TABLE "housing_obligations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reserve_account_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "installment_amount" DECIMAL(18,2) NOT NULL,
    "remaining_installments" INTEGER NOT NULL,
    "due_day" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "housing_obligations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "housing_obligations_installment_amount_positive" CHECK ("installment_amount" > 0),
    CONSTRAINT "housing_obligations_remaining_non_negative" CHECK ("remaining_installments" >= 0),
    CONSTRAINT "housing_obligations_due_day_range" CHECK ("due_day" IS NULL OR "due_day" BETWEEN 1 AND 31)
);

-- AddForeignKey
ALTER TABLE "housing_obligations" ADD CONSTRAINT "housing_obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housing_obligations" ADD CONSTRAINT "housing_obligations_reserve_account_id_fkey" FOREIGN KEY ("reserve_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
