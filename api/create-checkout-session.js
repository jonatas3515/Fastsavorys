/**
 * Create Stripe Checkout Session
 * POST /api/create-checkout-session
 * 
 * REQUIRED ENV VARS:
 * - STRIPE_SECRET_KEY
 * - CHECKOUT_SUCCESS_URL
 * - CHECKOUT_CANCEL_URL
 * 
 * Body: { orderId, amount, customerEmail?, customerName? }
 */

const { stripe, handleCors } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return res.status(405).json({ error: 'Use POST /api/create-checkout-session (JSON body).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    try {
        const { orderId, amount, customerEmail, customerName } = req.body || {};

        console.log(`Creating Checkout Session for order ${orderId}, amount: R$ ${amount}`);

        if (!orderId || !amount) {
            return res.status(400).json({ error: 'orderId e amount são obrigatórios' });
        }

        const successUrl = process.env.CHECKOUT_SUCCESS_URL || 'https://fastsavorys.vercel.app/pages/fast.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
        const cancelBaseUrl = process.env.CHECKOUT_CANCEL_URL || 'https://fastsavorys.vercel.app/pages/fast.html?checkout=cancel&order_id=';

        const encodedOrderId = encodeURIComponent(String(orderId));
        const cancelUrl = cancelBaseUrl.includes('{ORDER_ID}')
            ? cancelBaseUrl.replace('{ORDER_ID}', encodedOrderId)
            : cancelBaseUrl.includes('{order_id}')
                ? cancelBaseUrl.replace('{order_id}', encodedOrderId)
                : cancelBaseUrl.endsWith('order_id=')
                    ? (cancelBaseUrl + encodedOrderId)
                    : (cancelBaseUrl + (cancelBaseUrl.includes('?') ? '&' : '?') + 'order_id=' + encodedOrderId);

        const sessionPayload = {
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: String(orderId),
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: `Pedido Fast Savory's #${orderId}`,
                            description: `Pedido para ${customerName || 'Cliente'}`
                        },
                        unit_amount: Math.round(amount * 100)
                    },
                    quantity: 1
                }
            ],
            payment_intent_data: {
                metadata: {
                    order_id: String(orderId),
                    customer_name: customerName || 'Cliente'
                }
            },
            metadata: {
                order_id: String(orderId)
            }
        };

        if (customerEmail) {
            sessionPayload.customer_email = customerEmail;
        }

        const session = await stripe.checkout.sessions.create(sessionPayload);

        res.status(200).json({
            success: true,
            url: session.url,
            sessionId: session.id
        });
    } catch (error) {
        console.error('Stripe Checkout error:', error);
        res.status(400).json({ error: error.message });
    }
};
