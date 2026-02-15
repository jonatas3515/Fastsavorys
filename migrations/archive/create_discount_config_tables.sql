-- ==============================================================================
-- MIGRATION: CONFIGURAÇÃO DE DESCONTOS (IDEMPOTENTE)
-- Este script verifica se as tabelas existem. 
-- Se NÃO existirem, cria. 
-- Se JÁ existirem, mantém os dados (não sobrescreve).
-- Pode ser executado múltiplas vezes com segurança.
-- ==============================================================================

BEGIN;

-- 1. Tabela de Configuração de Desconto Especial (Fidelidade)
-- Verifica se a tabela existe; se não, cria.
CREATE TABLE IF NOT EXISTS fast_special_discounts (
    id SERIAL PRIMARY KEY,
    store_id INTEGER UNIQUE DEFAULT 1,
    min_orders INTEGER DEFAULT 10,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
    discount_value DECIMAL(10,2) DEFAULT 10.00,
    min_order_value DECIMAL(10,2) DEFAULT 0,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garante que RLS está habilitado (seguro de rodar múltiplas vezes)
ALTER TABLE fast_special_discounts ENABLE ROW LEVEL SECURITY;

-- Recria políticas de segurança para garantir que estão atualizadas
-- DROP primeiro evita erro de "policy already exists"
DROP POLICY IF EXISTS "Public Read Special Discounts" ON fast_special_discounts;
CREATE POLICY "Public Read Special Discounts" ON fast_special_discounts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Special Discounts" ON fast_special_discounts;
CREATE POLICY "Admin Manage Special Discounts" ON fast_special_discounts FOR ALL USING (
    auth.role() = 'authenticated'
) WITH CHECK (
    auth.role() = 'authenticated'
);

-- Insere configuração padrão APENAS se não existir nenhuma configuração para a loja 1
INSERT INTO fast_special_discounts (store_id, min_orders, discount_type, discount_value, active)
VALUES (1, 10, 'percentage', 10.00, true)
ON CONFLICT (store_id) DO NOTHING;


-- 2. Tabela de Configuração de Aniversário
CREATE TABLE IF NOT EXISTS fast_birthday_discount (
    id SERIAL PRIMARY KEY,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
    discount_value DECIMAL(10,2) DEFAULT 10.00,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE fast_birthday_discount ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
DROP POLICY IF EXISTS "Public Read Birthday Discount" ON fast_birthday_discount;
CREATE POLICY "Public Read Birthday Discount" ON fast_birthday_discount FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Birthday Discount" ON fast_birthday_discount;
CREATE POLICY "Admin Manage Birthday Discount" ON fast_birthday_discount FOR ALL USING (
    auth.role() = 'authenticated'
) WITH CHECK (
    auth.role() = 'authenticated'
);

-- Insere configuração padrão APENAS se não existir (conflito no ID)
INSERT INTO fast_birthday_discount (id, discount_type, discount_value, active)
VALUES (1, 'percentage', 10.00, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Trigger para atualização automática da data (updated_at)
-- Função update_updated_at_column deve existir (padrão em Supabase), mas recriando referência safe

-- Trigger Special Discounts
DROP TRIGGER IF EXISTS update_fast_special_discounts_updated_at ON fast_special_discounts;
CREATE TRIGGER update_fast_special_discounts_updated_at 
    BEFORE UPDATE ON fast_special_discounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger Birthday Discount
DROP TRIGGER IF EXISTS update_fast_birthday_discount_updated_at ON fast_birthday_discount;
CREATE TRIGGER update_fast_birthday_discount_updated_at 
    BEFORE UPDATE ON fast_birthday_discount 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- FIM DA MIGRAÇÃO
