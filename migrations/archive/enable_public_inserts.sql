-- Allow public insert on fast_orders explicitly
DROP POLICY IF EXISTS "Allow public insert on fast_orders" ON fast_orders;

CREATE POLICY "Allow public insert on fast_orders" 
ON fast_orders 
FOR INSERT 
TO public
WITH CHECK (true);

-- Also ensure allow all (development mode)
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON fast_orders;

CREATE POLICY "Allow full access to fast_orders" 
ON fast_orders 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Verify
SELECT * FROM pg_policies WHERE tablename = 'fast_orders';
