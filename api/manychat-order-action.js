/**
 * ManyChat Order Action Endpoint (Unified Accept/Reject)
 * POST /api/manychat-order-action
 * 
 * Handles both accept and reject actions for orders via ManyChat.
 * 
 * For ACCEPT:
 * {
 *   "action": "accept",
 *   "mensagem_com_pedido": "Aceitar FAST-0003"
 * }
 * 
 * For REJECT:
 * {
 *   "action": "reject",
 *   "mensagem_com_recusa_do_pedido": "Desculpe, estamos sem esse ingrediente.",
 *   "id_numero_pedido": "Recusado FAST-0003",
 *   "id_fluxo_para_envio_pedido_recusado": "content20260110222023_240118"
 * }
 */

const { createClient } = require('@supabase/supabase-js');

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
    console.error('[manychat-order-action] Supabase init error:', err.message);
}

function extractOrderCode(message) {
    if (!message) return null;
    const match = message.match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
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
// ACCEPT ORDER
// ==========================================
async function handleAccept(body, res) {
    const { mensagem_com_pedido } = body;
    const orderCode = extractOrderCode(mensagem_com_pedido);

    if (!orderCode) {
        return res.status(200).json({ success: false, error: 'Could not extract order code' });
    }

    console.log(`[manychat-order-action] ACCEPT: ${orderCode}`);

    const collaboratorUserId = process.env.MANYCHAT_USER_ID_JESSICA;
    const orderNumberFieldId = process.env.MANYCHAT_FIELD_ID_ORDER_NUMBER;
    const acceptedFlowId = process.env.MANYCHAT_FLOW_ID_ACEITOU_PEDIDO;

    if (!collaboratorUserId) {
        return res.status(200).json({ success: false, error: 'MANYCHAT_USER_ID_JESSICA not configured' });
    }

    let fieldUpdated = false;
    if (orderNumberFieldId) {
        const fieldResult = await updateCustomField(collaboratorUserId, orderNumberFieldId, orderCode);
        fieldUpdated = fieldResult.success;
    }

    let flowSent = false;
    if (acceptedFlowId) {
        const flowResult = await sendFlow(collaboratorUserId, acceptedFlowId);
        flowSent = flowResult.success;
    }

    if (supabaseAdmin) {
        await supabaseAdmin
            .from('fast_orders')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('order_code', orderCode);
    }

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        field_updated: fieldUpdated,
        flow_sent: flowSent
    });
}

// ==========================================
// REJECT ORDER
// ==========================================
async function handleReject(body, res) {
    const { mensagem_com_recusa_do_pedido, id_numero_pedido, id_fluxo_para_envio_pedido_recusado } = body;

    if (!id_numero_pedido) {
        return res.status(200).json({ success: false, error: 'id_numero_pedido is required' });
    }

    if (!id_fluxo_para_envio_pedido_recusado) {
        return res.status(200).json({ success: false, error: 'id_fluxo_para_envio_pedido_recusado is required' });
    }

    const orderCode = extractOrderCode(id_numero_pedido);
    if (!orderCode) {
        return res.status(200).json({ success: false, error: 'Could not extract order code' });
    }

    console.log(`[manychat-order-action] REJECT: ${orderCode}`);

    if (!supabaseAdmin) {
        return res.status(200).json({ success: false, error: 'Database not configured' });
    }

    const { data: orders, error: orderError } = await supabaseAdmin
        .from('fast_orders')
        .select('id, client_phone, client_name, manychat_id')
        .eq('order_code', orderCode)
        .limit(1);

    if (orderError || !orders?.[0]) {
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
        return res.status(200).json({
            success: false,
            error: `Client has no ManyChat ID`,
            order_code: orderCode
        });
    }

    const rejectionFieldId = process.env.MANYCHAT_FIELD_ID_MSG_PEDIDO_RECUSADO;
    let messageSent = false;

    if (rejectionFieldId && mensagem_com_recusa_do_pedido) {
        const fieldResult = await updateCustomField(clientManychatId, rejectionFieldId, mensagem_com_recusa_do_pedido);
        messageSent = fieldResult.success;
    }

    const flowResult = await sendFlow(clientManychatId, id_fluxo_para_envio_pedido_recusado);
    if (!flowResult.success) {
        return res.status(200).json({
            success: false,
            error: 'Failed to send flow: ' + flowResult.error,
            order_code: orderCode
        });
    }

    await supabaseAdmin
        .from('fast_orders')
        .update({
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            rejection_reason: mensagem_com_recusa_do_pedido || null
        })
        .eq('order_code', orderCode);

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        client_manychat_id: clientManychatId,
        message_sent: messageSent,
        flow_sent: true
    });
}

// ==========================================
// MAIN HANDLER
// ==========================================
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).json({ success: false, error: 'Use POST' });

    try {
        const { action } = req.body || {};

        // Auto-detect action based on body fields if not specified
        let detectedAction = action;
        if (!detectedAction) {
            if (req.body.mensagem_com_recusa_do_pedido || req.body.id_fluxo_para_envio_pedido_recusado) {
                detectedAction = 'reject';
            } else if (req.body.mensagem_com_pedido) {
                detectedAction = 'accept';
            }
        }

        console.log(`[manychat-order-action] Action: ${detectedAction}`);

        if (detectedAction === 'accept') {
            return handleAccept(req.body, res);
        } else if (detectedAction === 'reject') {
            return handleReject(req.body, res);
        } else {
            return res.status(200).json({ success: false, error: 'Unknown action. Use accept or reject.' });
        }

    } catch (err) {
        console.error('[manychat-order-action] Error:', err);
        return res.status(200).json({ success: false, error: err.message });
    }
};
