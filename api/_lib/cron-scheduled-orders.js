/**
 * FastSavory's - Sub-módulo: Notificação de Pedidos Agendados para o Proprietário
 */

const { createClient } = require('@supabase/supabase-js');
const { notifyOwnerScheduledOrder } = require('./manychat');

let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function getBrasiliaTomorrow() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const nowBrasilia = new Date(utc - (3 * 60 * 60 * 1000));

  const tomorrow = new Date(nowBrasilia);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

async function handleNotifyScheduledOrders(req, res) {
  if (!supabaseAdmin) {
    console.error('[Cron] Supabase not configured');
    return res.status(500).json({ error: 'Database configuration missing' });
  }

  const tomorrowDate = getBrasiliaTomorrow();
  console.log(`[Cron] Checking scheduled orders for date: ${tomorrowDate}`);

  try {
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

    const results = {
      total: orders.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (const order of orders) {
      const result = await notifyOwnerScheduledOrder(order);

      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({ id: order.id, error: result.error });
      }
    }

    return res.status(200).json({
      success: true,
      date: tomorrowDate,
      processed: results
    });

  } catch (err) {
    console.error('[Cron] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

module.exports = { handleNotifyScheduledOrders };
