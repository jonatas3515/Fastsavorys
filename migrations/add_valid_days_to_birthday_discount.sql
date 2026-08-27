-- ==============================================================================
-- Migration: Adicionar coluna valid_days à tabela fast_birthday_discount
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fast_birthday_discount' AND column_name = 'valid_days'
    ) THEN
        ALTER TABLE fast_birthday_discount ADD COLUMN valid_days INTEGER NOT NULL DEFAULT 6;
    END IF;
END $$;
