-- Migration: Fix product_id type in fast_promotions table
-- Run this in Supabase SQL Editor to fix the integer overflow error

-- First, backup existing data (optional but recommended)
-- Drop existing backup if it exists to avoid conflicts
DROP TABLE IF EXISTS fast_promotions_backup;

CREATE TABLE fast_promotions_backup AS SELECT * FROM fast_promotions;

-- Enable RLS on backup table to avoid security warnings
ALTER TABLE fast_promotions_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Disable access to backup table" ON fast_promotions_backup
    FOR ALL USING (false) WITH CHECK (false);

-- Drop the existing table
DROP TABLE IF EXISTS fast_promotions;

-- Recreate with correct BIGINT type for product_id
CREATE TABLE fast_promotions (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT UNIQUE REFERENCES fast_products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Restore data from backup if it existed
INSERT INTO fast_promotions SELECT * FROM fast_promotions_backup;

-- Drop backup table (comment this line if you want to keep the backup)
-- DROP TABLE fast_promotions_backup;

-- Add RLS policies (if needed)
ALTER TABLE fast_promotions ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust according to your security needs)
CREATE POLICY "Enable all operations for fast_promotions" ON fast_promotions
    FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_fast_promotions_product_id ON fast_promotions(product_id);
CREATE INDEX idx_fast_promotions_active ON fast_promotions(active);
