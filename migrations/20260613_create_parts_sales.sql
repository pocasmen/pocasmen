-- Migration: Create parts_sales and parts_sale_items tables
-- Date: 2026-06-13

CREATE TABLE IF NOT EXISTS "public"."parts_sales" (
    "id" SERIAL PRIMARY KEY,
    "document_number" TEXT NOT NULL,
    "user_id" UUID REFERENCES "public"."profiles"("id"),
    "sale_type" TEXT NOT NULL CHECK ("sale_type" IN ('SALE', 'GIVEAWAY', 'DISCARD')),
    "notes" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."parts_sale_items" (
    "id" SERIAL PRIMARY KEY,
    "sale_id" INTEGER NOT NULL REFERENCES "public"."parts_sales"("id") ON DELETE CASCADE,
    "part_id" INTEGER NOT NULL REFERENCES "public"."parts"("id"),
    "designation" TEXT,
    "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
    "stock_type" TEXT NOT NULL CHECK ("stock_type" IN ('general', 'contract')),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS "idx_parts_sales_user_id" ON "public"."parts_sales"("user_id");
CREATE INDEX IF NOT EXISTS "idx_parts_sale_items_sale_id" ON "public"."parts_sale_items"("sale_id");
CREATE INDEX IF NOT EXISTS "idx_parts_sale_items_part_id" ON "public"."parts_sale_items"("part_id");

-- Grant permissions
GRANT ALL ON TABLE "public"."parts_sales" TO "anon";
GRANT ALL ON TABLE "public"."parts_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_sales" TO "service_role";

GRANT ALL ON TABLE "public"."parts_sale_items" TO "anon";
GRANT ALL ON TABLE "public"."parts_sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."parts_sale_items" TO "service_role";

GRANT ALL ON SEQUENCE "public"."parts_sales_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parts_sale_items_id_seq" TO "authenticated";
