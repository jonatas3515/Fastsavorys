-- ==========================================
-- FIX ORDER SEQUENCE & PREVENT FAST-0001
-- ==========================================

-- 1. Recreate the RPC function to be absolutely sure it exists and works
CREATE OR REPLACE FUNCTION get_next_order_sequence()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS to see all orders
SET search_path = public
AS $$
DECLARE
    next_seq INTEGER;
    max_code_seq INTEGER;
BEGIN
    -- Get max from order_sequence column
    SELECT COALESCE(MAX(order_sequence), 0) INTO next_seq
    FROM fast_orders;
    
    -- Get max from parsing FAST-XXXX codes (fallback/safety)
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_code FROM 'FAST-(\d+)') AS INTEGER)), 0) INTO max_code_seq
    FROM fast_orders
    WHERE order_code ~ '^FAST-\d+$';
    
    -- Use the greater of the two + 1
    RETURN GREATEST(next_seq, max_code_seq) + 1;
END;
$$;

-- Grant permissions again just in case
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO anon;
GRANT EXECUTE ON FUNCTION get_next_order_sequence() TO service_role;

-- 2. Fix the specific incorrect order (FAST-0001 created recently)
-- We find the order that is likely the culprit (created independently of the sequence)
DO $$
DECLARE
    target_order_id BIGINT;
    new_sequence INTEGER;
    new_code TEXT;
BEGIN
    -- Find the problematic FAST-0001 order (created recently, e.g. last 24h)
    -- Adjust condition if needed to be more specific
    SELECT id INTO target_order_id
    FROM fast_orders
    WHERE order_code = 'FAST-0001'
    ORDER BY created_at DESC
    LIMIT 1;

    IF target_order_id IS NOT NULL THEN
        -- Calculate the correct next sequence
        -- (This uses our function logic inside the block)
        SELECT get_next_order_sequence() INTO new_sequence;
        new_code := 'FAST-' || LPAD(new_sequence::TEXT, 4, '0');
        
        -- Update the order
        UPDATE fast_orders
        SET 
            order_sequence = new_sequence,
            order_code = new_code
        WHERE id = target_order_id;
        
        RAISE NOTICE 'Fixed order % to become % (seq %)', target_order_id, new_code, new_sequence;
    ELSE
        RAISE NOTICE 'No FAST-0001 order found to fix.';
    END IF;
END;
$$;

-- 3. Create a Trigger to AUTOMATICALLY assign sequence if client sends known duplicates or null
-- This is the ultimate safeguard against client-side race conditions
CREATE OR REPLACE FUNCTION tr_set_order_sequence()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If sequence is null or order_code is 'FAST-0001' (which implies failure), generate a new one
    IF NEW.order_sequence IS NULL OR NEW.order_code = 'FAST-0001' OR NEW.order_code IS NULL THEN
        NEW.order_sequence := get_next_order_sequence();
        NEW.order_code := 'FAST-' || LPAD(NEW.order_sequence::TEXT, 4, '0');
    END IF;
    
    -- Check if the generated code already exists (unlikely with our logic, but safe)
    -- If exists, loop until we find a free one (simple collision resolution)
    WHILE EXISTS (SELECT 1 FROM fast_orders WHERE order_code = NEW.order_code AND id <> NEW.id) LOOP
        NEW.order_sequence := NEW.order_sequence + 1;
        NEW.order_code := 'FAST-' || LPAD(NEW.order_sequence::TEXT, 4, '0');
    END LOOP;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_sequence_trig ON fast_orders;

CREATE TRIGGER set_order_sequence_trig
BEFORE INSERT ON fast_orders
FOR EACH ROW
EXECUTE FUNCTION tr_set_order_sequence();
