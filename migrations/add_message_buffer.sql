-- =============================================
-- Migration: Message Buffer for WhatsApp Bot
-- Phase 1: Text message queue/buffer per user
-- =============================================

-- 1) Buffer table: stores pending messages per conversation/user
CREATE TABLE IF NOT EXISTS fast_message_buffer (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,                          -- manychat_user_id
    user_name TEXT,                                  -- client name (for logging)
    message TEXT NOT NULL,                           -- raw message text
    message_type TEXT NOT NULL DEFAULT 'text',       -- 'text' only in phase 1
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    batch_id TEXT,                                   -- set when claimed for processing
    processed_at TIMESTAMPTZ                         -- set when processed
);

-- Index for fast lookup of pending messages per user
CREATE INDEX IF NOT EXISTS idx_msg_buffer_user_pending
    ON fast_message_buffer (user_id, created_at)
    WHERE processed_at IS NULL;

-- Index for cleanup of old processed messages
CREATE INDEX IF NOT EXISTS idx_msg_buffer_processed
    ON fast_message_buffer (processed_at)
    WHERE processed_at IS NOT NULL;

-- 2) Add config columns to fast_store_config (feature flag + delay)
DO $$
BEGIN
    -- Feature flag: enables/disables the message buffer (default OFF = safe)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'message_buffer_enabled'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN message_buffer_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    -- Configurable delay in seconds (default 5s)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fast_store_config' AND column_name = 'message_buffer_delay_seconds'
    ) THEN
        ALTER TABLE fast_store_config ADD COLUMN message_buffer_delay_seconds INTEGER NOT NULL DEFAULT 5;
    END IF;
END $$;

-- 3) Optional: auto-cleanup function to purge processed messages older than 24h
-- Run manually or via pg_cron if available
-- DELETE FROM fast_message_buffer WHERE processed_at IS NOT NULL AND processed_at < NOW() - INTERVAL '24 hours';
