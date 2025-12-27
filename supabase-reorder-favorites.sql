-- ============================================
-- FastSavorys: Order History & Favorites Tables
-- ============================================

-- Histórico de pedidos para analytics e recompra
CREATE TABLE IF NOT EXISTS order_history (
  id BIGINT PRIMARY KEY,
  client_phone TEXT NOT NULL,
  client_name TEXT,
  items JSONB NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  delivery_type TEXT,
  neighborhood TEXT,
  is_encomenda BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por telefone
CREATE INDEX IF NOT EXISTS idx_order_history_phone ON order_history(client_phone);

-- Favoritos do cliente
CREATE TABLE IF NOT EXISTS customer_favorites (
  id BIGSERIAL PRIMARY KEY,
  client_phone TEXT NOT NULL,
  product_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_phone, product_id)
);

-- Índice para busca por telefone
CREATE INDEX IF NOT EXISTS idx_customer_favorites_phone ON customer_favorites(client_phone);

-- RLS Policies (acesso público para o app)
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;

-- Policies para permitir acesso anônimo (app público)
DROP POLICY IF EXISTS "Allow anon access to order_history" ON order_history;
CREATE POLICY "Allow anon access to order_history" ON order_history 
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon access to customer_favorites" ON customer_favorites;
CREATE POLICY "Allow anon access to customer_favorites" ON customer_favorites 
  FOR ALL USING (true) WITH CHECK (true);
