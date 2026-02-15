CREATE TABLE IF NOT EXISTS public.fast_birthday_message_log (
  id BIGSERIAL PRIMARY KEY,
  client_phone TEXT NOT NULL,
  message_year INTEGER NOT NULL,
  manychat_id TEXT,
  valid_until DATE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fast_birthday_message_log_phone_year
  ON public.fast_birthday_message_log (client_phone, message_year);

ALTER TABLE public.fast_birthday_message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fast_birthday_message_log_all_access" ON public.fast_birthday_message_log;

CREATE POLICY "fast_birthday_message_log_all_access" ON public.fast_birthday_message_log
  FOR ALL USING (true) WITH CHECK (true);
