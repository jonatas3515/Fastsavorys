const { createClient } = require('@supabase/supabase-js');
const { notifyOwnerScheduledOrder } = require('../_lib/manychat');

// Initialize Supabase Admin Client
let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
}

/**
 * Helper: Get "Tomorrow's" Date in Brasilia Time (UTC-3)
 * Returns YYYY-MM-DD string
 */
function getBrasiliaTomorrow() {
    const now = new Date();
    // Convert to Brasilia Time (UTC-3)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowBrasilia = new Date(utc - (3 * 60 * 60 * 1000));

    // Add 1 day
    const tomorrow = new Date(nowBrasilia);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Format YYYY-MM-DD
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

/**
 * Vercel Cron Handler
 */
module.exports = async function handler(req, res) {
    // 1. Basic Security & Setup
    if (!supabaseAdmin) {
        console.error('[Cron] Supabase not configured');
        return res.status(500).json({ error: 'Database configuration missing' });
    }

    // Verify Vercel Cron Signature (optional but recommended in prod)
    // For now, we allow manual triggering if query param ?key=SECRET is present 
    // or if it comes from Vercel's internal cron system.

    const tomorrowDate = getBrasiliaTomorrow();
    console.log(`[Cron] Checking scheduled orders for date: ${tomorrowDate}`);

    try {
        // 2. Query Supabase for Tomorrow's Scheduled Orders
        // Status must be NOT cancelled.
        const { data: orders, error } = await supabaseAdmin
            .from('fast_orders')
            .select('*')
            .eq('scheduled_date', tomorrowDate)
            .neq('status', 'cancelled');

        if (error) {
            console.error('[Cron] Database error:', error);
            return res.status(500).json({ error: 'Database error', details: error.message });
        }

        if (!orders || orders.length === 0) {
            console.log('[Cron] No scheduled orders found for tomorrow.');
            return res.status(200).json({
                success: true,
                message: 'No scheduled orders for tomorrow',
                date: tomorrowDate,
                count: 0
            });
        }

        console.log(`[Cron] Found ${orders.length} scheduled order(s) for tomorrow.`);

        // 3. Process Notifications
        const results = {
            total: orders.length,
            success: 0,
            failed: 0,
            errors: []
        };

        for (const order of orders) {
            // Check if order has a specific scheduled time, otherwise execute logic as is
            // We pass the full order object to the helper
            const result = await notifyOwnerScheduledOrder(order);

            if (result.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push({ id: order.id, error: result.error });
            }
        }

        // 4. Return Summary
        return res.status(200).json({
            success: true,
            date: tomorrowDate,
            processed: results
        });

    } catch (err) {
        console.error('[Cron] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
};
