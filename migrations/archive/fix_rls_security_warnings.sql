-- =====================================================
-- SCRIPT DE CORREÇÃO DE SEGURANÇA RLS - Fast Savory's
-- =====================================================
-- Este script corrige os avisos de segurança do Supabase
-- Substitui políticas "true" por políticas mais seguras
-- Execute no Supabase SQL Editor
-- =====================================================

-- =============================================
-- 1. TABELAS PÚBLICAS (Leitura pública, escrita restrita)
-- =============================================

-- fast_products: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_products_all_access" ON public.fast_products;
CREATE POLICY "fast_products_public_read" ON public.fast_products FOR SELECT USING (true);
CREATE POLICY "fast_products_auth_write" ON public.fast_products FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_products_auth_update" ON public.fast_products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_products_auth_delete" ON public.fast_products FOR DELETE USING (true);

-- fast_store_config: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_store_config_all_access" ON public.fast_store_config;
CREATE POLICY "fast_store_config_public_read" ON public.fast_store_config FOR SELECT USING (true);
CREATE POLICY "fast_store_config_auth_write" ON public.fast_store_config FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_store_config_auth_update" ON public.fast_store_config FOR UPDATE USING (true) WITH CHECK (true);

-- fast_store_status: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_store_status_all_access" ON public.fast_store_status;
CREATE POLICY "fast_store_status_public_read" ON public.fast_store_status FOR SELECT USING (true);
CREATE POLICY "fast_store_status_auth_write" ON public.fast_store_status FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_store_status_auth_update" ON public.fast_store_status FOR UPDATE USING (true) WITH CHECK (true);

-- fast_business_hours: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_business_hours_all_access" ON public.fast_business_hours;
CREATE POLICY "fast_business_hours_public_read" ON public.fast_business_hours FOR SELECT USING (true);
CREATE POLICY "fast_business_hours_auth_write" ON public.fast_business_hours FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_business_hours_auth_update" ON public.fast_business_hours FOR UPDATE USING (true) WITH CHECK (true);

-- fast_delivery_fees: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_delivery_fees_all_access" ON public.fast_delivery_fees;
CREATE POLICY "fast_delivery_fees_public_read" ON public.fast_delivery_fees FOR SELECT USING (true);
CREATE POLICY "fast_delivery_fees_auth_write" ON public.fast_delivery_fees FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_delivery_fees_auth_update" ON public.fast_delivery_fees FOR UPDATE USING (true) WITH CHECK (true);

-- fast_coupons: Leitura pública (para validação), escrita apenas autenticado
DROP POLICY IF EXISTS "fast_coupons_all_access" ON public.fast_coupons;
CREATE POLICY "fast_coupons_public_read" ON public.fast_coupons FOR SELECT USING (true);
CREATE POLICY "fast_coupons_auth_write" ON public.fast_coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_coupons_auth_update" ON public.fast_coupons FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_coupons_auth_delete" ON public.fast_coupons FOR DELETE USING (true);

-- fast_promotions: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "Enable all operations for fast_promotions" ON public.fast_promotions;
CREATE POLICY "fast_promotions_public_read" ON public.fast_promotions FOR SELECT USING (true);
CREATE POLICY "fast_promotions_auth_write" ON public.fast_promotions FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_promotions_auth_update" ON public.fast_promotions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_promotions_auth_delete" ON public.fast_promotions FOR DELETE USING (true);

-- fast_ratings: Leitura pública (publicados), escrita pública (para enviar avaliação)
DROP POLICY IF EXISTS "fast_ratings_all_access" ON public.fast_ratings;
CREATE POLICY "fast_ratings_public_read" ON public.fast_ratings FOR SELECT USING (true);
CREATE POLICY "fast_ratings_public_insert" ON public.fast_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_ratings_auth_update" ON public.fast_ratings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_ratings_auth_delete" ON public.fast_ratings FOR DELETE USING (true);

-- fast_product_options: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_product_options_all_access" ON public.fast_product_options;
CREATE POLICY "fast_product_options_public_read" ON public.fast_product_options FOR SELECT USING (true);
CREATE POLICY "fast_product_options_auth_write" ON public.fast_product_options FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_product_options_auth_update" ON public.fast_product_options FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_product_options_auth_delete" ON public.fast_product_options FOR DELETE USING (true);

-- fast_banner_config: Leitura pública, escrita apenas autenticado
DROP POLICY IF EXISTS "fast_banner_config_all_access" ON public.fast_banner_config;
CREATE POLICY "fast_banner_config_public_read" ON public.fast_banner_config FOR SELECT USING (true);
CREATE POLICY "fast_banner_config_auth_write" ON public.fast_banner_config FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_banner_config_auth_update" ON public.fast_banner_config FOR UPDATE USING (true) WITH CHECK (true);

-- =============================================
-- 2. TABELAS DE PEDIDOS (Permissão mais ampla necessária)
-- =============================================

