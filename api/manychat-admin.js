/**
 * ManyChat Admin API - Unified Endpoint
 * 
 * GET /api/manychat-admin?action=pedido&codigo=FAST-0000
 * POST /api/manychat-admin?action=atualizar-status
 * 
 * This consolidates multiple ManyChat admin endpoints into one to stay
 * within Vercel's 12 serverless function limit on the Hobby plan.
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
let supabaseAdmin = null;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );
    }
} catch (err) {
    console.error('[manychat-admin] Supabase init error:', err.message);
}

// ManyChat API
const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

// Status mapping from ManyChat to database
const STATUS_MAP = {
    'EM_PREPARO': {
        dbStatus: 'preparing',
        emoji: '🍳',
        message: (codigo, nome) => `🍳 Olá ${nome}! Seu pedido *${codigo}* está em preparo! Avisaremos quando estiver pronto.`
    },
    'SAIU_ENTREGA': {
        dbStatus: 'out_for_delivery',
        emoji: '🚚',
        message: (codigo, nome) => `🚚 Olá ${nome}! Seu pedido *${codigo}* saiu para entrega! Em breve chegará até você.`
    },
    'PRONTO_RETIRAR': {
        dbStatus: 'confirmed',
        emoji: '✅',
        message: (codigo, nome) => `✅ Olá ${nome}! Seu pedido *${codigo}* está pronto para retirada! Aguardamos você na loja.`
    }
};

/**
 * Generates WhatsApp link for sending message
 */
function generateWhatsAppLink(phone, message) {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 11) {
        formattedPhone = '55' + formattedPhone;
    }
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Sends message via ManyChat API
 */
