/**
 * ManyChat Client Registration & Order Data API
 * POST /api/manychat-client
 * 
 * This endpoint handles two scenarios:
 * 1. New client registration: Extracts order code from message, finds client, saves ManyChat ID
 * 2. Returns last order data for the client to populate ManyChat custom fields
 * 
 * Request Body:
 * {
 *   "id_manychat": "123456789",           // ManyChat subscriber ID
 *   "mensagem_do_pedido": "... FAST-0001 ..." // Optional: message containing order code
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "client_registered": true,
 *   "order": { ... last order data ... }
 * }
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    })
    : null;

/**
 * Extracts order code (FAST-XXXX) from message text using regex
 * @param {string} message - Message containing order code
 * @returns {string|null} Order code or null if not found
 */
function extractOrderCode(message) {
    if (!message) return null;

    // Match FAST-XXXX pattern (case insensitive)
    const match = message.match(/FAST-(\d{4})/i);
    if (match) {
        return `FAST-${match[1]}`;
    }

    // Also try to match just the order code format
    const altMatch = message.match(/Código:\s*FAST-(\d{4})/i);
    if (altMatch) {
        return `FAST-${altMatch[1]}`;
    }

    return null;
}

/**
 * Formats order data for ManyChat custom fields
 * @param {object} order - Order from Supabase
 * @returns {object} Formatted order data
 */
