-- =====================================================
-- DIAGNÓSTICO: Problemas com salvamento de pedidos
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- 1. Verificar se a tabela existe e suas colunas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'fast_orders'
ORDER BY ordinal_position;

-- 2. Verificar políticas RLS atuais
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'fast_orders';

-- 3. Verificar se RLS está habilitado
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'fast_orders';

-- 4. Verificar últimos pedidos (se existem)
SELECT id, order_code, order_sequence, client_name, status, created_at 
FROM fast_orders 
ORDER BY created_at DESC 
LIMIT 10;

-- 5. Contar total de pedidos
SELECT COUNT(*) as total_pedidos FROM fast_orders;

-- 6. Verificar se a função RPC existe
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_next_order_sequence';

-- 7. Testar a função RPC
SELECT get_next_order_sequence() AS proxima_sequencia;

-- 8. Verificar se o trigger existe
SELECT tgname, tgrelid::regclass, tgtype, tgenabled
FROM pg_trigger
WHERE tgrelid = 'fast_orders'::regclass;
