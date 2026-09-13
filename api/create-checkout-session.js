/**
 * Create Stripe Checkout Session & Sync Checkout Session
 * POST /api/create-checkout-session
 * POST /api/sync-checkout-session (via rewrite or ?action=sync)
 */

const { stripe, supabaseAdmin, handleCors, isPartialPayment, safeErrorMessage } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return res.status(405).json({ error: 'Use POST (JSON body).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    const isSync = req.query.action === 'sync' || req.body?.sessionId;

    // Handle SYNC checkout session
    if (isSync) {
        if (!supabaseAdmin) {
            return res.status(500).json({ error: 'SUPABASE credentials not configured' });
        }

        try {
            const { sessionId } = req.body || {};

            if (!sessionId) {
                return res.status(400).json({ error: 'sessionId é obrigatório' });
            }

            const session = await stripe.checkout.sessions.retrieve(String(sessionId), {
                expand: ['payment_intent']
            });

            const orderId = session?.metadata?.order_id || session?.client_reference_id || session?.payment_intent?.metadata?.order_id;

            if (!orderId) {
                return res.status(404).json({ error: 'order_id não encontrado na Checkout Session' });
            }

            const isPaid = session?.payment_status === 'paid';
            const amountPaid = isPaid ? ((session.amount_total || 0) / 100) : 0;

            const { data: orderRow, error: orderErr } = await supabaseAdmin
                .from('fast_orders')
                .select('total, payment_status')
                .eq('id', orderId)
                .single();

            if (orderErr) throw orderErr;

            const total = Number(orderRow?.total || 0);
            const paymentStatus = isPaid
                ? (isPartialPayment(amountPaid, total) ? 'paid_partial' : 'paid_full')
                : (orderRow?.payment_status || 'awaiting_payment');

            const { error: upErr } = await supabaseAdmin
                .from('fast_orders')
                .update({
                    payment_status: paymentStatus,
                    amount_paid: amountPaid,
                    stripe_payment_id: session.payment_intent?.id || session.payment_intent || session.id
                })
                .eq('id', orderId);

            if (upErr) throw upErr;

            console.log(`🔄 Sync Checkout: session ${sessionId} -> order ${orderId} (${paymentStatus})`);

            return res.status(200).json({
                success: true,
                orderId: String(orderId),
                payment_status: paymentStatus,
                amount_paid: amountPaid
            });
        } catch (err) {
            console.error('❌ Sync Checkout error:', err);
            return res.status(400).json({ error: safeErrorMessage(err, 'Falha ao sincronizar checkout') });
        }
    }

    // Handle CREATE checkout session
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
        res.status(400).json({ error: safeErrorMessage(error, 'Erro ao criar sessão de checkout') });
    }
};
