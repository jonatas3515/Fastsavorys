-- Add approved and archived columns to fast_ratings if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_ratings' AND column_name = 'approved') THEN
        ALTER TABLE fast_ratings ADD COLUMN approved BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_ratings' AND column_name = 'archived') THEN
        ALTER TABLE fast_ratings ADD COLUMN archived BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_ratings' AND column_name = 'admin_reply') THEN
        ALTER TABLE fast_ratings ADD COLUMN admin_reply TEXT;
    END IF;

     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_ratings' AND column_name = 'status') THEN
        ALTER TABLE fast_ratings ADD COLUMN status TEXT DEFAULT 'pending'; -- legacy status support if needed, or migration target
    END IF;
END $$;

-- Update rows that might have status 'published' to approved=true (if migrating from legacy logic)
UPDATE fast_ratings SET approved = TRUE WHERE status = 'published';
UPDATE fast_ratings SET archived = TRUE WHERE status = 'archived';
