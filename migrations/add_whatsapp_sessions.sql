-- ==============================================
-- Tabela de sessões WhatsApp (controle de saudação)
-- Usada pelo handler Gemini para evitar repetir
-- saudação completa dentro de uma janela de 3h.
-- Execute no Supabase SQL Editor.
-- ==============================================

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    manychat_user_id TEXT UNIQUE NOT NULL,
    last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user
    ON whatsapp_sessions(manychat_user_id);

-- RLS (mesma política aberta das outras tabelas do projeto)
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all access to whatsapp_sessions"
    ON whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);
