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

function extractProductPriceAndStatus(html) {
  let price = '';
  let originalPrice = '';
  let discountTag = '';
  let isPaused = false;

  if (
    html.includes('Anúncio pausado') ||
    html.includes('Este anúncio foi pausado') ||
    html.includes('Publicação finalizada') ||
    html.includes('Produto esgotado')
  ) {
    isPaused = true;
  }

  // 1. Check embedded Mercado Livre Social / PDP JSON state
  const currMatch = html.match(/"current_price":\s*\{\s*"value":\s*([0-9.]+)/i) || 
                    html.match(/current_price.*?value.*?([0-9.]+)/i);
  if (currMatch && currMatch[1]) {
    price = `R$ ${Number(currMatch[1]).toFixed(2).replace('.', ',')}`;
  }

  const prevMatch = html.match(/"previous_price":\s*\{\s*"value":\s*([0-9.]+)/i) || 
                    html.match(/previous_price.*?value.*?([0-9.]+)/i);
  if (prevMatch && prevMatch[1]) {
    originalPrice = `R$ ${Number(prevMatch[1]).toFixed(2).replace('.', ',')}`;
  }

  const discMatch = html.match(/"discount_label":\s*\{\s*"text":\s*"([^"]+)"/i) || 
                    html.match(/discount_label.*?text.*?"([^"]+)"/i);
  if (discMatch && discMatch[1]) {
    discountTag = discMatch[1];
  }

  // 2. Check JSON-LD schema fallback
  if (!price) {
    const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const schema = JSON.parse(match[1]);
        if (schema) {
          const offers = schema.offers;
          if (offers) {
            const offerPrice = offers.price || offers.lowPrice || (Array.isArray(offers) ? offers[0]?.price : null);
            if (offerPrice) {
              price = `R$ ${Number(offerPrice).toFixed(2).replace('.', ',')}`;
              break;
            }
          }
        }
      } catch (err) {}
    }
  }

  // 3. Check Meta Tags for price
  if (!price) {
    const metaPrice = html.match(/<meta\s+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']\s+content=["']([0-9.]+)["']/i) ||
                      html.match(/<meta\s+content=["']([0-9.]+)["']\s+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']/i);
    if (metaPrice && metaPrice[1]) {
      price = `R$ ${Number(metaPrice[1]).toFixed(2).replace('.', ',')}`;
    }
  }

  // 4. Fallback price regex from Andes money HTML structure
  if (!price) {
    const priceFractionMatch = html.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
    const priceCentsMatch = html.match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
    if (priceFractionMatch && priceFractionMatch[1]) {
      const frac = priceFractionMatch[1];
      const cents = priceCentsMatch ? priceCentsMatch[1] : '00';
      price = `R$ ${frac},${cents}`;
    }
  }

  // 5. Previous price fallback from Andes HTML
  if (!originalPrice) {
    const originalPriceMatch = html.match(
      /class=["'][^"']*andes-money-amount--previous[^"']*[\s\S]*?class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i
    );
    if (originalPriceMatch && originalPriceMatch[1]) {
      originalPrice = `R$ ${originalPriceMatch[1]},00`;
    }
  }

  return { price, originalPrice, discountTag, isPaused };
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

  const { price, originalPrice, discountTag, isPaused } = extractProductPriceAndStatus(html);

  let discountPercent = 0;
  if (price && originalPrice) {
    const p1 = parseFloat(price.replace(/[^0-9,]/g, '').replace(',', '.'));
    const p2 = parseFloat(originalPrice.replace(/[^0-9,]/g, '').replace(',', '.'));
    if (p2 > p1) {
      discountPercent = Math.round(((p2 - p1) / p2) * 100);
    }
  }

  const finalTitle = title || 'Produto Mercado Livre';
  const detectedCategory = detectCategory(finalTitle, '', targetUrl);

  return {
    title: finalTitle,
    image_url: imageUrl || '',
    price_display: price || '',
    original_price: originalPrice || '',
    discount_percent: discountPercent,
    discount_tag: discountTag || (discountPercent > 0 ? `${discountPercent}% OFF` : ''),
    category: detectedCategory,
    is_active: !isPaused,
    final_url: targetUrl
  };
}

