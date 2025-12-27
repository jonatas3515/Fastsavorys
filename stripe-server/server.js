require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY não encontrada no .env. Configure e reinicie o servidor.');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
  : null;

// Middleware
app.use(cors());

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecretRaw = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecretRaw) {
    return res.status(500).send('STRIPE_WEBHOOK_SECRET não configurado no .env');
  }
  if (!supabaseAdmin) {
    return res.status(500).send('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados no .env');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const secrets = String(webhookSecretRaw)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let lastErr;
    for (const secret of secrets) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!event) {
      throw lastErr || new Error('Assinatura inválida');
    }
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log(`🔔 Webhook recebido: ${event.type} (${event.id})`);
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
        const paymentStatus = (total > 0 && amountPaid + 0.009 < total) ? 'paid_partial' : 'paid_full';

        const { error: upErr } = await supabaseAdmin
          .from('fast_orders')
          .update({
            payment_status: paymentStatus,
            amount_paid: amountPaid,
            stripe_payment_id: pi.id
          })
          .eq('id', orderId);

        if (upErr) throw upErr;
        console.log(`✅ Pedido ${orderId} atualizado no Supabase: ${paymentStatus} (R$ ${amountPaid})`);
      } else {
        console.warn('⚠️ payment_intent.succeeded sem metadata.order_id; ignorando');
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
        const paymentStatus = (total > 0 && amountPaid + 0.009 < total) ? 'paid_partial' : 'paid_full';

        const { error: upErr } = await supabaseAdmin
          .from('fast_orders')
          .update({
            payment_status: paymentStatus,
            amount_paid: amountPaid,
            stripe_payment_id: session.payment_intent || session.id
          })
          .eq('id', orderId);

        if (upErr) throw upErr;
        console.log(`✅ Pedido ${orderId} atualizado no Supabase via Checkout: ${paymentStatus} (R$ ${amountPaid})`);
      } else {
        console.warn('⚠️ checkout.session.* sem metadata.order_id/client_reference_id; ignorando');
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
        console.log(`↩️ Pedido ${orderId} marcado como reembolsado`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
});

app.use(express.json());

app.post('/sync-checkout-session', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados no .env' });
    }

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
      ? ((total > 0 && amountPaid + 0.009 < total) ? 'paid_partial' : 'paid_full')
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

    console.log(`🔄 Sync Checkout: session ${sessionId} -> pedido ${orderId} (${paymentStatus})`);
    return res.json({ success: true, orderId: String(orderId), payment_status: paymentStatus, amount_paid: amountPaid });
  } catch (err) {
    console.error('❌ Sync Checkout error:', err);
    return res.status(400).json({ error: err.message || 'Falha ao sincronizar checkout' });
  }
});

// Friendly message for accidental GET
app.get('/create-checkout-session', (req, res) => {
  res.status(405).json({ error: 'Use POST /create-checkout-session (JSON body).' });
});

// Create Checkout Session (recommended)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { orderId, amount, customerEmail, customerName } = req.body;

    console.log(`Creating Checkout Session for order ${orderId}, amount: R$ ${amount}`);

    if (!orderId || !amount) {
      return res.status(400).json({
        error: 'orderId e amount são obrigatórios'
      });
    }

    const successUrl = process.env.CHECKOUT_SUCCESS_URL || 'http://localhost:8000/pages/fast.html?checkout=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelBaseUrl = process.env.CHECKOUT_CANCEL_URL || 'http://localhost:8000/pages/fast.html?checkout=cancel&order_id=';
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

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    res.status(400).json({
      error: error.message
    });
  }
});

// Root (friendly info)
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    routes: {
      health: { method: 'GET', path: '/health' },
      webhookStripe: { method: 'POST', path: '/webhook/stripe' },
      syncCheckoutSession: { method: 'POST', path: '/sync-checkout-session' },
      createCheckoutSession: { method: 'POST', path: '/create-checkout-session' },
      createPaymentLink: { method: 'POST', path: '/create-payment-link' },
      paymentLinkStatus: { method: 'GET', path: '/payment-link/:id' }
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Friendly message for accidental GET
app.get('/create-payment-link', (req, res) => {
  res.status(405).json({ error: 'Use POST /create-payment-link (JSON body).' });
});

// Create payment link
app.post('/create-payment-link', async (req, res) => {
  try {
    const { orderId, amount, customerEmail, customerName } = req.body;
    
    console.log(`Creating payment link for order ${orderId}, amount: R$ ${amount}`);
    
    if (!orderId || !amount) {
      return res.status(400).json({ 
        error: 'orderId e amount são obrigatórios' 
      });
    }
    
    const waText = `Ola! Paguei o pedido #${orderId}`;
    const waUrl = `https://wa.me/5573999366554?text=${encodeURIComponent(waText)}`;

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Pedido Fast Savory's #${orderId}`,
            description: `Pedido para ${customerName || 'Cliente'}`,
            images: [] // Adicione URL do logo se tiver
          },
          unit_amount: Math.round(amount * 100), // converte para centavos
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
    
    res.json({ 
      success: true,
      url: paymentLink.url,
      paymentLinkId: paymentLink.id
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(400).json({ 
      error: error.message 
    });
  }
});

// Get payment link status
app.get('/payment-link/:id', async (req, res) => {
  try {
    const paymentLink = await stripe.paymentLinks.retrieve(req.params.id);
    res.json(paymentLink);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Stripe Server running on http://localhost:${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
  console.log(`🧾 Checkout Session: POST http://localhost:${PORT}/create-checkout-session`);
  console.log(`💳 Create payment link: POST http://localhost:${PORT}/create-payment-link`);
  console.log(`🔄 Sync Checkout (fallback): POST http://localhost:${PORT}/sync-checkout-session`);
  console.log(`🔔 Webhook endpoint: POST http://localhost:${PORT}/webhook/stripe`);
  console.log(`\n🔐 STRIPE_SECRET_KEY carregada: ${process.env.STRIPE_SECRET_KEY ? 'SIM' : 'NÃO'}`);
  console.log(`🔐 STRIPE_WEBHOOK_SECRET carregada: ${process.env.STRIPE_WEBHOOK_SECRET ? 'SIM' : 'NÃO'}`);
  console.log(`🔐 SUPABASE_URL configurada: ${process.env.SUPABASE_URL ? 'SIM' : 'NÃO'}`);
  console.log(`🔐 SUPABASE_SERVICE_ROLE_KEY configurada: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SIM' : 'NÃO'}`);
});
