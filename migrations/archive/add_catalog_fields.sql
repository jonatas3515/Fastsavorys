-- ============================================
-- SQL MIGRATION: CATALOG FIELDS FOR FAST_PRODUCTS
-- Execute this in Supabase SQL Editor BEFORE using catalog features
-- This script is SAFE to run multiple times (uses IF NOT EXISTS)
-- ============================================

-- Add catalog fields to fast_products table
ALTER TABLE fast_products 
ADD COLUMN IF NOT EXISTS catalog_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS catalog_size_options TEXT,
ADD COLUMN IF NOT EXISTS catalog_vegan BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS catalog_phrase TEXT,
ADD COLUMN IF NOT EXISTS catalog_order INTEGER DEFAULT 0;

-- Create index for catalog ordering (optional, improves performance)
CREATE INDEX IF NOT EXISTS idx_fast_products_catalog_order ON fast_products(catalog_order);

-- Add comment for documentation
COMMENT ON COLUMN fast_products.catalog_enabled IS 'Whether product appears in magazine-style catalog';
COMMENT ON COLUMN fast_products.catalog_size_options IS 'JSON array of size options, e.g. ["Pequeno", "Grande"]';
COMMENT ON COLUMN fast_products.catalog_vegan IS 'Whether product is vegan-friendly';
COMMENT ON COLUMN fast_products.catalog_phrase IS 'Marketing phrase for catalog display';
COMMENT ON COLUMN fast_products.catalog_order IS 'Display order in catalog (lower = first)';

-- ============================================
-- ✅ DONE! 
-- Catalog feature is now ready to use.
-- ============================================
