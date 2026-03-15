/**
 * ManyChat Unified API Endpoint
 * POST /api/manychat-api
 * 
 * Helper for handling various ManyChat integrations in a single function to save Vercel slots.
 * 
 * Query Params:
 * - type=notify-new-order  (Replaces notify-manychat.js)
 * - type=notify-client     (Replaces manychat-notify-client.js)
 * - type=order-action      (Replaces manychat-order-action.js - Default if no type)
 */

const { createClient } = require('@supabase/supabase-js');
const { notifyNewOrder, isConfigured } = require('./_lib/manychat');

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

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
    console.error('[manychat-api] Supabase init error:', err.message);
}

// ==========================================
// HELPERS
// ==========================================

function extractOrderCode(message) {
    if (!message) return null;
    const match = message.match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
}

function generateWhatsAppLink(phone, message) {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 11) {
        formattedPhone = '55' + formattedPhone;
    }
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message || '')}`;
}

async function manychatRequest(endpoint, body) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey) return { success: false, error: 'API key not configured' };

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) return { success: false, error: data?.message || `HTTP ${response.status}` };
        return { success: true, data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function updateCustomField(userId, fieldId, value) {
    if (!userId || !fieldId) return { success: false, error: 'Missing userId or fieldId' };
    return await manychatRequest('/subscriber/setCustomFields', {
        subscriber_id: userId,
        fields: [{ field_id: parseInt(fieldId, 10), field_value: String(value) }]
    });
}

async function sendFlow(userId, flowId) {
    if (!userId || !flowId) return { success: false, error: 'Missing userId or flowId' };
    return await manychatRequest('/sending/sendFlow', {
        subscriber_id: userId,
        flow_ns: flowId
    });
}

// ==========================================
// HANDLER: Notify New Order (Owner)
// ==========================================
async function handleNotifyNewOrder(req, res) {
    if (!isConfigured()) {
        console.log('[manychat-api:notify-new-order] ManyChat not configured');
        return res.status(200).json({ success: false, error: 'ManyChat not configured' });
    }

    const { order } = req.body || {};
    if (!order) {
        return res.status(200).json({ success: false, error: 'No order data provided' });
    }

    console.log(`[manychat-api:notify-new-order] Processing order ${order.order_code || order.id}`);
    const result = await notifyNewOrder(order);
    return res.status(200).json(result);
}

// ==========================================
// HANDLER: Notify Client (Manual)
// ==========================================
async function handleNotifyClient(req, res) {
    if (!supabaseAdmin) return res.status(200).json({ success: false, error: 'Database not configured' });

    const { mensagem_com_pedido, ID_fluxo_enviar_ao_cliente } = req.body || {};

    if (!mensagem_com_pedido || !ID_fluxo_enviar_ao_cliente) {
        return res.status(200).json({ success: false, error: 'Missing required fields' });
    }

    const orderCode = extractOrderCode(mensagem_com_pedido);
    if (!orderCode) {
        return res.status(200).json({ success: false, error: 'Could not extract order code' });
    }

    console.log(`[manychat-api:notify-client] Extracted: ${orderCode}`);

    const { data: orders, error } = await supabaseAdmin
        .from('fast_orders')
        .select('id, client_phone, client_name, manychat_id')
        .eq('order_code', orderCode)
        .limit(1);

    if (error || !orders?.[0]) {
        return res.status(200).json({ success: false, error: `Order ${orderCode} not found` });
    }

    const order = orders[0];
    let clientManychatId = order.manychat_id;

    if (!clientManychatId && order.client_phone) {
        const { data: clients } = await supabaseAdmin
            .from('fast_clients')
            .select('manychat_id')
            .eq('phone', order.client_phone)
            .limit(1);
        clientManychatId = clients?.[0]?.manychat_id;
    }

    if (!clientManychatId) {
        return res.status(200).json({ success: false, error: 'Client has no ManyChat ID', order_code: orderCode });
    }

    const flowResult = await sendFlow(clientManychatId, ID_fluxo_enviar_ao_cliente);

    return res.status(200).json({
        success: flowResult.success,
        order_code: orderCode,
        client_manychat_id: clientManychatId,
        flow_sent: flowResult.success,
        error: flowResult.error
    });
}

// ==========================================
// HANDLER: Order Action (Accept/Reject)
// ==========================================
async function handleOrderAction(req, res) {
    const { action } = req.body || {};
    let detectedAction = action;

    if (!detectedAction) {
        if (req.body.mensagem_com_recusa_do_pedido || req.body.id_fluxo_para_envio_pedido_recusado) {
            detectedAction = 'reject';
        } else if (req.body.mensagem_com_pedido) {
            detectedAction = 'accept';
        }
    }

    console.log(`[manychat-api:order-action] Action: ${detectedAction}`);

    if (detectedAction === 'accept') {
        return _handleAccept(req.body, res);
    } else if (detectedAction === 'reject') {
        return _handleReject(req.body, res);
    }

    return res.status(200).json({ success: false, error: 'Unknown action' });
}

async function _handleAccept(body, res) {
    // Reusing logic from manychat-order-action.js
    const { mensagem_com_pedido } = body;
    const orderCode = extractOrderCode(mensagem_com_pedido);
    if (!orderCode) return res.status(200).json({ success: false, error: 'Could not extract order code' });

    const collaboratorUserId = process.env.MANYCHAT_USER_ID_JESSICA;
    const orderNumberFieldId = process.env.MANYCHAT_FIELD_ID_ORDER_NUMBER;
    const acceptedFlowId = process.env.MANYCHAT_FLOW_ID_ACEITOU_PEDIDO;

    let fieldUpdated = false;
    if (collaboratorUserId && orderNumberFieldId) {
        const r = await updateCustomField(collaboratorUserId, orderNumberFieldId, orderCode);
        fieldUpdated = r.success;
    }

    let flowSent = false;
    if (collaboratorUserId && acceptedFlowId) {
        const r = await sendFlow(collaboratorUserId, acceptedFlowId);
        flowSent = r.success;
    }

    // Update DB
    let order = null;
    let clientManychatId = null;
    let clientPhone = null;

    if (supabaseAdmin) {
        const { data: orders } = await supabaseAdmin
            .from('fast_orders')
            .select('*')
            .eq('order_code', orderCode)
            .limit(1);

        order = orders?.[0];
        if (order) {
            clientManychatId = order.manychat_id;
            clientPhone = order.client_phone;

            await supabaseAdmin.from('fast_orders')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('order_code', orderCode);

            if (!clientManychatId && clientPhone) {
                const { data: c } = await supabaseAdmin.from('fast_clients').select('manychat_id').eq('phone', clientPhone).limit(1);
                clientManychatId = c?.[0]?.manychat_id;
            }
        }
    }

    // Notify Client
    const flowIdClient = body.id_fluxo_para_envio_pedido_aceito || body.ID_fluxo_enviar_ao_cliente;
    let clientFlowSent = false;
    if (clientManychatId && flowIdClient) {
        const r = await sendFlow(clientManychatId, flowIdClient);
        clientFlowSent = r.success;
    }

    // PrintNode
    let printResult = { success: false, skipped: true };
    const printNodeKey = process.env.PRINTNODE_API_KEY || 't2W6QKkr-yB56svr5ZHod5Kzvp0RTROOSE8bcbrVzDg';
    const printerId = process.env.PRINTNODE_PRINTER_ID || '75185228';

    if (printNodeKey && printerId && order) {
        try {
            const PrintNodeService = require('../api_lib/printnode-service');
            const printer = new PrintNodeService(printNodeKey);
            const receiptText = printer.formatReceipt(order);
            const result = await printer.print(printerId, receiptText);
            printResult = { ...result, skipped: false };
        } catch (e) {
            printResult = { success: false, error: e.message };
        }
    }

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        field_updated: fieldUpdated,
        flow_sent: flowSent,
        client_flow_sent: clientFlowSent,
        print_result: printResult
    });
}

async function _handleReject(body, res) {
    // Reusing logic from manychat-order-action.js
    const { mensagem_com_recusa_do_pedido, id_numero_pedido, id_fluxo_para_envio_pedido_recusado } = body;
    const orderCode = extractOrderCode(id_numero_pedido);

    if (!orderCode) return res.status(200).json({ success: false, error: 'Could not extract order code' });
    if (!id_fluxo_para_envio_pedido_recusado) return res.status(200).json({ success: false, error: 'Missing flow ID' });

    if (!supabaseAdmin) return res.status(200).json({ success: false, error: 'Database not configured' });

    const { data: orders } = await supabaseAdmin.from('fast_orders').select('*').eq('order_code', orderCode).limit(1);
    const order = orders?.[0];
    if (!order) return res.status(200).json({ success: false, error: 'Order not found' });

    let clientManychatId = order.manychat_id;
    if (!clientManychatId && order.client_phone) {
        const { data: c } = await supabaseAdmin.from('fast_clients').select('manychat_id').eq('phone', order.client_phone).limit(1);
        clientManychatId = c?.[0]?.manychat_id;
    }

    if (!clientManychatId) return res.status(200).json({ success: false, error: 'Client has no ManyChat ID' });

    const rejectionFieldId = process.env.MANYCHAT_FIELD_ID_MSG_PEDIDO_RECUSADO;
    if (rejectionFieldId && mensagem_com_recusa_do_pedido) {
        await updateCustomField(clientManychatId, rejectionFieldId, mensagem_com_recusa_do_pedido);
    }

    const flowResult = await sendFlow(clientManychatId, id_fluxo_para_envio_pedido_recusado);

    await supabaseAdmin.from('fast_orders').update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: mensagem_com_recusa_do_pedido
    }).eq('order_code', orderCode);

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        flow_sent: flowResult.success
    });
}

// ==========================================
// HANDLER: Gemini AI (ManyChat Webhook)
// ==========================================
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const GEMINI_SYSTEM_PROMPT = `Você é a atendente virtual da FastSavory's, uma lanchonete de delivery localizada em Itamaraju-BA.

