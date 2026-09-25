/**
 * FastSavory's - Autonomous Deals Miner Endpoint
 * Can be triggered via GET/POST or scheduled via Cron
 */

const { handleMineDeals } = require('./_lib/cron-deals-miner');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return handleMineDeals(req, res);
};
