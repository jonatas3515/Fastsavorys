/**
 * FastSavory's - Unified Cron Router
 * Rotas centralizadas para economizar slots de Serverless Functions no plano Vercel Hobby:
 * 1. action=send-whatsapp-deal (Postagem automática de Achadinhos no grupo do WhatsApp)
 * 2. action=notify-scheduled-orders (Avisos de pedidos do dia seguinte)
 * 3. action=birthday-broadcast (Felicitações e cupom de aniversário)
 */

const { handleSendWhatsAppDeal } = require('./_lib/cron-whatsapp-deal');
const { handleNotifyScheduledOrders } = require('./_lib/cron-scheduled-orders');
const { handleBirthdayBroadcast } = require('./_lib/cron-birthday-broadcast');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validação de Segurança Global de CRON_SECRET
  const requiredCronSecret = process.env.CRON_SECRET;
  if (requiredCronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim() ||
      req.headers['x-cron-secret'] ||
      req.query.key ||
      req.query.secret;

    if (!providedSecret || providedSecret !== requiredCronSecret) {
      console.warn('[Cron Router] ⛔ Acesso negado: CRON_SECRET inválido ou ausente.');
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid cron secret' });
    }
  }

  const action = req.query.action || (req.body && req.body.action) || 'send-whatsapp-deal';

  switch (action) {
    case 'send-whatsapp-deal':
    case 'whatsapp-deal':
      return handleSendWhatsAppDeal(req, res);

    case 'notify-scheduled-orders':
    case 'scheduled-orders':
      return handleNotifyScheduledOrders(req, res);

    case 'birthday-broadcast':
    case 'birthday':
      return handleBirthdayBroadcast(req, res);

    default:
      return res.status(400).json({
        success: false,
        error: `Ação desconhecida: "${action}". Ações válidas: send-whatsapp-deal, notify-scheduled-orders, birthday-broadcast.`
      });
  }
};
