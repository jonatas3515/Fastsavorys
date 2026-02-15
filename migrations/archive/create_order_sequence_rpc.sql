-- RPC function to get next order sequence atomically
-- This bypasses RLS and ensures correct sequential numbering
-- IMPORTANTE: Execute este script no Supabase SQL Editor

-- Drop existing function if exists (to allow recreation)
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
        MAX(CAST(SUBSTRING(order_code FROM 'FAST-0*(\d+)') AS INTEGER)),
        0
    ) INTO max_code_num
    FROM fast_orders
    WHERE order_code ~ '^FAST-\d+$';
    
    -- Use the greater of the two + 1
    next_seq := GREATEST(max_seq, max_code_num) + 1;
    
    -- Ensure minimum of 1
    IF next_seq < 1 THEN
        next_seq := 1;
    END IF;
    
    RETURN next_seq;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO anon;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO service_role;

-- Verify the function works
-- SELECT get_next_order_sequence();
