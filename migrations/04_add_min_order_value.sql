-- Add min_order_value column to fast_delivery_fees
ALTER TABLE fast_delivery_fees 
ADD COLUMN IF NOT EXISTS min_order_value DECIMAL(10,2) DEFAULT 0.00;
