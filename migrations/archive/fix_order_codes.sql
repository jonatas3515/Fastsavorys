-- =============================================
-- FIX ORDER CODES: Corrigir pedidos com FAST-0001 duplicado
-- Executar este script no SQL Editor do Supabase
-- =============================================

-- 1. Primeiro, verificar pedidos existentes
-- SELECT id, order_code, order_sequence, created_at FROM fast_orders ORDER BY created_at ASC;

-- 2. Atualizar order_sequence e order_code sequencialmente baseado em created_at
WITH numbered_orders AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY created_at ASC) AS new_sequence
    FROM fast_orders
)
UPDATE fast_orders
SET 
    order_sequence = numbered_orders.new_sequence,
    order_code = 'FAST-' || LPAD(numbered_orders.new_sequence::text, 4, '0')
FROM numbered_orders
WHERE fast_orders.id = numbered_orders.id;

-- 3. Criar/atualizar a RPC function para gerar sequências atômicas
CREATE OR REPLACE FUNCTION get_next_order_sequence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    -- Get the maximum order_sequence from fast_orders
    SELECT COALESCE(MAX(order_sequence), 0) + 1 INTO next_seq
    FROM fast_orders;
    
    -- Also check order_code for any higher numbers (fallback)
    SELECT GREATEST(
        next_seq,
        COALESCE(
            (SELECT MAX(CAST(SUBSTRING(order_code FROM 'FAST-(\d+)') AS INTEGER)) + 1
             FROM fast_orders
             WHERE order_code ~ '^FAST-\d+$'),
            next_seq
        )
    ) INTO next_seq;
    
    RETURN next_seq;
END;
$$;

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO anon;

-- 5. Verificar resultado
-- SELECT id, order_code, order_sequence, created_at FROM fast_orders ORDER BY order_sequence ASC;

-- =============================================
-- FIX SALGADOS: Corrigir tipo 'salgados' para ter apenas salgados grandes
-- =============================================

-- 1. Remover os salgados antigos (que são mini salgados)
DELETE FROM fast_product_options WHERE type = 'salgados';

-- 2. Inserir os 4 salgados grandes corretos
INSERT INTO fast_product_options (type, name, visible, sort_order) VALUES
    ('salgados', 'Coxinha', true, 1),
    ('salgados', 'Enroladinho', true, 2),
    ('salgados', 'Rissole de Carne', true, 3),
    ('salgados', 'Rissole de Queijo e Presunto', true, 4);

-- 3. Verificar resultado
-- SELECT * FROM fast_product_options WHERE type = 'salgados' ORDER BY sort_order;
