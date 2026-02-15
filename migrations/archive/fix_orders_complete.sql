-- =====================================================
-- FIX COMPLETO: Pedidos não estão sendo salvos
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- 1. Remover todas as constraints problemáticas
ALTER TABLE fast_orders DROP CONSTRAINT IF EXISTS fast_orders_status_check;
ALTER TABLE fast_orders DROP CONSTRAINT IF EXISTS fast_orders_payment_status_check;

-- 2. Adicionar colunas que podem estar faltando
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS order_code TEXT;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS order_sequence INTEGER;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS birthday_discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS scheduled_time TEXT;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS card_fee DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS payment_link TEXT;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS address JSONB;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2b. Corrigir tipo da coluna scheduled_date se for DATE (precisa ser TEXT para aceitar formato flexível)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fast_orders' AND column_name = 'scheduled_date' AND data_type = 'date'
  ) THEN
    ALTER TABLE fast_orders ALTER COLUMN scheduled_date TYPE TEXT USING scheduled_date::TEXT;
    RAISE NOTICE 'scheduled_date convertida de DATE para TEXT';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fast_orders' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE fast_orders ADD COLUMN scheduled_date TEXT;
  END IF;
END $$;

-- 3. Garantir que RLS permite operações
ALTER TABLE fast_orders ENABLE ROW LEVEL SECURITY;

-- Remover TODAS as políticas existentes
DROP POLICY IF EXISTS "Allow public insert on fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow public select on fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow public update on fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow anon insert" ON fast_orders;
DROP POLICY IF EXISTS "Allow anon select own" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_anon_insert" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_anon_select" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_insert" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_select" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_update" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_delete" ON fast_orders;

-- Criar políticas permissivas
CREATE POLICY "fast_orders_insert" ON fast_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "fast_orders_select" ON fast_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fast_orders_update" ON fast_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fast_orders_delete" ON fast_orders FOR DELETE TO anon, authenticated USING (true);

-- 4. Recriar função RPC para sequência
DROP FUNCTION IF EXISTS get_next_order_sequence();

CREATE OR REPLACE FUNCTION get_next_order_sequence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    max_seq INTEGER := 0;
    max_code_num INTEGER := 0;
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(order_sequence), 0) INTO max_seq FROM fast_orders;
    
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN order_code ~ '^FAST-0*(\d+)$' THEN 
                    CAST(REGEXP_REPLACE(order_code, '^FAST-0*', '') AS INTEGER)
                ELSE 0
            END
        ), 0
    ) INTO max_code_num
    FROM fast_orders WHERE order_code IS NOT NULL;
    
    next_seq := GREATEST(max_seq, max_code_num) + 1;
    IF next_seq < 1 THEN next_seq := 1; END IF;
    
    RETURN next_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO anon;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO service_role;

-- 5. Recriar trigger para sequência automática
DROP TRIGGER IF EXISTS tr_set_order_sequence ON fast_orders;
DROP FUNCTION IF EXISTS fn_set_order_sequence();

CREATE OR REPLACE FUNCTION fn_set_order_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    IF NEW.order_sequence IS NULL OR NEW.order_sequence = 0 THEN
        SELECT get_next_order_sequence() INTO next_seq;
        NEW.order_sequence := next_seq;
        NEW.order_code := 'FAST-' || LPAD(next_seq::TEXT, 4, '0');
    ELSIF NEW.order_code IS NULL OR NEW.order_code = '' THEN
        NEW.order_code := 'FAST-' || LPAD(NEW.order_sequence::TEXT, 4, '0');
    END IF;
    
    -- Garantir created_at
    IF NEW.created_at IS NULL THEN
        NEW.created_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_set_order_sequence
BEFORE INSERT ON fast_orders
FOR EACH ROW
EXECUTE FUNCTION fn_set_order_sequence();

-- 6. Verificar configuração
SELECT 'Políticas RLS:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'fast_orders';

SELECT 'Próxima sequência:' as info;
SELECT get_next_order_sequence() AS proxima_sequencia;

SELECT 'Últimos pedidos:' as info;
SELECT id, order_code, order_sequence, client_name, status, created_at 
FROM fast_orders 
ORDER BY created_at DESC 
LIMIT 5;
