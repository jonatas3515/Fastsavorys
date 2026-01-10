/**
 * ManyChat Notification Endpoint
 * POST /api/notify-manychat
 * 
 * Receives order data and sends notification to ManyChat for Jéssica.
 * This endpoint is called from the frontend after an order is saved to Supabase.
 * 
 * IMPORTANT:
 * - This endpoint ALWAYS returns HTTP 200 to avoid blocking the frontend
 * - Success/failure is indicated in the JSON response body
 * - If ManyChat is not configured, it returns gracefully with success: false
 * 
 * Body: { order: OrderData }
 * Response: { success: boolean, error?: string }
 */

const { notifyNewOrder, isConfigured } = require('./_lib/manychat');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(200).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }

    // Check if ManyChat is configured
    if (!isConfigured()) {
        console.log('[notify-manychat] ManyChat not configured, skipping notification');
        return res.status(200).json({
            success: false,
            error: 'ManyChat not configured'
        });
    }

    try {
        // Parse request body
        const { order } = req.body || {};

        // Validate order data
        if (!order) {
            console.warn('[notify-manychat] No order data in request body');
            return res.status(200).json({
                success: false,
                error: 'No order data provided'
            });
        }

        // Basic validation: order should have at least an ID or code
        if (!order.id && !order.order_code) {
            console.warn('[notify-manychat] Order missing id/order_code');
            return res.status(200).json({
                success: false,
                error: 'Order missing identifier (id or order_code)'
            });
        }

        console.log(`[notify-manychat] Processing notification for order ${order.order_code || order.id}`);

        // Call ManyChat service
        const result = await notifyNewOrder(order);

        if (result.success) {
            console.log(`[notify-manychat] ✅ Notification sent for order ${order.order_code || order.id}`);
        } else {
            console.warn(`[notify-manychat] ⚠️ Notification failed for order ${order.order_code || order.id}: ${result.error}`);
        }

        // Always return 200 to not block frontend
        return res.status(200).json(result);

    } catch (err) {
        // Catch-all error handler - NEVER return 500
        console.error('[notify-manychat] ❌ Unexpected error:', err.message);
        return res.status(200).json({
            success: false,
            error: 'Internal error: ' + err.message
        });
    }
};
