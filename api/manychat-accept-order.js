/**
 * ManyChat Order Accept Webhook
 * POST /api/manychat-accept-order
 * 
 * Called when a collaborator accepts an order via ManyChat.
 * Extracts order number from message, updates custom field, and triggers flow.
 * 
 * Request Body:
 * {
 *   "mensagem_com_pedido": "Aceitar FAST-0003",
 *   "id_manychat": "123456",
 *   "id_fast_savory": "789" (optional fallback)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "order_code": "FAST-0003",
 *   "field_updated": true,
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
    console.error('[manychat-accept-order] Supabase init error:', err.message);
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
        console.error('[manychat-accept-order] MANYCHAT_API_KEY not configured');
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
            console.error('[manychat-accept-order] API Error:', response.status, data);
            return { success: false, error: data?.message || `HTTP ${response.status}` };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[manychat-accept-order] Request failed:', err.message);
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

    console.log(`[manychat-accept-order] Updating field ${fieldId} for user ${userId}: ${value}`);

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

    console.log(`[manychat-accept-order] Sending flow ${flowId} to user ${userId}`);

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

    try {
        const { mensagem_com_pedido, id_manychat, id_fast_savory } = req.body || {};

        console.log('[manychat-accept-order] Received:', {
            mensagem_com_pedido: mensagem_com_pedido?.substring(0, 50),
            id_manychat,
            id_fast_savory
        });

        // Extract order code from message
        const orderCode = extractOrderCode(mensagem_com_pedido);

        if (!orderCode) {
            return res.status(200).json({
                success: false,
                error: 'Could not extract order code (FAST-XXXX) from message'
            });
        }

        console.log(`[manychat-accept-order] Extracted order code: ${orderCode}`);

        // Get collaborator's ManyChat user ID (Jéssica)
        const collaboratorUserId = process.env.MANYCHAT_USER_ID_JESSICA;
        const orderNumberFieldId = process.env.MANYCHAT_FIELD_ID_ORDER_NUMBER;
        const acceptedFlowId = process.env.MANYCHAT_FLOW_ID_ACEITOU_PEDIDO;

        if (!collaboratorUserId) {
            return res.status(200).json({
                success: false,
                error: 'MANYCHAT_USER_ID_JESSICA not configured'
            });
        }

        // Step 1: Update custom field with order number
        let fieldUpdated = false;
        if (orderNumberFieldId) {
            const fieldResult = await updateCustomField(collaboratorUserId, orderNumberFieldId, orderCode);
            fieldUpdated = fieldResult.success;
            if (!fieldResult.success) {
                console.warn('[manychat-accept-order] Field update failed:', fieldResult.error);
            }
        } else {
            console.warn('[manychat-accept-order] MANYCHAT_FIELD_ID_ORDER_NUMBER not configured');
        }

        // Step 2: Send flow to collaborator
        let flowSent = false;
        if (acceptedFlowId) {
            const flowResult = await sendFlow(collaboratorUserId, acceptedFlowId);
            flowSent = flowResult.success;
            if (!flowResult.success) {
                console.warn('[manychat-accept-order] Flow send failed:', flowResult.error);
            }
        } else {
            console.warn('[manychat-accept-order] MANYCHAT_FLOW_ID_ACEITOU_PEDIDO not configured');
        }

        // Optional: Update order status in Supabase
        if (supabaseAdmin) {
            const { error: updateError } = await supabaseAdmin
                .from('fast_orders')
                .update({
                    status: 'accepted',
                    accepted_at: new Date().toISOString()
                })
                .eq('order_code', orderCode);

            if (updateError) {
                console.warn('[manychat-accept-order] Failed to update order status:', updateError);
            } else {
                console.log(`[manychat-accept-order] Order ${orderCode} status updated to 'accepted'`);
            }
        }

        return res.status(200).json({
            success: true,
            order_code: orderCode,
            field_updated: fieldUpdated,
            flow_sent: flowSent,
            collaborator_notified: fieldUpdated || flowSent
        });

    } catch (err) {
        console.error('[manychat-accept-order] Error:', err);
        return res.status(200).json({
            success: false,
            error: 'Error: ' + (err.message || 'Unknown')
        });
    }
};
