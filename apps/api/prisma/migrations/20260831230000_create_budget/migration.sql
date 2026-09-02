-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budgets_amount_non_negative" CHECK ("amount" >= 0),
    CONSTRAINT "budgets_month_range" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "budgets_year_minimum" CHECK ("year" >= 2000)
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_currency_year_month_key" ON "budgets"("user_id", "category_id", "currency", "year", "month");

-- CreateIndex
CREATE INDEX "budgets_user_id_year_month_idx" ON "budgets"("user_id", "year", "month");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
