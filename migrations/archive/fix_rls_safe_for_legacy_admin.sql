-- =====================================================
-- SCRIPT DE CORREÇÃO RLS (MODO COMPATIBILIDADE ADMIN)
-- =====================================================
-- Este script corrige os avisos do Supabase mas
-- MANTÉM as permissões "públicas" (incluindo DELETE)
-- para garantir que o painel admin atual (sem login real)
-- continue funcionando perfeitamente.
-- =====================================================

-- 1. fast_orders (Pedidos)
-- Remover TODAS as políticas existentes para evitar duplicatas
DROP POLICY IF EXISTS "fast_orders_all_access" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_select" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_insert" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_update" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_delete" ON public.fast_orders;
DROP POLICY IF EXISTS "fast_orders_public_read" ON public.fast_orders;
DROP POLICY IF EXISTS "Allow public insert on fast_orders" ON public.fast_orders;
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON public.fast_orders;

-- Recriar políticas separadas (melhora os warnings do Supabase)
CREATE POLICY "fast_orders_public_select" ON public.fast_orders FOR SELECT USING (true);
CREATE POLICY "fast_orders_public_insert" ON public.fast_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_orders_public_update" ON public.fast_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_orders_public_delete" ON public.fast_orders FOR DELETE USING (true);

-- 2. fast_users (Usuários Admin/Garçom)
DROP POLICY IF EXISTS "fast_users_all_access" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_select" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_write" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_update" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_delete" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_public_read" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_write" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_update" ON public.fast_users;
DROP POLICY IF EXISTS "fast_users_auth_delete" ON public.fast_users;

CREATE POLICY "fast_users_public_select" ON public.fast_users FOR SELECT USING (true);
CREATE POLICY "fast_users_public_write"  ON public.fast_users FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_users_public_update" ON public.fast_users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_users_public_delete" ON public.fast_users FOR DELETE USING (true);

-- 3. fast_products
DROP POLICY IF EXISTS "fast_products_all_access" ON public.fast_products;
DROP POLICY IF EXISTS "fast_products_public_all" ON public.fast_products;
DROP POLICY IF EXISTS "fast_products_public_read" ON public.fast_products;
DROP POLICY IF EXISTS "fast_products_auth_write" ON public.fast_products;
DROP POLICY IF EXISTS "fast_products_auth_update" ON public.fast_products;
DROP POLICY IF EXISTS "fast_products_auth_delete" ON public.fast_products;

CREATE POLICY "fast_products_public_all" ON public.fast_products FOR ALL USING (true) WITH CHECK (true);

-- 4. fast_store_config
DROP POLICY IF EXISTS "fast_store_config_all_access" ON public.fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_public_all" ON public.fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_public_read" ON public.fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_auth_write" ON public.fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_auth_update" ON public.fast_store_config;

CREATE POLICY "fast_store_config_public_all" ON public.fast_store_config FOR ALL USING (true) WITH CHECK (true);

-- 5. fast_order_logs
DROP POLICY IF EXISTS "fast_order_logs_all_access" ON public.fast_order_logs;
DROP POLICY IF EXISTS "fast_order_logs_public_all" ON public.fast_order_logs;
DROP POLICY IF EXISTS "fast_order_logs_public_read" ON public.fast_order_logs;
DROP POLICY IF EXISTS "fast_order_logs_public_insert" ON public.fast_order_logs;

CREATE POLICY "fast_order_logs_public_all" ON public.fast_order_logs FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
-- Com este script, o site NÃO PARA de funcionar.
-- Os avisos de "Policy Permissive" no Supabase continuarão aparecendo,
-- mas os ERROS de performance e conflitos sumirão.
-- =====================================================
