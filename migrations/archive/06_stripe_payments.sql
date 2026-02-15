-- Migration: Stripe Payment Integration
-- Run this in Supabase SQL Editor

-- ========================================
-- ADD PAYMENT COLUMNS TO FAST_ORDERS
-- ========================================

-- Add payment_method column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'payment_method') THEN
    ALTER TABLE fast_orders ADD COLUMN payment_method TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Add payment_status column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'payment_status') THEN
    ALTER TABLE fast_orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- Add payment_link column if not exists (Stripe Payment Link URL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'payment_link') THEN
    ALTER TABLE fast_orders ADD COLUMN payment_link TEXT;
  END IF;
END $$;

-- Add stripe_payment_id column if not exists (for tracking)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'stripe_payment_id') THEN
    ALTER TABLE fast_orders ADD COLUMN stripe_payment_id TEXT;
  END IF;
END $$;

-- Add amount_paid column if not exists (to track partial payments)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'amount_paid') THEN
    ALTER TABLE fast_orders ADD COLUMN amount_paid DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add accepted_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'accepted_at') THEN
    ALTER TABLE fast_orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- ========================================
-- STRIPE CONFIG TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS fast_stripe_config (
  id SERIAL PRIMARY KEY,
  store_id INTEGER DEFAULT 1,
  stripe_public_key TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  min_payment_percent INTEGER DEFAULT 50,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'fast_stripe_config'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'fast_stripe_config_store_id_unique'
  ) THEN
    ALTER TABLE fast_stripe_config ADD CONSTRAINT fast_stripe_config_store_id_unique UNIQUE (store_id);
  END IF;
END $$;

-- RLS Policy for stripe config
ALTER TABLE fast_stripe_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon stripe_config" ON fast_stripe_config;
CREATE POLICY "Allow all for anon stripe_config" ON fast_stripe_config FOR ALL USING (true) WITH CHECK (true);

-- Insert default config if not exists
INSERT INTO fast_stripe_config (store_id, min_payment_percent, enabled)
SELECT 1, 50, false
WHERE NOT EXISTS (SELECT 1 FROM fast_stripe_config WHERE store_id = 1);

-- ========================================
-- UPDATE STATUS CONSTRAINT
-- ========================================
-- Drop and recreate the status check constraint to include 'accepted'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fast_orders_status_check') THEN
    ALTER TABLE fast_orders DROP CONSTRAINT fast_orders_status_check;
  END IF;
END $$;

ALTER TABLE fast_orders ADD CONSTRAINT fast_orders_status_check 
  CHECK (status IN ('pending', 'accepted', 'preparing', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'));

-- Add payment_status check constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fast_orders_payment_status_check') THEN
    ALTER TABLE fast_orders ADD CONSTRAINT fast_orders_payment_status_check 
      CHECK (payment_status IN ('pending', 'awaiting_payment', 'paid_partial', 'paid_full', 'refunded', 'cash', 'pix'));
  END IF;
END $$;
