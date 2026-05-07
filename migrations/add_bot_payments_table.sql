-- Tabela para registrar pagamentos via cartão feitos pelo robô do ManyChat
-- Isso permite rastrear pagamentos do robô mesmo sem salvar o pedido completo em fast_orders

CREATE TABLE IF NOT EXISTS fast_bot_payments (
    id BIGSERIAL PRIMARY KEY,
    stripe_session_id TEXT UNIQUE NOT NULL,
    stripe_payment_intent_id TEXT,
    amount NUMERIC(10,2) NOT NULL,
    customer_name TEXT,
    source TEXT DEFAULT 'manychat_bot',
    payment_status TEXT DEFAULT 'pending', -- pending, succeeded, failed, refunded
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca rápida por session_id
CREATE INDEX IF NOT EXISTS idx_bot_payments_session_id ON fast_bot_payments(stripe_session_id);

-- Índice para busca por status
CREATE INDEX IF NOT EXISTS idx_bot_payments_status ON fast_bot_payments(payment_status);

-- Índice para busca por data
CREATE INDEX IF NOT EXISTS idx_bot_payments_created_at ON fast_bot_payments(created_at);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_bot_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bot_payments_updated_at
BEFORE UPDATE ON fast_bot_payments
FOR EACH ROW
EXECUTE FUNCTION update_bot_payments_updated_at();
