-- Migration: Move stock_type from items to header in sales
-- Date: 2026-06-13

-- Add stock_type to parts_sales
ALTER TABLE "public"."parts_sales" ADD COLUMN "stock_type" TEXT CHECK ("stock_type" IN ('general', 'contract'));

-- Fill default value (assume general for existing records if any, though we just created them)
UPDATE "public"."parts_sales" SET "stock_type" = 'general' WHERE "stock_type" IS NULL;

-- Make it NOT NULL
ALTER TABLE "public"."parts_sales" ALTER COLUMN "stock_type" SET NOT NULL;

-- Remove stock_type from parts_sale_items
ALTER TABLE "public"."parts_sale_items" DROP COLUMN "stock_type";
