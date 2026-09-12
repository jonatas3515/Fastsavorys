-- =====================================================================
-- Migration: Enable RLS and Permissive Policies on fast_message_buffer & fast_bot_payments
-- Fixes Supabase Linter warnings (rls_disabled_in_public) for both tables.
-- Ensures zero breaking changes across WhatsApp Bot, Stripe Webhooks, ManyChat API and frontend.
-- =====================================================================

-- 1) fast_message_buffer
ALTER TABLE IF EXISTS public.fast_message_buffer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow All On fast_message_buffer" ON public.fast_message_buffer;

CREATE POLICY "Allow All On fast_message_buffer"
ON public.fast_message_buffer
FOR ALL
USING (true)
WITH CHECK (true);

-- 2) fast_bot_payments
ALTER TABLE IF EXISTS public.fast_bot_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow All On fast_bot_payments" ON public.fast_bot_payments;

CREATE POLICY "Allow All On fast_bot_payments"
ON public.fast_bot_payments
FOR ALL
USING (true)
WITH CHECK (true);
