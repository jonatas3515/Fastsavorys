-- ==============================================================================
-- FAST SAVORY'S SECURITY HARDENING (RLS)
-- ==============================================================================

-- 1. Enable RLS on all tables (Safety Check)
ALTER TABLE fast_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_store_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_birthday_discount_usage ENABLE ROW LEVEL SECURITY;

-- 2. PRODUCTS & PROMOTIONS & CONFIG (Public Read, Admin Write)
-- Products
DROP POLICY IF EXISTS "Public Read Products" ON fast_products;
CREATE POLICY "Public Read Products" ON fast_products 
    FOR SELECT TO anon, authenticated USING (visible = true);

DROP POLICY IF EXISTS "Admin Full Access Products" ON fast_products;
CREATE POLICY "Admin Full Access Products" ON fast_products 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Promotions
DROP POLICY IF EXISTS "Public Read Promotions" ON fast_promotions;
CREATE POLICY "Public Read Promotions" ON fast_promotions 
    FOR SELECT TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "Admin Full Access Promotions" ON fast_promotions;
CREATE POLICY "Admin Full Access Promotions" ON fast_promotions 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Store Config
DROP POLICY IF EXISTS "Public Read Config" ON fast_store_config;
CREATE POLICY "Public Read Config" ON fast_store_config 
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin Write Config" ON fast_store_config;
CREATE POLICY "Admin Write Config" ON fast_store_config 
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. ORDERS (Anon Insert, Admin Full Access)
DROP POLICY IF EXISTS "Public Insert Orders" ON fast_orders;
CREATE POLICY "Public Insert Orders" ON fast_orders 
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Allow public to select their own inserted orders (if we tracked session)
-- For now, we restrict SELECT to Admin. 
-- Public Tracking must be done via specific query or SECURITY DEFINER function to avoid exposing all orders.
DROP POLICY IF EXISTS "Admin Full Access Orders" ON fast_orders;
CREATE POLICY "Admin Full Access Orders" ON fast_orders 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. CLIENTS (Admin Full Access, Public Read Self?)
DROP POLICY IF EXISTS "Admin Full Access Clients" ON fast_clients;
CREATE POLICY "Admin Full Access Clients" ON fast_clients 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow inserting new client during checkout
DROP POLICY IF EXISTS "Public Insert Clients" ON fast_clients;
CREATE POLICY "Public Insert Clients" ON fast_clients 
    FOR INSERT TO anon, authenticated WITH CHECK (true);
    
-- Allow public to read/update BY PHONE (This is weak security without SMS auth, but better than nothing)
-- Ideally: CREATE POLICY "Public Read Client Self" ON fast_clients FOR SELECT USING (phone = current_setting('app.current_phone', true));

-- 5. FUNCTION FOR SECURE ORDER TRACKING (Bypasses RLS safely)
DROP FUNCTION IF EXISTS get_order_for_tracking(text, text);
CREATE OR REPLACE FUNCTION get_order_for_tracking(p_order_code text, p_phone text)
RETURNS TABLE (
    id bigint,
    order_code text,
    status text,
    created_at timestamptz,
    updated_at timestamptz,
    total numeric,
    items jsonb,
    delivery_type text,
    client_name text,
    order_sequence int
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        o.id, 
        o.order_code, 
        o.status, 
        o.created_at, 
        o.updated_at, 
        o.total, 
        o.items,
        o.delivery_type,
        o.client_name,
        o.order_sequence
    FROM fast_orders o
    WHERE 
        UPPER(o.order_code) = UPPER(p_order_code) 
        AND (
            o.client_phone = p_phone
            OR 
            -- Robustez para formato de telefone
            RIGHT(REGEXP_REPLACE(o.client_phone, '\D', '', 'g'), 8) = RIGHT(REGEXP_REPLACE(p_phone, '\D', '', 'g'), 8)
        )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to anon
GRANT EXECUTE ON FUNCTION get_order_for_tracking TO anon;
GRANT EXECUTE ON FUNCTION get_order_for_tracking TO authenticated;

-- ==============================================================================
-- INSTRUCTIONS:
-- 1. Run this script in Supabase SQL Editor.
-- 2. Update Admin Auth to use supabase.auth.signInWithPassword().
-- 3. Update 'tracking.js' to use rpc('get_order_for_tracking', ...) instead of .select().
-- ==============================================================================
