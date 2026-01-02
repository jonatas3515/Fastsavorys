/**
 * Sync Checkout Session Status
 * POST /api/sync-checkout-session
 * 
 * Fallback to manually check and sync payment status
 * 
 * REQUIRED ENV VARS:
 * - STRIPE_SECRET_KEY
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * 
 * Body: { sessionId }
 */

const { stripe, supabaseAdmin, handleCors, isPartialPayment, safeErrorMessage } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

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
};
