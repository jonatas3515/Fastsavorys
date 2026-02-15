-- ==============================================
-- CORREÇÃO/ATUALIZAÇÃO COMPLETA DO SUPABASE
-- FAST SAVORY'S - Execute se alguma verificação falhar
-- ==============================================

-- =====================================================
-- 1. ADICIONAR COLUNAS FALTANTES EM FAST_ORDERS
-- =====================================================

-- order_code (código amigável do pedido)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'order_code') THEN
    ALTER TABLE fast_orders ADD COLUMN order_code TEXT;
  END IF;
END $$;

-- order_sequence (número sequencial)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'order_sequence') THEN
    ALTER TABLE fast_orders ADD COLUMN order_sequence INTEGER;
  END IF;
END $$;

-- rating (avaliação 1-5)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'rating') THEN
    ALTER TABLE fast_orders ADD COLUMN rating INTEGER;
  END IF;
END $$;

-- rating_comment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'rating_comment') THEN
    ALTER TABLE fast_orders ADD COLUMN rating_comment TEXT;
  END IF;
END $$;

-- payment_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'payment_status') THEN
    ALTER TABLE fast_orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
  END IF;
END $$;

-- payment_link
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'payment_link') THEN
    ALTER TABLE fast_orders ADD COLUMN payment_link TEXT;
  END IF;
END $$;

-- stripe_payment_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'stripe_payment_id') THEN
    ALTER TABLE fast_orders ADD COLUMN stripe_payment_id TEXT;
  END IF;
END $$;

-- amount_paid
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'amount_paid') THEN
    ALTER TABLE fast_orders ADD COLUMN amount_paid DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- accepted_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'accepted_at') THEN
    ALTER TABLE fast_orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- birthday_discount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'birthday_discount') THEN
    ALTER TABLE fast_orders ADD COLUMN birthday_discount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- coupon_discount
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_orders' AND column_name = 'coupon_discount') THEN
    ALTER TABLE fast_orders ADD COLUMN coupon_discount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- 2. ADICIONAR min_order_value EM FAST_DELIVERY_FEES
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_delivery_fees' AND column_name = 'min_order_value') THEN
    ALTER TABLE fast_delivery_fees ADD COLUMN min_order_value DECIMAL(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- =====================================================
-- 3. ADICIONAR COLUNAS DE TEMPO EM FAST_STORE_CONFIG
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'prep_time_min') THEN
    ALTER TABLE fast_store_config ADD COLUMN prep_time_min INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'prep_time_max') THEN
    ALTER TABLE fast_store_config ADD COLUMN prep_time_max INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'delivery_time_min') THEN
    ALTER TABLE fast_store_config ADD COLUMN delivery_time_min INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'delivery_time_max') THEN
    ALTER TABLE fast_store_config ADD COLUMN delivery_time_max INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'max_concurrent_orders') THEN
    ALTER TABLE fast_store_config ADD COLUMN max_concurrent_orders INTEGER DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_store_config' AND column_name = 'high_demand_extra_time') THEN
    ALTER TABLE fast_store_config ADD COLUMN high_demand_extra_time INTEGER DEFAULT 15;
  END IF;
END $$;

-- =====================================================
-- 4. CRIAR TABELA FAST_STRIPE_CONFIG SE NÃO EXISTIR
-- =====================================================
CREATE TABLE IF NOT EXISTS fast_stripe_config (
  id SERIAL PRIMARY KEY,
  store_id INTEGER DEFAULT 1,
  stripe_public_key TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  min_payment_percent INTEGER DEFAULT 50,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE fast_stripe_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon stripe_config" ON fast_stripe_config;
CREATE POLICY "Allow all for anon stripe_config" ON fast_stripe_config FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 5. CRIAR TABELA FAST_ORDER_LOGS (auditoria)
-- =====================================================
CREATE TABLE IF NOT EXISTS fast_order_logs (
  id SERIAL PRIMARY KEY,
  order_id BIGINT,
  order_code TEXT,
  old_status TEXT,
  new_status TEXT,
  changed_by TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE fast_order_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fast_order_logs" ON fast_order_logs;
CREATE POLICY "Allow all for fast_order_logs" ON fast_order_logs FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 6. ADICIONAR CAMPOS DE PROMO EM FAST_PRODUCTS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_products' AND column_name = 'promo_active') THEN
    ALTER TABLE fast_products ADD COLUMN promo_active BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_products' AND column_name = 'promo_type') THEN
    ALTER TABLE fast_products ADD COLUMN promo_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_products' AND column_name = 'promo_value') THEN
    ALTER TABLE fast_products ADD COLUMN promo_value DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fast_products' AND column_name = 'is_encomenda') THEN
    ALTER TABLE fast_products ADD COLUMN is_encomenda BOOLEAN DEFAULT false;
  END IF;
END $$;

-- =====================================================
-- 7. ATUALIZAR CONSTRAINT DE STATUS
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fast_orders_status_check') THEN
    ALTER TABLE fast_orders DROP CONSTRAINT fast_orders_status_check;
  END IF;
END $$;

ALTER TABLE fast_orders ADD CONSTRAINT fast_orders_status_check 
  CHECK (status IN ('pending', 'accepted', 'preparing', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'));

-- =====================================================
-- 8. CRIAR ÍNDICES IMPORTANTES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fast_orders_order_code ON fast_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_fast_orders_order_sequence ON fast_orders(order_sequence);
CREATE INDEX IF NOT EXISTS idx_fast_orders_payment_status ON fast_orders(payment_status);

-- =====================================================
-- ✅ PRONTO! Execute este SQL para garantir que tudo está correto
-- =====================================================
SELECT '✅ Script de correção executado com sucesso!' as resultado;
