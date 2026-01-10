/**
 * ManyChat Notify Client Endpoint
 * POST /api/manychat-notify-client
 * 
 * Called when a collaborator wants to notify a client about their order status.
 * Extracts order number, finds client's ManyChat ID, and sends specified flow.
 * 
 * Request Body:
 * {
 *   "mensagem_com_pedido": "Ret. Hoje FAST-0003",
 *   "ID_fluxo_enviar_ao_cliente": "content20260110214412_281742"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "order_code": "FAST-0003",
 *   "client_manychat_id": "123456",
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
    console.error('[manychat-notify-client] Supabase init error:', err.message);
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
 * Sends a flow to a user via ManyChat API
 */
async function sendFlowToUser(userId, flowId) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey) {
        console.error('[manychat-notify-client] MANYCHAT_API_KEY not configured');
        return { success: false, error: 'API key not configured' };
    }

    if (!userId || !flowId) {
        return { success: false, error: 'Missing userId or flowId' };
    }

    console.log(`[manychat-notify-client] Sending flow ${flowId} to user ${userId}`);

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}/sending/sendFlow`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: userId,
                flow_ns: flowId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[manychat-notify-client] API Error:', response.status, data);
            return { success: false, error: data?.message || `HTTP ${response.status}` };
        }

        console.log('[manychat-notify-client] ✅ Flow sent successfully');
        return { success: true, data };
    } catch (err) {
        console.error('[manychat-notify-client] Request failed:', err.message);
        return { success: false, error: err.message };
    }
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
        const { mensagem_com_pedido, ID_fluxo_enviar_ao_cliente } = req.body || {};

        console.log('[manychat-notify-client] Received:', {
            mensagem_com_pedido: mensagem_com_pedido?.substring(0, 50),
            ID_fluxo_enviar_ao_cliente
        });

        // Validate required fields
        if (!mensagem_com_pedido) {
            return res.status(200).json({
                success: false,
                error: 'mensagem_com_pedido is required'
            });
        }

        if (!ID_fluxo_enviar_ao_cliente) {
            return res.status(200).json({
                success: false,
                error: 'ID_fluxo_enviar_ao_cliente is required'
            });
        }

        // Step 1: Extract order code from message
        const orderCode = extractOrderCode(mensagem_com_pedido);

        if (!orderCode) {
            return res.status(200).json({
                success: false,
                error: 'Could not extract order code (FAST-XXXX) from message'
            });
        }

        console.log(`[manychat-notify-client] Extracted order code: ${orderCode}`);

        // Step 2: Find order and get client's ManyChat ID
        const { data: orders, error: orderError } = await supabaseAdmin
            .from('fast_orders')
            .select('id, client_phone, client_name, manychat_id')
            .eq('order_code', orderCode)
            .limit(1);

        if (orderError) {
            console.error('[manychat-notify-client] Database error:', orderError);
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

        // Try to get ManyChat ID from order first, then from client
        let clientManychatId = order.manychat_id;

        if (!clientManychatId && order.client_phone) {
            // Fallback: search in fast_clients table
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

        console.log(`[manychat-notify-client] Found client ManyChat ID: ${clientManychatId}`);

        // Step 3: Send flow to client
        const flowResult = await sendFlowToUser(clientManychatId, ID_fluxo_enviar_ao_cliente);

        if (!flowResult.success) {
            return res.status(200).json({
                success: false,
                error: 'Failed to send flow: ' + flowResult.error,
                order_code: orderCode,
                client_manychat_id: clientManychatId
            });
        }

        return res.status(200).json({
            success: true,
            order_code: orderCode,
            client_name: order.client_name,
            client_manychat_id: clientManychatId,
            flow_sent: true,
            flow_id: ID_fluxo_enviar_ao_cliente
        });

    } catch (err) {
        console.error('[manychat-notify-client] Error:', err);
        return res.status(200).json({
            success: false,
            error: 'Error: ' + (err.message || 'Unknown')
        });
    }
};
