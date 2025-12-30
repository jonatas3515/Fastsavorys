-- Add columns for terms acceptance tracking to fast_clients table
-- Run this in Supabase SQL Editor

-- Add terms_accepted columns to fast_clients
ALTER TABLE fast_clients 
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fast_clients_terms_accepted ON fast_clients(terms_accepted);

-- Verify columns added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fast_clients' 
AND column_name LIKE 'terms%';
