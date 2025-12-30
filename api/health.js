/**
 * Health Check Endpoint
 * GET /api/health
 */

const { handleCors } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'development',
        routes: {
            health: { method: 'GET', path: '/api/health' },
            webhookStripe: { method: 'POST', path: '/api/webhook-stripe' },
            syncCheckoutSession: { method: 'POST', path: '/api/sync-checkout-session' },
            createCheckoutSession: { method: 'POST', path: '/api/create-checkout-session' },
            createPaymentLink: { method: 'POST', path: '/api/create-payment-link' },
            paymentLinkStatus: { method: 'GET', path: '/api/payment-link/[id]' }
        }
    });
};
