-- Migration: Add requires_preorder flag to products
-- This replaces the fragile string-based detection of products that need advance ordering

-- Add the column with default false (most products can be ordered same-day)
ALTER TABLE fast_products 
ADD COLUMN IF NOT EXISTS requires_preorder BOOLEAN DEFAULT false;

-- Set existing products that typically require preorder
-- Bolos (by category)
UPDATE fast_products 
SET requires_preorder = true 
WHERE LOWER(category) = 'bolos';

-- Kits (by category or name)
UPDATE fast_products 
SET requires_preorder = true 
WHERE LOWER(category) = 'kits' 
   OR LOWER(name) LIKE '%kit festa%'
   OR LOWER(name) LIKE '%kit %';

-- Vulcão comum (not Mini Vulcão)
UPDATE fast_products 
SET requires_preorder = true 
WHERE LOWER(name) LIKE '%vulcão%' 
  AND LOWER(name) NOT LIKE '%mini%';

-- Add comment for documentation
COMMENT ON COLUMN fast_products.requires_preorder IS 'If true, this product requires at least 1 day advance ordering and cannot be ordered for same-day pickup';
