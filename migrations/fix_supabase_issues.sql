-- ============================================================
-- MIGRATION: Fix Supabase Security and Performance Issues
-- Date: 2024-12-31
-- ============================================================
-- Esta migração resolve:
-- 1. SECURITY: Função update_updated_at_column com search_path mutável
-- 2. PERFORMANCE: Múltiplas políticas permissivas nas tabelas
-- ============================================================

-- ============================================================
-- 1. FIX SECURITY: Set search_path for update_updated_at_column
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. CONSOLIDATE RLS POLICIES FOR ALL AFFECTED TABLES
-- ============================================================

-- ----------------------------------------
-- fast_business_hours
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all access to fast_business_hours" ON fast_business_hours;
DROP POLICY IF EXISTS "Allow full access to fast_business_hours" ON fast_business_hours;
DROP POLICY IF EXISTS "fast_business_hours_all_access" ON fast_business_hours;

CREATE POLICY "fast_business_hours_all_access" ON fast_business_hours
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_order_logs
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all access to fast_order_logs" ON fast_order_logs;
DROP POLICY IF EXISTS "Allow all for fast_order_logs" ON fast_order_logs;
DROP POLICY IF EXISTS "Allow full access to fast_order_logs" ON fast_order_logs;
DROP POLICY IF EXISTS "fast_order_logs_all_access" ON fast_order_logs;

CREATE POLICY "fast_order_logs_all_access" ON fast_order_logs
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_products
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow full access to fast_products" ON fast_products;
DROP POLICY IF EXISTS "Allow read access to fast_products" ON fast_products;
DROP POLICY IF EXISTS "Allow all access to fast_products" ON fast_products;
DROP POLICY IF EXISTS "fast_products_all_access" ON fast_products;

CREATE POLICY "fast_products_all_access" ON fast_products
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_ratings
-- ----------------------------------------
DROP POLICY IF EXISTS "Anon full access ratings" ON fast_ratings;
DROP POLICY IF EXISTS "fast_ratings_all_access" ON fast_ratings;
DROP POLICY IF EXISTS "Public read published ratings" ON fast_ratings;
DROP POLICY IF EXISTS "Anon insert ratings" ON fast_ratings;
DROP POLICY IF EXISTS "Anon read own ratings" ON fast_ratings;
DROP POLICY IF EXISTS "Service role full access" ON fast_ratings;
DROP POLICY IF EXISTS "Authenticated manage ratings" ON fast_ratings;
DROP POLICY IF EXISTS "Allow full access to fast_ratings" ON fast_ratings;
DROP POLICY IF EXISTS "Allow all access to fast_ratings" ON fast_ratings;

CREATE POLICY "fast_ratings_all_access" ON fast_ratings
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_special_discounts
-- ----------------------------------------
DROP POLICY IF EXISTS "Admin full access" ON fast_special_discounts;
DROP POLICY IF EXISTS "Public read access" ON fast_special_discounts;
DROP POLICY IF EXISTS "Allow full access to fast_special_discounts" ON fast_special_discounts;
DROP POLICY IF EXISTS "Allow all access to fast_special_discounts" ON fast_special_discounts;
DROP POLICY IF EXISTS "fast_special_discounts_all_access" ON fast_special_discounts;

CREATE POLICY "fast_special_discounts_all_access" ON fast_special_discounts
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_store_config
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all access to fast_store_config" ON fast_store_config;
DROP POLICY IF EXISTS "Allow full access to fast_store_config" ON fast_store_config;
DROP POLICY IF EXISTS "fast_store_config_all_access" ON fast_store_config;

CREATE POLICY "fast_store_config_all_access" ON fast_store_config
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_store_status
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all access to fast_store_status" ON fast_store_status;
DROP POLICY IF EXISTS "Allow full access to fast_store_status" ON fast_store_status;
DROP POLICY IF EXISTS "fast_store_status_all_access" ON fast_store_status;

CREATE POLICY "fast_store_status_all_access" ON fast_store_status
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_banner_config
-- ----------------------------------------
DROP POLICY IF EXISTS "Public can read banner config" ON fast_banner_config;
DROP POLICY IF EXISTS "Service role can manage banner" ON fast_banner_config;
DROP POLICY IF EXISTS "Allow full access to fast_banner_config" ON fast_banner_config;
DROP POLICY IF EXISTS "Allow all access to fast_banner_config" ON fast_banner_config;
DROP POLICY IF EXISTS "Anon can manage banner" ON fast_banner_config;
DROP POLICY IF EXISTS "fast_banner_config_all_access" ON fast_banner_config;

CREATE POLICY "fast_banner_config_all_access" ON fast_banner_config
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_birthday_discount
-- ----------------------------------------
DROP POLICY IF EXISTS "Public read birthday discount" ON fast_birthday_discount;
DROP POLICY IF EXISTS "Anon manage birthday discount" ON fast_birthday_discount;
DROP POLICY IF EXISTS "Allow full access to fast_birthday_discount" ON fast_birthday_discount;
DROP POLICY IF EXISTS "Allow all access to fast_birthday_discount" ON fast_birthday_discount;
DROP POLICY IF EXISTS "fast_birthday_discount_all_access" ON fast_birthday_discount;

CREATE POLICY "fast_birthday_discount_all_access" ON fast_birthday_discount
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_birthday_discount_usage
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all access to fast_birthday_discount_usage" ON fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Allow full access to fast_birthday_discount_usage" ON fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Public read birthday discount usage" ON fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Anon manage birthday discount usage" ON fast_birthday_discount_usage;
DROP POLICY IF EXISTS "fast_birthday_discount_usage_all_access" ON fast_birthday_discount_usage;

