-- ==============================================================================
-- FastSavory's: Adicionar coluna de controle de envio no WhatsApp
-- Usada pelo robô/cron para rotacionar produtos e evitar repetições frequentes.
-- ==============================================================================

-- 1. Adiciona a coluna last_posted_at se ela não existir
ALTER TABLE fast_affiliate_products 
ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Cria índice para busca ultra-rápida do próximo produto da fila
CREATE INDEX IF NOT EXISTS idx_affiliate_last_posted_queue 
ON fast_affiliate_products (is_active, last_posted_at ASC NULLS FIRST, position ASC);

-- 3. Confirmação visual
COMMENT ON COLUMN fast_affiliate_products.last_posted_at IS 'Data/hora do último envio automático para o grupo do WhatsApp';
