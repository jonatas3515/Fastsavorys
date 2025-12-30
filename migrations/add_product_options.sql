-- Fast Product Options Table
-- Stores customization options for products (cake mass, filling, salgados, mini-salgados flavors)

-- Create table
CREATE TABLE IF NOT EXISTS fast_product_options (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'cakeMass', 'filling', 'salgados', 'miniSalgadosFlavors'
  name VARCHAR(100) NOT NULL,
  visible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by type
CREATE INDEX IF NOT EXISTS idx_fast_product_options_type ON fast_product_options(type);

-- Enable RLS
ALTER TABLE fast_product_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all operations for app - no auth required)
DROP POLICY IF EXISTS "Allow all for fast_product_options" ON fast_product_options;
CREATE POLICY "Allow all for fast_product_options" ON fast_product_options
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default options (only if table is empty)
INSERT INTO fast_product_options (type, name, visible, sort_order)
SELECT * FROM (VALUES
  -- Cake Mass Options
  ('cakeMass', 'Massa Branca', true, 1),
  ('cakeMass', 'Massa de Chocolate', true, 2),
  
  -- Filling Options  
  ('filling', 'Ninho', true, 1),
  ('filling', 'Beijinho', true, 2),
  ('filling', 'Chocolate', true, 3),
  ('filling', 'Chocolate com Côco', true, 4),
  ('filling', 'Ninho com Côco', true, 5),
  ('filling', 'Ninho com Chocolate', true, 6),
  
  -- Salgados Options (for Kits)
  ('salgados', 'Coxinha', true, 1),
  ('salgados', 'Bolinha de Carne', true, 2),
  ('salgados', 'Cazulo de Presunto e Queijo', true, 3),
  ('salgados', 'Quibe', true, 4),
  ('salgados', 'Bolinha de Queijo', true, 5),
  ('salgados', 'Enroladinho de Salsicha', true, 6),
  
  -- Mini-Salgados Flavors
  ('miniSalgadosFlavors', 'Coxinha', true, 1),
  ('miniSalgadosFlavors', 'Enroladinho', true, 2),
  ('miniSalgadosFlavors', 'Quibe', true, 3),
  ('miniSalgadosFlavors', 'Bolinha de Carne', true, 4),
  ('miniSalgadosFlavors', 'Bolinha de Queijo', true, 5),
  ('miniSalgadosFlavors', 'Risole de Carne', true, 6),
  ('miniSalgadosFlavors', 'Risole de Queijo', true, 7)
) AS default_options(type, name, visible, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM fast_product_options LIMIT 1);

-- Add flavorSelection column to fast_products if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fast_products' AND column_name = 'flavor_selection'
  ) THEN
    ALTER TABLE fast_products ADD COLUMN flavor_selection JSONB DEFAULT NULL;
  END IF;
END $$;

-- Comment for documentation
COMMENT ON TABLE fast_product_options IS 'Customization options for products (cake mass, filling, salgados, mini-salgados flavors)';
COMMENT ON COLUMN fast_product_options.type IS 'Option type: cakeMass, filling, salgados, miniSalgadosFlavors';
COMMENT ON COLUMN fast_product_options.visible IS 'Whether this option is available for selection by customers';
COMMENT ON COLUMN fast_product_options.sort_order IS 'Display order in selection lists';
COMMENT ON COLUMN fast_products.flavor_selection IS 'JSON with {enabled: bool, maxFlavors: int, availableFlavors: int[]} for mini-salgados';
