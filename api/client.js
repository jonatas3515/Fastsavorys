/**
 * API: /api/client
 * Endpoint unificado para operações de cliente (busca perfil e salva endereço)
 * Usa service_role para bypasaar RLS
 * 
 * GET ?phone=XXXXX - busca perfil do cliente
 * POST { action: 'save-address', phone, order_code, address } - salva endereço
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase Admin Client (service role - bypassa RLS)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// Janela de tempo para permitir alteração de endereço (30 minutos)
const ORDER_WINDOW_MINUTES = 30;

// Rate limiting simples
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    
    if (!record || (now - record.timestamp) > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { timestamp: now, count: 1 });
        return true;
    }
    
    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }
    
    record.count++;
    return true;
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
        return digits.slice(2);
    }
    return digits;
}

function phonesMatch(phone1, phone2) {
    const p1 = normalizePhone(phone1);
    const p2 = normalizePhone(phone2);
    
    if (p1 === p2) return true;
    
    if (p1.length >= 8 && p2.length >= 8) {
        return p1.slice(-8) === p2.slice(-8);
    }
    
    return false;
}

// ==========================================
// GET: Buscar perfil do cliente
// ==========================================
async function handleGetProfile(phone, res) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 11) {
        return res.status(400).json({ success: false, error: 'Telefone inválido' });
    }

    const { data: client, error } = await supabaseAdmin
        .from('fast_clients')
        .select('id, name, phone, birthdate, addresses')
        .eq('phone', normalizedPhone)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('[client] Erro Supabase:', error);
        return res.status(500).json({ success: false, error: 'Erro ao buscar cliente' });
    }

    if (!client) {
        return res.status(200).json({ success: true, found: false, client: null });
    }

    return res.status(200).json({
        success: true,
        found: true,
        client: {
            name: client.name || '',
            phone: client.phone,
            birthdate: client.birthdate || null,
            addresses: client.addresses || []
        }
    });
}

// ==========================================
// POST: Salvar endereço do cliente
// ==========================================
async function handleSaveAddress(body, res) {
    const { phone, order_code, address } = body;

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
        return res.status(400).json({ success: false, error: 'Telefone inválido' });
    }

    if (!order_code) {
        return res.status(400).json({ success: false, error: 'Código do pedido é obrigatório' });
    }

    if (!address || !address.street || !address.number || !address.neighborhood) {
        return res.status(400).json({ success: false, error: 'Endereço incompleto' });
    }

    // Valida pedido
    const { data: order, error: orderError } = await supabaseAdmin
        .from('fast_orders')
        .select('id, client_phone, created_at')
        .eq('order_code', order_code.toUpperCase())
        .single();

    if (orderError || !order) {
        return res.status(403).json({ success: false, error: 'Pedido não encontrado' });
    }

    if (!phonesMatch(order.client_phone, normalizedPhone)) {
        return res.status(403).json({ success: false, error: 'Telefone não corresponde ao pedido' });
    }

    const orderDate = new Date(order.created_at);
    const now = new Date();
    const diffMinutes = (now - orderDate) / (1000 * 60);

    if (diffMinutes > ORDER_WINDOW_MINUTES) {
        return res.status(403).json({ 
            success: false, 
            error: `Alteração só permitida até ${ORDER_WINDOW_MINUTES} min após o pedido` 
        });
    }

    // Busca cliente
    let { data: client, error: clientError } = await supabaseAdmin
        .from('fast_clients')
        .select('id, name, phone, addresses')
        .eq('phone', normalizedPhone)
        .single();

    if (clientError && clientError.code !== 'PGRST116') {
        return res.status(500).json({ success: false, error: 'Erro ao buscar cliente' });
    }

    const newAddress = {
        id: Date.now(),
        street: address.street.trim(),
        number: address.number.trim(),
        neighborhood: address.neighborhood.trim(),
        reference: (address.reference || '').trim(),
        label: address.label || 'Casa',
        created_at: new Date().toISOString()
    };

    if (client) {
        let addresses = client.addresses || [];
        
        const existingIndex = addresses.findIndex(a => 
            a.street?.toLowerCase() === newAddress.street.toLowerCase() &&
            a.number === newAddress.number &&
            a.neighborhood?.toLowerCase() === newAddress.neighborhood.toLowerCase()
        );

        if (existingIndex >= 0) {
            addresses[existingIndex] = { ...addresses[existingIndex], ...newAddress };
        } else {
            addresses.push(newAddress);
        }

        const { error: updateError } = await supabaseAdmin
            .from('fast_clients')
            .update({ addresses, updated_at: new Date().toISOString() })
            .eq('id', client.id);

        if (updateError) {
            return res.status(500).json({ success: false, error: 'Erro ao salvar endereço' });
        }

        return res.status(200).json({
            success: true,
            message: existingIndex >= 0 ? 'Endereço atualizado' : 'Endereço adicionado',
            address: newAddress
        });
    } else {
        const { error: insertError } = await supabaseAdmin
            .from('fast_clients')
            .insert({
                phone: normalizedPhone,
                name: '',
                addresses: [newAddress],
                created_at: new Date().toISOString()
            });

        if (insertError) {
            return res.status(500).json({ success: false, error: 'Erro ao criar cliente' });
        }

        return res.status(200).json({
            success: true,
            message: 'Cliente e endereço criados',
            address: newAddress
        });
    }
}

// ==========================================
// MAIN HANDLER
// ==========================================
module.exports = async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }

    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    try {
        const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({ success: false, error: 'Muitas requisições' });
        }

        // GET: buscar perfil
        if (req.method === 'GET') {
            const phone = req.query.phone;
            return handleGetProfile(phone, res);
        }

        // POST: ações
        if (req.method === 'POST') {
            const { action, phone } = req.body || {};

            if (action === 'save-address') {
                return handleSaveAddress(req.body, res);
            }

            // Default: buscar perfil via POST
            return handleGetProfile(phone, res);
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });

    } catch (err) {
        console.error('[client] Erro:', err);
        return res.status(500).json({ success: false, error: 'Erro interno' });
    }
};
