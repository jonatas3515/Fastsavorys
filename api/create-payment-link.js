/**
 * Create Stripe Payment Link
 * POST /api/create-payment-link
 * 
 * REQUIRED ENV VARS:
 * - STRIPE_SECRET_KEY
 * - WHATSAPP_NUMBER (optional, defaults to 5573999366554)
 * 
 * Body: { orderId, amount, customerEmail?, customerName? }
 */

const { stripe, handleCors, WHATSAPP_NUMBER, safeErrorMessage } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method === 'GET') {
        return res.status(405).json({ error: 'Use POST /api/create-payment-link (JSON body).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    try {
        const { orderId, amount, customerEmail, customerName } = req.body || {};

        console.log(`Creating payment link for order ${orderId}, amount: R$ ${amount}`);

        if (!orderId || !amount) {
            return res.status(400).json({ error: 'orderId e amount são obrigatórios' });
        }

        const waText = `Ola! Paguei o pedido #${orderId}`;
        const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`;

        const paymentLink = await stripe.paymentLinks.create({
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: `Pedido Fast Savory's #${orderId}`,
                        description: `Pedido para ${customerName || 'Cliente'}`,
                        images: []
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            after_completion: {
                type: 'redirect',
                redirect: {
                    url: waUrl,
                }
            },
            allow_promotion_codes: false,
            payment_intent_data: {
                metadata: {
                    order_id: orderId.toString(),
                    customer_name: customerName || 'Cliente'
                }
            }
        });

        console.log(`Payment link created: ${paymentLink.url}`);

        res.status(200).json({
            success: true,
            url: paymentLink.url,
            paymentLinkId: paymentLink.id
        });
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(400).json({ error: safeErrorMessage(error, 'Erro ao gerar link de pagamento') });
    }
};
