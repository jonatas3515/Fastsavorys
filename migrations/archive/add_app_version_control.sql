-- ==============================================================================
-- MIGRATION: ADICIONAR CONTROLE DE VERSÃO DO APP
-- Adiciona coluna 'app_version' na tabela de configuração para forçar atualização
-- dos clientes quando houver deploy novo.
-- ==============================================================================

BEGIN;

-- 1. Adicionar coluna app_version se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'app_version') THEN
        ALTER TABLE fast_store_config ADD COLUMN app_version TEXT DEFAULT '1.0.0';
    END IF;
END $$;

-- 2. Atualizar valor inicial para garantir sincronia
UPDATE fast_store_config 
SET app_version = '1.0.0', 
    updated_at = NOW() 
WHERE id = 1;

-- 3. Garantir que a configuração existe (caso a tabela esteja vazia)
INSERT INTO fast_store_config (id, app_version)
VALUES (1, '1.0.0')
ON CONFLICT (id) DO UPDATE 
SET app_version = EXCLUDED.app_version;

COMMIT;
