/**
 * Get Payment Link Status
 * GET /api/payment-link/[id]
 * 
 * REQUIRED ENV VARS:
 * - STRIPE_SECRET_KEY
 */

const { stripe, handleCors } = require('../_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!stripe) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
    }

    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Payment link ID is required' });
        }

        const paymentLink = await stripe.paymentLinks.retrieve(id);

        res.status(200).json(paymentLink);
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(400).json({ error: error.message });
    }
};
