-- =====================================================
-- FIX URGENTE: Sequência de Pedidos e RLS
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- 1. Garantir que RLS permite INSERT público
ALTER TABLE fast_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow anon insert" ON fast_orders;
DROP POLICY IF EXISTS "Allow anon select own" ON fast_orders;

-- Política para INSERT (qualquer um pode criar pedido)
CREATE POLICY "Allow public insert on fast_orders" 
ON fast_orders 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Política para SELECT (qualquer um pode ver pedidos - necessário para admin)
CREATE POLICY "Allow public select on fast_orders" 
ON fast_orders 
FOR SELECT 
TO anon, authenticated
USING (true);

-- Política para UPDATE (qualquer um pode atualizar - necessário para admin)
CREATE POLICY "Allow public update on fast_orders" 
ON fast_orders 
FOR UPDATE 
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 2. Recriar a função RPC para sequência
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
    -- Get the maximum order_sequence from fast_orders
    SELECT COALESCE(MAX(order_sequence), 0) INTO max_seq
    FROM fast_orders;
    
    -- Also check order_code for any higher numbers (fallback)
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN order_code ~ '^FAST-0*(\d+)$' THEN 
                    CAST(REGEXP_REPLACE(order_code, '^FAST-0*', '') AS INTEGER)
                ELSE 0
            END
        ),
        0
    ) INTO max_code_num
    FROM fast_orders
    WHERE order_code IS NOT NULL;
    
    -- Use the greater of the two + 1
    next_seq := GREATEST(max_seq, max_code_num) + 1;
    
    -- Ensure minimum of 1
    IF next_seq < 1 THEN
        next_seq := 1;
    END IF;
    
    RAISE NOTICE 'get_next_order_sequence: max_seq=%, max_code_num=%, next_seq=%', max_seq, max_code_num, next_seq;
    
    RETURN next_seq;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO anon;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO service_role;

-- 3. Criar trigger para garantir sequência correta no INSERT
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
    -- Se order_sequence não foi fornecido ou é 0, calcular
    IF NEW.order_sequence IS NULL OR NEW.order_sequence = 0 THEN
        SELECT get_next_order_sequence() INTO next_seq;
        NEW.order_sequence := next_seq;
        NEW.order_code := 'FAST-' || LPAD(next_seq::TEXT, 4, '0');
    -- Se order_sequence foi fornecido mas order_code não, gerar
    ELSIF NEW.order_code IS NULL OR NEW.order_code = '' THEN
        NEW.order_code := 'FAST-' || LPAD(NEW.order_sequence::TEXT, 4, '0');
    END IF;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_set_order_sequence
BEFORE INSERT ON fast_orders
FOR EACH ROW
EXECUTE FUNCTION fn_set_order_sequence();

-- 4. Verificar a próxima sequência
SELECT get_next_order_sequence() AS proxima_sequencia;

-- 5. Listar últimos pedidos para conferência
SELECT id, order_code, order_sequence, client_name, created_at 
FROM fast_orders 
ORDER BY created_at DESC 
LIMIT 10;
