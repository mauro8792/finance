-- CreateEnum
CREATE TYPE "currency_enum" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "account_type_enum" AS ENUM ('CASH', 'BANK', 'FUND', 'INVESTMENT', 'HOUSING_RESERVE', 'OTHER');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "type" "account_type_enum" NOT NULL,
    "initial_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
