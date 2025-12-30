-- Migration: Fix RLS policies for fast_ratings to allow UPDATE operations
-- Run this in Supabase SQL Editor
-- This fixes the issue where publish/archive/reply actions fail silently

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anon read own ratings" ON fast_ratings;

-- Create new policy that allows anon users to UPDATE ratings
-- This is needed because the admin panel uses the anon key
CREATE POLICY "Anon full access ratings"
ON fast_ratings FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'fast_ratings';

-- Test query
SELECT 'RLS policies updated for fast_ratings' as status;
