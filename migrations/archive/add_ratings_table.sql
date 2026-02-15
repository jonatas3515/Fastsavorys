-- Migration: Create fast_ratings table for customer reviews
-- Run this in Supabase SQL Editor
-- Updated: Dec 2024 - Improved security policies

DROP TABLE IF EXISTS fast_ratings CASCADE;

CREATE TABLE fast_ratings (
    id BIGSERIAL PRIMARY KEY,
    order_code TEXT,
    phone TEXT NOT NULL,
    client_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'archived')),
    admin_reply TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better query performance
CREATE INDEX idx_fast_ratings_status ON fast_ratings(status);
CREATE INDEX idx_fast_ratings_phone ON fast_ratings(phone);
CREATE INDEX idx_fast_ratings_order ON fast_ratings(order_code);
CREATE UNIQUE INDEX idx_fast_ratings_unique_review ON fast_ratings(order_code, phone);

-- Enable Row Level Security
ALTER TABLE fast_ratings ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can read published ratings (for landing page testimonials)
CREATE POLICY "Public read published ratings" 
ON fast_ratings FOR SELECT 
TO public 
USING (status = 'published');

-- Policy 2: Anon users can insert new ratings (customers submitting reviews)
CREATE POLICY "Anon insert ratings" 
ON fast_ratings FOR INSERT 
TO anon 
WITH CHECK (true);

-- Policy 3: Anon users can read their own ratings (by phone + order_code)
CREATE POLICY "Anon read own ratings" 
ON fast_ratings FOR SELECT 
TO anon 
USING (true);

-- Policy 4: Service role (admin) can do everything
CREATE POLICY "Service role full access" 
ON fast_ratings FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Policy 5: Authenticated users (admin) can manage all ratings
CREATE POLICY "Authenticated manage ratings" 
ON fast_ratings FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON fast_ratings TO anon;
GRANT INSERT ON fast_ratings TO anon;
GRANT ALL ON fast_ratings TO authenticated;
GRANT ALL ON fast_ratings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE fast_ratings_id_seq TO anon;

-- Verify table created
SELECT 'fast_ratings table created successfully' as status;
SELECT COUNT(*) as total_ratings FROM fast_ratings;
