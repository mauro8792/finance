-- CreateEnum
CREATE TYPE "investment_type_enum" AS ENUM ('CAUCION', 'OTHER');

-- CreateEnum
CREATE TYPE "investment_status_enum" AS ENUM ('DRAFT', 'ACTIVE', 'MATURED', 'RENEWED', 'CANCELLED');

-- CreateTable
CREATE TABLE "investments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "renewed_from_investment_id" UUID,
    "type" "investment_type_enum" NOT NULL,
    "status" "investment_status_enum" NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "annual_rate" DECIMAL(12,6),
    "start_date" TIMESTAMPTZ NOT NULL,
    "maturity_date" TIMESTAMPTZ,
    "expected_return" DECIMAL(18,2),
    "actual_return" DECIMAL(18,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investments_principal_positive" CHECK ("principal" > 0),
    CONSTRAINT "investments_annual_rate_non_negative" CHECK ("annual_rate" IS NULL OR "annual_rate" >= 0),
    CONSTRAINT "investments_maturity_on_or_after_start" CHECK ("maturity_date" IS NULL OR "maturity_date" >= "start_date")
);

-- CreateIndex
CREATE INDEX "investments_user_id_status_idx" ON "investments"("user_id", "status");

-- CreateIndex
CREATE INDEX "investments_user_id_maturity_date_idx" ON "investments"("user_id", "maturity_date");

-- CreateIndex
CREATE INDEX "investments_account_id_idx" ON "investments"("account_id");

-- CreateIndex
CREATE INDEX "investments_renewed_from_investment_id_idx" ON "investments"("renewed_from_investment_id");

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_renewed_from_investment_id_fkey" FOREIGN KEY ("renewed_from_investment_id") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
