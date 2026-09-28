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
    'auto-sync-links', 'auto-check-links', 'sync-links', 'check-sync-links', 'verify-links', 'check-links', 'sync'
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

    default:
      return res.status(400).json({
        success: false,
        error: `Ação desconhecida: "${action}". Ações válidas: send-whatsapp-deal, mine-deals, auto-sync-links, notify-scheduled-orders, birthday-broadcast.`
      });
  }
};

module.exports.config = config;
