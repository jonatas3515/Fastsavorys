-- =============================================
-- Migration: AI Config + Media Processing (Phase 2)
-- Adds configurable AI model, temperature, tokens,
-- and media processing toggle to fast_store_config
-- =============================================

DO $$
BEGIN
    -- AI Model (primary text model — used in cascata)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'ai_model_primary'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN ai_model_primary TEXT NOT NULL DEFAULT 'gemini-2.5-flash-lite';
    END IF;

    -- AI Multimodal Model (for audio/image/PDF — must support inline_data)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'ai_model_multimodal'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN ai_model_multimodal TEXT NOT NULL DEFAULT 'gemini-2.5-flash';
    END IF;

    -- AI Temperature (0.0 to 1.0)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'ai_temperature'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN ai_temperature REAL NOT NULL DEFAULT 0.7;
    END IF;

    -- AI Max Output Tokens
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'ai_max_output_tokens'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN ai_max_output_tokens INTEGER NOT NULL DEFAULT 2048;
    END IF;

    -- Media Processing toggle (enables image/PDF/URL processing instead of fallback)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'media_processing_enabled'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN media_processing_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;

END $$;
