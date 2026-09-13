/**
 * Vercel Serverless Function: Check Affiliate Link Health & Status
 * Safely resolves Mercado Livre affiliate links and checks if they are active/paused/broken.
 */

export default async function handler(req, res) {
  // Set CORS headers
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

    // Limit to 20 items per batch to stay fast and avoid timeout
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
          // Perform HTTP request with realistic headers
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

          // Read small portion of HTML to detect if paused / check metadata
          const text = await response.text();

          // Check if page contains indicators of paused listing
          const isPaused =
            text.includes('Anúncio pausado') ||
            text.includes('Este anúncio foi pausado') ||
            text.includes('Publicação finalizada') ||
            text.includes('Produto esgotado');

          // Extract title if available
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
            statusText: isAbort ? 'Tempo limite esgotado' : (err.message || 'Erro ao conectar'),
            statusCode: 0
          };
        }
      })
    );

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('[CheckAffiliateLinks] Erro:', error);
    return res.status(500).json({ error: 'Erro ao verificar links', details: error.message });
  }
}
