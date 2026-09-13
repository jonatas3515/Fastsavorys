-- Migration: Create fast_affiliate_products table for Mercado Livre Affiliate Showcase
CREATE TABLE IF NOT EXISTS fast_affiliate_products (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'cozinha',
    price_display VARCHAR(50),
    original_price VARCHAR(50),
    discount_tag VARCHAR(50),
    image_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    badge_color VARCHAR(50) DEFAULT 'amber',
    is_fast_pick BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    position INT DEFAULT 0,
    clicks_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure column exists if table was already created
ALTER TABLE fast_affiliate_products ADD COLUMN IF NOT EXISTS is_fast_pick BOOLEAN DEFAULT FALSE;

-- Enable Row Level Security
ALTER TABLE fast_affiliate_products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public Read Affiliate Products" ON fast_affiliate_products;
DROP POLICY IF EXISTS "Public All Affiliate Products" ON fast_affiliate_products;

-- Allow read access for everyone
CREATE POLICY "Public Read Affiliate Products" 
ON fast_affiliate_products FOR SELECT 
USING (true);

-- Allow full access for admin and client operations
CREATE POLICY "Public All Affiliate Products" 
ON fast_affiliate_products FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_affiliate_products_active_pos ON fast_affiliate_products(is_active, position);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_category ON fast_affiliate_products(category);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_fast_pick ON fast_affiliate_products(is_fast_pick);
