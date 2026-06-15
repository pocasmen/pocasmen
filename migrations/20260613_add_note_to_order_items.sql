-- Migration: Add note column to parts_order_items
-- Date: 2026-06-13

ALTER TABLE "public"."parts_order_items" ADD COLUMN "note" TEXT;
