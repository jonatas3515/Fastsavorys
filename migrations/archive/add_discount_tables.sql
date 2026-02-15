-- Migration: Add tables for birthday discount, client discounts, and coupon usage tracking
-- Run this in Supabase SQL Editor
-- This script drops and recreates tables to ensure correct structure

-- ========================================
-- 1. BIRTHDAY DISCOUNT CONFIGURATION
-- ========================================
DROP TABLE IF EXISTS fast_birthday_discount CASCADE;

CREATE TABLE fast_birthday_discount (
    id BIGSERIAL PRIMARY KEY,
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL DEFAULT 10,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default config
INSERT INTO fast_birthday_discount (discount_type, discount_value, active) VALUES ('percentage', 10, true);

ALTER TABLE fast_birthday_discount ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read birthday discount" ON fast_birthday_discount FOR SELECT TO public USING (true);
CREATE POLICY "Anon manage birthday discount" ON fast_birthday_discount FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========================================
-- 2. CLIENT DISCOUNTS (sync across devices)
-- ========================================
DROP TABLE IF EXISTS fast_client_discounts CASCADE;

CREATE TABLE fast_client_discounts (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fast_client_discounts_phone ON fast_client_discounts(phone);

ALTER TABLE fast_client_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read client discounts" ON fast_client_discounts FOR SELECT TO public USING (true);
CREATE POLICY "Anon manage client discounts" ON fast_client_discounts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========================================
-- 3. COUPON USAGE TRACKING (single use per phone)
-- ========================================
DROP TABLE IF EXISTS fast_coupon_usage CASCADE;

CREATE TABLE fast_coupon_usage (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    coupon_code TEXT NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    order_id BIGINT,
    UNIQUE(phone, coupon_code)
);

CREATE INDEX idx_fast_coupon_usage_phone ON fast_coupon_usage(phone);
CREATE INDEX idx_fast_coupon_usage_code ON fast_coupon_usage(coupon_code);

ALTER TABLE fast_coupon_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read coupon usage" ON fast_coupon_usage FOR SELECT TO public USING (true);
CREATE POLICY "Anon manage coupon usage" ON fast_coupon_usage FOR ALL TO anon USING (true) WITH CHECK (true);

-- ========================================
-- 4. BIRTHDAY DISCOUNT USAGE TRACKING (once per year)
-- ========================================
DROP TABLE IF EXISTS fast_birthday_usage CASCADE;

CREATE TABLE fast_birthday_usage (
    id BIGSERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    year INTEGER NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    order_id BIGINT,
    UNIQUE(phone, year)
);

CREATE INDEX idx_fast_birthday_usage_phone ON fast_birthday_usage(phone);

ALTER TABLE fast_birthday_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read birthday usage" ON fast_birthday_usage FOR SELECT TO public USING (true);
CREATE POLICY "Anon manage birthday usage" ON fast_birthday_usage FOR ALL TO anon USING (true) WITH CHECK (true);

-- Verify tables created
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'fast_%' ORDER BY table_name;
