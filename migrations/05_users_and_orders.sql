-- Migration: Users table with roles and Orders status constraint fix
-- Run this in Supabase SQL Editor

-- ========================================
-- FAST_USERS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS fast_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'garcom' CHECK (role IN ('admin', 'gerente', 'garcom', 'caixa')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add role column if table exists but column doesn't
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_users' AND column_name = 'role') THEN
    ALTER TABLE fast_users ADD COLUMN role TEXT NOT NULL DEFAULT 'garcom';
  END IF;
END $$;

-- Add check constraint for role if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fast_users_role_check') THEN
    ALTER TABLE fast_users ADD CONSTRAINT fast_users_role_check CHECK (role IN ('admin', 'gerente', 'garcom', 'caixa'));
  END IF;
END $$;

-- RLS Policy for users
ALTER TABLE fast_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon users" ON fast_users;
CREATE POLICY "Allow all for anon users" ON fast_users FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- FIX FAST_ORDERS STATUS CONSTRAINT
-- ========================================
-- First, drop the existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fast_orders_status_check') THEN
    ALTER TABLE fast_orders DROP CONSTRAINT fast_orders_status_check;
  END IF;
END $$;

-- Add updated constraint with all possible status values
ALTER TABLE fast_orders ADD CONSTRAINT fast_orders_status_check 
  CHECK (status IN ('pending', 'preparing', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'));

-- Update any orders with null/empty status to 'pending'
UPDATE fast_orders SET status = 'pending' WHERE status IS NULL OR status = '';

-- ========================================
-- FAST_STORE_CONFIG TABLE (ensure all columns exist)
-- ========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'prep_time_min') THEN
    ALTER TABLE fast_store_config ADD COLUMN prep_time_min INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'prep_time_max') THEN
    ALTER TABLE fast_store_config ADD COLUMN prep_time_max INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'delivery_time_min') THEN
    ALTER TABLE fast_store_config ADD COLUMN delivery_time_min INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'delivery_time_max') THEN
    ALTER TABLE fast_store_config ADD COLUMN delivery_time_max INTEGER DEFAULT 0;
  END IF;
END $$;
