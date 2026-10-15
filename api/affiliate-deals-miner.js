/**
 * FastSavory's - Autonomous Deals Miner Endpoint
 * Can be triggered via GET/POST or scheduled via Cron
 */

const { handleMineDeals, handleMineShopeeDeals } = require('./_lib/cron-deals-miner');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const platform = (req.query?.platform || req.body?.platform || '').toLowerCase();
  if (platform === 'shopee') {
    return handleMineShopeeDeals(req, res);
  }

  return handleMineDeals(req, res);
};

