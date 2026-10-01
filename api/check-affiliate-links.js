/**
 * Vercel Serverless Function: FastSavory's Affiliate & Mercado Livre Suite (High-Precision Scraper)
 * Handles:
 * 1. Auto-fetch of product details (Title, Image, Genuine BuyBox Price, Discount)
 * 2. High-precision Health & Price Check of affiliate links (detects exact price drops and increases)
 */

const shopeeApi = require('./_lib/shopee-api');

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon') || u.includes('amzn') || u.includes('a.co') || u.includes('amzlinks')) {
    return 'amazon';
  }
  if (u.includes('shopee') || u.includes('s.shopee') || u.includes('shope.ee')) {
    return 'shopee';
  }
  if (u.includes('natura') || (u.includes('scvald') && !u.includes('avon'))) {
    return 'natura';
  }
  if (u.includes('avon')) {
    return 'avon';
  }
  if (u.includes('mercadolivre') || u.includes('mercadolibre') || u.includes('meli.la')) {
    return 'mercadolivre';
  }
  return 'marketplace';
}

function cleanTitle(title = '', platform = '') {
  if (!title) return '';
  let clean = title.trim();
  clean = clean.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  if (platform === 'mercadolivre' || !platform) {
    clean = clean.replace(/\s*\|\s*Mercado\s*Livre.*$/i, '')
                 .replace(/\s*-\s*Mercado\s*Livre.*$/i, '');
  }
  if (platform === 'amazon' || !platform) {
    clean = clean.replace(/\s*:\s*Amazon\.com\.br:.*$/i, '')
                 .replace(/\s*\|\s*Amazon.*$/i, '')
                 .replace(/\s*-\s*Amazon.*$/i, '');
  }
  if (platform === 'shopee' || !platform) {
    clean = clean.replace(/\s*\|\s*Shopee\s*Brasil.*$/i, '')
                 .replace(/\s*-\s*Shopee.*$/i, '');
  }
  if (platform === 'natura' || !platform) {
    clean = clean.replace(/\s*\|\s*Natura.*$/i, '')
                 .replace(/\s*-\s*Natura.*$/i, '');
  }
  if (platform === 'avon' || !platform) {
    clean = clean.replace(/\s*\|\s*Avon.*$/i, '')
                 .replace(/\s*-\s*Avon.*$/i, '');
  }
  return clean.trim();
}

function cleanAmazonImageUrl(url = '') {
  if (!url) return '';
  const m = url.match(/(https?:\/\/[^\/]+\/images\/I\/[a-zA-Z0-9+_.-]+?)(?:\._[^.]+\.jpg|\.jpg_.*|\.jpg)$/i);
  if (m && m[1]) {
    return `${m[1]}.jpg`;
  }
  return url;
}

