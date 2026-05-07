-- Adiciona colunas para histórico de conversa e contagem de mensagens sem intenção clara
-- Necessário para: multi-turn conversation, continuação de pedido e handover para atendente humano
-- Rodar no Supabase SQL Editor após o deploy

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS conversation_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unclear_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_approval_notice_count INTEGER DEFAULT 0;

-- conversation_history: array de {role: "user"|"assistant", text: "..."} com últimas 30 mensagens
-- unclear_count: quantas mensagens consecutivas sem intenção clara (>=3 aciona handover humano)
-- owner_approval_notice_count: quantas vezes o aviso de aprovação da dona foi enviado nesta sessão