CREATE POLICY "fast_birthday_discount_usage_all_access" ON fast_birthday_discount_usage
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_client_discounts (se existir)
-- ----------------------------------------
DROP POLICY IF EXISTS "Public read client discounts" ON fast_client_discounts;
DROP POLICY IF EXISTS "Anon manage client discounts" ON fast_client_discounts;
DROP POLICY IF EXISTS "Allow full access to fast_client_discounts" ON fast_client_discounts;
DROP POLICY IF EXISTS "Allow all access to fast_client_discounts" ON fast_client_discounts;
DROP POLICY IF EXISTS "fast_client_discounts_all_access" ON fast_client_discounts;

CREATE POLICY "fast_client_discounts_all_access" ON fast_client_discounts
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_coupon_usage
-- ----------------------------------------
DROP POLICY IF EXISTS "Public read coupon usage" ON fast_coupon_usage;
DROP POLICY IF EXISTS "Anon manage coupon usage" ON fast_coupon_usage;
DROP POLICY IF EXISTS "Allow full access to fast_coupon_usage" ON fast_coupon_usage;
DROP POLICY IF EXISTS "Allow all access to fast_coupon_usage" ON fast_coupon_usage;
DROP POLICY IF EXISTS "fast_coupon_usage_all_access" ON fast_coupon_usage;

CREATE POLICY "fast_coupon_usage_all_access" ON fast_coupon_usage
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_birthday_usage (se existir)
-- ----------------------------------------
DROP POLICY IF EXISTS "Public read birthday usage" ON fast_birthday_usage;
DROP POLICY IF EXISTS "Anon manage birthday usage" ON fast_birthday_usage;
DROP POLICY IF EXISTS "Allow full access to fast_birthday_usage" ON fast_birthday_usage;
DROP POLICY IF EXISTS "Allow all access to fast_birthday_usage" ON fast_birthday_usage;
DROP POLICY IF EXISTS "fast_birthday_usage_all_access" ON fast_birthday_usage;

CREATE POLICY "fast_birthday_usage_all_access" ON fast_birthday_usage
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_couriers
-- ----------------------------------------
DROP POLICY IF EXISTS "Public read couriers" ON fast_couriers;
DROP POLICY IF EXISTS "Anon manage couriers" ON fast_couriers;
DROP POLICY IF EXISTS "Allow all access to fast_couriers" ON fast_couriers;
DROP POLICY IF EXISTS "Allow full access to fast_couriers" ON fast_couriers;
DROP POLICY IF EXISTS "fast_couriers_all_access" ON fast_couriers;

CREATE POLICY "fast_couriers_all_access" ON fast_couriers
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_promotions
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow public read access to promotions" ON fast_promotions;
DROP POLICY IF EXISTS "Allow authenticated users to manage promotions" ON fast_promotions;
DROP POLICY IF EXISTS "Allow anon users to manage promotions" ON fast_promotions;
DROP POLICY IF EXISTS "Allow full access to fast_promotions" ON fast_promotions;
DROP POLICY IF EXISTS "Allow all access to fast_promotions" ON fast_promotions;
DROP POLICY IF EXISTS "fast_promotions_all_access" ON fast_promotions;

CREATE POLICY "fast_promotions_all_access" ON fast_promotions
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_product_options
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all for fast_product_options" ON fast_product_options;
DROP POLICY IF EXISTS "Allow full access to fast_product_options" ON fast_product_options;
DROP POLICY IF EXISTS "fast_product_options_all_access" ON fast_product_options;

CREATE POLICY "fast_product_options_all_access" ON fast_product_options
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_orders
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow public insert on fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow all access to fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "fast_orders_all_access" ON fast_orders;

CREATE POLICY "fast_orders_all_access" ON fast_orders
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_users
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow full access to fast_users" ON fast_users;
DROP POLICY IF EXISTS "Allow all for anon users" ON fast_users;
DROP POLICY IF EXISTS "Allow all access to fast_users" ON fast_users;
DROP POLICY IF EXISTS "fast_users_all_access" ON fast_users;

CREATE POLICY "fast_users_all_access" ON fast_users
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_stripe_config
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow all for anon stripe_config" ON fast_stripe_config;
DROP POLICY IF EXISTS "Allow full access to fast_stripe_config" ON fast_stripe_config;
DROP POLICY IF EXISTS "fast_stripe_config_all_access" ON fast_stripe_config;

CREATE POLICY "fast_stripe_config_all_access" ON fast_stripe_config
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_clients
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow full access to fast_clients" ON fast_clients;
DROP POLICY IF EXISTS "Allow all access to fast_clients" ON fast_clients;
DROP POLICY IF EXISTS "fast_clients_all_access" ON fast_clients;

CREATE POLICY "fast_clients_all_access" ON fast_clients
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_delivery_fees
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow full access to fast_delivery_fees" ON fast_delivery_fees;
DROP POLICY IF EXISTS "Allow all access to fast_delivery_fees" ON fast_delivery_fees;
DROP POLICY IF EXISTS "fast_delivery_fees_all_access" ON fast_delivery_fees;

CREATE POLICY "fast_delivery_fees_all_access" ON fast_delivery_fees
    FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------
-- fast_coupons
-- ----------------------------------------
DROP POLICY IF EXISTS "Allow full access to fast_coupons" ON fast_coupons;
DROP POLICY IF EXISTS "Allow all access to fast_coupons" ON fast_coupons;
DROP POLICY IF EXISTS "fast_coupons_all_access" ON fast_coupons;

CREATE POLICY "fast_coupons_all_access" ON fast_coupons
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- VERIFICATION QUERY (execute after migration)
-- ============================================================
-- SELECT schemaname, tablename, policyname 
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename LIKE 'fast_%' 
-- ORDER BY tablename, policyname;
