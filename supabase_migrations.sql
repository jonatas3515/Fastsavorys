-- =====================================================
-- FAST SAVORY'S - SUPABASE MIGRATIONS
-- Execute estes comandos no SQL Editor do Supabase
-- =====================================================

-- 1. Adicionar colunas faltantes na tabela fast_orders
ALTER TABLE fast_orders 
ADD COLUMN IF NOT EXISTS order_code TEXT,
ADD COLUMN IF NOT EXISTS rating INTEGER,
ADD COLUMN IF NOT EXISTS rating_comment TEXT,
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS courier_id UUID,
ADD COLUMN IF NOT EXISTS courier_name TEXT;

-- 2. Criar tabela de entregadores (fast_couriers)
CREATE TABLE IF NOT EXISTS fast_couriers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE fast_couriers ENABLE ROW LEVEL SECURITY;

-- Política de acesso público (ajuste conforme necessário)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fast_couriers'
      AND policyname = 'Allow all access to fast_couriers'
  ) THEN
    CREATE POLICY "Allow all access to fast_couriers" ON fast_couriers
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Criar tabela de logs de auditoria (fast_order_logs)
CREATE TABLE IF NOT EXISTS fast_order_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES fast_orders(id),
  order_code TEXT,
  old_status TEXT,
  new_status TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Habilitar RLS
ALTER TABLE fast_order_logs ENABLE ROW LEVEL SECURITY;

-- Política de acesso público
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fast_order_logs'
      AND policyname = 'Allow all access to fast_order_logs'
  ) THEN
    CREATE POLICY "Allow all access to fast_order_logs" ON fast_order_logs
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_fast_orders_archived ON fast_orders(archived);
CREATE INDEX IF NOT EXISTS idx_fast_orders_order_code ON fast_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_fast_order_logs_order_id ON fast_order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_fast_couriers_active ON fast_couriers(active);

-- 5. Atualizar order_code para pedidos existentes que não têm
UPDATE fast_orders 
SET order_code = 'FAST-' || LPAD(id::TEXT, 4, '0')
WHERE order_code IS NULL;

