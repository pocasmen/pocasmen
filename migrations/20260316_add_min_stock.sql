-- Migration: Add min_stock and min_stock_foss to parts table
-- Created at: 2026-03-16

ALTER TABLE parts ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS min_stock_foss INTEGER DEFAULT 0;
