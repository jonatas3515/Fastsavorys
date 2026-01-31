/**
 * API: /api/client-profile
 * Busca perfil do cliente por telefone (nome + endereços)
 * Usa service_role para bypasaar RLS - seguro porque retorna apenas dados mínimos
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

// Rate limiting simples (em memória - reseta no cold start)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const RATE_LIMIT_MAX = 30; // máx 30 requests por minuto por IP

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
    // Remove prefixo 55 se tiver 13 dígitos
    if (digits.length === 13 && digits.startsWith('55')) {
        return digits.slice(2);
    }
    return digits;
}

module.exports = async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    try {
        // Rate limit check
        const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIP)) {
            return res.status(429).json({
                success: false,
                error: 'Muitas requisições. Aguarde um momento.'
            });
        }

        // Aceita GET ou POST
        let phone;
        if (req.method === 'GET') {
            phone = req.query.phone;
        } else if (req.method === 'POST') {
            phone = req.body?.phone;
        } else {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Validação
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone || normalizedPhone.length < 10 || normalizedPhone.length > 11) {
            return res.status(400).json({
                success: false,
                error: 'Telefone inválido'
            });
        }

        // Busca cliente no Supabase
        const { data: client, error } = await supabaseAdmin
            .from('fast_clients')
            .select('id, name, phone, birthdate, addresses')
            .eq('phone', normalizedPhone)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('[client-profile] Erro Supabase:', error);
            return res.status(500).json({
                success: false,
                error: 'Erro ao buscar cliente'
            });
        }

        if (!client) {
            return res.status(200).json({
                success: true,
                found: false,
                client: null
            });
        }

        // Retorna apenas dados necessários (sem expor tudo)
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

    } catch (err) {
        console.error('[client-profile] Erro:', err);
        return res.status(500).json({
            success: false,
            error: 'Erro interno'
        });
    }
};