REGRAS DE ATENDIMENTO:
1. Responda SEMPRE em português do Brasil, tom educado e simpático, como atendente de lanchonete de bairro.
2. Seja breve: no máximo 3 a 4 frases por resposta.
3. Quando o cliente pedir algo:
   - Cumprimente pelo nome se disponível.
   - Resuma o que ele pediu.
   - Sugira salgados, combos ou bebidas complementares, se fizer sentido.
   - Pergunte se deseja finalizar o pedido e peça: nome completo, endereço de entrega e forma de pagamento.
4. HORÁRIO DE FUNCIONAMENTO: 17h às 23h (horário de Brasília).
   - Se a hora atual estiver FORA desse horário, responda educadamente que estamos fechados, informe o horário de funcionamento e convide o cliente a voltar depois.
5. Nunca invente preços, itens do cardápio ou informações que você não tenha certeza. Se não souber, diga que vai confirmar com a equipe.
6. Se o cliente fizer uma pergunta que não seja sobre a lanchonete, redirecione gentilmente para o atendimento de pedidos.`;

async function handleGemini(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[manychat-api:gemini] GEMINI_API_KEY não configurada');
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { message, name } = req.body || {};
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Campo "message" vazio ou ausente' });
    }

    // Hora atual em Itamaraju-BA (UTC-3) para a IA saber se está dentro do horário
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', weekday: 'long' });
    const userMessage = `[Hora atual: ${now}]` + (name ? ` Cliente "${name}" disse: ${message}` : ` ${message}`);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        })
    });

    if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error('[manychat-api:gemini] Gemini API error:', geminiRes.status, errBody);
        return res.status(502).json({ error: 'Gemini API error', details: errBody });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'Desculpe, não consegui gerar uma resposta agora. Um atendente vai te ajudar!';

    return res.status(200).json({
        version: 'v2',
        content: {
            messages: [{ type: 'text', text: reply }],
            actions: [],
            quick_replies: []
        }
    });
}

// ==========================================
// MAIN EXPORT
// ==========================================
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).json({ success: false, error: 'Use POST' });

    const type = req.query.type;

    try {
        if (type === 'notify-new-order') {
            return await handleNotifyNewOrder(req, res);
        } else if (type === 'notify-client') {
            return await handleNotifyClient(req, res);
        } else if (type === 'gemini') {
            return await handleGemini(req, res);
        } else {
            // Default: Order Action (Accept/Reject)
            return await handleOrderAction(req, res);
        }
    } catch (err) {
        console.error('[manychat-api] Unexpected error:', err);
        return res.status(200).json({ success: false, error: 'Internal server error: ' + err.message });
    }
};
