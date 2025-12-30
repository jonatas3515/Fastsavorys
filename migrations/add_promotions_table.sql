-- Migration: Add fast_promotions table for syncing product promotions
-- This table stores product-specific promotions that should sync across all devices

-- Create the promotions table
CREATE TABLE IF NOT EXISTS fast_promotions (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fast_promotions_product_id ON fast_promotions(product_id);
CREATE INDEX IF NOT EXISTS idx_fast_promotions_active ON fast_promotions(active);

-- Enable Row Level Security
ALTER TABLE fast_promotions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (anyone can see promotions)
CREATE POLICY "Allow public read access to promotions"
ON fast_promotions FOR SELECT
TO public
USING (true);

-- Policy: Allow authenticated users to manage promotions
CREATE POLICY "Allow authenticated users to manage promotions"
ON fast_promotions FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow anon users to insert/update (for admin panel without auth)
CREATE POLICY "Allow anon users to manage promotions"
ON fast_promotions FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE fast_promotions IS 'Stores product promotions for the FastSavorys delivery app';
