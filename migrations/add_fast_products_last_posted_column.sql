-- Migração para fila circular anti-repetição nos produtos próprios da FastSavory's
ALTER TABLE IF EXISTS fast_products 
ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_fast_products_last_posted_queue 
ON fast_products(last_posted_at ASC NULLS FIRST);
