/**
 * Stripe Webhook Handler
 * POST /api/webhook-stripe
 * 
 * REQUIRED ENV VARS:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { EPSILON, isPartialPayment } = require('./_lib/stripe');

// Disable body parsing - Stripe needs raw body
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper to get raw body
async function getRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(Buffer.from(data)));
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate environment
    if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not configured' });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'SUPABASE credentials not configured' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        const rawBody = await getRawBody(req);

        // Support multiple webhook secrets (comma-separated)
        const secrets = String(process.env.STRIPE_WEBHOOK_SECRET)
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        let lastErr;
        for (const secret of secrets) {
            try {
                event = stripe.webhooks.constructEvent(rawBody, sig, secret);
                lastErr = null;
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!event) {
            throw lastErr || new Error('Invalid signature');
        }
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
        console.log(`🔔 Webhook received: ${event.type} (${event.id})`);

        if (event.type === 'payment_intent.succeeded') {
            const pi = event.data.object;
            const orderId = pi?.metadata?.order_id;

            if (orderId) {
                const amountPaid = (pi.amount_received || 0) / 100;

                const { data: orderRow, error: orderErr } = await supabaseAdmin
                    .from('fast_orders')
                    .select('total')
                    .eq('id', orderId)
                    .single();

                if (orderErr) throw orderErr;

                const total = Number(orderRow?.total || 0);
                const paymentStatus = isPartialPayment(amountPaid, total) ? 'paid_partial' : 'paid_full';

                const { error: upErr } = await supabaseAdmin
                    .from('fast_orders')
                    .update({
                        payment_status: paymentStatus,
                        amount_paid: amountPaid,
                        stripe_payment_id: pi.id
                    })
                    .eq('id', orderId);

                if (upErr) throw upErr;
                console.log(`✅ Order ${orderId} updated: ${paymentStatus} (R$ ${amountPaid})`);
            }
        } else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
            const session = event.data.object;
            const orderId = session?.metadata?.order_id || session?.client_reference_id;

            if (orderId) {
                const amountPaid = (session.amount_total || 0) / 100;

                const { data: orderRow, error: orderErr } = await supabaseAdmin
                    .from('fast_orders')
                    .select('total')
                    .eq('id', orderId)
                    .single();

                if (orderErr) throw orderErr;

                const total = Number(orderRow?.total || 0);
                const paymentStatus = isPartialPayment(amountPaid, total) ? 'paid_partial' : 'paid_full';

                const { error: upErr } = await supabaseAdmin
                    .from('fast_orders')
                    .update({
                        payment_status: paymentStatus,
                        amount_paid: amountPaid,
                        stripe_payment_id: session.payment_intent || session.id
                    })
                    .eq('id', orderId);

                if (upErr) throw upErr;
                console.log(`✅ Order ${orderId} updated via Checkout: ${paymentStatus} (R$ ${amountPaid})`);
            }
        } else if (event.type === 'charge.refunded') {
            const charge = event.data.object;
            const orderId = charge?.metadata?.order_id;

            if (orderId) {
                const { error: upErr } = await supabaseAdmin
                    .from('fast_orders')
                    .update({ payment_status: 'refunded' })
                    .eq('id', orderId);

                if (upErr) throw upErr;
                console.log(`↩️ Order ${orderId} marked as refunded`);
            }
        }

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error('❌ Webhook handler error:', err);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
};