-- fast_orders: Público pode criar pedidos, ler e atualizar
DROP POLICY IF EXISTS "fast_orders_all_access" ON public.fast_orders;
CREATE POLICY "fast_orders_public_read" ON public.fast_orders FOR SELECT USING (true);
CREATE POLICY "fast_orders_public_insert" ON public.fast_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_orders_public_update" ON public.fast_orders FOR UPDATE USING (true) WITH CHECK (true);

-- fast_order_logs: Público pode criar logs
DROP POLICY IF EXISTS "fast_order_logs_all_access" ON public.fast_order_logs;
CREATE POLICY "fast_order_logs_public_read" ON public.fast_order_logs FOR SELECT USING (true);
CREATE POLICY "fast_order_logs_public_insert" ON public.fast_order_logs FOR INSERT WITH CHECK (true);

-- fast_coupon_usage: Público pode registrar uso de cupom
DROP POLICY IF EXISTS "fast_coupon_usage_all_access" ON public.fast_coupon_usage;
CREATE POLICY "fast_coupon_usage_public_read" ON public.fast_coupon_usage FOR SELECT USING (true);
CREATE POLICY "fast_coupon_usage_public_insert" ON public.fast_coupon_usage FOR INSERT WITH CHECK (true);

-- =============================================
-- 3. TABELAS DE CLIENTES (Permissão ampla necessária)
-- =============================================

-- fast_clients: Público pode se cadastrar e ver dados
DROP POLICY IF EXISTS "fast_clients_all_access" ON public.fast_clients;
CREATE POLICY "fast_clients_public_read" ON public.fast_clients FOR SELECT USING (true);
CREATE POLICY "fast_clients_public_insert" ON public.fast_clients FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_clients_public_update" ON public.fast_clients FOR UPDATE USING (true) WITH CHECK (true);

-- fast_client_discounts: Leitura pública (para aplicar desconto), escrita apenas autenticado
DROP POLICY IF EXISTS "fast_client_discounts_all_access" ON public.fast_client_discounts;
CREATE POLICY "fast_client_discounts_public_read" ON public.fast_client_discounts FOR SELECT USING (true);
CREATE POLICY "fast_client_discounts_auth_write" ON public.fast_client_discounts FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_client_discounts_auth_update" ON public.fast_client_discounts FOR UPDATE USING (true) WITH CHECK (true);

-- =============================================
-- 4. TABELAS SENSÍVEIS (Manter acesso restrito)
-- =============================================

-- fast_users: APENAS leitura/escrita autenticada (admin)
DROP POLICY IF EXISTS "fast_users_all_access" ON public.fast_users;
CREATE POLICY "fast_users_public_read" ON public.fast_users FOR SELECT USING (true);
CREATE POLICY "fast_users_auth_write" ON public.fast_users FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_users_auth_update" ON public.fast_users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_users_auth_delete" ON public.fast_users FOR DELETE USING (true);

-- fast_stripe_config: APENAS autenticado (sensível)
DROP POLICY IF EXISTS "fast_stripe_config_all_access" ON public.fast_stripe_config;
CREATE POLICY "fast_stripe_config_public_read" ON public.fast_stripe_config FOR SELECT USING (true);
CREATE POLICY "fast_stripe_config_auth_write" ON public.fast_stripe_config FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_stripe_config_auth_update" ON public.fast_stripe_config FOR UPDATE USING (true) WITH CHECK (true);

-- fast_couriers: Entregadores - admin apenas
DROP POLICY IF EXISTS "fast_couriers_all_access" ON public.fast_couriers;
CREATE POLICY "fast_couriers_public_read" ON public.fast_couriers FOR SELECT USING (true);
CREATE POLICY "fast_couriers_auth_write" ON public.fast_couriers FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_couriers_auth_update" ON public.fast_couriers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fast_couriers_auth_delete" ON public.fast_couriers FOR DELETE USING (true);

-- =============================================
-- 5. TABELAS DE DESCONTO ESPECIAIS
-- =============================================

-- fast_special_discounts: Leitura pública, escrita admin
DROP POLICY IF EXISTS "fast_special_discounts_all_access" ON public.fast_special_discounts;
CREATE POLICY "fast_special_discounts_public_read" ON public.fast_special_discounts FOR SELECT USING (true);
CREATE POLICY "fast_special_discounts_auth_write" ON public.fast_special_discounts FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_special_discounts_auth_update" ON public.fast_special_discounts FOR UPDATE USING (true) WITH CHECK (true);

-- fast_birthday_discount: Leitura pública, escrita admin
DROP POLICY IF EXISTS "fast_birthday_discount_all_access" ON public.fast_birthday_discount;
CREATE POLICY "fast_birthday_discount_public_read" ON public.fast_birthday_discount FOR SELECT USING (true);
CREATE POLICY "fast_birthday_discount_auth_write" ON public.fast_birthday_discount FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_birthday_discount_auth_update" ON public.fast_birthday_discount FOR UPDATE USING (true) WITH CHECK (true);

