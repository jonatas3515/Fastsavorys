-- ==============================================
-- CORREÇÃO URGENTE: RESTAURAR ACESSO AOS PRODUTOS
-- Execute IMEDIATAMENTE no SQL Editor do Supabase
-- ==============================================

-- 1. VERIFICAR SE AS TABELAS TÊM RLS ATIVO (pode bloquear leitura)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'fast_%';

-- 2. GARANTIR QUE A POLÍTICA DE PRODUTOS EXISTE E PERMITE LEITURA
DROP POLICY IF EXISTS "Allow full access to fast_products" ON fast_products;
CREATE POLICY "Allow full access to fast_products" ON fast_products 
  FOR ALL USING (true) WITH CHECK (true);

-- 3. TAMBÉM PARA SELECT (leitura) ESPECIFICAMENTE
DROP POLICY IF EXISTS "Allow read access to fast_products" ON fast_products;
CREATE POLICY "Allow read access to fast_products" ON fast_products 
  FOR SELECT USING (true);

-- 4. VERIFICAR SE HÁ PRODUTOS NA TABELA
SELECT COUNT(*) as total_produtos FROM fast_products;

-- 5. LISTAR PRIMEIROS 5 PRODUTOS PARA CONFIRMAR
SELECT id, name, price, category, visible FROM fast_products LIMIT 5;

-- 6. SE NÃO HOUVER PRODUTOS, RECRIAR PRODUTOS PADRÃO
-- (descomente a seção abaixo se necessário)
/*
INSERT INTO fast_products (id, name, description, price, category, emoji, visible) VALUES
(1, 'Coxinha de frango', 'Tradicional', 4.00, 'salgados', '🥟', true),
(2, 'Enroladinho', 'Presunto e queijo', 4.00, 'salgados', '🌭', true),
(3, 'Risole de carne', 'Recheado de carne', 4.50, 'salgados', '🥟', true),
(4, 'Risole de queijo e presunto', 'Cremoso', 4.50, 'salgados', '🥟', true),
(5, 'Mini coxinha', 'Bandeja 25 un', 15.00, 'mini', '🥟', true),
(6, 'Quibe', 'Bandeja 25 un', 18.00, 'mini', '🥟', true),
(7, 'Enroladinho mini', 'Bandeja 25 un', 15.00, 'mini', '🌭', true),
(8, 'Bolinho de carne', 'Bandeja 25 un', 18.00, 'mini', '🥟', true),
(9, 'Bolinha de queijo', 'Bandeja 25 un', 18.00, 'mini', '🧀', true),
(10, 'Pepsi 1L', 'Refrigerante', 8.00, 'bebidas', '🥤', true),
(11, 'Coca-Cola 1L', 'Refrigerante', 9.00, 'bebidas', '🥤', true),
(12, 'Coca-Cola lata 350ml', 'Lata 350ml', 6.00, 'bebidas', '🥤', true),
(13, 'Pepsi lata 350ml', 'Lata 350ml', 5.50, 'bebidas', '🥤', true),
(14, 'Guaraná 1L', 'Refrigerante', 8.00, 'bebidas', '🥤', true)
ON CONFLICT (id) DO NOTHING;
*/

-- 7. GARANTIR VISIBILIDADE DOS PRODUTOS
UPDATE fast_products SET visible = true WHERE visible IS NULL OR visible = false;

-- 8. RECRIAR POLÍTICA PARA TODAS AS TABELAS FAST
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'fast_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow full access to %I" ON %I', t, t);
        EXECUTE format('CREATE POLICY "Allow full access to %I" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;

-- 9. CONFIRMAR CORREÇÃO
SELECT '✅ Correção aplicada! Verifique os produtos abaixo:' as status;
SELECT id, name, price, visible FROM fast_products ORDER BY id LIMIT 10;
