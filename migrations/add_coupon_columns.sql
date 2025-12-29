-- Add coupon columns to fast_orders if they don't exist
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS coupon_discount DECIMAL(10,2) DEFAULT 0;

-- Also check scheduled_date as it might be missing too
ALTER TABLE fast_orders ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Verify columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fast_orders';