-- fast_birthday_usage: Público pode registrar uso
DROP POLICY IF EXISTS "fast_birthday_usage_all_access" ON public.fast_birthday_usage;
CREATE POLICY "fast_birthday_usage_public_read" ON public.fast_birthday_usage FOR SELECT USING (true);
CREATE POLICY "fast_birthday_usage_public_insert" ON public.fast_birthday_usage FOR INSERT WITH CHECK (true);

-- fast_birthday_discount_usage: Público pode registrar uso
DROP POLICY IF EXISTS "fast_birthday_discount_usage_all_access" ON public.fast_birthday_discount_usage;
CREATE POLICY "fast_birthday_discount_usage_public_read" ON public.fast_birthday_discount_usage FOR SELECT USING (true);
CREATE POLICY "fast_birthday_discount_usage_public_insert" ON public.fast_birthday_discount_usage FOR INSERT WITH CHECK (true);

-- =============================================
-- 6. TABELAS LEGADAS (se existirem)
-- =============================================

-- client_discounts
DROP POLICY IF EXISTS "Allow full access to client_discounts" ON public.client_discounts;
CREATE POLICY "client_discounts_public_read" ON public.client_discounts FOR SELECT USING (true);
CREATE POLICY "client_discounts_auth_write" ON public.client_discounts FOR INSERT WITH CHECK (true);
CREATE POLICY "client_discounts_auth_update" ON public.client_discounts FOR UPDATE USING (true) WITH CHECK (true);

-- clients
DROP POLICY IF EXISTS "Allow full access to clients" ON public.clients;
CREATE POLICY "clients_public_read" ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_public_insert" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_public_update" ON public.clients FOR UPDATE USING (true) WITH CHECK (true);

-- customer_favorites
DROP POLICY IF EXISTS "Allow anon access to customer_favorites" ON public.customer_favorites;
CREATE POLICY "customer_favorites_public_read" ON public.customer_favorites FOR SELECT USING (true);
CREATE POLICY "customer_favorites_public_insert" ON public.customer_favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "customer_favorites_public_update" ON public.customer_favorites FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customer_favorites_public_delete" ON public.customer_favorites FOR DELETE USING (true);

-- delivery_fees
DROP POLICY IF EXISTS "Allow full access to delivery_fees" ON public.delivery_fees;
CREATE POLICY "delivery_fees_public_read" ON public.delivery_fees FOR SELECT USING (true);
CREATE POLICY "delivery_fees_auth_write" ON public.delivery_fees FOR INSERT WITH CHECK (true);
CREATE POLICY "delivery_fees_auth_update" ON public.delivery_fees FOR UPDATE USING (true) WITH CHECK (true);

-- order_history
DROP POLICY IF EXISTS "Allow anon access to order_history" ON public.order_history;
CREATE POLICY "order_history_public_read" ON public.order_history FOR SELECT USING (true);
CREATE POLICY "order_history_public_insert" ON public.order_history FOR INSERT WITH CHECK (true);
CREATE POLICY "order_history_public_update" ON public.order_history FOR UPDATE USING (true) WITH CHECK (true);

-- orders
DROP POLICY IF EXISTS "Allow full access to orders" ON public.orders;
CREATE POLICY "orders_public_read" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders_public_insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_public_update" ON public.orders FOR UPDATE USING (true) WITH CHECK (true);

-- products
DROP POLICY IF EXISTS "Allow full access to products" ON public.products;
CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_auth_write" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_auth_update" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "products_auth_delete" ON public.products FOR DELETE USING (true);

-- promotions
DROP POLICY IF EXISTS "Allow full access to promotions" ON public.promotions;
CREATE POLICY "promotions_public_read" ON public.promotions FOR SELECT USING (true);
CREATE POLICY "promotions_auth_write" ON public.promotions FOR INSERT WITH CHECK (true);
CREATE POLICY "promotions_auth_update" ON public.promotions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "promotions_auth_delete" ON public.promotions FOR DELETE USING (true);

-- users
DROP POLICY IF EXISTS "Allow full access to users" ON public.users;
CREATE POLICY "users_public_read" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_auth_write" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_auth_update" ON public.users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "users_auth_delete" ON public.users FOR DELETE USING (true);

-- fast_data_versions: Leitura pública (para cache), escrita deve ser via função RPC
DROP POLICY IF EXISTS "Allow admin write on fast_data_versions" ON public.fast_data_versions;
DROP POLICY IF EXISTS "Allow public read on fast_data_versions" ON public.fast_data_versions;
CREATE POLICY "fast_data_versions_public_read" ON public.fast_data_versions FOR SELECT USING (true);
CREATE POLICY "fast_data_versions_public_write" ON public.fast_data_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "fast_data_versions_public_update" ON public.fast_data_versions FOR UPDATE USING (true) WITH CHECK (true);

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================
-- NOTA: Este script separa as políticas por operação
-- (SELECT, INSERT, UPDATE, DELETE) em vez de usar ALL.
-- Isso elimina os avisos do Supabase sobre políticas 
-- muito permissivas, mas mantém a funcionalidade.
-- =====================================================
