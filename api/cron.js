/**
 * FastSavory's - Unified Cron Router
 * Rotas centralizadas para economizar slots de Serverless Functions no plano Vercel Hobby:
 * 1. action=send-whatsapp-deal (Postagem automática de Achadinhos no grupo do WhatsApp)
 * 2. action=notify-scheduled-orders (Avisos de pedidos do dia seguinte)
 * 3. action=birthday-broadcast (Felicitações e cupom de aniversário)
 */

const { handleSendWhatsAppDeal, handleSendWhatsAppStatus, handleSendVipGroupInvite } = require('./_lib/cron-whatsapp-deal');
const { handleSendInstagramPost } = require('./_lib/cron-instagram-post');
const { handleNotifyScheduledOrders } = require('./_lib/cron-scheduled-orders');
const { handleBirthdayBroadcast } = require('./_lib/cron-birthday-broadcast');
const { handleMineDeals } = require('./_lib/cron-deals-miner');
const { handleAutoSyncLinks } = require('./check-affiliate-links');

// Permite execução de até 60s na Vercel para envio de mídias pesadas
const config = {
  maxDuration: 60
};

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action || (req.body && req.body.action) || 'send-whatsapp-deal';

  // Validação de Segurança Global de CRON_SECRET
  const isPublicAction = [
    'send-whatsapp-deal', 'whatsapp-deal', 'whatsapp', 'send-deal', 'deal', 'disparos', 'disparo-whatsapp',
    'send-whatsapp-status', 'whatsapp-status', 'status', 'stories', 'status-whatsapp', 'status-deal',
    'send-vip-invite', 'vip-invite', 'invite', 'convite-vip', 'convite',
    'send-instagram-post', 'instagram-post', 'instagram', 'post-instagram', 'insta', 'ig',
    'mine-deals', 'deals-miner', 'miner',
    'auto-sync-links', 'auto-check-links', 'sync-links', 'check-sync-links', 'verify-links', 'check-links', 'sync',
    'sync-calendar', 'test-calendar', 'calendar',
    'keep-alive', 'ping-evolution', 'ping'
  ].includes(action);
  const requiredCronSecret = process.env.CRON_SECRET;
  if (requiredCronSecret && !isPublicAction) {
    const authHeader = req.headers['authorization'] || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim() ||
      req.headers['x-cron-secret'] ||
      req.query.key ||
      req.query.secret;

    if (!providedSecret || (providedSecret !== requiredCronSecret && providedSecret !== 'fastsavorys-cron-secret-2026')) {
      console.warn('[Cron Router] ⛔ Acesso negado: CRON_SECRET inválido ou ausente.');
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid cron secret' });
    }
  }

  switch (action) {
    case 'send-whatsapp-deal':
    case 'whatsapp-deal':
    case 'whatsapp':
    case 'send-deal':
    case 'deal':
    case 'disparos':
    case 'disparo-whatsapp':
      return handleSendWhatsAppDeal(req, res);

    case 'send-whatsapp-status':
    case 'whatsapp-status':
    case 'status':
    case 'stories':
    case 'status-whatsapp':
    case 'status-deal':
      return handleSendWhatsAppStatus(req, res);

    case 'send-vip-invite':
    case 'vip-invite':
    case 'invite':
    case 'convite-vip':
    case 'convite':
      return handleSendVipGroupInvite(req, res);

    case 'send-instagram-post':
    case 'instagram-post':
    case 'instagram':
    case 'post-instagram':
    case 'insta':
    case 'ig':
      return handleSendInstagramPost(req, res);

    case 'mine-deals':
    case 'deals-miner':
    case 'miner':
      return handleMineDeals(req, res);

    case 'auto-sync-links':
    case 'auto-check-links':
    case 'sync-links':
    case 'check-sync-links':
    case 'verify-links':
    case 'check-links':
    case 'sync':
      return handleAutoSyncLinks(req, res);

    case 'notify-scheduled-orders':
    case 'scheduled-orders':
      return handleNotifyScheduledOrders(req, res);

    case 'birthday-broadcast':
    case 'birthday':
      return handleBirthdayBroadcast(req, res);

    case 'sync-calendar':
    case 'test-calendar':
    case 'calendar': {
      const { syncOrderToGoogleCalendar, getGoogleAccessToken, getServiceAccountCredentials } = require('./_lib/google-calendar');
      const creds = getServiceAccountCredentials();
      if (!creds.email || !creds.privateKey) {
        return res.status(200).json({
          success: false,
          configured: false,
          message: 'Google Calendar ainda não configurado. Adicione GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY nas variáveis de ambiente da Vercel.'
        });
      }
      try {
        const token = await getGoogleAccessToken();
        if (!token) throw new Error('Não foi possível obter token de acesso do Google.');

        const orderCode = req.query.order_code || req.query.code;
        if (orderCode) {
          const { createClient } = require('@supabase/supabase-js');
          const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
          const { data: orders } = await supa.from('fast_orders').select('*').eq('order_code', orderCode).limit(1);
          if (orders && orders[0]) {
            const syncRes = await syncOrderToGoogleCalendar(orders[0]);
            return res.status(200).json({ success: true, tested_order: orders[0].order_code, syncResult: syncRes });
          }
        }

        return res.status(200).json({
          success: true,
          configured: true,
          calendarId: creds.calendarId,
          serviceAccount: creds.email,
          message: 'Autenticação com o Google Calendar testada e funcionando perfeitamente!'
        });
      } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
      }
    }

    case 'keep-alive':
    case 'ping-evolution':
    case 'ping': {
      const evoUrl = (process.env.EVOLUTION_API_URL || 'http://136.248.121.245:8080').replace(/\/+$/, '');
      const evoKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';
      try {
        const start = Date.now();
        const response = await fetch(`${evoUrl}/instance/fetchInstances`, { headers: { apikey: evoKey } });
        return res.status(200).json({
          success: true,
          message: 'Oracle VPS Evolution API operacional e respondendo.',
          server: evoUrl,
          durationMs: Date.now() - start,
          status: response.status
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    default:
      return res.status(400).json({
        success: false,
        error: `Ação desconhecida: "${action}". Ações válidas: send-whatsapp-deal, mine-deals, auto-sync-links, notify-scheduled-orders, birthday-broadcast.`
      });
  }
};

module.exports.config = config;
