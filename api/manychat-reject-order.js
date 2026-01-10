/**
 * ManyChat Reject Order Endpoint
 * POST /api/manychat-reject-order
 * 
 * Called when a collaborator rejects an order.
 * Sends rejection message to custom field and triggers rejection flow.
 * 
 * Request Body:
 * {
 *   "mensagem_com_recusa_do_pedido": "Desculpe, estamos sem esse ingrediente hoje.",
 *   "id_numero_pedido": "Recusado FAST-0003",
 *   "id_fluxo_para_envio_pedido_recusado": "content20260110222023_240118"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "order_code": "FAST-0003",
 *   "client_manychat_id": "123456",
 *   "message_sent": true,
 *   "flow_sent": true
 * }
 */

const { createClient } = require('@supabase/supabase-js');

// ManyChat API base URL
const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

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
    console.error('[manychat-reject-order] Supabase init error:', err.message);
}

/**
 * Extracts order code (FAST-XXXX) from message using regex
 */
function extractOrderCode(message) {
    if (!message) return null;
    const match = message.match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
}

/**
 * Makes a request to ManyChat API
 */
async function manychatRequest(endpoint, body) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey) {
        console.error('[manychat-reject-order] MANYCHAT_API_KEY not configured');
        return { success: false, error: 'API key not configured' };
    }

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

        if (!response.ok) {
            console.error('[manychat-reject-order] API Error:', response.status, data);
            return { success: false, error: data?.message || `HTTP ${response.status}` };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[manychat-reject-order] Request failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Updates a custom field for a user
 */
async function updateCustomField(userId, fieldId, value) {
    if (!userId || !fieldId) {
        return { success: false, error: 'Missing userId or fieldId' };
    }

    console.log(`[manychat-reject-order] Updating field ${fieldId} for user ${userId}`);

    return await manychatRequest('/subscriber/setCustomFields', {
        subscriber_id: userId,
        fields: [{
            field_id: parseInt(fieldId, 10),
            field_value: String(value)
        }]
    });
}

/**
 * Sends a flow to a user
 */
async function sendFlow(userId, flowId) {
    if (!userId || !flowId) {
        return { success: false, error: 'Missing userId or flowId' };
    }

    console.log(`[manychat-reject-order] Sending flow ${flowId} to user ${userId}`);

    return await manychatRequest('/sending/sendFlow', {
        subscriber_id: userId,
        flow_ns: flowId
    });
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(200).json({ success: false, error: 'Use POST method' });
    }

    // Check Supabase
    if (!supabaseAdmin) {
        return res.status(200).json({ success: false, error: 'Database not configured' });
    }

    try {
        const {
            mensagem_com_recusa_do_pedido,
            id_numero_pedido,
            id_fluxo_para_envio_pedido_recusado
        } = req.body || {};

        console.log('[manychat-reject-order] Received:', {
            mensagem_com_recusa_do_pedido: mensagem_com_recusa_do_pedido?.substring(0, 50),
            id_numero_pedido,
            id_fluxo_para_envio_pedido_recusado
        });

        // Validate required fields
        if (!id_numero_pedido) {
            return res.status(200).json({
                success: false,
                error: 'id_numero_pedido is required'
            });
        }

        if (!id_fluxo_para_envio_pedido_recusado) {
            return res.status(200).json({
                success: false,
                error: 'id_fluxo_para_envio_pedido_recusado is required'
            });
        }

        // Step 1: Extract order code from id_numero_pedido
        const orderCode = extractOrderCode(id_numero_pedido);

        if (!orderCode) {
            return res.status(200).json({
                success: false,
                error: 'Could not extract order code (FAST-XXXX) from id_numero_pedido'
            });
        }

        console.log(`[manychat-reject-order] Extracted order code: ${orderCode}`);

        // Step 2: Find order and get client's ManyChat ID
        const { data: orders, error: orderError } = await supabaseAdmin
            .from('fast_orders')
            .select('id, client_phone, client_name, manychat_id')
            .eq('order_code', orderCode)
            .limit(1);

        if (orderError) {
            console.error('[manychat-reject-order] Database error:', orderError);
            return res.status(200).json({
                success: false,
                error: 'Database error: ' + orderError.message
            });
        }

        const order = orders?.[0];

        if (!order) {
            return res.status(200).json({
                success: false,
                error: `Order ${orderCode} not found`
            });
        }

        // Get client's ManyChat ID
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
                error: `Client for order ${orderCode} does not have ManyChat ID registered`,
                order_code: orderCode,
                client_phone: order.client_phone
            });
        }

        console.log(`[manychat-reject-order] Found client ManyChat ID: ${clientManychatId}`);

        // Step 3: Send rejection message to custom field
        const rejectionFieldId = process.env.MANYCHAT_FIELD_ID_MSG_PEDIDO_RECUSADO;
        let messageSent = false;

        if (rejectionFieldId && mensagem_com_recusa_do_pedido) {
            const fieldResult = await updateCustomField(
                clientManychatId,
                rejectionFieldId,
                mensagem_com_recusa_do_pedido
            );
            messageSent = fieldResult.success;
            if (!fieldResult.success) {
                console.warn('[manychat-reject-order] Field update failed:', fieldResult.error);
            }
        } else if (!rejectionFieldId) {
            console.warn('[manychat-reject-order] MANYCHAT_FIELD_ID_MSG_PEDIDO_RECUSADO not configured');
        }

        // Step 4: Send rejection flow to client
        const flowResult = await sendFlow(clientManychatId, id_fluxo_para_envio_pedido_recusado);

        if (!flowResult.success) {
            return res.status(200).json({
                success: false,
                error: 'Failed to send flow: ' + flowResult.error,
                order_code: orderCode,
                client_manychat_id: clientManychatId,
                message_sent: messageSent
            });
        }

        // Step 5: Update order status in Supabase
        const { error: updateError } = await supabaseAdmin
            .from('fast_orders')
            .update({
                status: 'rejected',
                rejected_at: new Date().toISOString(),
                rejection_reason: mensagem_com_recusa_do_pedido || null
            })
            .eq('order_code', orderCode);

        if (updateError) {
            console.warn('[manychat-reject-order] Failed to update order status:', updateError);
        } else {
            console.log(`[manychat-reject-order] Order ${orderCode} status updated to 'rejected'`);
        }

        return res.status(200).json({
            success: true,
            order_code: orderCode,
            client_name: order.client_name,
            client_manychat_id: clientManychatId,
            message_sent: messageSent,
            flow_sent: true,
            flow_id: id_fluxo_para_envio_pedido_recusado
        });

    } catch (err) {
        console.error('[manychat-reject-order] Error:', err);
        return res.status(200).json({
            success: false,
            error: 'Error: ' + (err.message || 'Unknown')
        });
    }
};
