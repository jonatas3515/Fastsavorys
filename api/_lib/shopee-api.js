/**
 * FastSavory's - Shopee Affiliate Open API Integration (GraphQL)
 * Documentação: Shopee Affiliate Open Platform
 */

const crypto = require('crypto');

const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '18372871276';
const SHOPEE_SECRET = process.env.SHOPEE_SECRET || '6VO6DGJJFSUI37FVABAAFIP3H4276G4K';

/**
 * Envia uma requisição autenticada para a GraphQL API da Shopee
 */
async function shopeeRequest(query) {
  const payloadStr = typeof query === 'string' ? JSON.stringify({ query }) : JSON.stringify(query);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const factor = SHOPEE_APP_ID + timestamp + payloadStr + SHOPEE_SECRET;
  const signature = crypto.createHash('sha256').update(factor).digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `SHA256 Credential=${SHOPEE_APP_ID},Timestamp=${timestamp},Signature=${signature}`
  };

  const response = await fetch(SHOPEE_API_URL, {
    method: 'POST',
    headers,
    body: payloadStr
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Shopee API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(`Shopee GraphQL Error: ${data.errors[0].message}`);
  }

  return data.data;
}

/**
 * Converte qualquer link de produto da Shopee em link oficial de afiliado
 */
async function generateShopeeShortLink(originUrl, subIds = ['fastsavorys']) {
  if (!originUrl) throw new Error('originUrl é obrigatório');

  const query = {
    query: `mutation {
      generateShortLink(input: {
        originUrl: ${JSON.stringify(originUrl)}
        ${subIds && subIds.length ? `subIds: ${JSON.stringify(subIds)}` : ''}
      }) {
        shortLink
      }
    }`
  };

  const data = await shopeeRequest(query);
  return data?.generateShortLink?.shortLink || null;
}

/**
 * Extrai o itemId de links de produtos Shopee
 */
function extractShopeeItemId(url = '') {
  if (!url) return null;

  // Formato: /product/12345/67890 ou /opaanlp/12345/67890
  const productMatch = url.match(/(?:\/product|\/opaanlp)\/\d+\/(\d+)/i);
  if (productMatch && productMatch[1]) {
    return productMatch[1];
  }

  // Formato: -i.12345.67890
  const iMatch = url.match(/-i\.\d+\.(\d+)/i);
  if (iMatch && iMatch[1]) {
    return iMatch[1];
  }

  // Formato com itemId na query string ?item_id=67890 ou ?itemId=67890
  const queryMatch = url.match(/[?&]item_?id=(\d+)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  return null;
}

/**
 * Resolve link encurtado da Shopee (ex: s.shopee.com.br ou shope.ee) até obter o link de destino
 */
async function resolveShopeeUrl(url) {
  let currentUrl = url;
  if (currentUrl.includes('s.shopee.com.br') || currentUrl.includes('shope.ee')) {
    try {
      const resp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      if (resp.url) {
        currentUrl = resp.url;
      }
    } catch (e) {
      console.warn('[Shopee API] Erro ao resolver redirect curto:', e.message);
    }
  }
  return currentUrl;
}

/**
 * Busca detalhes completos do produto na Shopee via GraphQL API
 */
async function getShopeeProductDetails(rawUrl) {
  const resolvedUrl = await resolveShopeeUrl(rawUrl);
  const itemId = extractShopeeItemId(resolvedUrl);

  if (!itemId) {
    // Se não conseguimos extrair o itemId, geramos ao menos o link de afiliado
    const shortLink = await generateShopeeShortLink(rawUrl).catch(() => null);
    return {
      affiliate_url: shortLink || rawUrl,
      platform: 'shopee'
    };
  }

  const query = {
    query: `query {
      productOfferV2(itemId: ${itemId}) {
        nodes {
          itemId
          productName
          imageUrl
          price
          priceMin
          priceMax
          sales
          ratingStar
          offerLink
          commissionRate
          commission
          shopName
        }
      }
    }`
  };

  const data = await shopeeRequest(query);
  const node = data?.productOfferV2?.nodes?.[0];

  if (!node) {
    // Produto não encontrado diretamente no catálogo de ofertas, gera link encurtado
    const shortLink = await generateShopeeShortLink(rawUrl).catch(() => null);
    return {
      affiliate_url: shortLink || rawUrl,
      platform: 'shopee'
    };
  }

  const priceVal = parseFloat(node.priceMin || node.price || '0');
  const priceDisplay = priceVal > 0 ? `R$ ${priceVal.toFixed(2).replace('.', ',')}` : '';

  let originalPrice = '';
  let discountTag = '';
  const priceMaxVal = parseFloat(node.priceMax || '0');
  if (priceMaxVal > priceVal) {
    originalPrice = `R$ ${priceMaxVal.toFixed(2).replace('.', ',')}`;
    const pct = Math.round(((priceMaxVal - priceVal) / priceMaxVal) * 100);
    if (pct > 0) discountTag = `${pct}% OFF`;
  }

  return {
    title: node.productName,
    price_display: priceDisplay,
    price: priceVal,
    original_price: originalPrice,
    discount_tag: discountTag,
    image_url: node.imageUrl,
    affiliate_url: node.offerLink || rawUrl,
    rating: node.ratingStar,
    sales: node.sales,
    commission_rate: node.commissionRate,
    shop_name: node.shopName,
    platform: 'shopee',
    is_active: true
  };
}

/**
 * Busca lista de ofertas e achadinhos em destaque da Shopee
 */
async function getShopeeOffers({ page = 1, limit = 10, keyword = null } = {}) {
  const args = [`page: ${page}`, `limit: ${limit}`];
  if (keyword) {
    args.push(`keyword: ${JSON.stringify(keyword)}`);
  }

  const query = {
    query: `query {
      productOfferV2(${args.join(', ')}) {
        nodes {
          itemId
          productName
          imageUrl
          price
          priceMin
          priceMax
          sales
          ratingStar
          offerLink
          commissionRate
          commission
          shopName
        }
      }
    }`
  };

  const data = await shopeeRequest(query);
  return data?.productOfferV2?.nodes || [];
}

module.exports = {
  SHOPEE_APP_ID,
  SHOPEE_SECRET,
  shopeeRequest,
  generateShopeeShortLink,
  extractShopeeItemId,
  resolveShopeeUrl,
  getShopeeProductDetails,
  getShopeeOffers
};
