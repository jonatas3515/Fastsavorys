/**
 * ManyChat Generate Payment Link Endpoint
 * POST /api/manychat-payment-link
 * 
 * Generates a Stripe payment link for an order and sends it to ManyChat custom field.
 * This endpoint is called when an order with card payment is accepted.
 * 
 * Request Body:
 * {
 *   "id_numero_pedido": "Aceito FAST-0003" or just "FAST-0003",
 *   "id_manychat_cliente": "2071263622" (optional, will lookup from order if not provided)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "order_code": "FAST-0003",
 *   "payment_link": "https://checkout.stripe.com/...",
 *   "field_updated": true
 * }
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// ManyChat API base URL
const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

// Initialize Stripe
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
} catch (err) {
    console.error('[manychat-payment-link] Stripe init error:', err.message);
}

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
    console.error('[manychat-payment-link] Supabase init error:', err.message);
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
 * Updates a ManyChat custom field
 */
async function updateManyChatField(userId, fieldId, value) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey || !userId || !fieldId) {
        console.warn('[manychat-payment-link] Missing API key, userId, or fieldId');
        return { success: false, error: 'Missing configuration' };
    }

    console.log(`[manychat-payment-link] Updating field ${fieldId} for user ${userId}`);

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}/subscriber/setCustomFields`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: userId,
                fields: [{
                    field_id: parseInt(fieldId, 10),
                    field_value: String(value)
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[manychat-payment-link] ManyChat API Error:', response.status, data);
            return { success: false, error: data?.message || `HTTP ${response.status}` };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[manychat-payment-link] ManyChat request failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Generates a Stripe Checkout session and returns the URL
 */
async function generateStripePaymentLink(order) {
    if (!stripe) {
        return { success: false, error: 'Stripe not configured' };
    }

    const orderId = order.id;
    const amount = Number(order.total || 0);
    const customerName = order.client_name || 'Cliente';
    const orderCode = order.order_code || `FAST-${String(order.order_sequence || orderId).padStart(4, '0')}`;

    // Calculate minimum payment (50% for encomendas, or full amount)
    const minPaymentPercent = order.scheduled_date ? 50 : 100;
    const paymentAmount = (amount * minPaymentPercent) / 100;

    console.log(`[manychat-payment-link] Generating Stripe link for order ${orderCode}, amount: R$ ${paymentAmount.toFixed(2)}`);

    try {
        const successUrl = process.env.CHECKOUT_SUCCESS_URL ||
            `https://fastsavorys.vercel.app/pages/fast.html?payment=success&order=${orderCode}`;
        const cancelUrl = process.env.CHECKOUT_CANCEL_URL ||
            `https://fastsavorys.vercel.app/pages/fast.html?payment=cancel&order=${orderCode}`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: String(orderId),
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: `Pedido Fast Savory's #${orderCode}`,
                        description: `Pedido para ${customerName}`
                    },
                    unit_amount: Math.round(paymentAmount * 100) // Stripe uses cents
                },
                quantity: 1
            }],
            payment_intent_data: {
                metadata: {
                    order_id: String(orderId),
                    order_code: orderCode,
                    customer_name: customerName
                }
            },
            metadata: {
                order_id: String(orderId),
                order_code: orderCode
            }
        });

        console.log(`[manychat-payment-link] ✅ Stripe session created: ${session.id}`);
        return { success: true, url: session.url, sessionId: session.id };

    } catch (err) {
        console.error('[manychat-payment-link] Stripe error:', err.message);
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

    // Check dependencies
    if (!supabaseAdmin) {
        return res.status(200).json({ success: false, error: 'Database not configured' });
    }

    if (!stripe) {
        return res.status(200).json({ success: false, error: 'Stripe not configured (STRIPE_SECRET_KEY missing)' });
    }

    try {
        const { id_numero_pedido, id_manychat_cliente } = req.body || {};

        console.log('[manychat-payment-link] Received:', {
            id_numero_pedido,
            id_manychat_cliente
        });

        // Validate required fields
        if (!id_numero_pedido) {
            return res.status(200).json({
                success: false,
                error: 'id_numero_pedido is required'
            });
        }

        // Step 1: Extract order code
        const orderCode = extractOrderCode(id_numero_pedido);

        if (!orderCode) {
            return res.status(200).json({
                success: false,
                error: 'Could not extract order code (FAST-XXXX) from id_numero_pedido'
            });
        }

        console.log(`[manychat-payment-link] Extracted order code: ${orderCode}`);

        // Step 2: Find order
        const { data: orders, error: orderError } = await supabaseAdmin
            .from('fast_orders')
            .select('*')
            .eq('order_code', orderCode)
            .limit(1);

        if (orderError) {
            console.error('[manychat-payment-link] Database error:', orderError);
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

        // Step 3: Generate Stripe payment link
        const stripeResult = await generateStripePaymentLink(order);

        if (!stripeResult.success) {
            return res.status(200).json({
                success: false,
                error: 'Failed to generate payment link: ' + stripeResult.error,
                order_code: orderCode
            });
        }

        const paymentLink = stripeResult.url;
        console.log(`[manychat-payment-link] Payment link generated: ${paymentLink.substring(0, 50)}...`);

        // Step 4: Save payment link to order in Supabase
        await supabaseAdmin
            .from('fast_orders')
            .update({
                stripe_checkout_url: paymentLink,
                stripe_session_id: stripeResult.sessionId
            })
            .eq('id', order.id);

        // Step 5: Send payment link to ManyChat custom field (if we have client's ManyChat ID)
        let fieldUpdated = false;
        const paymentLinkFieldId = process.env.MANYCHAT_FIELD_ID_PAYMENT_LINK;

        // Get client's ManyChat ID
        let clientManychatId = id_manychat_cliente || order.manychat_id;

        if (!clientManychatId && order.client_phone) {
            const { data: clients } = await supabaseAdmin
                .from('fast_clients')
                .select('manychat_id')
                .eq('phone', order.client_phone)
                .limit(1);
            clientManychatId = clients?.[0]?.manychat_id;
        }

        if (clientManychatId && paymentLinkFieldId) {
            const fieldResult = await updateManyChatField(clientManychatId, paymentLinkFieldId, paymentLink);
            fieldUpdated = fieldResult.success;
            if (!fieldResult.success) {
                console.warn('[manychat-payment-link] Failed to update ManyChat field:', fieldResult.error);
            } else {
                console.log('[manychat-payment-link] ✅ Payment link sent to ManyChat');
            }
        } else {
            if (!clientManychatId) {
                console.warn('[manychat-payment-link] Client ManyChat ID not found');
            }
            if (!paymentLinkFieldId) {
                console.warn('[manychat-payment-link] MANYCHAT_FIELD_ID_PAYMENT_LINK not configured');
            }
        }

        return res.status(200).json({
            success: true,
            order_code: orderCode,
            payment_link: paymentLink,
            client_manychat_id: clientManychatId || null,
            field_updated: fieldUpdated
        });

    } catch (err) {
        console.error('[manychat-payment-link] Error:', err);
        return res.status(200).json({
            success: false,
            error: 'Error: ' + (err.message || 'Unknown')
        });
    }
};
