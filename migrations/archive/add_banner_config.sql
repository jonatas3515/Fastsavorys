-- Migration: Create fast_banner_config table for ad banner management
-- Run this in Supabase SQL Editor

-- Create the banner config table
CREATE TABLE IF NOT EXISTS fast_banner_config (
  id SERIAL PRIMARY KEY,
  store_id INTEGER DEFAULT 1,
  image_url TEXT,
  link_url TEXT,
  alt_text TEXT DEFAULT 'Anuncie aqui',
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row for store 1 (no image = fallback)
INSERT INTO fast_banner_config (store_id, image_url, link_url, alt_text, enabled)
VALUES (1, NULL, NULL, 'Anuncie aqui', true)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE fast_banner_config ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read (public banner display)
CREATE POLICY "Public can read banner config" ON fast_banner_config
  FOR SELECT USING (true);

-- Policy: Service role can update (admin panel)
CREATE POLICY "Service role can manage banner" ON fast_banner_config
  FOR ALL USING (true) WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE fast_banner_config IS 'Configuration for ad banner displayed on public store. enabled=false hides all banners.';
