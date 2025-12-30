-- Migration: Add missing columns to fast_products table
-- Run this in your Supabase SQL Editor

-- Add the missing columns to fast_products
ALTER TABLE IF EXISTS fast_products
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS unavailable_today BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS promo JSONB,
ADD COLUMN IF NOT EXISTS is_encomenda BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flavor_selection JSONB;

-- Add comments for documentation
COMMENT ON COLUMN fast_products.start_date IS 'Start date for seasonal products';
COMMENT ON COLUMN fast_products.end_date IS 'End date for seasonal products';
COMMENT ON COLUMN fast_products.unavailable_today IS 'If true, product is unavailable today';
COMMENT ON COLUMN fast_products.promo IS 'Promotion config: {active, type, value}';
COMMENT ON COLUMN fast_products.is_encomenda IS 'If true, product requires scheduling';
COMMENT ON COLUMN fast_products.flavor_selection IS 'Mini-salgados flavor config: {enabled, maxFlavors, availableFlavors}';
