-- CHECK ORDER FAST-0001
SELECT * FROM fast_orders WHERE order_code = 'FAST-0001';

-- CHECK LATEST ORDERS
SELECT * FROM fast_orders ORDER BY created_at DESC LIMIT 5;

-- CHECK RLS POLICIES FOR INSERT
SELECT * FROM pg_policies WHERE tablename = 'fast_orders';

-- CHECK PERMISSIONS
SELECT 
  items, 
  total, 
  status 
FROM fast_orders 
LIMIT 1;
