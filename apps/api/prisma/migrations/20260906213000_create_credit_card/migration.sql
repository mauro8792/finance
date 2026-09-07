-- CreateEnum
CREATE TYPE "credit_card_fee_status_enum" AS ENUM ('HAS_FEE', 'WAIVED', 'POTENTIALLY_WAIVED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "issuer" VARCHAR(120) NOT NULL,
    "brand" VARCHAR(40) NOT NULL,
    "currency" "currency_enum" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "closing_day" INTEGER,
    "due_day" INTEGER,
    "fee_status" "credit_card_fee_status_enum" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_cards_closing_day_check" CHECK ("closing_day" IS NULL OR ("closing_day" >= 1 AND "closing_day" <= 31)),
    CONSTRAINT "credit_cards_due_day_check" CHECK ("due_day" IS NULL OR ("due_day" >= 1 AND "due_day" <= 31))
);

-- CreateIndex
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards"("user_id");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_is_active_idx" ON "credit_cards"("user_id", "is_active");

-- At most one primary card per user (active or inactive).
CREATE UNIQUE INDEX "credit_cards_one_primary_per_user" ON "credit_cards"("user_id") WHERE "is_primary" = true;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
