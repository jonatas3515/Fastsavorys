-- ==============================================
-- VERIFICAÇÃO COMPLETA DO SUPABASE - FAST SAVORY'S
-- Execute este SQL no Supabase SQL Editor para verificar
-- se todas as tabelas e colunas estão corretas
-- ==============================================

-- =====================================================
-- 1. VERIFICAR SE TODAS AS TABELAS EXISTEM
-- =====================================================
SELECT 
    'TABELAS' as categoria,
    tablename as nome,
    CASE WHEN tablename IS NOT NULL THEN '✅ OK' ELSE '❌ FALTA' END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'fast_products',
    'fast_clients', 
    'fast_promotions',
    'fast_delivery_fees',
    'fast_users',
    'fast_orders',
    'fast_coupons',
    'fast_coupon_usage',
    'fast_store_status',
    'fast_birthday_discount_usage',
    'fast_store_config',
    'fast_business_hours',
    'fast_stripe_config'
)
ORDER BY tablename;

-- =====================================================
-- 2. CONTAR REGISTROS DE CADA TABELA
-- =====================================================
SELECT 'fast_products' as tabela, COUNT(*) as registros FROM fast_products
UNION ALL SELECT 'fast_clients', COUNT(*) FROM fast_clients
UNION ALL SELECT 'fast_orders', COUNT(*) FROM fast_orders
UNION ALL SELECT 'fast_users', COUNT(*) FROM fast_users
UNION ALL SELECT 'fast_promotions', COUNT(*) FROM fast_promotions
UNION ALL SELECT 'fast_coupons', COUNT(*) FROM fast_coupons
UNION ALL SELECT 'fast_delivery_fees', COUNT(*) FROM fast_delivery_fees
UNION ALL SELECT 'fast_store_config', COUNT(*) FROM fast_store_config
UNION ALL SELECT 'fast_business_hours', COUNT(*) FROM fast_business_hours
UNION ALL SELECT 'fast_store_status', COUNT(*) FROM fast_store_status
ORDER BY tabela;

-- =====================================================
-- 3. VERIFICAR COLUNAS CRÍTICAS EM FAST_ORDERS
-- =====================================================
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'fast_orders'
ORDER BY ordinal_position;

-- =====================================================
-- 4. VERIFICAR COLUNAS EM FAST_DELIVERY_FEES
-- (deve ter min_order_value da migration 04)
-- =====================================================
SELECT 
    column_name,
    data_type,
    CASE 
        WHEN column_name = 'min_order_value' THEN '✅ Migration 04 aplicada'
        ELSE ''
    END as nota
FROM information_schema.columns 
WHERE table_name = 'fast_delivery_fees'
ORDER BY ordinal_position;

-- =====================================================
-- 5. VERIFICAR COLUNAS STRIPE EM FAST_ORDERS
-- (payment_link, stripe_payment_id, amount_paid, accepted_at)
-- =====================================================
SELECT 
    column_name,
    data_type,
    CASE 
        WHEN column_name IN ('payment_link', 'stripe_payment_id', 'amount_paid', 'accepted_at', 'payment_status') 
        THEN '✅ Migration 06 aplicada'
        ELSE ''
    END as nota
FROM information_schema.columns 
WHERE table_name = 'fast_orders'
AND column_name IN ('payment_link', 'stripe_payment_id', 'amount_paid', 'accepted_at', 'payment_status')
ORDER BY column_name;

-- =====================================================
-- 6. VERIFICAR COLUNAS DE TEMPO EM FAST_STORE_CONFIG
-- (prep_time_min, prep_time_max, delivery_time_min, delivery_time_max)
-- =====================================================
SELECT 
    column_name,
    data_type,
    column_default,
    CASE 
        WHEN column_name LIKE '%time%' THEN '✅ Migration 05 aplicada'
        ELSE ''
    END as nota
FROM information_schema.columns 
WHERE table_name = 'fast_store_config'
ORDER BY ordinal_position;

-- =====================================================
-- 7. VERIFICAR RLS (Row Level Security) NAS TABELAS
-- =====================================================
SELECT 
    schemaname,
    tablename,
    CASE WHEN rowsecurity THEN '✅ RLS Ativo' ELSE '❌ RLS Inativo' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'fast_%'
ORDER BY tablename;

-- =====================================================
-- 8. VERIFICAR POLÍTICAS RLS
-- =====================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    CASE WHEN cmd = 'ALL' THEN '✅ Full Access' ELSE cmd END as permissao
FROM pg_policies
WHERE schemaname = 'public'
AND tablename LIKE 'fast_%'
ORDER BY tablename;

-- =====================================================
-- 9. VERIFICAR ÚLTIMOS 5 PEDIDOS
-- =====================================================
SELECT 
    id,
    order_code,
    client_name,
    status,
    payment_method,
    payment_status,
    total,
    created_at
FROM fast_orders
ORDER BY created_at DESC
LIMIT 5;

-- =====================================================
-- 10. VERIFICAR STORAGE BUCKET (IMAGENS)
-- =====================================================
-- Nota: Este SELECT pode falhar se você não tiver acesso ao schema storage
-- Se falhar, verifique manualmente no painel Storage do Supabase
SELECT 
    id,
    name,
    CASE WHEN public THEN '✅ Público' ELSE '🔒 Privado' END as acesso,
    created_at
FROM storage.buckets
WHERE id LIKE 'fast%' OR name LIKE 'fast%';

-- =====================================================
-- 11. VERIFICAR SE HÁ PRODUTOS COM IMAGEM
-- =====================================================
SELECT 
    COUNT(*) as total_produtos,
    COUNT(CASE WHEN image IS NOT NULL AND image != '' THEN 1 END) as com_imagem,
    COUNT(CASE WHEN image IS NULL OR image = '' THEN 1 END) as sem_imagem
FROM fast_products;

-- =====================================================
-- 12. VERIFICAR CONSTRAINTS IMPORTANTES
-- =====================================================
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name LIKE 'fast_%'
AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- =====================================================
-- 13. RESUMO FINAL
-- =====================================================
SELECT 
    '📊 RESUMO' as info,
    (SELECT COUNT(*) FROM fast_products) as produtos,
    (SELECT COUNT(*) FROM fast_orders) as pedidos,
    (SELECT COUNT(*) FROM fast_clients) as clientes,
    (SELECT COUNT(*) FROM fast_users) as usuarios,
    (SELECT COUNT(*) FROM fast_delivery_fees) as bairros_taxa;
