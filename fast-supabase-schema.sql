-- ==============================================
-- SCHEMA COMPLETO PARA FAST SAVORY'S
-- Execute este SQL COMPLETO no Supabase SQL Editor
-- Este script é SEGURO para rodar múltiplas vezes
-- (usa IF NOT EXISTS, ON CONFLICT DO NOTHING, DROP IF EXISTS)
-- ==============================================

-- ==============================================
-- 1. TABELAS PRINCIPAIS
-- ==============================================

-- 1. TABELA DE PRODUTOS
CREATE TABLE IF NOT EXISTS fast_products (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('salgados', 'mini', 'kits', 'bolos', 'adicionais', 'bebidas')),
    image TEXT,  -- URL da imagem no Supabase Storage ou base64
    emoji TEXT DEFAULT '🥟',
    visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABELA DE CLIENTES
CREATE TABLE IF NOT EXISTS fast_clients (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    birthdate TEXT,
    email TEXT,
    address TEXT,
    addresses JSONB DEFAULT '[]',
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABELA DE PROMOÇÕES
CREATE TABLE IF NOT EXISTS fast_promotions (
    id BIGINT PRIMARY KEY,
    product_id BIGINT REFERENCES fast_products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABELA DE TAXAS DE ENTREGA
CREATE TABLE IF NOT EXISTS fast_delivery_fees (
    id SERIAL PRIMARY KEY,
    neighborhood TEXT UNIQUE NOT NULL,
    fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABELA DE USUÁRIOS ADMIN
CREATE TABLE IF NOT EXISTS fast_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'gerente', 'garcom', 'caixa')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS fast_orders (
    id BIGINT PRIMARY KEY,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    items JSONB NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    card_fee DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    payment_method TEXT NOT NULL,
    delivery_type TEXT NOT NULL CHECK (delivery_type IN ('entrega', 'retirada')),
    address JSONB,
    scheduled_date DATE,
    coupon_code TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'delivered', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABELA DE CUPONS DE DESCONTO
CREATE TABLE IF NOT EXISTS fast_coupons (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL,
    min_order DECIMAL(10,2) DEFAULT 0,
    max_discount_value DECIMAL(10,2) DEFAULT NULL,  -- Limite máximo de desconto total
    max_usage_count INTEGER DEFAULT NULL,           -- Limite de utilizações
    current_usage_count INTEGER DEFAULT 0,          -- Utilizações atuais
    current_discount_total DECIMAL(10,2) DEFAULT 0, -- Total de descontos aplicados
    expiry_date DATE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABELA DE USO DE CUPONS (histórico)
CREATE TABLE IF NOT EXISTS fast_coupon_usage (
    id SERIAL PRIMARY KEY,
    coupon_id INTEGER REFERENCES fast_coupons(id) ON DELETE CASCADE,
    coupon_code TEXT NOT NULL,
    order_id BIGINT,
    client_phone TEXT,
    discount_applied DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TABELA DE STATUS DA LOJA (aberta/fechada)
CREATE TABLE IF NOT EXISTS fast_store_status (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    closed_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. TABELA DE USO DE DESCONTO DE ANIVERSÁRIO (uma vez por ano)
CREATE TABLE IF NOT EXISTS fast_birthday_discount_usage (
    id SERIAL PRIMARY KEY,
    client_phone TEXT NOT NULL,
    usage_year INTEGER NOT NULL,
    discount_applied DECIMAL(10,2) NOT NULL,
    order_id BIGINT,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_phone, usage_year)  -- Garante apenas 1 uso por ano por telefone
);

-- 11. TABELA DE CONFIGURAÇÕES DA LOJA
CREATE TABLE IF NOT EXISTS fast_store_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    card_fee_1x DECIMAL(5,2) DEFAULT 5.00,          -- Taxa cartão 1x (%)
    card_fee_2x DECIMAL(5,2) DEFAULT 10.00,         -- Taxa cartão 2x (%)
    delivery_enabled BOOLEAN DEFAULT true,          -- Delivery habilitado
    delivery_disabled_reason TEXT DEFAULT '',       -- Motivo quando delivery desativado
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_config_row CHECK (id = 1)     -- Garante apenas 1 registro
);

-- 12. TABELA DE HORÁRIOS DE FUNCIONAMENTO
CREATE TABLE IF NOT EXISTS fast_business_hours (
    id SERIAL PRIMARY KEY,
    day_of_week INTEGER NOT NULL,                   -- 0=Dom, 1=Seg, ..., 6=Sáb
    day_name TEXT NOT NULL,                         -- Nome do dia
    is_open BOOLEAN DEFAULT true,                   -- Se abre neste dia
    open_time TEXT DEFAULT '14:00',                 -- Hora abertura (HH:MM)
    close_time TEXT DEFAULT '18:00',                -- Hora fechamento (HH:MM)
    UNIQUE(day_of_week)
);

-- ==============================================
-- 2. ÍNDICES PARA PERFORMANCE
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_fast_products_category ON fast_products(category);
CREATE INDEX IF NOT EXISTS idx_fast_products_visible ON fast_products(visible);
CREATE INDEX IF NOT EXISTS idx_fast_clients_phone ON fast_clients(phone);
CREATE INDEX IF NOT EXISTS idx_fast_promotions_product ON fast_promotions(product_id);
CREATE INDEX IF NOT EXISTS idx_fast_orders_status ON fast_orders(status);
CREATE INDEX IF NOT EXISTS idx_fast_orders_date ON fast_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_fast_orders_client ON fast_orders(client_phone);
CREATE INDEX IF NOT EXISTS idx_fast_coupons_code ON fast_coupons(code);
CREATE INDEX IF NOT EXISTS idx_fast_coupons_active ON fast_coupons(active);
CREATE INDEX IF NOT EXISTS idx_fast_coupon_usage_coupon ON fast_coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_fast_store_status_date ON fast_store_status(date);

-- ==============================================
-- 3. TRIGGER PARA UPDATED_AT AUTOMÁTICO
-- ==============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar triggers em todas as tabelas que têm updated_at
DROP TRIGGER IF EXISTS update_fast_products_updated_at ON fast_products;
CREATE TRIGGER update_fast_products_updated_at 
    BEFORE UPDATE ON fast_products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_clients_updated_at ON fast_clients;
CREATE TRIGGER update_fast_clients_updated_at 
    BEFORE UPDATE ON fast_clients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_promotions_updated_at ON fast_promotions;
CREATE TRIGGER update_fast_promotions_updated_at 
    BEFORE UPDATE ON fast_promotions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_delivery_fees_updated_at ON fast_delivery_fees;
CREATE TRIGGER update_fast_delivery_fees_updated_at 
    BEFORE UPDATE ON fast_delivery_fees 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_users_updated_at ON fast_users;
CREATE TRIGGER update_fast_users_updated_at 
    BEFORE UPDATE ON fast_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_orders_updated_at ON fast_orders;
CREATE TRIGGER update_fast_orders_updated_at 
    BEFORE UPDATE ON fast_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fast_coupons_updated_at ON fast_coupons;
CREATE TRIGGER update_fast_coupons_updated_at 
    BEFORE UPDATE ON fast_coupons 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 4. HABILITAR ROW LEVEL SECURITY
-- ==============================================
ALTER TABLE fast_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_delivery_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_store_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_birthday_discount_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fast_business_hours ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- 5. POLÍTICAS RLS (Remover antes de criar)
-- ==============================================
DROP POLICY IF EXISTS "Allow full access to fast_products" ON fast_products;
DROP POLICY IF EXISTS "Allow full access to fast_clients" ON fast_clients;
DROP POLICY IF EXISTS "Allow full access to fast_promotions" ON fast_promotions;
DROP POLICY IF EXISTS "Allow full access to fast_delivery_fees" ON fast_delivery_fees;
DROP POLICY IF EXISTS "Allow full access to fast_users" ON fast_users;
DROP POLICY IF EXISTS "Allow full access to fast_orders" ON fast_orders;
DROP POLICY IF EXISTS "Allow full access to fast_coupons" ON fast_coupons;
DROP POLICY IF EXISTS "Allow full access to fast_coupon_usage" ON fast_coupon_usage;
DROP POLICY IF EXISTS "Allow all access to fast_store_status" ON fast_store_status;
DROP POLICY IF EXISTS "Allow all access to fast_birthday_discount_usage" ON fast_birthday_discount_usage;
DROP POLICY IF EXISTS "Allow all access to fast_store_config" ON fast_store_config;
DROP POLICY IF EXISTS "Allow all access to fast_business_hours" ON fast_business_hours;

-- Criar políticas de acesso público (desenvolvimento)
-- NOTA: Em produção, substitua por políticas mais restritivas!
CREATE POLICY "Allow full access to fast_products" ON fast_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_clients" ON fast_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_promotions" ON fast_promotions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_delivery_fees" ON fast_delivery_fees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_users" ON fast_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_orders" ON fast_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_coupons" ON fast_coupons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to fast_coupon_usage" ON fast_coupon_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to fast_store_status" ON fast_store_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to fast_birthday_discount_usage" ON fast_birthday_discount_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to fast_store_config" ON fast_store_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to fast_business_hours" ON fast_business_hours FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 6. DADOS INICIAIS
-- ==============================================

-- Usuário admin padrão
INSERT INTO fast_users (username, password, role) 
VALUES ('fast', 'fast123', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Taxas de entrega padrão
INSERT INTO fast_delivery_fees (neighborhood, fee) VALUES 
('novo prado', 0), 
('sao domingos', 0), 
('cristo redentor', 0), 
('baixa fria', 0),
('varzea alegre', 2), 
('sao bernardo', 2), 
('santo antonio', 2), 
('canaa', 2), 
('centro', 2), 
('fatima', 2), 
('31 de marco', 2), 
('bnh', 2), 
('vale do jucurucu', 2), 
('jaqueira', 2), 
('cidade baixa', 2),
('marotinho', 3), 
('corujao', 3), 
('primavera', 3), 
('bela vista', 3), 
('vista bela', 3), 
('liberdade', 3), 
('urbis 2', 3), 
('urbis 3', 3), 
('italage', 3),
('portal do monte', 4), 
('alvorada', 4), 
('monte pescoco', 4), 
('tarcizao', 4), 
('vista da pedra', 4), 
('village das pedras', 4), 
('itatiaia', 4), 
('furlan', 4)
ON CONFLICT (neighborhood) DO NOTHING;

-- Configuração inicial da loja
INSERT INTO fast_store_config (id, card_fee_1x, card_fee_2x, delivery_enabled, delivery_disabled_reason)
VALUES (1, 5.00, 10.00, true, '')
ON CONFLICT (id) DO NOTHING;

-- Horários de funcionamento padrão
INSERT INTO fast_business_hours (day_of_week, day_name, is_open, open_time, close_time) VALUES
    (0, 'Domingo', false, '14:00', '18:00'),
    (1, 'Segunda', true, '14:00', '18:00'),
    (2, 'Terça', true, '14:00', '18:00'),
    (3, 'Quarta', true, '14:00', '18:00'),
    (4, 'Quinta', true, '14:00', '18:00'),
    (5, 'Sexta', true, '14:00', '19:30'),
    (6, 'Sábado', true, '14:00', '18:00')
ON CONFLICT (day_of_week) DO NOTHING;

-- ==============================================
-- 7. STORAGE BUCKET (opcional)
-- ==============================================
-- Para criar bucket de imagens via SQL:
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('fast-images', 'fast-images', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- Ou crie manualmente:
-- 1. Vá em Storage no painel Supabase
-- 2. Clique em "New bucket"
-- 3. Nome: fast-images
-- 4. Marque "Public bucket" ✓
-- 5. Clique em "Create bucket"

-- ==============================================
-- ✅ PRONTO! Execute este SQL inteiro no Supabase.
-- Ele é seguro para rodar múltiplas vezes.
-- ==============================================
