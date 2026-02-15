-- Fix: Add UNIQUE constraint on store_id for upsert to work
-- Run this in Supabase SQL Editor

-- Add unique constraint on store_id
ALTER TABLE fast_banner_config 
ADD CONSTRAINT fast_banner_config_store_id_key UNIQUE (store_id);
