-- ============================================================
-- SCRIPT SQL - Painel de Gerenciamento de Regras
-- Execute este script no Supabase SQL Editor
-- Data: 21/01/2026
-- ============================================================

-- Adicionar novas colunas à tabela fast_store_config
ALTER TABLE fast_store_config 
ADD COLUMN IF NOT EXISTS min_order_delivery DECIMAL(10,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS min_order_pickup DECIMAL(10,2) DEFAULT 8.00,
ADD COLUMN IF NOT EXISTS min_order_pickup_offhours DECIMAL(10,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS same_day_orders_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS same_day_min_value DECIMAL(10,2) DEFAULT 15.00,
ADD COLUMN IF NOT EXISTS same_day_pickup_start TIME DEFAULT '12:00',
ADD COLUMN IF NOT EXISTS same_day_pickup_end TIME DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS order_window_start TIME DEFAULT '07:00',
ADD COLUMN IF NOT EXISTS order_window_end TIME DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS morning_rule_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS morning_rule_end_time TIME DEFAULT '12:00',
ADD COLUMN IF NOT EXISTS morning_rule_min_value DECIMAL(10,2) DEFAULT 25.00;

-- Criar tabela de feriados/datas bloqueadas (se não existir)
CREATE TABLE IF NOT EXISTS fast_blocked_dates (
  id SERIAL PRIMARY KEY,
  blocked_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- Criar índice para busca rápida de datas bloqueadas
CREATE INDEX IF NOT EXISTS idx_blocked_dates ON fast_blocked_dates(blocked_date);

-- Atualizar registro existente com valores padrão (se já existir)
UPDATE fast_store_config SET
  min_order_delivery = COALESCE(min_order_delivery, 15.00),
  min_order_pickup = COALESCE(min_order_pickup, 8.00),
  min_order_pickup_offhours = COALESCE(min_order_pickup_offhours, 15.00),
  same_day_orders_enabled = COALESCE(same_day_orders_enabled, TRUE),
  same_day_min_value = COALESCE(same_day_min_value, 15.00),
  same_day_pickup_start = COALESCE(same_day_pickup_start, '12:00'),
  same_day_pickup_end = COALESCE(same_day_pickup_end, '18:00'),
  order_window_start = COALESCE(order_window_start, '07:00'),
  order_window_end = COALESCE(order_window_end, '18:00'),
  morning_rule_enabled = COALESCE(morning_rule_enabled, TRUE),
  morning_rule_end_time = COALESCE(morning_rule_end_time, '12:00'),
  morning_rule_min_value = COALESCE(morning_rule_min_value, 25.00)
WHERE id = 1;

-- Habilitar RLS para a nova tabela
ALTER TABLE fast_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Dropar políticas existentes (se houver) e recriar
DROP POLICY IF EXISTS "Allow public read blocked dates" ON fast_blocked_dates;
DROP POLICY IF EXISTS "Allow authenticated write blocked dates" ON fast_blocked_dates;

-- Política de leitura pública para datas bloqueadas
CREATE POLICY "Allow public read blocked dates" ON fast_blocked_dates
  FOR SELECT USING (true);

-- Política de escrita para usuários autenticados
CREATE POLICY "Allow authenticated write blocked dates" ON fast_blocked_dates
  FOR ALL USING (true);

-- ============================================================
-- VERIFICAÇÃO: Execute esta query para confirmar as colunas
-- ============================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'fast_store_config';
