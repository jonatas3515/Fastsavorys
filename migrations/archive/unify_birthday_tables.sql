-- Migration to unify birthday usage tables
-- Goal: Move data from 'fast_birthday_usage' to 'fast_birthday_discount_usage' and drop 'fast_birthday_usage'

-- 1. Ensure target table exists
CREATE TABLE IF NOT EXISTS public.fast_birthday_discount_usage (
    id SERIAL PRIMARY KEY,
    client_phone TEXT,
    usage_year INTEGER,
    discount_applied DECIMAL(10,2),
    order_id BIGINT,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add missing columns (if table pre-exists from older scripts)
ALTER TABLE public.fast_birthday_discount_usage
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Migrate data only if old table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fast_birthday_usage'
  ) THEN
    INSERT INTO public.fast_birthday_discount_usage (client_phone, usage_year, order_id)
    SELECT phone, year, order_id
    FROM public.fast_birthday_usage
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.fast_birthday_discount_usage target
        WHERE target.client_phone = fast_birthday_usage.phone
          AND target.usage_year = fast_birthday_usage.year
    );
  END IF;
END $$;

-- 4. Drop the old table to prevent confusion
DROP TABLE IF EXISTS public.fast_birthday_usage;

-- 5. Backfill null values to allow stricter constraints
UPDATE public.fast_birthday_discount_usage
SET discount_applied = 0
WHERE discount_applied IS NULL;

UPDATE public.fast_birthday_discount_usage
SET used_at = NOW()
WHERE used_at IS NULL;

-- 6. Enforce constraints to prevent multiple usage per year
DO $$
BEGIN
  -- Set NOT NULL only if there are no nulls left
  IF NOT EXISTS (SELECT 1 FROM public.fast_birthday_discount_usage WHERE client_phone IS NULL) THEN
    EXECUTE 'ALTER TABLE public.fast_birthday_discount_usage ALTER COLUMN client_phone SET NOT NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fast_birthday_discount_usage WHERE usage_year IS NULL) THEN
    EXECUTE 'ALTER TABLE public.fast_birthday_discount_usage ALTER COLUMN usage_year SET NOT NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fast_birthday_discount_usage WHERE discount_applied IS NULL) THEN
    EXECUTE 'ALTER TABLE public.fast_birthday_discount_usage ALTER COLUMN discount_applied SET NOT NULL';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fast_birthday_discount_usage_phone_year
    ON public.fast_birthday_discount_usage (client_phone, usage_year);

-- 7. RLS policies (idempotent)
ALTER TABLE public.fast_birthday_discount_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON public.fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Allow public insert" ON public.fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Allow public update" ON public.fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Allow all access to fast_birthday_discount_usage" ON public.fast_birthday_discount_usage;
DROP POLICY IF EXISTS "fast_birthday_discount_usage_all_access" ON public.fast_birthday_discount_usage;

CREATE POLICY "fast_birthday_discount_usage_all_access" ON public.fast_birthday_discount_usage
    FOR ALL USING (true) WITH CHECK (true);
