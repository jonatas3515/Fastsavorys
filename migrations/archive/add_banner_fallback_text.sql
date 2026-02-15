-- MIGRATION: Add fallback_text to banner and sync birthday data
-- Execute this in Supabase SQL Editor

-- 1. Add fallback_text column to fast_banner_config table
ALTER TABLE public.fast_banner_config 
ADD COLUMN IF NOT EXISTS fallback_text TEXT DEFAULT '';

-- 2. Ensure birth_date column exists in fast_clients
ALTER TABLE public.fast_clients
ADD COLUMN IF NOT EXISTS birth_date TEXT;

-- 3. Check structure of fast_clients
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fast_clients' 
AND table_schema = 'public';

-- 4. Show all clients with their birthdates (to verify data)
SELECT phone, name, birth_date 
FROM public.fast_clients 
WHERE birth_date IS NOT NULL AND birth_date != ''
LIMIT 20;

-- 5. Check fast_ratings table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fast_ratings' 
AND table_schema = 'public';

-- 6. Show all ratings
SELECT * FROM public.fast_ratings ORDER BY created_at DESC;

-- Success message
SELECT 'Migration complete!' as status;