function formatOrderForManyChat(order) {
    if (!order) return null;

    // Parse items if stored as JSON string
    let items = order.items;
    if (typeof items === 'string') {
        try {
            items = JSON.parse(items);
        } catch {
            items = [];
        }
    }

    // Format items description
    const itemsDescription = (items || []).map(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        const price = item.price ? `R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : '';
        const note = item.note ? ` _${item.note}_` : '';
        return `${qty}x ${name}${price ? ` (${price})` : ''}${note}`;
    }).join(' • ');

    // Format delivery date
    let deliveryDate = 'Hoje - o mais breve possível';
    if (order.scheduled_date) {
        const parts = order.scheduled_date.split('-');
        if (parts.length === 3) {
            deliveryDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            if (order.scheduled_time) {
                deliveryDate += ` às ${order.scheduled_time}`;
            }
        }
    }

    // Format payment method
    const paymentMap = {
        'dinheiro': '💵 Dinheiro',
        'cartao1x': '💳 Cartão',
        'pix': '📱 PIX'
    };
    const paymentMethod = paymentMap[order.payment_method] || order.payment_method || 'Não informado';
    const paymentLocation = order.delivery_type === 'entrega' ? 'na entrega' : 'na retirada';

    // Format phone
    let formattedPhone = order.client_phone || 'Não informado';
    const digits = (order.client_phone || '').replace(/\D/g, '');
    if (digits.length === 11) {
        formattedPhone = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    // Get first name
    const firstName = order.client_name ? order.client_name.trim().split(/\s+/)[0] : 'Cliente';

    return {
        order_code: order.order_code || `FAST-${String(order.order_sequence || '').padStart(4, '0')}`,
        order_total: order.total ? `R$ ${Number(order.total).toFixed(2).replace('.', ',')}` : 'R$ 0,00',
        order_description: itemsDescription || 'Sem itens',
        order_date: deliveryDate,
        delivery_method: order.delivery_type === 'entrega' ? '🚚 Entrega' : '🏪 Retirada',
        client_first_name: firstName,
        payment_method: `${paymentMethod} (${paymentLocation})`,
        client_phone: formattedPhone,
        client_name: order.client_name || 'Cliente',
        status: order.status || 'pending',
        created_at: order.created_at
    };
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check Supabase
    if (!supabaseAdmin) {
        console.error('[manychat-client] Supabase not configured');
        return res.status(200).json({
            success: false,
            error: 'Database not configured'
        });
    }

    try {
        // Handle GET - fetch client data by manychat_id
        if (req.method === 'GET') {
            const manychatId = req.query.id_manychat || req.query.manychat_id;

            if (!manychatId) {
                return res.status(200).json({
                    success: false,
                    error: 'id_manychat is required'
                });
            }

            console.log(`[manychat-client] GET request for manychat_id: ${manychatId}`);

            // Find client by manychat_id
            const { data: client, error: clientError } = await supabaseAdmin
                .from('fast_clients')
                .select('phone, name')
                .eq('manychat_id', manychatId)
                .single();

            if (clientError || !client) {
                console.log(`[manychat-client] Client not found for manychat_id: ${manychatId}`);
                return res.status(200).json({
                    success: false,
                    error: 'Client not found',
                    registered: false
                });
            }

            // Get last order for this client
            const { data: lastOrder, error: orderError } = await supabaseAdmin
                .from('fast_orders')
                .select('*')
                .eq('client_phone', client.phone)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (orderError || !lastOrder) {
                return res.status(200).json({
                    success: true,
                    registered: true,
                    client_name: client.name,
                    order: null,
                    message: 'No orders found for this client'
                });
            }

            return res.status(200).json({
                success: true,
                registered: true,
                client_name: client.name,
                order: formatOrderForManyChat(lastOrder)
            });
        }

        // Handle POST - register new client or update manychat_id
        if (req.method === 'POST') {
            const { id_manychat, mensagem_do_pedido } = req.body || {};

            if (!id_manychat) {
                return res.status(200).json({
                    success: false,
                    error: 'id_manychat is required'
                });
            }

            console.log(`[manychat-client] POST request - manychat_id: ${id_manychat}`);

            // Check if client already registered with this manychat_id
            const { data: existingClient } = await supabaseAdmin
                .from('fast_clients')
                .select('phone, name')
                .eq('manychat_id', id_manychat)
                .single();

            if (existingClient) {
                // Client already registered, just return last order
                console.log(`[manychat-client] Client already registered: ${existingClient.phone}`);

                const { data: lastOrder } = await supabaseAdmin
                    .from('fast_orders')
                    .select('*')
                    .eq('client_phone', existingClient.phone)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                return res.status(200).json({
                    success: true,
                    client_registered: true,
                    already_registered: true,
                    client_name: existingClient.name,
                    order: formatOrderForManyChat(lastOrder)
                });
            }

            // New client - need to extract order code from message
            if (!mensagem_do_pedido) {
                return res.status(200).json({
                    success: false,
                    error: 'mensagem_do_pedido is required for new client registration'
                });
            }

            // Extract order code from message
            const orderCode = extractOrderCode(mensagem_do_pedido);

            if (!orderCode) {
                console.warn(`[manychat-client] Could not extract order code from message`);
                return res.status(200).json({
                    success: false,
                    error: 'Could not extract order code (FAST-XXXX) from message'
                });
            }

            console.log(`[manychat-client] Extracted order code: ${orderCode}`);

            // Find order by order_code
            const { data: order, error: orderError } = await supabaseAdmin
                .from('fast_orders')
                .select('*')
                .eq('order_code', orderCode)
                .single();

            if (orderError || !order) {
                console.warn(`[manychat-client] Order not found: ${orderCode}`);
                return res.status(200).json({
                    success: false,
                    error: `Order ${orderCode} not found`
                });
            }

            // Update client with manychat_id
            const { error: updateError } = await supabaseAdmin
                .from('fast_clients')
                .update({
                    manychat_id: id_manychat,
                    manychat_updated_at: new Date().toISOString()
                })
                .eq('phone', order.client_phone);

            if (updateError) {
                console.error(`[manychat-client] Error updating client:`, updateError);
                // Continue anyway - might be a new phone not in clients table
            } else {
                console.log(`[manychat-client] ✅ Updated client ${order.client_phone} with manychat_id: ${id_manychat}`);
            }

            // Also save manychat_id to the order for reference
            await supabaseAdmin
                .from('fast_orders')
                .update({ manychat_id: id_manychat })
                .eq('id', order.id);

            return res.status(200).json({
                success: true,
                client_registered: true,
                newly_registered: true,
                order_code: orderCode,
                client_phone: order.client_phone,
                order: formatOrderForManyChat(order)
            });
        }

        // Method not allowed
        return res.status(200).json({
            success: false,
            error: 'Use GET or POST method'
        });

    } catch (err) {
        console.error('[manychat-client] ❌ Error:', err.message);
        return res.status(200).json({
            success: false,
            error: 'Internal error: ' + err.message
        });
    }
};