async function sendManyChatMessage(subscriberId, message) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey || !subscriberId) {
        return { success: false, error: 'ManyChat not configured' };
    }

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}/sending/sendContent`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: subscriberId,
                data: {
                    version: 'v2',
                    content: {
                        messages: [{ type: 'text', text: message }]
                    }
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return { success: false, error: data?.message || `HTTP ${response.status}` };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Extracts FAST-XXXX code from any text
 */
function extractOrderCode(text) {
    if (!text) return null;
    const match = String(text).match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
}

/**
 * GET/POST: Fetch order data
 * Accepts:
 *   - GET ?codigo=FAST-0001
 *   - GET ?mensagem=FAST-0001
 *   - POST { mensagem: "FAST-0001" }
 *   - POST { codigo: "FAST-0001" }
 */
async function handleGetPedido(req, res) {
    // Try to get codigo from multiple sources
    let codigo = null;

    // From query string
    if (req.query.codigo) {
        codigo = extractOrderCode(req.query.codigo);
    }
    // From query string "mensagem"
    if (!codigo && req.query.mensagem) {
        codigo = extractOrderCode(req.query.mensagem);
    }
    // From POST body
    if (!codigo && req.body) {
        if (req.body.codigo) {
            codigo = extractOrderCode(req.body.codigo);
        }
        if (!codigo && req.body.mensagem) {
            codigo = extractOrderCode(req.body.mensagem);
        }
        // Also try "message" in English
        if (!codigo && req.body.message) {
            codigo = extractOrderCode(req.body.message);
        }
    }

    console.log('[manychat-admin] Pedido request, extracted codigo:', codigo);

    if (!codigo) {
        return res.status(200).json({
            error: 'Não foi possível encontrar código FAST-XXXX',
            dica: 'Envie uma mensagem contendo FAST-0000 ou similar',
            exemplo_get: '/api/manychat-admin?action=pedido&mensagem=FAST-0001',
            exemplo_post: '{ "mensagem": "FAST-0001" }'
        });
    }

    const { data: orders, error: dbError } = await supabaseAdmin
        .from('fast_orders')
        .select('order_code, client_name, client_phone, status, total, delivery_type, created_at')
        .eq('order_code', codigo)
        .limit(1);

    if (dbError) {
        console.error('[manychat-admin] DB error:', dbError);
        return res.status(200).json({ error: 'Erro ao buscar pedido', codigo });
    }

    const order = orders?.[0];
    if (!order) {
        return res.status(200).json({ error: 'Pedido não encontrado', codigo });
    }

    let phone = (order.client_phone || '').replace(/\D/g, '');
    if (phone.length === 11) phone = '55' + phone;

    console.log('[manychat-admin] Found order:', order.order_code, 'for client:', order.client_name);

    return res.status(200).json({
        codigo: order.order_code,
        cliente_nome: order.client_name || 'Cliente',
        cliente_phone: phone,
        status: order.status,
        total: order.total,
        tipo_entrega: order.delivery_type,
        data_pedido: order.created_at
    });
}

/**
 * POST: Update order status and notify client
 */
async function handleAtualizarStatus(req, res) {
    const { codigo, status, cliente_phone, cliente_nome } = req.body || {};

    console.log('[manychat-admin] POST atualizar-status:', { codigo, status });

    if (!codigo) {
        return res.status(200).json({ ok: false, error: 'Campo "codigo" é obrigatório' });
    }
    if (!status) {
        return res.status(200).json({ ok: false, error: 'Campo "status" é obrigatório' });
    }

    const statusConfig = STATUS_MAP[status.toUpperCase()];
    if (!statusConfig) {
        return res.status(200).json({
            ok: false,
            error: `Status inválido. Use: ${Object.keys(STATUS_MAP).join(', ')}`,
            status_recebido: status
        });
    }

    const orderCode = codigo.trim().toUpperCase();
    if (!/^FAST-\d{4}$/i.test(orderCode)) {
        return res.status(200).json({ ok: false, error: 'Formato inválido. Use FAST-0000', codigo: orderCode });
    }

    // Update order
    const { data: updatedOrders, error: updateError } = await supabaseAdmin
        .from('fast_orders')
        .update({
            status: statusConfig.dbStatus,
            updated_at: new Date().toISOString()
        })
        .eq('order_code', orderCode)
        .select('id, order_code, client_name, client_phone, manychat_id');

    if (updateError) {
        console.error('[manychat-admin] Update error:', updateError);
        return res.status(200).json({ ok: false, error: 'Erro ao atualizar pedido', codigo: orderCode });
    }

    const order = updatedOrders?.[0];
    if (!order) {
        return res.status(200).json({ ok: false, error: 'Pedido não encontrado', codigo: orderCode });
    }

    console.log(`[manychat-admin] Order ${orderCode} updated to: ${statusConfig.dbStatus}`);

    const clientName = cliente_nome || order.client_name || 'Cliente';
    const clientPhone = cliente_phone || order.client_phone;
    const message = statusConfig.message(orderCode, clientName);

    let manychatSent = false;
    if (order.manychat_id) {
        const result = await sendManyChatMessage(order.manychat_id, message);
        manychatSent = result.success;
    }

    const whatsappLink = clientPhone ? generateWhatsAppLink(clientPhone, message) : null;

    // Log the update
    try {
        await supabaseAdmin.from('fast_order_logs').insert({
            order_id: order.id,
            action: 'status_update',
            new_status: statusConfig.dbStatus,
            message: `Status atualizado via ManyChat para ${statusConfig.dbStatus}`,
            created_at: new Date().toISOString()
        });
    } catch (logError) {
        console.warn('[manychat-admin] Log error:', logError.message);
    }

    return res.status(200).json({
        ok: true,
        codigo: orderCode,
        status_atualizado: statusConfig.dbStatus,
        status_emoji: statusConfig.emoji,
        cliente_nome: clientName,
        manychat_enviado: manychatSent,
        whatsapp_link: whatsappLink,
        mensagem: message
    });
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!supabaseAdmin) {
        return res.status(200).json({ error: 'Database not configured' });
    }

    try {
        const action = req.query.action || '';

        // Action "pedido" accepts both GET and POST
        if (action === 'pedido') {
            return handleGetPedido(req, res);
        }

        if (req.method === 'POST' && action === 'atualizar-status') {
            return handleAtualizarStatus(req, res);
        }

        // Help response
        return res.status(200).json({
            error: 'Ação não reconhecida',
            uso: {
                buscar_pedido: 'POST /api/manychat-admin?action=pedido { "mensagem": "FAST-0001" }',
                atualizar_status: 'POST /api/manychat-admin?action=atualizar-status { codigo, status }',
                status_validos: Object.keys(STATUS_MAP)
            }
        });

    } catch (err) {
        console.error('[manychat-admin] Error:', err);
        return res.status(200).json({ error: 'Erro interno: ' + err.message });
    }
};
