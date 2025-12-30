-- Migration: Create fast_couriers table for delivery personnel
-- Run this in Supabase SQL Editor

DROP TABLE IF EXISTS fast_couriers CASCADE;

CREATE TABLE fast_couriers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fast_couriers_active ON fast_couriers(active);

ALTER TABLE fast_couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read couriers" ON fast_couriers FOR SELECT TO public USING (true);
CREATE POLICY "Anon manage couriers" ON fast_couriers FOR ALL TO anon USING (true) WITH CHECK (true);

-- Verify table created
SELECT * FROM fast_couriers LIMIT 1;
