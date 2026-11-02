/**
 * Endpoint Oficial do Webhook da Meta WhatsApp Cloud API
 * Rota pública: https://fastsavorys.vercel.app/api/whatsapp-webhook
 */

const handleMetaWebhook = require('./_lib/meta-whatsapp-handler');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    return await handleMetaWebhook(req, res);
};
