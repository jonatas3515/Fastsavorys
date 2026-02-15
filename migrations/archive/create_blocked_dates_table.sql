-- Create fast_blocked_dates table (Safe to run: Creates only if not exists)
CREATE TABLE IF NOT EXISTS fast_blocked_dates (
  id SERIAL PRIMARY KEY,
  blocked_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- Enable RLS
ALTER TABLE fast_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Create policies (safe to run multiple times due to DROP IF EXISTS)
DROP POLICY IF EXISTS "Allow public read blocked dates" ON fast_blocked_dates;
CREATE POLICY "Allow public read blocked dates" ON fast_blocked_dates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated write blocked dates" ON fast_blocked_dates;
CREATE POLICY "Allow authenticated write blocked dates" ON fast_blocked_dates
  FOR ALL USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_blocked_dates ON fast_blocked_dates(blocked_date);