function detectCategory(title = '', description = '', url = '') {
  const text = `${title} ${description} ${url}`.toLowerCase();

  const rules = [
    {
      category: 'joias',
      keywords: ['relogio', 'relógio', 'smartwatch', 'pulseira', 'colar', 'brinco', 'anel', 'corrente', 'pingente', 'alianca', 'aliança', 'joia', 'jóia', 'semijoia', 'ouro 18k', 'prata 925', 'gargantilha']
    },
    {
      category: 'celulares',
      keywords: ['smartphone', 'celular', 'iphone', 'xiaomi', 'galaxy', 'motorola', 'redmi', 'poco', 'realme', 'capinha', 'pelicula celular', 'carregador tipo c', 'carregador celular', 'suporte celular', 'ring light']
    },
    {
      category: 'informatica',
      keywords: ['notebook', 'computador', 'computador gamer', 'laptop', 'macbook', 'mouse', 'teclado', 'monitor', 'impressora', 'ssd', 'memoria ram', 'pendrive', 'pen drive', 'roteador', 'placa de video', 'headset gamer', 'gabinete', 'fonte atx', 'webcam', 'tablet', 'ipad']
    },
    {
      category: 'eletronicos',
      keywords: ['smart tv', 'tv', 'televisao', 'televisão', 'alexa', 'echo dot', 'fone de ouvido', 'fone bluetooth', 'headphone', 'airpod', 'caixa de som', 'jbl', 'som bluetooth', 'soundbar', 'microfone', 'projetor', 'camera digital', 'drone', 'power bank']
    },
    {
      category: 'confeitaria',
      keywords: ['confeitaria', 'forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'pasta americana', 'corante alimenticio', 'assadeira bolo']
    },
    {
      category: 'cozinha',
      keywords: ['air fryer', 'airfryer', 'fritadeira', 'panela', 'panelas', 'frigideira', 'liquidificador', 'batedeira', 'microondas', 'micro-ondas', 'fogao', 'fogão', 'cooktop', 'forno', 'cafeteira', 'nespresso', 'dolce gusto', 'sanduicheira', 'grill', 'mixer', 'processador', 'chaleira', 'faqueiro', 'faca chef', 'prato', 'copo', 'talher', 'balanca cozinha', 'balança digital', 'garrafa termica']
    },
    {
      category: 'embalagens',
      keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita', 'kit festa']
    },
    {
      category: 'supermercado',
      keywords: ['whisky', 'gin', 'vodka', 'cerveja', 'vinho', 'espumante', 'refrigerante', 'suco', 'cafe em graos', 'café', 'capsula cafe', 'cha', 'chá', 'azeite', 'arroz', 'feijao', 'feijão', 'chocolate', 'bombom', 'biscoito', 'bolacha', 'doce de leite', 'nutella', 'snack', 'whey', 'creatina', 'suplemento', 'tempero', 'molho', 'bebida', 'alimento']
    },
    {
      category: 'perfumaria',
      keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'hidratante', 'sabonete', 'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'skincare', 'serum facial', 'protetor solar', 'maquiagem', 'batom', 'base facial', 'rimel', 'delineador', 'esmalte']
    },
    {
      category: 'banho',
      keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro']
    },
    {
      category: 'moda',
      keywords: ['camisa', 'camiseta', 'calca', 'calça', 'vestido', 'saia', 'bermuda', 'short', 'tenis', 'tênis', 'sapato', 'sandalia', 'sandália', 'bota', 'chinelo', 'havaianas', 'bolsa', 'mochila', 'carteira', 'cinto', 'jaqueta', 'moletom', 'casaco', 'biquini', 'biquíni', 'lingerie', 'meia', 'cueca', 'sutia', 'oculos de sol']
    },
    {
      category: 'brinquedos',
      keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime']
    },
    {
      category: 'bebes',
      keywords: ['bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'berco', 'berço', 'body bebe', 'macacao bebe', 'mordedor', 'babador', 'lenço umedecido', 'cadeirinha carro']
    },
    {
      category: 'petshop',
      keywords: ['racao', 'ração', 'cachorro', 'gato', 'pet', 'coleira', 'guia cachorro', 'arranhador', 'caminha pet', 'cama pet', 'petisco', 'comedouro', 'bebedouro pet', 'areia gato', 'tapete higienico', 'shampoo pet']
    },
    {
      category: 'veiculos',
      keywords: ['automotivo', 'carro', 'moto', 'motocicleta', 'pneu', 'capacete', 'farol', 'oleo motor', 'óleo motor', 'som automotivo', 'camera de re', 'capa automotiva', 'cera automotiva']
    },
    {
      category: 'livros',
      keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel']
    },
    {
      category: 'construcao',
      keywords: ['furadeira', 'parafusadeira', 'martelete', 'martelo', 'chave de fenda', 'chave phillips', 'trena', 'serra eletrica', 'serra circular', 'esmerilhadeira', 'ferramenta', 'jogo de ferramentas', 'torneira', 'chuveiro', 'tomada', 'extensao eletrica', 'lampada led', 'tinta parede']
    },
    {
      category: 'presentes',
      keywords: ['presente', 'lembrancinha', 'caneca personalizada', 'kit presente', 'cesta cafe da manha', 'quadro decorativo', 'luminaria 3d', 'porta retrato', 'chaveiro']
    },
    {
      category: 'utilidades',
      keywords: ['organizador', 'pote hermetico', 'potes hermeticos', 'vassoura', 'mop', 'rodo', 'dispenser', 'lixeira', 'cabide', 'varal', 'cesto organizador', 'tapete', 'cortina', 'almofada', 'decoracao', 'decoração', 'prateleira', 'espelho', 'umidificador']
    }
  ];

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return rule.category;
      }
    }
  }

  return 'utilidades';
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

    const batch = itemsToCheck.slice(0, 50);

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

          const { price, originalPrice, discountTag, isPaused } = extractProductPriceAndStatus(text);

          let pageTitle = '';
          const titleMatch =
            text.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
            text.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            pageTitle = titleMatch[1].replace(/\s*\|\s*Mercado\s*Livre.*$/i, '').trim();
          }

          if (isPaused) {
            return {
              id: item.id,
              url,
              finalUrl,
              title: pageTitle,
              price: price || '',
              original_price: originalPrice || '',
              status: 'paused',
              statusText: 'Anúncio Pausado / Esgotado no ML',
              statusCode: 200
            };
          }

          return {
            id: item.id,
            url,
            finalUrl,
            title: pageTitle,
            price: price || '',
            original_price: originalPrice || '',
            discount_tag: discountTag || '',
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
