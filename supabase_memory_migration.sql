-- ============================================================
-- MIGRAÇÃO: Tabela de Memória do Cliente (fast_client_memory)
-- ============================================================
-- Armazena fatos persistentes sobre cada cliente para personalizar
-- o atendimento da IA (bairro, preferências, produtos frequentes).
-- Execute no painel do Supabase: SQL Editor > New Query > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS fast_client_memory (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    memories JSONB DEFAULT '{}'::jsonb,
    interaction_count INTEGER DEFAULT 0,
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice único por user_id (garante um registro por cliente e permite UPSERT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_memory_user_id
    ON fast_client_memory(user_id);

-- Índice para busca por última interação (útil para relatórios e limpeza)
CREATE INDEX IF NOT EXISTS idx_client_memory_last_interaction
    ON fast_client_memory(last_interaction DESC);

-- Habilita Row Level Security (padrão Supabase)
ALTER TABLE fast_client_memory ENABLE ROW LEVEL SECURITY;

-- Policy: permite acesso total via service_role (usado pelo backend)
CREATE POLICY "service_role_full_access" ON fast_client_memory
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Exemplo de registro de memória:
-- {
--   "bairro": "Centro",
--   "preferencia_entrega": "entrega",
--   "preferencia_pagamento": "pix",
--   "produtos_frequentes": ["100 mini salgados", "2 coxinha", "pepsi"],
--   "ultimo_pedido": "100 mini salgados, 2 coxinha, pepsi"
-- }
