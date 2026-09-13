/**
 * Vercel Serverless Function: FastSavory's Affiliate & Mercado Livre Suite
 * Handles both:
 * 1. Auto-fetch of product details (Title, Image, Price, Discount) with ML API + Scraping
 * 2. Health check of affiliate links (Active vs Paused vs Broken)
 */

const ML_CLIENT_ID = process.env.ML_CLIENT_ID || '3591474885653129';
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || 'Pjf7vFsZUg6clNq7qwAz7dkfjvIEkf5V';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getMLAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', ML_CLIENT_ID);
    params.append('client_secret', ML_CLIENT_SECRET);

    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (res.ok) {
      const data = await res.json();
      cachedToken = data.access_token;
      tokenExpiresAt = now + (data.expires_in || 21600) * 1000;
      return cachedToken;
    }
  } catch (err) {
    console.warn('[ML API] Erro ao obter access token:', err);
  }
  return null;
}

async function fetchProductDetails(rawUrl) {
  let targetUrl = rawUrl.trim();

  // 1. Follow redirect if shortened link (like meli.la/...)
  if (targetUrl.includes('meli.la') || targetUrl.includes('mercadolivre.com/sec/')) {
    try {
      const headRes = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (headRes.url) {
        targetUrl = headRes.url;
      }
    } catch (e) {
      console.warn('[ML Auto-Fetch] Falha no redirect follow:', e);
    }
  }

  // 2. Fetch page HTML to extract full metadata
  const pageRes = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
    }
  });

  const html = await pageRes.text();

  let title = '';
  let imageUrl = '';
  let price = '';
  let originalPrice = '';
  let isPaused = false;

  const titleMatch =
    html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
    html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/\s*\|\s*Mercado\s*Livre.*$/i, '').trim();
  }

  const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
  if (imageMatch && imageMatch[1]) {
    imageUrl = imageMatch[1];
  }

  const schemaMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (schemaMatch && schemaMatch[1]) {
    try {
      const schema = JSON.parse(schemaMatch[1]);
      if (schema && schema.offers) {
        const offerPrice = schema.offers.price || schema.offers.lowPrice;
        if (offerPrice) {
          price = `R$ ${Number(offerPrice).toFixed(2).replace('.', ',')}`;
        }
      }
      if (!title && schema.name) title = schema.name;
      if (!imageUrl && schema.image) {
        imageUrl = Array.isArray(schema.image) ? schema.image[0] : schema.image;
      }
    } catch (err) {}
  }

  if (!price) {
    const priceFractionMatch = html.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
    const priceCentsMatch = html.match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
    if (priceFractionMatch && priceFractionMatch[1]) {
      const frac = priceFractionMatch[1];
      const cents = priceCentsMatch ? priceCentsMatch[1] : '00';
      price = `R$ ${frac},${cents}`;
    }
  }

  const originalPriceMatch = html.match(
    /class=["'][^"']*andes-money-amount--previous[^"']*[\s\S]*?class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i
  );
  if (originalPriceMatch && originalPriceMatch[1]) {
    originalPrice = `R$ ${originalPriceMatch[1]},00`;
  }

  if (
    html.includes('Anúncio pausado') ||
    html.includes('Este anúncio foi pausado') ||
    html.includes('Publicação finalizada') ||
    html.includes('Produto esgotado')
  ) {
    isPaused = true;
  }

  let discountPercent = 0;
  if (price && originalPrice) {
    const p1 = parseFloat(price.replace(/[^0-9,]/g, '').replace(',', '.'));
    const p2 = parseFloat(originalPrice.replace(/[^0-9,]/g, '').replace(',', '.'));
    if (p2 > p1) {
      discountPercent = Math.round(((p2 - p1) / p2) * 100);
    }
  }

  return {
    title: title || 'Produto Mercado Livre',
    image_url: imageUrl || '',
    price_display: price || '',
    original_price: originalPrice || '',
    discount_percent: discountPercent,
    is_active: !isPaused,
    final_url: targetUrl
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const action = req.query.action || req.body?.action || '';

    // Action 1: Auto-fetch product details
    if (action === 'fetch' || (req.query.url && !req.query.items && !req.body?.items)) {
      const targetUrl = req.query.url || req.body?.url;
      if (!targetUrl) {
        return res.status(400).json({ error: 'URL do produto não informada.' });
      }
      const data = await fetchProductDetails(targetUrl);
      return res.status(200).json({ success: true, data });
    }

    // Action 2: Health check
    let itemsToCheck = [];
    if (req.method === 'POST') {
      const body = req.body || {};
      itemsToCheck = body.items || (body.url ? [{ id: 0, url: body.url }] : []);
    } else {
      const url = req.query.url;
      if (url) itemsToCheck = [{ id: 0, url }];
    }

    if (!itemsToCheck || itemsToCheck.length === 0) {
      return res.status(400).json({ error: 'Nenhum link fornecido para verificação.' });
    }

    const batch = itemsToCheck.slice(0, 20);

    const results = await Promise.all(
      batch.map(async (item) => {
        const url = item.affiliate_url || item.url;
        if (!url || !url.startsWith('http')) {
          return {
            id: item.id,
            url,
            status: 'error',
            statusText: 'URL inválida',
            statusCode: 0
          };
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            redirect: 'follow',
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const finalUrl = response.url || url;
          const statusCode = response.status;

          if (statusCode === 404 || statusCode === 410) {
            return {
              id: item.id,
              url,
              finalUrl,
              status: 'paused',
              statusText: 'Anúncio não encontrado (404/Pausado)',
              statusCode
            };
          }

          if (!response.ok) {
            return {
              id: item.id,
              url,
              finalUrl,
              status: 'warning',
              statusText: `Retorno HTTP ${statusCode}`,
              statusCode
            };
          }

          const text = await response.text();

          const isPaused =
            text.includes('Anúncio pausado') ||
            text.includes('Este anúncio foi pausado') ||
            text.includes('Publicação finalizada') ||
            text.includes('Produto esgotado');

          let pageTitle = '';
          const titleMatch = text.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
          if (titleMatch && titleMatch[1]) {
            pageTitle = titleMatch[1];
          }

          if (isPaused) {
            return {
              id: item.id,
              url,
              finalUrl,
              title: pageTitle,
              status: 'paused',
              statusText: 'Anúncio Pausado / Finalizado pelo vendedor',
              statusCode: 200
            };
          }

          return {
            id: item.id,
            url,
            finalUrl,
            title: pageTitle,
            status: 'active',
            statusText: 'Online e Ativo',
            statusCode: 200
          };
        } catch (err) {
          const isAbort = err.name === 'AbortError';
          return {
            id: item.id,
            url,
            status: isAbort ? 'timeout' : 'error',
            statusText: isAbort ? 'Tempo limite esgotado' : err.message || 'Erro ao conectar',
            statusCode: 0
          };
        }
      })
    );

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('[Affiliate Suite] Erro:', error);
    return res.status(500).json({ error: 'Erro ao processar', details: error.message });
  }
}
