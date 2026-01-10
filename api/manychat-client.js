/**
 * ManyChat Client Registration & Order Data API
 * POST /api/manychat-client
 * GET /api/manychat-client?id_manychat=...
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase directly (avoid importing from stripe.js which requires stripe package)
let supabaseAdmin = null;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );
    }
} catch (initError) {
    console.error('[manychat-client] Failed to init Supabase:', initError.message);
}

/**
 * Extracts order code (FAST-XXXX) from message text using regex
 */
function extractOrderCode(message) {
    if (!message) return null;
    const match = message.match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
}

/**
 * Formats order data for ManyChat custom fields
 */
function formatOrderForManyChat(order) {
    if (!order) return null;

    let items = order.items;
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
    }

    const itemsDescription = (items || []).map(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        const price = item.price ? `R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : '';
        const note = item.note ? ` _${item.note}_` : '';
        return `${qty}x ${name}${price ? ` (${price})` : ''}${note}`;
    }).join(' • ') || 'Sem itens';

    let deliveryDate = 'Hoje';
    if (order.scheduled_date) {
        const parts = String(order.scheduled_date).split('-');
        if (parts.length === 3) {
            deliveryDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            if (order.scheduled_time) deliveryDate += ` às ${order.scheduled_time}`;
        }
    }

    const paymentMap = { 'dinheiro': '💵 Dinheiro', 'cartao1x': '💳 Cartão', 'pix': '📱 PIX' };
    const paymentMethod = paymentMap[order.payment_method] || order.payment_method || 'N/A';
    const paymentLocation = order.delivery_type === 'entrega' ? 'na entrega' : 'na retirada';

    let formattedPhone = order.client_phone || 'N/A';
    const digits = (order.client_phone || '').replace(/\D/g, '');
    if (digits.length === 11) {
        formattedPhone = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    const firstName = order.client_name ? String(order.client_name).trim().split(/\s+/)[0] : 'Cliente';

    return {
        order_code: order.order_code || 'N/A',
        order_total: order.total ? `R$ ${Number(order.total).toFixed(2).replace('.', ',')}` : 'R$ 0,00',
        order_description: itemsDescription,
        order_date: deliveryDate,
        delivery_method: order.delivery_type === 'entrega' ? '🚚 Entrega' : '🏪 Retirada',
        client_first_name: firstName,
        payment_method: `${paymentMethod} (${paymentLocation})`,
        client_phone: formattedPhone,
        client_name: order.client_name || 'Cliente',
        status: order.status || 'pending'
    };
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

    // Check Supabase
    if (!supabaseAdmin) {
        return res.status(200).json({ success: false, error: 'Database not configured' });
    }

    try {
        // GET - fetch client data
        if (req.method === 'GET') {
            const manychatId = req.query.id_manychat || req.query.manychat_id;
            if (!manychatId) {
                return res.status(200).json({ success: false, error: 'id_manychat required' });
            }

            const { data: clients } = await supabaseAdmin
                .from('fast_clients')
                .select('phone, name')
                .eq('manychat_id', String(manychatId))
                .limit(1);

            const client = clients?.[0];
            if (!client) {
                return res.status(200).json({ success: false, registered: false });
            }

            const { data: orders } = await supabaseAdmin
                .from('fast_orders')
                .select('*')
                .eq('client_phone', client.phone)
                .order('created_at', { ascending: false })
                .limit(1);

            return res.status(200).json({
                success: true,
                registered: true,
                client_name: client.name,
                order: orders?.[0] ? formatOrderForManyChat(orders[0]) : null
            });
        }

        // POST - register client
        if (req.method === 'POST') {
            const { id_manychat, mensagem_do_pedido } = req.body || {};

            if (!id_manychat) {
                return res.status(200).json({ success: false, error: 'id_manychat required' });
            }

            const manychatIdStr = String(id_manychat);

            // Check if already registered
            const { data: existingClients } = await supabaseAdmin
                .from('fast_clients')
                .select('id, phone, name, email, birthdate')
                .eq('manychat_id', manychatIdStr)
                .limit(1);

            if (existingClients?.[0]) {
                const client = existingClients[0];
                const { data: orders } = await supabaseAdmin
                    .from('fast_orders')
                    .select('*')
                    .eq('client_phone', client.phone)
                    .order('created_at', { ascending: false })
                    .limit(1);

                // Count total orders for this client
                const { count: totalOrders } = await supabaseAdmin
                    .from('fast_orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('client_phone', client.phone);

                return res.status(200).json({
                    success: true,
                    already_registered: true,
                    client: {
                        id: client.id,
                        name: client.name,
                        phone: client.phone,
                        email: client.email || null,
                        birthdate: client.birthdate || null,
                        total_orders: totalOrders || 0
                    },
                    order: orders?.[0] ? formatOrderForManyChat(orders[0]) : null
                });
            }

            // Need message to extract order code
            if (!mensagem_do_pedido) {
                return res.status(200).json({
                    success: false,
                    error: 'mensagem_do_pedido required for new registration'
                });
            }

            const orderCode = extractOrderCode(mensagem_do_pedido);
            if (!orderCode) {
                return res.status(200).json({
                    success: false,
                    error: 'Could not find FAST-XXXX in message'
                });
            }

            // Find the order
            const { data: orders } = await supabaseAdmin
                .from('fast_orders')
                .select('*')
                .eq('order_code', orderCode)
                .limit(1);

            const order = orders?.[0];
            if (!order) {
                return res.status(200).json({
                    success: false,
                    error: `Order ${orderCode} not found`
                });
            }

            // Update client with manychat_id
            await supabaseAdmin
                .from('fast_clients')
                .update({
                    manychat_id: manychatIdStr,
                    manychat_updated_at: new Date().toISOString()
                })
                .eq('phone', order.client_phone);

            // Also update order
            await supabaseAdmin
                .from('fast_orders')
                .update({ manychat_id: manychatIdStr })
                .eq('id', order.id);

            // Get client details
            const { data: clientData } = await supabaseAdmin
                .from('fast_clients')
                .select('id, name, email, birthdate')
                .eq('phone', order.client_phone)
                .limit(1);

            const client = clientData?.[0];

            // Count total orders
            const { count: totalOrders } = await supabaseAdmin
                .from('fast_orders')
                .select('id', { count: 'exact', head: true })
                .eq('client_phone', order.client_phone);

            return res.status(200).json({
                success: true,
                newly_registered: true,
                order_code: orderCode,
                client: {
                    id: client?.id || null,
                    name: order.client_name,
                    phone: order.client_phone,
                    email: client?.email || null,
                    birthdate: client?.birthdate || null,
                    total_orders: totalOrders || 1
                },
                order: formatOrderForManyChat(order)
            });
        }

        return res.status(200).json({ success: false, error: 'Use GET or POST' });

    } catch (err) {
        console.error('[manychat-client] Error:', err);
        return res.status(200).json({
            success: false,
            error: 'Error: ' + (err.message || 'Unknown')
        });
    }
};
