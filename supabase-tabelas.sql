-- Tabelas necessárias para o FastSavory's
-- Execute este SQL no painel SQL do seu projeto Supabase

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    birthdate TEXT,
    email TEXT,
    addresses JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Produtos (antiga - UUID)
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,
    visible BOOLEAN DEFAULT true,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================
-- TABELA FAST_PRODUCTS (para o app FastSavory's)
-- ==============================================
-- Esta tabela usa BIGINT como ID para compatibilidade com Date.now() do JavaScript

CREATE TABLE IF NOT EXISTS fast_products (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,
    image TEXT,  -- URL da imagem no Supabase Storage ou base64
    emoji TEXT DEFAULT '🥟',
    visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Política RLS para fast_products
ALTER TABLE fast_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to fast_products" ON fast_products FOR ALL USING (true);

-- Índices para fast_products
CREATE INDEX IF NOT EXISTS idx_fast_products_category ON fast_products(category);
CREATE INDEX IF NOT EXISTS idx_fast_products_visible ON fast_products(visible);

-- Trigger para updated_at
CREATE TRIGGER update_fast_products_updated_at 
    BEFORE UPDATE ON fast_products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- STORAGE BUCKET para imagens (executar no console)
-- ==============================================
-- Execute no SQL Editor do Supabase:
-- 
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('fast-images', 'fast-images', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- Ou crie manualmente no painel Storage do Supabase:
-- 1. Vá em Storage
-- 2. Clique em "New bucket"
-- 3. Nome: fast-images
-- 4. Marque "Public bucket"
-- ==============================================

-- Tabela de Usuários Admin
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'gerente', 'garçom', 'caixa')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Promoções
CREATE TABLE IF NOT EXISTS promotions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    value DECIMAL(10,2) NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Descontos de Clientes
CREATE TABLE IF NOT EXISTS client_discounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_phone TEXT REFERENCES clients(phone) ON DELETE CASCADE,
    discount_percentage DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_phone)
);

-- Tabela de Taxas de Entrega
CREATE TABLE IF NOT EXISTS delivery_fees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    neighborhood TEXT UNIQUE NOT NULL,
    fee DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    items JSONB NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    card_fee DECIMAL(10,2) DEFAULT 0,
    payment_method TEXT NOT NULL,
    delivery_type TEXT NOT NULL CHECK (delivery_type IN ('entrega', 'retirada')),
    address JSONB,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scheduled_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'delivered', 'cancelled')),
    whatsapp_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_visible ON products(visible);
CREATE INDEX IF NOT EXISTS idx_promotions_product_id ON promotions(product_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(active);
CREATE INDEX IF NOT EXISTS idx_orders_client_phone ON orders(client_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger em todas as tabelas
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_discounts_updated_at BEFORE UPDATE ON client_discounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_fees_updated_at BEFORE UPDATE ON delivery_fees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir dados iniciais
INSERT INTO users (username, password, role) VALUES 
('fast', 'fast123', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Inserir taxas de entrega padrão
INSERT INTO delivery_fees (neighborhood, fee) VALUES 
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

-- Políticas de segurança (RLS - Row Level Security)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (ajuste conforme necessário)
-- Para desenvolvimento, permitir acesso total
CREATE POLICY "Allow full access to clients" ON clients FOR ALL USING (true);
CREATE POLICY "Allow full access to products" ON products FOR ALL USING (true);
CREATE POLICY "Allow full access to users" ON users FOR ALL USING (true);
CREATE POLICY "Allow full access to promotions" ON promotions FOR ALL USING (true);
CREATE POLICY "Allow full access to client_discounts" ON client_discounts FOR ALL USING (true);
CREATE POLICY "Allow full access to delivery_fees" ON delivery_fees FOR ALL USING (true);
CREATE POLICY "Allow full access to orders" ON orders FOR ALL USING (true);