function formatBrlNumber(num) {
  if (num === null || num === undefined || isNaN(num) || num <= 0) return '';
  return `R$ ${Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parsePrice(str) {
  if (!str) return 0;
  let s = String(str).trim().replace(/[^\d,\.]/g, '');
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      s = s.replace(/\./g, '');
    }
  }
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

/**
 * High-Precision Price & Status Extractor
 * Strictly isolates the main BuyBox and official JSON schemas to avoid recommended cards/footer noise.
 */
function extractProductPriceAndStatus(html, platform = 'mercadolivre') {
  let price = '';
  let originalPrice = '';
  let discountTag = '';
  let couponCode = '';
  let isPaused = false;

  if (platform === 'amazon') {
    // 1. Availability check
    if (
      html.includes('Atualmente indisponível') ||
      html.includes('Currently unavailable') ||
      html.includes('Não disponível') ||
      html.includes('Não temos previsão de quando este produto') ||
      html.includes('produto não foi encontrado') ||
      html.includes('id="outOfStock"') ||
      html.includes('data-action="out-of-stock"')
    ) {
      isPaused = true;
    }

    // 1. Authoritative Twister Plus BuyBox State (Exact current BuyBox price, ignores used/collectible options)
    const twisterMatch = html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)\s*:\s*\[\{\s*(?:"|&quot;)displayPrice(?:"|&quot;)\s*:\s*(?:"|&quot;)([^"&]+)(?:"|&quot;)/i) ||
                         html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)[\s\S]*?(?:"|&quot;)displayPrice(?:"|&quot;)\s*:\s*(?:"|&quot;)([^"&]+)(?:"|&quot;)/i);
    if (twisterMatch && twisterMatch[1]) {
      const clean = twisterMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
      if (clean) price = clean;
    }

    if (!price) {
      const twisterAmount = html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)\s*:\s*\[\{\s*[^}]*?(?:"|&quot;)priceAmount(?:"|&quot;)\s*:\s*([0-9.]+)/i);
      if (twisterAmount && twisterAmount[1]) {
        const val = parseFloat(twisterAmount[1]);
        if (!isNaN(val) && val > 0) price = formatBrlNumber(val);
      }
    }

    // 2. Scoped BuyBox Container (desktop_buybox / buyBoxAccordion / priceblock_total_price_ww)
    if (!price) {
      const bbSection = html.match(/id=["'](?:desktop_buybox|buyBoxAccordion)["'][\s\S]*?<\/form>/i);
      if (bbSection) {
        const bbText = bbSection[0];
        const offscreen = bbText.match(/class=["']a-offscreen["']>\s*(R\$\s*[0-9.,]+)\s*<\/span>/i);
        if (offscreen && offscreen[1]) {
          price = offscreen[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
        } else {
          const whole = bbText.match(/class=["'][^"']*a-price-whole[^"']*["']>([0-9.,]+)<[\s\S]*?class=["'][^"']*a-price-fraction[^"']*["']>([0-9]{2})</i);
          if (whole && whole[1] && whole[2]) {
            price = `R$ ${whole[1].replace(/[^\d.]/g, '')},${whole[2]}`;
          }
        }
      }
    }

    // 3. Subtotal / Tooltip / Priceblock WW
    if (!price) {
      const tpMatch = html.match(/id=["'](?:priceblock_total_price_ww|tp-tool-tip-subtotal-price-value)["'][\s\S]*?class=["']a-offscreen["']>\s*(R\$\s*[0-9.,]+)\s*<\/span>/i);
      if (tpMatch && tpMatch[1]) {
        price = tpMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
      }
    }

    // 4. Check aok-offscreen with priceToPay label (Amazon Pix / Cash price)
    if (!price) {
      const pixMatch = html.match(/class=["'][^"']*aok-offscreen[^"']*["'][^>]*>\s*(R\$\s*[0-9.,]+)\s*<\/span>/i);
      if (pixMatch && pixMatch[1]) {
        const clean = pixMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean) price = `R$ ${clean}`;
      }
    }

    // 5. Targeted Amazon BuyBox / Apex Price Classes
    if (!price) {
      const targetedOffscreen = html.match(/class=["'][^"']*(?:apex-pricetopay-value|apexPriceToPay|priceToPay|reinventPricePriceToPayMargin|corePriceDisplay)[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>([^<]+)</i);
      if (targetedOffscreen && targetedOffscreen[1]) {
        const clean = targetedOffscreen[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean) price = `R$ ${clean}`;
      }
    }

    // 6. Whole + Fraction combination
    if (!price) {
      const wholeMatch = html.match(/class=["'][^"']*a-price-whole[^"']*["']>([0-9.,]+)<[\s\S]*?class=["'][^"']*a-price-fraction[^"']*["']>([0-9]{2})</i);
      if (wholeMatch && wholeMatch[1] && wholeMatch[2]) {
        const whole = wholeMatch[1].replace(/[^\d.]/g, '');
        const frac = wholeMatch[2];
        price = `R$ ${whole},${frac}`;
      }
    }

    // 7. Classic Amazon Price Block IDs
    if (!price) {
      const classicMatch = html.match(/id=["'](?:priceblock_ourprice|priceblock_dealprice|priceblock_saleprice|price_inside_buybox)["'][^>]*>([^<]+)</i);
      if (classicMatch && classicMatch[1]) {
        const clean = classicMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean) price = `R$ ${clean}`;
      }
    }

    // 5. Structured JSON-LD Schema
    if (!price) {
      const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
      let jMatch;
      while ((jMatch = jsonLdRegex.exec(html)) !== null) {
        try {
          const schema = JSON.parse(jMatch[1]);
          if (schema) {
            const item = Array.isArray(schema) ? schema[0] : schema;
            if (item && (item['@type'] === 'Product' || item['@type'] === 'ItemPage' || item.offers)) {
              const offers = item.offers;
              if (offers) {
                const offerObj = Array.isArray(offers) ? offers[0] : offers;
                const offerPrice = offerObj?.price || offerObj?.lowPrice;
                if (offerPrice && Number(offerPrice) > 0) {
                  price = formatBrlNumber(Number(offerPrice));
                  if (offerObj?.availability && offerObj.availability.includes('OutOfStock')) {
                    isPaused = true;
                  }
                  break;
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    // 6. General a-offscreen with R$ in the whole document
    if (!price) {
      const generalOffscreen = html.match(/class=["'][^"']*a-offscreen[^"']*["']>(\s*R\$\s*[0-9.,]+)<\/span>/i);
      if (generalOffscreen && generalOffscreen[1]) {
        const clean = generalOffscreen[1].replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean) price = `R$ ${clean}`;
      }
    }

    // Amazon Original / Strike-through Price
    const origOffscreen = html.match(/class=["'][^"']*(?:apex-basisprice-offscreen-label|apex-basisprice-value|a-text-price|basisPrice|savingPriceOverride)[^"']*["'][\s\S]*?(?:De:\s*)?(R\$\s*[0-9.,]+)/i) ||
                          html.match(/data-basisprice-label="[^"]*"\s+class=["'][^"']*apex-basisprice-offscreen-label[^"']*["'][^>]*>(?:De:\s*)?(R\$\s*[0-9.,]+)</i) ||
                          html.match(/class=["'][^"']*(?:apex-basisprice-offscreen-label|a-text-strike)[^"']*["'][^>]*>(?:De:\s*)?(R\$\s*[0-9.,]+)</i);
    if (origOffscreen && origOffscreen[1]) {
      const clean = origOffscreen[1].replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
      if (clean && clean !== price.replace(/[^\d.,]/g, '')) originalPrice = `R$ ${clean}`;
    }

    if (!originalPrice) {
      const listPriceMatch = html.match(/id=["'](?:priceblock_pospromoprice|regularprice_structural|listPrice)["'][^>]*>([^<]+)</i);
      if (listPriceMatch && listPriceMatch[1]) {
        const clean = listPriceMatch[1].replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean && clean !== price.replace(/[^\d.,]/g, '')) originalPrice = `R$ ${clean}`;
      }
    }

    // Amazon Discount percentage
    const discPctMatch = html.match(/class=["'][^"']*(?:savingPriceOverride|reinventPriceSavingsPercentageMargin|savingsPercentage)[^"']*["']>([^<]*%[^<]*)</i) ||
                          html.match(/"savingsPercentage"\s*:\s*([0-9]+)/i);
    if (discPctMatch && discPctMatch[1]) {
      const text = discPctMatch[1].trim();
      discountTag = text.includes('%') ? text.replace(/^-/, '').trim() : `${text}% OFF`;
      if (!discountTag.toUpperCase().includes('OFF')) discountTag += ' OFF';
    }

    // Amazon Coupon / Voucher Detection
    const amzCouponMatch = html.match(/id=["']couponBadgeV2["'][\s\S]*?>([^<]+)</i) ||
                           html.match(/class=["'][^"']*a-color-success[^"']*["'][^>]*>([^<]*Economize\s*[^<]+com cupom[^<]*)</i) ||
                           html.match(/data-cpc-coupon=["']([^"']+)["']/i) ||
                           html.match(/<label[^>]*class=["'][^"']*a-form-label[^"']*["'][^>]*>\s*(Aplicar cupom de\s*[^<]+)<\/label>/i);
    if (amzCouponMatch && amzCouponMatch[1]) {
      couponCode = amzCouponMatch[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

  } else if (platform === 'shopee') {
    if (
      html.includes('Produto esgotado') ||
      html.includes('Este anúncio foi pausado') ||
      html.includes('item_deleted') ||
      html.includes('Desculpe, a página não foi encontrada')
    ) {
      isPaused = true;
    }

    const metaPrice = html.match(/<meta\s+(?:property|name)=["'](?:product:price:amount|og:price:amount|twitter:data1)["']\s+content=["']([0-9.,]+)["']/i);
    if (metaPrice && metaPrice[1]) {
      const val = parseFloat(metaPrice[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) price = formatBrlNumber(val);
    }

    // Shopee Voucher Detection
    const shopeeCouponMatch = html.match(/"voucher_code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/"voucherDescription"\s*:\s*"([^"]+)"/i) ||
                              html.match(/class=["'][^"']*voucher-ticket[^"']*["'][\s\S]*?>([^<]+)</i);
    if (shopeeCouponMatch && shopeeCouponMatch[1]) {
      couponCode = shopeeCouponMatch[1].trim();
    }

  } else {
    // Mercado Livre - Multi-layer High Precision Engine
    if (
      html.includes('Anúncio pausado') ||
      html.includes('Este anúncio foi pausado') ||
      html.includes('Publicação finalizada') ||
      html.includes('Produto esgotado')
    ) {
      isPaused = true;
    }

    // LAYER 1: Authoritative Nordic / Initial State JSON (100% precise catalog price)
    const currentPriceMatch = html.match(/"current_price"\s*:\s*\{\s*"value"\s*:\s*([0-9.]+)\s*,\s*"currency"\s*:\s*"BRL"/i);
    if (currentPriceMatch && currentPriceMatch[1]) {
      const num = parseFloat(currentPriceMatch[1]);
      if (!isNaN(num) && num > 0) price = formatBrlNumber(num);
    }

    const previousPriceMatch = html.match(/"previous_price"\s*:\s*\{\s*"value"\s*:\s*([0-9.]+)\s*,\s*"currency"\s*:\s*"BRL"/i);
    if (previousPriceMatch && previousPriceMatch[1]) {
      const num = parseFloat(previousPriceMatch[1]);
      if (!isNaN(num) && num > 0) originalPrice = formatBrlNumber(num);
    }

    const discLabelMatch = html.match(/"discount_label"\s*:\s*\{\s*"text"\s*:\s*"([^"]+)"/i);
    if (discLabelMatch && discLabelMatch[1]) {
      discountTag = discLabelMatch[1].trim();
    }

    // Mercado Livre Coupon Detection (JSON state or PDP pills)
    const mlCouponCodeMatch = html.match(/"coupon_code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/"coupon"\s*:\s*\{\s*"code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/"campaign_code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/class=["'][^"']*ui-pdp-promotions-pill__label[^"']*["']>([^<]+)<\/span>/i) ||
                              html.match(/class=["'][^"']*ui-pdp-promotions-pill[^"']*["'][\s\S]*?>([A-Z0-9_-]{4,20})</i);
    if (mlCouponCodeMatch && mlCouponCodeMatch[1]) {
      let cCode = mlCouponCodeMatch[1].trim();
      if (/cupom:?\s*([A-Z0-9_-]+)/i.test(cCode)) {
        const m = cCode.match(/cupom:?\s*([A-Z0-9_-]+)/i);
        if (m && m[1]) cCode = m[1];
      }
      couponCode = cCode;
    }

    // LAYER 2: Structured JSON-LD Schema (Fallback)
    if (!price) {
      const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
      let jsonMatch;
      while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
        try {
          const schema = JSON.parse(jsonMatch[1]);
          if (schema) {
            const item = Array.isArray(schema) ? schema[0] : schema;
            if (item && (item['@type'] === 'Product' || item['@type'] === 'ItemPage' || item.offers)) {
              const offers = item.offers;
              if (offers) {
                const offerObj = Array.isArray(offers) ? offers[0] : offers;
                const offerPrice = offerObj?.price || offerObj?.lowPrice;
                if (offerPrice && Number(offerPrice) > 0) {
                  price = formatBrlNumber(Number(offerPrice));
                  if (offerObj?.availability && offerObj.availability.includes('OutOfStock')) {
                    isPaused = true;
                  }
                  break;
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    // LAYER 3: Strict BuyBox DOM Scoping & Affiliate Showcase Card (Scoped before bottom recommendation tabs)
    if (!price) {
      const primaryScope = html.split(/class=["'](?:rl-tabs|andes-tabs)/i)[0] || html;

      // Check BuyBox PDP
      const buyboxMatch = primaryScope.match(/class=["'][^"']*(?:ui-pdp-price__second-line|ui-pdp-price)[^"']*["'][\s\S]*?<\/div>/i) ||
                          primaryScope.match(/class=["'][^"']*ui-pdp-container__row--price[^"']*["'][\s\S]*?<\/div>/i);
      if (buyboxMatch) {
        const fracMatch = buyboxMatch[0].match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
        const centsMatch = buyboxMatch[0].match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
        if (fracMatch && fracMatch[1]) {
          const frac = fracMatch[1];
          const cents = centsMatch ? centsMatch[1] : '00';
          price = `R$ ${frac},${cents}`;
        }
      }

      // Check Showcase Card poly-price__current
      if (!price) {
        const polyCurrentMatch = primaryScope.match(/class=["'][^"']*poly-price__current[^"']*["'][\s\S]*?<\/div>/i);
        if (polyCurrentMatch) {
          const fracMatch = polyCurrentMatch[0].match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
          const centsMatch = polyCurrentMatch[0].match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
          if (fracMatch && fracMatch[1]) {
            const frac = fracMatch[1];
            const cents = centsMatch ? centsMatch[1] : '00';
            price = `R$ ${frac},${cents}`;
          }
        }
      }

      // Check Aria-label for Exact Price
      if (!price) {
        const agoraMatch = primaryScope.match(/aria-label=["'](?:Agora:\s*)?([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
        if (agoraMatch && agoraMatch[1]) {
          const frac = agoraMatch[1];
          const cents = agoraMatch[2] ? agoraMatch[2].padStart(2, '0') : '00';
          price = `R$ ${frac},${cents}`;
        }
      }
    }

    // Previous Original Price Fallback
    if (!originalPrice) {
      const primaryScope = html.split(/class=["'](?:rl-tabs|andes-tabs)/i)[0] || html;
      const previousMatch = primaryScope.match(/class=["'][^"']*andes-money-amount--previous[^"']*["'][\s\S]*?<\/(?:s|span|div)>/i);
      if (previousMatch) {
        const fracMatch = previousMatch[0].match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
        const centsMatch = previousMatch[0].match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
        if (fracMatch && fracMatch[1]) {
          const frac = fracMatch[1];
          const cents = centsMatch ? centsMatch[1] : '00';
          originalPrice = `R$ ${frac},${cents}`;
        }
      }

      if (!originalPrice) {
        const antesMatch = primaryScope.match(/aria-label=["']Antes:\s*([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
        if (antesMatch && antesMatch[1]) {
          const frac = antesMatch[1];
          const cents = antesMatch[2] ? antesMatch[2].padStart(2, '0') : '00';
          originalPrice = `R$ ${frac},${cents}`;
        }
      }
    }

    // Discount percentage tag fallback
    if (!discountTag) {
      const primaryScope = html.split(/class=["'](?:rl-tabs|andes-tabs)/i)[0] || html;
      const discMatch = primaryScope.match(/class=["'][^"']*(?:ui-pdp-price__discount|andes-money-amount__discount|poly-price__disc_label)[^"']*["']>([^<]+)</i);
      if (discMatch && discMatch[1]) {
        discountTag = discMatch[1].trim();
      }
    }
  }

  // Universal Fallback via Meta tags
  if (!price) {
    const metaPrice = html.match(/<meta\s+(?:property|name|itemprop)=["'](?:product:price:amount|og:price:amount|price)["']\s+content=["']([0-9.,]+)["']/i);
    if (metaPrice && metaPrice[1]) {
      const num = parseFloat(metaPrice[1].replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        price = formatBrlNumber(num);
      }
    }
  }

  return { price, originalPrice, discountTag, couponCode, isPaused };
}

async function fetchProductDetails(rawUrl) {
  let targetUrl = rawUrl.trim();
  let platform = detectPlatform(targetUrl);

  // 1. SHOPEE: Integração direta com a API Oficial GraphQL da Shopee
  if (platform === 'shopee') {
    try {
      const shopeeData = await shopeeApi.getShopeeProductDetails(targetUrl);
      if (shopeeData && shopeeData.title && shopeeData.price_display) {
        return {
          title: cleanTitle(shopeeData.title, 'shopee'),
          price_display: shopeeData.price_display,
          original_price: shopeeData.original_price || '',
          discount_tag: shopeeData.discount_tag || '',
          coupon_code: '',
          image_url: shopeeData.image_url || '',
          affiliate_url: shopeeData.affiliate_url || targetUrl,
          is_active: shopeeData.is_active !== false,
          platform: 'shopee',
          sales: shopeeData.sales,
          rating: shopeeData.rating
        };
      }
    } catch (err) {
      console.warn('[Shopee API] Erro ao buscar produto via API GraphQL:', err.message);
    }
  }

  // 2. NATURA / AVON: Desempacota o link de rastreio scvald.com para ler o produto real
  if (targetUrl.includes('scvald.com')) {
    try {
      const parsedUrl = new URL(targetUrl);
      const destUrl = parsedUrl.searchParams.get('url');
      if (destUrl && destUrl.startsWith('http')) {
        targetUrl = destUrl;
        platform = detectPlatform(targetUrl);
      }
    } catch (e) {}
  }

  let initialHtml = '';
  // 3. Follow redirect for shortened links
  if (
    targetUrl.includes('meli.la') ||
    targetUrl.includes('mercadolivre.com/sec/') ||
    targetUrl.includes('amzn.to') ||
    targetUrl.includes('a.co') ||
    targetUrl.includes('link.amazon') ||
    targetUrl.includes('amzlinks.in') ||
    targetUrl.includes('s.shopee.com.br') ||
    targetUrl.includes('shope.ee')
  ) {
    try {
      const isAmz = platform === 'amazon' || targetUrl.includes('amazon') || targetUrl.includes('amzn') || targetUrl.includes('amzlinks');
      const isShopee = platform === 'shopee' || targetUrl.includes('shopee') || targetUrl.includes('s.shopee') || targetUrl.includes('shope.ee');
      const ua = (isAmz || isShopee)
        ? 'WhatsApp/2.24.8.85 i'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      const headRes = await fetch(targetUrl, {
        method: 'GET',
        redirect: isShopee ? 'manual' : 'follow',
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (isShopee && headRes.status >= 300 && headRes.status < 400) {
        const loc = headRes.headers.get('location') || '';
        const idMatch = loc.match(/opaanlp\/(\d+)\/(\d+)/) || loc.match(/-i\.(\d+)\.(\d+)/) || loc.match(/product\/(\d+)\/(\d+)/);
        if (idMatch) {
          targetUrl = `https://shopee.com.br/product/${idMatch[1]}/${idMatch[2]}`;
        } else if (loc) {
          targetUrl = loc;
        }
      } else {
        initialHtml = await headRes.text();
        const btnMatch = initialHtml.match(/btn_url=([^"&'\s]+)/i);
        if (btnMatch && btnMatch[1]) {
          try { targetUrl = decodeURIComponent(btnMatch[1]); } catch (e) {}
        } else if (headRes.url && !isShopee) {
          targetUrl = headRes.url;
        }
      }
    } catch (e) {
      console.warn('[Auto-Fetch] Falha no redirect follow:', e);
    }
  }

  // Se for Shopee com rota opaanlp, converte para rota canônica de produto
  const opaanlpMatch = targetUrl.match(/opaanlp\/(\d+)\/(\d+)/);
  if (opaanlpMatch) {
    targetUrl = `https://shopee.com.br/product/${opaanlpMatch[1]}/${opaanlpMatch[2]}`;
  }

  platform = detectPlatform(targetUrl);

  const isShopeeTarget = platform === 'shopee' || targetUrl.includes('shopee') || targetUrl.includes('s.shopee') || targetUrl.includes('shope.ee');
  const fetchUa = (platform === 'amazon' || isShopeeTarget)
    ? 'WhatsApp/2.24.8.85 i'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  let html = initialHtml;

  // 2. Fetch page HTML if needed
  if (!html || (!html.includes('og:title') && !html.includes('productTitle') && !html.includes('ui-pdp-title'))) {
    try {
      const requestHeaders = (platform === 'amazon' || isShopeeTarget)
        ? {
            'User-Agent': fetchUa,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        : {
            'User-Agent': fetchUa,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
          };

      const pageRes = await fetch(targetUrl, {
        method: 'GET',
        headers: requestHeaders
      });
      html = await pageRes.text();
    } catch (e) {
      console.warn('[Auto-Fetch] Falha no fetch da página:', e);
    }
  }

  let title = '';
  let imageUrl = '';

  const titleMatch =
    html.match(/<h1[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*class=["'][^"']*(?:ui-pdp-title|poly-component__title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*><a[^>]*>([\s\S]*?)<\/a>/i) ||
    html.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
    html.match(/<title>([\s\S]*?)<\/title>/i) ||
    initialHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    initialHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
    initialHtml.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = cleanTitle(titleMatch[1], platform);
  }

  const imageMatch =
    html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i) ||
    html.match(/id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    html.match(/class=["'][^"']*ui-pdp-image[^"']*["'][\s\S]*?src=["']([^"']+)["']/i) ||
    html.match(/class=["'][^"']*poly-component__picture[^"']*["'][\s\S]*?src=["']([^"']+)["']/i) ||
    initialHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    initialHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (imageMatch && imageMatch[1]) {
    imageUrl = platform === 'amazon' ? cleanAmazonImageUrl(imageMatch[1]) : imageMatch[1];
  }

  if (!imageUrl && platform === 'amazon') {
    const amzImgMatch = html.match(/id=["']landingImage["'][\s\S]*?data-old-hires=["']([^"']+)["']/i) ||
                        html.match(/id=["']landingImage["'][\s\S]*?src=["']([^"']+)["']/i) ||
                        html.match(/data-a-dynamic-image=["']\{&quot;([^&]+)&quot;/i) ||
                        html.match(/id=["'](?:imgBlkFront|main-image)["'][^>]*src=["']([^"']+)["']/i);
    if (amzImgMatch && amzImgMatch[1]) {
      imageUrl = cleanAmazonImageUrl(amzImgMatch[1]);
    }
  }

  const { price, originalPrice, discountTag, couponCode, isPaused } = extractProductPriceAndStatus(html, platform);

  let discountPercent = 0;
  if (price && originalPrice) {
    const p1 = parsePrice(price);
    const p2 = parsePrice(originalPrice);
    if (p2 > p1) {
      discountPercent = Math.round(((p2 - p1) / p2) * 100);
    }
  }

  const defaultPlatformName = platform === 'amazon' ? 'Amazon' : (platform === 'shopee' ? 'Shopee' : 'Mercado Livre');
  const finalTitle = title || `Produto ${defaultPlatformName}`;
  const detectedCategory = detectCategory(finalTitle, '', targetUrl);

  return {
    title: finalTitle,
    image_url: imageUrl || '',
    price_display: price || '',
    original_price: originalPrice || '',
    discount_percent: discountPercent,
    discount_tag: discountTag || (discountPercent > 0 ? `${discountPercent}% OFF` : ''),
    coupon_code: couponCode || '',
    category: detectedCategory,
    platform: platform,
    is_active: !isPaused,
    final_url: targetUrl
  };
}

function detectCategory(title = '', description = '', url = '') {
  const text = `${title} ${description} ${url}`.toLowerCase();

  const rules = [
    { category: 'confeitaria_sobremesas', keywords: ['chocolate', 'bombom', 'biscoito', 'bolacha', 'doce de leite', 'nutella', 'pasta de amendoim', 'leite condensado', 'creme de leite', 'barra de chocolate', 'cacau', 'granulado', 'cobertura chocolate', 'achocolatado', 'nescau', 'toddy'] },
    { category: 'alimentos_basicos', keywords: ['arroz', 'feijao', 'feijão', 'azeite', 'oleo de soja', 'óleo de soja', 'macarrao', 'macarrão', 'massa', 'farinha de trigo', 'sal refinado', 'açucar', 'acucar', 'feijao preto', 'feijao carioca'] },
    { category: 'molhos_temperos', keywords: ['molho de tomate', 'extrato de tomate', 'tempero', 'molho shoyu', 'maionese', 'ketchup', 'mostarda', 'atum', 'sardinha', 'conserva', 'oregano', 'pimenta', 'curry', 'chimichurri'] },
    { category: 'bebidas_snacks', keywords: ['whisky', 'gin', 'vodka', 'cerveja', 'vinho', 'espumante', 'refrigerante', 'coca cola', 'suco', 'cafe', 'café', 'capsula cafe', 'cha', 'chá', 'snack', 'salgadinho', 'doritos', 'batata frita', 'amendoim', 'energetico', 'energético', 'red bull', 'monster'] },
    { category: 'limpeza_organizacao', keywords: ['detergente', 'amaciante', 'sabao em po', 'sabão em pó', 'sabao liquido', 'desinfetante', 'agua sanitaria', 'água sanitária', 'esponja', 'pano microfibra', 'lustra moveis', 'inseticida', 'saco de lixo', 'cloro', 'alcool 70'] },
    { category: 'eletroportateis', keywords: ['air fryer', 'airfryer', 'fritadeira sem oleo', 'liquidificador', 'batedeira', 'sanduicheira', 'grill', 'mixer', 'processador de alimentos', 'chaleira eletrica', 'panela de pressao eletrica', 'panela eletrica', 'torradeira', 'crepeira', 'pipoqueira'] },
    { category: 'eletrodomesticos', keywords: ['microondas', 'micro-ondas', 'forno eletrico', 'fogao', 'fogão', 'cooktop', 'depurador', 'coifa', 'bebedouro', 'purificador de agua', 'adega'] },
    { category: 'cafe_cha_expresso', keywords: ['cafeteira', 'nespresso', 'dolce gusto', 'tres coracoes', 'moedor de cafe', 'cafeteira expresso', 'cafeteira italiana', 'prensa francesa', 'capsula', 'xicara cafe', 'caneca'] },
    { category: 'panelas_loucas_copos', keywords: ['jogo de panelas', 'conjunto panelas', 'panela antiaderente', 'frigideira', 'cacarola', 'panela de pressao', 'aparelho de jantar', 'pratos', 'jogo de copos', 'tacas', 'taças', 'travessa vidro'] },
    { category: 'utensilios_domesticos', keywords: ['faqueiro', 'faca chef', 'jogo de facas', 'espatula', 'espátula', 'concha', 'pegador', 'tabua de corte', 'pote hermetico', 'potes hermeticos', 'pote de vidro', 'escorredor de louca', 'balanca de cozinha', 'garrafa termica', 'cortador de legumes'] },
    { category: 'cama_mesa_banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro', 'toalha de mesa', 'jogo americano'] },
    { category: 'grandes_eletros', keywords: ['geladeira', 'refrigerador', 'freezer', 'cervejeira', 'adega climatizada'] },
    { category: 'lavagem_secagem', keywords: ['lavadora', 'maquina de lavar', 'máquina de lavar', 'lava e seca', 'secadora de roupas', 'tanquinho', 'centrifuga de roupas'] },
    { category: 'climatizacao', keywords: ['ar condicionado', 'split inverter', 'climatizador de ar', 'aquecedor', 'umidificador de ar', 'desumidificador'] },
    { category: 'ventiladores', keywords: ['ventilador', 'ventilador de mesa', 'ventilador de coluna', 'ventilador de teto', 'circulador de ar', 'turbo silencioso', 'mondial turbo', 'arno turbo'] },
    { category: 'tv_audio_video', keywords: ['smart tv', 'tv 50', 'tv 55', 'tv 65', 'televisao', 'televisão', 'soundbar', 'home theater', 'projetor', 'chromecast', 'fire stick', 'roku', 'tv box'] },
    { category: 'cabelos', keywords: ['shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'secador de cabelo', 'chapinha', 'modelador de cachos', 'escova secadora', 'tonico capilar', 'leave in', 'cronograma capilar'] },
    { category: 'pele_rosto', keywords: ['skincare', 'serum facial', 'sérum', 'protetor solar', 'hidratante facial', 'gel de limpeza facial', 'agua micelar', 'vitamina c facial', 'antirrugas', 'acido hialuronico'] },
    { category: 'maquiagem_unhas', keywords: ['maquiagem', 'batom', 'base facial', 'rimel', 'rímel', 'delineador', 'paleta de sombras', 'esmalte', 'unha postica', 'cabine led unha', 'corretivo', 'po compacto', 'blush'] },
    { category: 'perfumaria_higiene', keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'sabonete', 'escova de dentes', 'fio dental', 'hidratante corporal', 'body splash'] },
    { category: 'barbear_depilacao', keywords: ['barbeador', 'barbeador eletrico', 'maquina de cortar cabelo', 'depilador', 'depilador eletrico', 'lamina de barbear', 'gillette', 'espuma de barbear', 'pos barba', 'aparador de pelos'] },
    { category: 'ingredientes_profissionais', keywords: ['pasta americana', 'corante alimenticio', 'desmoldante', 'essencia', 'emulsificante', 'glucose', 'chantilly', 'cobertura fracionada', 'harald', 'sicao', 'callebaut'] },
    { category: 'formas_utensilios', keywords: ['forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'assadeira bolo', 'manga de confeitar', 'tapete silicone'] },
    { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'caixa bolo', 'caixa doce', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita'] },
    { category: 'festas', keywords: ['artigo de festa', 'decoracao festa', 'decoração festa', 'balao', 'balão', 'bexiga', 'topo de bolo', 'vela aniversario', 'vela aniversário', 'painel festa', 'lembrancinha', 'presente', 'kit festa'] },
    { category: 'quarto', keywords: ['guarda roupa', 'cama box', 'colchao', 'colchão', 'cabeceira', 'comoda', 'cômoda', 'mesa de cabeceira', 'criado mudo', 'beliche'] },
    { category: 'sala_estar', keywords: ['sofa', 'sofá', 'poltrona', 'rack tv', 'painel tv', 'mesa de centro', 'tapete sala', 'cortina sala', 'almofada'] },
    { category: 'sala_jantar', keywords: ['mesa de jantar', 'cadeira de jantar', 'conjunto jantar', 'buffet sala', 'aparador', 'banqueta'] },
    { category: 'escritorio_organizacao', keywords: ['cadeira de escritorio', 'cadeira escritório', 'cadeira gamer', 'mesa escritorio', 'mesa escritório', 'escrivaninha', 'estante livros', 'gaveteiro'] },
    { category: 'celulares', keywords: ['smartphone', 'celular', 'iphone', 'xiaomi', 'galaxy', 'motorola', 'redmi', 'poco', 'realme', 'capinha', 'pelicula celular', 'carregador tipo c', 'carregador celular', 'suporte celular', 'ring light'] },
    { category: 'smart_home', keywords: ['alexa', 'echo dot', 'lampada inteligente', 'fechadura digital', 'camera de seguranca', 'sensor inteligente', 'tomada inteligente'] },
    { category: 'informatica', keywords: ['notebook', 'computador', 'computador gamer', 'laptop', 'macbook', 'mouse', 'teclado', 'monitor', 'impressora', 'ssd', 'memoria ram', 'pendrive', 'pen drive', 'roteador', 'placa de video', 'gabinete', 'fonte atx', 'webcam', 'tablet', 'ipad'] },
    { category: 'audio_gadgets', keywords: ['fone de ouvido', 'fone bluetooth', 'headphone', 'airpod', 'caixa de som', 'jbl', 'microfone', 'power bank', 'carregador portatil', 'smartband', 'drone'] },
    { category: 'consoles', keywords: ['playstation', 'ps5', 'ps4', 'xbox series', 'xbox one', 'nintendo switch', 'console'] },
    { category: 'jogos_midias', keywords: ['jogos ps5', 'jogos ps4', 'jogos switch', 'jogos xbox', 'midia fisica', 'game pass'] },
    { category: 'controles_acessorios_gamer', keywords: ['controle ps5', 'controle xbox', 'gamepad', 'joystick', 'headset gamer', 'volante gamer', 'teclado mecanico', 'mouse gamer', 'mousepad gamer'] },
    { category: 'colecionaveis_geek', keywords: ['action figure', 'funko pop', 'boneco colecionavel', 'estatua anime', 'colecionavel', 'cosplay'] },
    { category: 'ferramentas', keywords: ['furadeira', 'parafusadeira', 'martelete', 'martelo', 'chave de fenda', 'chave phillips', 'trena', 'serra eletrica', 'serra circular', 'esmerilhadeira', 'ferramenta', 'jogo de ferramentas'] },
    { category: 'construcao_eletrica', keywords: ['torneira', 'chuveiro', 'tomada', 'extensao eletrica', 'lampada led', 'tinta parede', 'fio eletrico', 'disjuntor', 'cano pvc'] },
    { category: 'automotivo', keywords: ['automotivo', 'carro', 'moto', 'motocicleta', 'pneu', 'capacete', 'farol', 'oleo motor', 'óleo motor', 'som automotivo', 'camera de re', 'capa automotiva', 'cera automotiva', 'lavagem automotiva', 'vonixx', 'pretinho'] },
    { category: 'petshop', keywords: ['racao', 'ração', 'cachorro', 'gato', 'pet', 'coleira', 'guia cachorro', 'arranhador', 'caminha pet', 'cama pet', 'petisco', 'comedouro', 'bebedouro pet', 'areia gato', 'tapete higienico', 'shampoo pet'] },
    { category: 'roupas', keywords: ['camisa', 'camiseta', 'calca', 'calça', 'vestido', 'saia', 'bermuda', 'short', 'jaqueta', 'moletom', 'casaco', 'biquini', 'biquíni', 'lingerie', 'meia', 'cueca', 'sutia'] },
    { category: 'calcados', keywords: ['tenis', 'tênis', 'sapato', 'sandalia', 'sandália', 'bota', 'chinelo', 'havaianas', 'chuteira', 'rasteirinha'] },
    { category: 'bolsas_malas', keywords: ['bolsa', 'mochila', 'mala de viagem', 'mochila escolar', 'carteira', 'necessaire', 'pochete', 'pasta notebook'] },
    { category: 'relogios_oculos', keywords: ['relogio', 'relógio', 'smartwatch', 'oculos de sol', 'óculos de sol', 'armacao oculos', 'joia', 'jóia', 'semijoia', 'brinco', 'colar', 'pulseira'] },
    { category: 'suplementos', keywords: ['whey', 'creatina', 'suplemento', 'bcaa', 'glutamina', 'pre treino', 'pré treino', 'termogenico', 'vitamina', 'omega 3', 'colageno', 'hipercalorico', 'barra de proteina'] },
    { category: 'treino_funcional', keywords: ['haltere', 'colchonete', 'elastico treino', 'kettlebell', 'corda de pular', 'caneleira', 'barra fixa', 'faixa elastica', 'luva academia', 'tapete yoga', 'roda abdominal'] },
    { category: 'monitoramento_saude', keywords: ['medidor de pressao', 'termometro', 'inalador', 'nebulizador', 'oximetro', 'glicosimetro', 'massageador', 'balanca corporal', 'balança digital bioimpedancia', 'joelheira', 'corretor postural'] },
    { category: 'brinquedos_pedagogicos', keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime', 'bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'mordedor'] },
    { category: 'jogos_tabuleiro', keywords: ['jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'domino', 'baralho', 'xadrez', 'war', 'banco imobiliario'] },
    { category: 'papelaria_escolar', keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel', 'tinta guache'] },
    { category: 'escritorio_envelopamento', keywords: ['plastificadora', 'guilhotina papel', 'perfurador papel', 'grampeador', 'fita crepe', 'envelopamento', 'bobina papel'] }
  ];

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return rule.category;
      }
    }
  }

  return 'confeitaria_sobremesas';
}

async function handler(req, res) {
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

    // Action 0: 1-Click Quick Save from Bookmarklet or External Extensions
    if (action === 'quick-save' || action === 'save') {
      const payload = req.method === 'POST' ? req.body : req.query;
      const title = (payload.title || '').trim();
      let affiliate_url = (payload.affiliate_url || payload.url || '').trim();

      if (!title || !affiliate_url) {
        return res.status(400).json({ success: false, error: 'Título e URL são obrigatórios.' });
      }

      // Auto-tag Amazon links
      if (affiliate_url.includes('amazon.com.br') || affiliate_url.includes('amazon.com')) {
        try {
          const u = new URL(affiliate_url);
          u.searchParams.set('tag', 'jonatas00a3-20');
          u.searchParams.set('linkCode', 'sl2');
          affiliate_url = u.toString();
        } catch (e) {}
      }

      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

      const itemToInsert = {
        title,
        description: payload.description ? String(payload.description).trim() : null,
        affiliate_url,
        image_url: payload.image_url ? String(payload.image_url).trim() : '',
        price_display: payload.price_display ? String(payload.price_display).trim() : (payload.price ? String(payload.price).trim() : null),
        original_price: payload.original_price ? String(payload.original_price).trim() : null,
        category: payload.category || detectCategory(title, payload.description || '', affiliate_url),
        discount_tag: payload.discount_tag || payload.tag || null,
        coupon_code: payload.coupon_code ? String(payload.coupon_code).trim() : null,
        badge_color: payload.badge_color || payload.color || 'orange',
        is_fast_pick: payload.is_fast_pick === true || payload.is_fast_pick === 'true',
        position: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify([itemToInsert])
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        console.error('[Quick Save] Erro ao salvar no Supabase:', errText);
        return res.status(500).json({ success: false, error: 'Erro ao salvar no banco', details: errText });
      }

      const inserted = await insertRes.json();
      return res.status(200).json({
        success: true,
        message: '🎉 Oferta salva no FastSavory\'s com sucesso!',
        data: inserted?.[0] || itemToInsert
      });
    }

    // Action 0.1: Click Tracker for Affiliate Analytics (Zero Cost)
    if (action === 'track-click' || action === 'click') {
      const id = req.query.id || req.body?.id;
      if (id) {
        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

        // Increment clicks_count in Supabase
        try {
          const fetchCurrent = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${id}&select=id,clicks_count`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
          if (fetchCurrent.ok) {
            const arr = await fetchCurrent.json();
            const curClicks = (arr?.[0]?.clicks_count || 0) + 1;
            await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ clicks_count: curClicks })
            });
          }
        } catch (e) {
          console.warn('[Click Tracker] Erro não-bloqueante:', e.message);
        }
      }
      return res.status(200).json({ success: true });
    }

    // Action 0.2: Send specific deal to WhatsApp Group (Admin 1-Click)
    if (action === 'send-whatsapp' || action === 'post-whatsapp') {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID do produto não informado.' });
      }
      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

      const prodRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${id}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (!prodRes.ok) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado no banco.' });
      }
      const pData = await prodRes.json();
      if (!pData || !pData[0]) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
      }
      const targetProd = pData[0];
      
      try {
        const { sendProductDealToWhatsApp } = require('./_lib/cron-whatsapp-deal');
        const waRes = await sendProductDealToWhatsApp(targetProd);
        return res.status(200).json({ success: true, message: '🚀 Oferta enviada com sucesso no WhatsApp!', evolutionResponse: waRes });
      } catch (waErr) {
        console.warn('[Send WhatsApp 1-Click Error]:', waErr.message);
        return res.status(200).json({
          success: false,
          configured: false,
          error: waErr.message || 'Configuração da Evolution API não encontrada na Vercel.',
          product: targetProd
        });
      }
    }

    // Action 0.3: Price Alert Lead Capture
    if (action === 'save-price-alert' || action === 'price-alert') {
      const payload = req.method === 'POST' ? req.body : req.query;
      const phone = (payload.phone || '').replace(/\D/g, '');
      const productId = payload.product_id || payload.id;
      if (!phone || phone.length < 10) {
        return res.status(400).json({ success: false, error: 'Número de WhatsApp inválido.' });
      }
      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/fast_price_alerts`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify([{
            phone,
            product_id: productId ? Number(productId) : null,
            product_title: payload.product_title || payload.title || '',
            target_price: payload.price || null,
            created_at: new Date().toISOString()
          }])
        });
      } catch (e) {
        console.warn('[Price Alert Lead] Salvo com resiliência:', e.message);
      }
      return res.status(200).json({ success: true, message: '🔔 Alerta de preço cadastrado com sucesso! Você será avisado no WhatsApp quando o preço cair.' });
    }

    // Action 0.5: Automatic Link Health, Status & Price Synchronizer
    if (action === 'auto-sync' || action === 'auto-sync-links' || action === 'sync-prices') {
      return handleAutoSyncLinks(req, res);
    }

    // Action 1: Auto-fetch single product details with high precision
    if (action === 'fetch' || (req.query.url && !req.query.items && !req.body?.items)) {
      const targetUrl = req.query.url || req.body?.url;
      if (!targetUrl) {
        return res.status(400).json({ error: 'URL do produto não informada.' });
      }
      const data = await fetchProductDetails(targetUrl);
      return res.status(200).json({ success: true, data });
    }

    // Action 2: Batch health & price check
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

          const isAmz = url.includes('amazon') || url.includes('amzn') || url.includes('a.co') || url.includes('amzlinks');
          const isShopee = url.includes('shopee') || url.includes('s.shopee') || url.includes('shope.ee');
          const fetchUa = (isAmz || isShopee)
            ? 'WhatsApp/2.24.8.85 i'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'User-Agent': fetchUa,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
              'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Windows"',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1'
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
          const itemPlatform = detectPlatform(finalUrl || url);

          const { price, originalPrice, discountTag, isPaused } = extractProductPriceAndStatus(text, itemPlatform);

          let pageTitle = '';
          const titleMatch =
            text.match(/<h1[^>]*class=["'][^"']*(?:ui-pdp-title|poly-component__title)[^"']*["'][^>]*>([^<]+)<\/h1>/i) ||
            text.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*><a[^>]*>([^<]+)<\/a>/i) ||
            text.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
            text.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            pageTitle = cleanTitle(titleMatch[1], itemPlatform);
          }

          const platformName = itemPlatform === 'amazon' ? 'Amazon' : (itemPlatform === 'shopee' ? 'Shopee' : 'ML');

          if (isPaused) {
            return {
              id: item.id,
              url,
              finalUrl,
              platform: itemPlatform,
              title: pageTitle,
              price: price || '',
              original_price: originalPrice || '',
              status: 'paused',
              statusText: `Anúncio Pausado / Esgotado na ${platformName}`,
              statusCode: 200
            };
          }

          return {
            id: item.id,
            url,
            finalUrl,
            platform: itemPlatform,
            title: pageTitle,
            price: price || '',
            original_price: originalPrice || '',
            discount_tag: discountTag || '',
            status: 'active',
            statusText: `Online e Ativo (${platformName})`,
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

async function handleAutoSyncLinks(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

  // Limite por ciclo para responder em menos de 3-4 segundos e nunca estourar o timeout da Serverless Function
  const limit = Math.min(Math.max(parseInt(req.query?.limit || req.body?.limit || '15', 10), 1), 30);

  try {
    console.log(`[AutoSync Affiliate Links] Verificando lote de ${limit} links (Round-robin pelos mais antigos)...`);
    
    // Busca os produtos ativos que foram atualizados há mais tempo (fila rotativa)
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=*&is_active=eq.true&order=updated_at.asc&limit=${limit}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!dbRes.ok) {
      throw new Error(`Erro ao buscar produtos do banco: HTTP ${dbRes.status}`);
    }

    const items = await dbRes.json();
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(200).json({ success: true, message: 'Nenhum produto ativo para verificar.', total_checked: 0 });
    }

    let pausedCount = 0;
    let priceUpdatedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;
    const updates = [];
    const priceDropCandidates = [];

    // Executa em paralelo de forma ultra rápida com timeout individual de 4s
    await Promise.all(items.map(async (item) => {
      try {
        const details = await fetchProductDetails(item.affiliate_url);
        
        if (details.is_active === false) {
          // Pausado ou esgotado na loja de origem
          await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
          });
          pausedCount++;
          updates.push({ id: item.id, title: item.title, action: 'paused', reason: 'Pausado/Esgotado' });
        } else {
          const patchPayload = { updated_at: new Date().toISOString() };
          let hasPriceChange = false;
          let isPriceDrop = false;
          let dropPct = 0;
          let diff = 0;

          if (details.price_display && details.price_display !== item.price_display) {
            patchPayload.price_display = details.price_display;
            hasPriceChange = true;

            const oldNum = parsePrice(item.price_display);
            const newNum = parsePrice(details.price_display);
            if (oldNum > 0 && newNum > 0 && newNum < oldNum) {
              isPriceDrop = true;
              diff = oldNum - newNum;
              dropPct = Math.round((diff / oldNum) * 100);
              patchPayload.badge_color = 'rose';
              if (!patchPayload.discount_tag && !details.discount_tag) {
                patchPayload.discount_tag = 'Menor Preço';
              }

              priceDropCandidates.push({
                item,
                oldPrice: item.price_display,
                newPrice: details.price_display,
                dropPercent: dropPct,
                diffAmount: diff
              });
            }
          }
          if (details.original_price && details.original_price !== item.original_price) {
            patchPayload.original_price = details.original_price;
            hasPriceChange = true;
          }
          if (details.discount_tag && details.discount_tag !== item.discount_tag) {
            patchPayload.discount_tag = details.discount_tag;
            hasPriceChange = true;
          }
          if (details.coupon_code && details.coupon_code !== item.coupon_code) {
            patchPayload.coupon_code = details.coupon_code;
            hasPriceChange = true;
          }

          await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(patchPayload)
          });

          if (hasPriceChange) {
            priceUpdatedCount++;
            updates.push({
              id: item.id,
              title: item.title,
              action: isPriceDrop ? 'price_dropped' : 'price_updated',
              old_price: item.price_display,
              new_price: details.price_display,
              drop_percent: dropPct
            });
          } else {
            unchangedCount++;
          }
        }
      } catch (itemErr) {
        errorCount++;
        // Atualiza updated_at mesmo em erro para não travar a fila rotativa
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ updated_at: new Date().toISOString() })
          });
        } catch (e) {}
      }
    }));

    // REGRA DE OURO VIP: Limita o envio de alertas de queda de preço para no máximo os 2 maiores descontos em %
    let priceDropAlertsSent = 0;
    if (priceDropCandidates.length > 0) {
      // Ordena por maior percentual de queda (e maior valor em R$ como desempate)
      priceDropCandidates.sort((a, b) => b.dropPercent - a.dropPercent || b.diffAmount - a.diffAmount);

      // Pega estritamente os top 2
      const topDrops = priceDropCandidates.slice(0, 2);

      // Apenas dispara alertas no WhatsApp entre 07h00 e 22h30 para não incomodar de madrugada
      const now = new Date();
      const brtHours = (now.getUTCHours() - 3 + 24) % 24;
      const isAllowedAlertHour = brtHours >= 7 && brtHours <= 22;

      if (isAllowedAlertHour) {
        try {
          const { sendPriceDropAlertToWhatsApp } = require('./_lib/cron-whatsapp-deal');
          if (typeof sendPriceDropAlertToWhatsApp === 'function') {
            for (const drop of topDrops) {
              try {
                console.log(`[Price Drop Alert] 📉 Enviando alerta VIP (${drop.dropPercent}% OFF): ${drop.item.title}`);
                await sendPriceDropAlertToWhatsApp(drop.item, drop.oldPrice, drop.newPrice);
                priceDropAlertsSent++;
                if (topDrops.length > 1) {
                  await new Promise(r => setTimeout(r, 2000));
                }
              } catch (dropErr) {
                console.warn('[Price Drop Alert Dispatch] Falha ao enviar:', dropErr.message);
              }
            }
          }
        } catch (alertModuleErr) {
          console.warn('[Price Drop Alert] Erro ao carregar módulo:', alertModuleErr.message);
        }
      } else {
        console.log(`[Price Drop Alert] Alertas silenciados na madrugada (${brtHours}h BRT).`);
      }
    }

    console.log(`[AutoSync Affiliate Links] Lote concluído: ${items.length} verificados | ${priceUpdatedCount} preços atualizados | ${priceDropAlertsSent} alertas de queda enviados`);

    return res.status(200).json({
      success: true,
      message: `✅ Lote verificado com sucesso (${items.length} links). Preços atualizados: ${priceUpdatedCount} | Quedas enviadas (máx 2): ${priceDropAlertsSent} | Pausados: ${pausedCount} | Inalterados: ${unchangedCount}`,
      total_checked: items.length,
      price_updated_count: priceUpdatedCount,
      price_drop_alerts_sent: priceDropAlertsSent,
      paused_count: pausedCount,
      unchanged_count: unchangedCount,
      error_count: errorCount,
      updates
    });
  } catch (error) {
    console.error('[AutoSync Affiliate Links] Erro geral:', error);
    return res.status(500).json({ success: false, error: 'Erro ao executar verificação automática', details: error.message });
  }
}

module.exports = handler;
module.exports.handleAutoSyncLinks = handleAutoSyncLinks;
module.exports.fetchProductDetails = fetchProductDetails;
module.exports.extractProductPriceAndStatus = extractProductPriceAndStatus;

