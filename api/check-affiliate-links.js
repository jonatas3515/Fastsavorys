/**
 * Vercel Serverless Function: FastSavory's Affiliate & Mercado Livre Suite (High-Precision Scraper)
 * Handles:
 * 1. Auto-fetch of product details (Title, Image, Genuine BuyBox Price, Discount)
 * 2. High-precision Health & Price Check of affiliate links (detects exact price drops and increases)
 */

const shopeeApi = require('./_lib/shopee-api');

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon') || u.includes('amzn') || /(?:^|\/\/|\.)a\.co(?:\/|$)/.test(u) || u.includes('amzlinks')) {
    return 'amazon';
  }
  if (u.includes('shopee') || u.includes('s.shopee') || u.includes('shope.ee')) {
    return 'shopee';
  }
  if (u.includes('natura') || u.includes('sovsls') || (u.includes('scvald') && !u.includes('avon'))) {
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
  let isFlashDeal = false;
  let flashDealEnd = null;
  let isPrime = false;
  let isImported = false;

  // Limpeza de scripts e estilos para detecção segura de texto visível na página
  const htmlNoScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Detecção Automática de Oferta Relâmpago (Apenas em texto/badges visíveis para evitar nós de telemetria interna de JS)
  const isLightningDealText = /(?:OFERTAS?\s*(?:⏰\s*)?REL[ÂA]MPAGO|dealBadge|deal-badge|badge_deal)/i.test(htmlNoScripts);
  if (isLightningDealText) {
    isFlashDeal = true;
    discountTag = '⚡ Oferta Relâmpago';
    
    // Tenta encontrar o tempo restante no HTML (ex: termina em 03:12:16 ou end_time)
    const timeMatch = htmlNoScripts.match(/termina\s*em\s*[:\s]*(\d{1,2})\s*[:\s](\d{2})(?:\s*[:\s](\d{2}))?/i) ||
                      html.match(/"end_time"\s*:\s*(\d{10,13})/i) ||
                      html.match(/"flash_sale_end"\s*:\s*(\d{10,13})/i);
    if (timeMatch) {
      if (timeMatch[1] && timeMatch[1].length > 9) {
        const ts = Number(timeMatch[1]);
        flashDealEnd = new Date(ts > 1e11 ? ts : ts * 1000).toISOString();
      } else if (timeMatch[1] && timeMatch[2]) {
        const hours = parseInt(timeMatch[1], 10) || 0;
        const mins = parseInt(timeMatch[2], 10) || 0;
        const totalMs = (hours * 3600 + mins * 60) * 1000;
        flashDealEnd = new Date(Date.now() + totalMs).toISOString();
      }
    }
    if (!flashDealEnd) {
      flashDealEnd = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    }
  }

  if (platform === 'amazon') {
    // 1. Availability & Import check
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

    // Detecção segura de produto importado na Amazon (isolando BuyBox e merchant info de rodapés/carrosséis)
    const cleanForImport = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/id=["'](?:navFooter|nav-subnav|navbar)["'][\s\S]*?<\/div>/gi, '')
      .replace(/class=["'][^"']*(?:rhf-frame|sims-carousel|p13n)[^"']*["'][\s\S]*?<\/div>/gi, '');

    const amzBuyboxMatch = cleanForImport.match(/id=["'](?:desktop_buybox|buyBoxAccordion|tabular-buybox|merchant-info|exports_desktop_qualified_buybox|agsk-detail-bullets)["'][\s\S]*?<\/div>/gi) || [];
    const amzBuyboxText = amzBuyboxMatch.join(' ');

    if (
      /id=["']exports_desktop_qualified_buybox["']/i.test(cleanForImport) ||
      /id=["']agsk-detail-bullets["']/i.test(cleanForImport) ||
      /tributos\s+de\s+importa[çc][ãa]o/i.test(amzBuyboxText) ||
      /compra\s+internacional/i.test(amzBuyboxText) ||
      /enviado\s+de\s+fora\s+do\s+brasil/i.test(amzBuyboxText) ||
      /vendido\s+por\s+amazon\s+(?:estados\s+unidos|us)/i.test(amzBuyboxText) ||
      /(?:vendido|enviado)\s+por[^<]*amazon\s+global\s+store/i.test(amzBuyboxText) ||
      /produtos?\s+importados?\s+dos?\s+estados\s+unidos/i.test(amzBuyboxText)
    ) {
      isImported = true;
    }

    // 1. input hidden attach-base-product-price (Preço exato oficial do produto principal selecionado)
    const attachPrice = html.match(/id=["']attach-base-product-price["'][^>]*value=["']([0-9.]+)["']/i) ||
                        html.match(/value=["']([0-9.]+)["'][^>]*id=["']attach-base-product-price["']/i);
    if (attachPrice && attachPrice[1]) {
      const val = parseFloat(attachPrice[1]);
      if (!isNaN(val) && val > 0) price = formatBrlNumber(val);
    }

    // 2. Authoritative Twister Plus BuyBox State (Exact current BuyBox price, ignores used/collectible options)
    if (!price) {
      const twisterMatch = html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)\s*:\s*\[\{\s*(?:"|&quot;)displayPrice(?:"|&quot;)\s*:\s*(?:"|&quot;)([^"&]+)(?:"|&quot;)/i) ||
                           html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)[\s\S]*?(?:"|&quot;)displayPrice(?:"|&quot;)\s*:\s*(?:"|&quot;)([^"&]+)(?:"|&quot;)/i);
      if (twisterMatch && twisterMatch[1]) {
        const clean = twisterMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
        if (clean) price = clean;
      }
    }

    if (!price) {
      const twisterAmount = html.match(/(?:"|&quot;)desktop_buybox_group_1(?:"|&quot;)\s*:\s*\[\{\s*[^}]*?(?:"|&quot;)priceAmount(?:"|&quot;)\s*:\s*([0-9.]+)/i);
      if (twisterAmount && twisterAmount[1]) {
        const val = parseFloat(twisterAmount[1]);
        if (!isNaN(val) && val > 0) price = formatBrlNumber(val);
      }
    }

    // 3. Apex core price identifier & targeted BuyBox price classes
    if (!price) {
      const apexMatch = html.match(/apex-core-price-identifier[\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>\s*(R\$\s*[0-9.,]+)\s*</i) ||
                        html.match(/class=["'][^"']*(?:apex-pricetopay-value|apexPriceToPay|priceToPay|reinventPricePriceToPayMargin|corePriceDisplay)[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>\s*(R\$\s*[0-9.,]+)\s*</i);
      if (apexMatch && apexMatch[1]) {
        const clean = apexMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
        if (clean) price = clean;
      }
    }

    // 4. Scoped BuyBox Container (desktop_buybox / buyBoxAccordion / priceblock_total_price_ww)
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

    // 5. Subtotal / Tooltip / Priceblock WW
    if (!price) {
      const tpMatch = html.match(/id=["'](?:priceblock_total_price_ww|tp-tool-tip-subtotal-price-value)["'][\s\S]*?class=["']a-offscreen["']>\s*(R\$\s*[0-9.,]+)\s*<\/span>/i);
      if (tpMatch && tpMatch[1]) {
        price = tpMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
      }
    }

    // 6. Check aok-offscreen with priceToPay label (Amazon Pix / Cash price)
    if (!price) {
      const pixMatch = html.match(/class=["'][^"']*aok-offscreen[^"']*["'][^>]*>\s*(R\$\s*[0-9.,]+)\s*<\/span>/i);
      if (pixMatch && pixMatch[1]) {
        const clean = pixMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/[^\d.,]/g, '').trim();
        if (clean) price = `R$ ${clean}`;
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

    // 8. Scoped fallback isolando centerCol e limpando caixas de ofertas usadas / de terceiros
    if (!price) {
      const centerColMatch = html.match(/id=["'](?:centerCol|apex_desktop)["'][\s\S]*?id=["'](?:rightCol|desktop_buybox|navFooter)/i);
      const zone = centerColMatch ? centerColMatch[0] : html;
      const cleanZone = zone
        .replace(/class=["'][^"']*(?:olp-touch|aod-ingress|aod-wrapper|olpLink)[^"']*["'][\s\S]*?<\/div>/gi, '')
        .replace(/id=["'](?:olpLinkWidget_feature_div|all-offers-display|dynamic-aod-ingress-box|moreBuyingChoices_feature_div)["'][\s\S]*?<\/div>/gi, '');

      const offMatch = cleanZone.match(/class=["'][^"']*a-price[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>\s*(R\$\s*[0-9.,]+)\s*</i);
      if (offMatch && offMatch[1]) {
        price = offMatch[1].replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').trim();
      } else {
        const wholeMatch = cleanZone.match(/class=["'][^"']*a-price-whole[^"']*["']>([0-9.,]+)<[\s\S]*?class=["'][^"']*a-price-fraction[^"']*["']>([0-9]{2})</i);
        if (wholeMatch && wholeMatch[1] && wholeMatch[2]) {
          const whole = wholeMatch[1].replace(/[^\d.]/g, '');
          const frac = wholeMatch[2];
          price = `R$ ${whole},${frac}`;
        }
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

    // Amazon Coupon / Voucher Detection (Codes or Clip Coupons)
    const amzCouponMatch = html.match(/id=["']couponBadgeV2["'][\s\S]*?>([^<]+)</i) ||
                           html.match(/class=["'][^"']*a-color-success[^"']*["'][^>]*>([^<]*Economize\s*[^<]+com cupom[^<]*)</i) ||
                           html.match(/data-cpc-coupon=["']([^"']+)["']/i) ||
                           html.match(/<label[^>]*class=["'][^"']*a-form-label[^"']*["'][^>]*>\s*(Aplicar cupom de\s*[^<]+)<\/label>/i) ||
                           html.match(/class=["'][^"']*(?:couponBadge|reinventPriceSavingsPercentageMargin|savingsPercentage)[^"']*["'][^>]*>([^<]*cupom[^<]*)/i) ||
                           html.match(/([0-9.,]+%\s*OFF\s*com\s*cupom|Economize\s*R\$\s*[0-9.,]+\s*com\s*cupom|Aplicar\s*cupom\s*de\s*(?:R\$\s*)?[0-9.,]+%?)/i);
    if (amzCouponMatch && amzCouponMatch[1]) {
      const rawAmzCoupon = amzCouponMatch[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const valMatch = rawAmzCoupon.match(/(?:Economize|cupom\s*de)\s*(R\$\s*[0-9.,]+|[0-9]+%)/i) ||
                       rawAmzCoupon.match(/(R\$\s*[0-9.,]+|[0-9]+%)\s*(?:OFF|com\s*cupom)/i);
      if (valMatch && valMatch[1]) {
        couponCode = `Ativar no anúncio (${valMatch[1]} OFF)`;
      } else {
        couponCode = 'Ativar cupom no anúncio';
      }
    }

    // Amazon Prime Membership Detection (Exclusive badge, Prime accordion or free shipping)
    isPrime = Boolean(
      html.match(/id=["']prime-accordion["']/i) ||
      html.match(/a-icon-prime/i) ||
      html.match(/icon-prime/i) ||
      html.match(/primeExclusivePrice/i) ||
      html.match(/"isPrime"\s*:\s*true/i) ||
      html.match(/"prime"\s*:\s*true/i) ||
      html.match(/badge_delivery_prime/i) ||
      html.match(/amazon\.com\.br\/prime/i) ||
      html.match(/frete grátis com (o )?prime/i) ||
      html.match(/frete grátis com o amazon prime/i) ||
      html.match(/entrega grátis.*amazon prime/i)
    );

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
      const rawShopee = shopeeCouponMatch[1].trim();
      if (/^[A-Z0-9_-]{4,20}$/i.test(rawShopee)) {
        couponCode = rawShopee;
      } else {
        couponCode = 'Resgatar cupom no app';
      }
    }

    if (
      /vendedor\s+internacional/i.test(html) ||
      /envio\s+de[:\s]+internacional/i.test(html) ||
      /compra\s+internacional/i.test(html) ||
      (/exterior/i.test(html) && /envio/i.test(html))
    ) {
      isImported = true;
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

    // Detecção segura de produto importado no Mercado Livre (BuyBox, Shipping e flags CBT oficiais)
    const mlClean = html.replace(/<footer[\s\S]*?<\/footer>/gi, '').replace(/class=["']nav-footer[\s\S]*?<\/div>/gi, '');
    const buyboxMatch = mlClean.match(/class=["'][^"']*(?:ui-pdp-buybox|ui-pdp-container__row--shipping|ui-pdp-promotions-pill|ui-pdp-seller)[^"']*["'][\s\S]*?<\/div>/gi) || [];
    const buyboxText = buyboxMatch.join(' ');
    if (
      /compra\s+internacional/i.test(buyboxText) ||
      /vendedor\s+internacional/i.test(buyboxText) ||
      /tributos\s+(?:de\s+importa[çc][ãa]o\s+)?inclusos/i.test(buyboxText) ||
      /"is_cbt"\s*:\s*true/i.test(html) ||
      /"cbt_flag"\s*:\s*true/i.test(html)
    ) {
      isImported = true;
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

    // Mercado Livre Coupon Detection (JSON state or PDP pills or poly-cards)
    const mlCouponCodeMatch = html.match(/"coupon_code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/"coupon"\s*:\s*\{\s*"code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/"campaign_code"\s*:\s*"([^"]+)"/i) ||
                              html.match(/class=["'][^"']*ui-pdp-promotions-pill[^"']*["'][\s\S]*?>([A-Z0-9_-]{4,20})</i);
    if (mlCouponCodeMatch && mlCouponCodeMatch[1]) {
      let cCode = mlCouponCodeMatch[1].trim();
      if (/cupom:?\s*([A-Z0-9_-]+)/i.test(cCode)) {
        const m = cCode.match(/cupom:?\s*([A-Z0-9_-]+)/i);
        if (m && m[1]) cCode = m[1];
      }
      if (/^[A-Z0-9_-]{4,20}$/i.test(cCode)) {
        couponCode = cCode;
      }
    }

    if (!couponCode) {
      // Detecção de pílulas de cupom / tags de promoção (sem código digitável explícito)
      const mlPillMatch = html.match(/class=["'][^"']*poly-coupons__pill[^"']*["']([\s\S]*?)<\/div>/i) ||
                          html.match(/class=["'][^"']*ui-pdp-promotions-pill[^"']*["']([\s\S]*?)<\/span>/i) ||
                          html.match(/(?:id|type)["']:\s*["']coupon["'][\s\S]{0,120}?["']text["']:\s*["']([^"']+)["']/i) ||
                          html.match(/([0-9.,]+%?\s*OFF\s*com\s*[Cc]upom|R\$\s*[0-9.,]+\s*OFF\s*com\s*[Cc]upom|[Cc]upom\s*de\s*R\$\s*[0-9.,]+)/i);

      if (mlPillMatch) {
        const pillContent = (mlPillMatch[1] || mlPillMatch[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const valMatch = pillContent.match(/(R\$\s*[0-9.,]+|[0-9]+%)\s*OFF/i) ||
                         pillContent.match(/([0-9]+)\s*OFF/i) ||
                         pillContent.match(/cupom\s*de\s*(R\$\s*[0-9.,]+|[0-9]+%)/i);
        if (valMatch && valMatch[1]) {
          const discountStr = valMatch[1].includes('R$') || valMatch[1].includes('%') ? valMatch[1] : `${valMatch[1]}%`;
          couponCode = `Ativar no anúncio (${discountStr} OFF)`;
        } else {
          couponCode = 'Ativar cupom no anúncio';
        }
      }
    }

    // LAYER 2: Structured JSON-LD Schema (Fallback & Primary for stores with LD-JSON)
    if (!price) {
      const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
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

  // Validação estrita: Preço riscado NUNCA pode ser menor ou igual ao preço atual (evita pegar parcelas de 6x ou erros de scraping)
  if (originalPrice && price) {
    const pOrig = parsePrice(originalPrice);
    const pCurr = parsePrice(price);
    if (pOrig <= pCurr) {
      originalPrice = '';
    }
  }

  return { price, originalPrice, discountTag, couponCode, isPaused, isFlashDeal, flashDealEnd, isPrime, isImported };
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
          affiliate_url: shopeeData.affiliate_url || rawUrl,
          is_active: shopeeData.is_active !== false,
          is_imported: Boolean(shopeeData.is_imported || (shopeeData.title && /internacional|importad/i.test(shopeeData.title))),
          platform: 'shopee',
          sales: shopeeData.sales,
          rating: shopeeData.rating
        };
      }
    } catch (err) {
      console.warn('[Shopee API] Erro ao buscar produto via API GraphQL:', err.message);
    }
  }

  // 2. NATURA / AVON: Desempacota links de rastreio (sovsls.com ou scvald.com) para ler o produto real
  if (targetUrl.includes('sovsls.com') || targetUrl.includes('scvald.com')) {
    try {
      const parsedUrl = new URL(targetUrl);
      const destUrl = parsedUrl.searchParams.get('url');
      if (destUrl && destUrl.startsWith('http')) {
        targetUrl = decodeURIComponent(destUrl);
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

  // Se a imagem for nula ou um logo genérico (como a logo da Natura), busca a foto real do JSON-LD
  if (!imageUrl || imageUrl.includes('LOGO') || imageUrl.includes('logo')) {
    const jsonLdImgRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jMatch;
    while ((jMatch = jsonLdImgRegex.exec(html)) !== null) {
      try {
        const schema = JSON.parse(jMatch[1]);
        const item = Array.isArray(schema) ? schema[0] : schema;
        if (item && (item['@type'] === 'Product' || item.image)) {
          if (Array.isArray(item.image) && item.image[0]) {
            imageUrl = item.image[0];
            break;
          } else if (typeof item.image === 'string' && item.image) {
            imageUrl = item.image;
            break;
          }
        }
      } catch (e) {}
    }
  }

  // Fallback de título a partir do JSON-LD
  if (!title) {
    const jsonLdTitleRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jMatch;
    while ((jMatch = jsonLdTitleRegex.exec(html)) !== null) {
      try {
        const schema = JSON.parse(jMatch[1]);
        const item = Array.isArray(schema) ? schema[0] : schema;
        if (item && item.name && (item['@type'] === 'Product' || item.offers)) {
          title = cleanTitle(item.name, platform);
          break;
        }
      } catch (e) {}
    }
  }

  const { price, originalPrice, discountTag, couponCode, isPaused, isFlashDeal, flashDealEnd, isPrime, isImported } = extractProductPriceAndStatus(html, platform);

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
    is_prime: Boolean(isPrime),
    is_imported: Boolean(isImported),
    affiliate_url: rawUrl,
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
    { category: 'perfumaria_higiene', keywords: ['perfume', 'colonia', 'colônia', 'parfum', 'deo parfum', 'eau de parfum', 'fragrancia', 'fragrância', 'kaiak', 'essencial', 'natura una', 'una somos', 'humor', 'biografia', 'ilia', 'ilía', 'luna', 'tododia', 'desodorante', 'sabonete', 'escova de dentes', 'fio dental', 'hidratante corporal', 'body splash'] },
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

      // Auto-tag e encurtador oficial da Shopee
      if (affiliate_url.includes('shopee') && !affiliate_url.includes('s.shopee.com.br')) {
        try {
          const shortLink = await shopeeApi.generateShopeeShortLink(affiliate_url);
          if (shortLink) affiliate_url = shortLink;
        } catch (e) {
          console.warn('[Quick-Save] Falha ao gerar link oficial Shopee:', e.message);
        }
      }

      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

      const itemToInsert = {
        title,
        description: payload.description ? String(payload.description).trim() : null,
        affiliate_url,
        image_url: payload.image_url ? String(payload.image_url).trim() : '',
        price_display: payload.price_display ? String(payload.price_display).replace(/,+/g, ',').trim() : (payload.price ? String(payload.price).replace(/,+/g, ',').trim() : null),
        original_price: payload.original_price ? String(payload.original_price).replace(/,+/g, ',').trim() : null,
        category: payload.category || detectCategory(title, payload.description || '', affiliate_url),
        discount_tag: payload.discount_tag || payload.tag || null,
        badge_tag: payload.badge_tag || null,
        coupon_code: payload.coupon_code ? String(payload.coupon_code).trim() : null,
        badge_color: payload.badge_color || payload.color || 'orange',
        is_fast_pick: payload.is_fast_pick === true || payload.is_fast_pick === 'true',
        is_prime: payload.is_prime === true || payload.is_prime === 'true' || false,
        is_imported: payload.is_imported === true || payload.is_imported === 'true' || false,
        flash_deal_end: payload.flash_deal_end || null,
        position: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Se o preço não veio ou veio em branco pelo navegador/Quick Clip, busca automaticamente no backend
      if (!itemToInsert.price_display || itemToInsert.price_display === 'R$ ' || itemToInsert.price_display === 'R$ 0,00') {
        try {
          const autoDetails = await fetchProductDetails(affiliate_url);
          if (autoDetails) {
            if (autoDetails.price_display) itemToInsert.price_display = autoDetails.price_display;
            if (!itemToInsert.original_price && autoDetails.original_price) itemToInsert.original_price = autoDetails.original_price;
            if (!itemToInsert.discount_tag && autoDetails.discount_tag) itemToInsert.discount_tag = autoDetails.discount_tag;
            if (!itemToInsert.image_url && autoDetails.image_url) itemToInsert.image_url = autoDetails.image_url;
            if (autoDetails.coupon_code && !itemToInsert.coupon_code) itemToInsert.coupon_code = autoDetails.coupon_code;
            if (autoDetails.is_prime) itemToInsert.is_prime = true;
            if (autoDetails.is_imported) itemToInsert.is_imported = true;
          }
        } catch (e) {
          console.warn('[Quick-Save] Falha no fallback auto-fetch:', e.message);
        }
      }

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

    // Action 0.6: Immediate Sync of Expired Flash Deals
    if (action === 'sync-flash-expired' || action === 'sync-expired-flash') {
      return handleSyncExpiredFlashDeals(req, res);
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

async function handleSyncExpiredFlashDeals(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

  try {
    const nowIso = new Date().toISOString();
    console.log('[Sync Expired Flash Deals] Buscando ofertas relâmpago expiradas...');
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=*&is_active=eq.true&or=(badge_color.eq.flash_deal,flash_deal_end.lte.${nowIso})&limit=30`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!dbRes.ok) {
      throw new Error(`Erro ao buscar do Supabase: HTTP ${dbRes.status}`);
    }

    const items = await dbRes.json();
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(200).json({ success: true, message: 'Nenhuma oferta relâmpago expirada para atualizar.', count: 0, items: [] });
    }

    const results = [];
    await Promise.all(items.map(async (item) => {
      try {
        const details = await fetchProductDetails(item.affiliate_url);
        if (details.is_active === false) {
          await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
          });
          results.push({ id: item.id, title: item.title, action: 'paused', reason: 'Esgotado na loja de origem' });
        } else {
          const patchPayload = {
            updated_at: new Date().toISOString(),
            flash_deal_end: null,
            badge_color: 'orange'
          };
          if (details.price_display) patchPayload.price_display = details.price_display;
          if (details.original_price !== undefined) patchPayload.original_price = details.original_price || null;
          if (item.badge_tag && /rel[âa]mpago/i.test(item.badge_tag)) patchPayload.badge_tag = null;
          if (item.discount_tag && /rel[âa]mpago/i.test(item.discount_tag)) patchPayload.discount_tag = details.discount_tag || null;
          if (details.is_imported !== undefined) patchPayload.is_imported = details.is_imported;

          await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(patchPayload)
          });
          results.push({
            id: item.id,
            title: item.title,
            action: 'updated',
            old_price: item.price_display,
            new_price: details.price_display || item.price_display
          });
        }
      } catch (err) {
        results.push({ id: item.id, title: item.title, action: 'error', error: err.message });
      }
    }));

    return res.status(200).json({
      success: true,
      message: `Revalidação de relâmpagos concluída: ${results.length} produtos atualizados com novos preços.`,
      count: results.length,
      results
    });
  } catch (e) {
    console.error('[Sync Flash Expired Error]:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleAutoSyncLinks(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

  // Validação de agendamento: XXh25min é reservado exclusivamente para Mega Eventos (dias duplos: 09.09, 10.10, 11.11, etc.)
  const now = new Date();
  const utcMinutes = now.getUTCMinutes();
  const isSlot25 = utcMinutes >= 15 && utcMinutes <= 35;
  const isForce = req.query?.force === 'true' || req.body?.force === true;

  let isDoubleDay = false;
  let eventLabel = '';
  try {
    const { getDoubleDayContext } = require('./_lib/cron-whatsapp-deal');
    const ctx = getDoubleDayContext(now);
    isDoubleDay = ctx.isDoubleDay;
    eventLabel = ctx.eventLabel;
  } catch (e) {
    const brtTime = new Date(now.getTime() - 3 * 3600 * 1000);
    const day = brtTime.getUTCDate();
    const month = brtTime.getUTCMonth() + 1;
    isDoubleDay = day === month;
    eventLabel = `${day}.${month}`;
  }

  if (isSlot25 && !isDoubleDay && !isForce) {
    return res.status(200).json({
      success: true,
      skipped: true,
      message: `Verificação das XXh25min ignorada: horário das XXh25 é ativado apenas em dias de Mega Eventos (ex: 10.10, 11.11). Próxima verificação geral às XXh55min.`,
      isDoubleDay: false
    });
  }

  // Limite por ciclo para responder em menos de 3-4 segundos e nunca estourar o timeout da Serverless Function
  const limit = Math.min(Math.max(parseInt(req.query?.limit || req.body?.limit || '15', 10), 1), 30);

  try {
    console.log(`[AutoSync Affiliate Links] Verificando lote de ${limit} links (Prioridade Relâmpagos Expirados + Round-robin)...`);
    
    // 1. Prioridade Máxima: busca produtos ativos com oferta relâmpago que já expiraram
    let expiredFlashItems = [];
    try {
      const nowIso = new Date().toISOString();
      const flashRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=*&is_active=eq.true&badge_color=eq.flash_deal&flash_deal_end=lte.${nowIso}&limit=10`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      if (flashRes.ok) {
        expiredFlashItems = await flashRes.json();
      }
    } catch (e) {
      console.warn('[AutoSync] Erro ao buscar relâmpagos expirados:', e.message);
    }

    let items = Array.isArray(expiredFlashItems) ? [...expiredFlashItems] : [];
    const remainingLimit = limit - items.length;

    // 2. Complementa a fila com os produtos ativos atualizados há mais tempo (fila rotativa)
    if (remainingLimit > 0) {
      const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=*&is_active=eq.true&order=updated_at.asc&limit=${remainingLimit}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      if (dbRes.ok) {
        const roundRobinItems = await dbRes.json();
        const existingIds = new Set(items.map(x => x.id));
        for (const it of roundRobinItems) {
          if (!existingIds.has(it.id)) items.push(it);
        }
      }
    }

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

          // Se for produto com oferta relâmpago cujo tempo encerrou:
          const isExpiredFlash = (item.badge_color === 'flash_deal' || item.flash_deal_end) && 
                                 item.flash_deal_end && new Date(item.flash_deal_end) <= new Date();
          if (isExpiredFlash) {
            patchPayload.flash_deal_end = null;
            if (patchPayload.badge_color === undefined || patchPayload.badge_color === 'flash_deal' || item.badge_color === 'flash_deal') {
              patchPayload.badge_color = 'orange';
            }
            if (item.badge_tag && /rel[âa]mpago/i.test(item.badge_tag)) {
              patchPayload.badge_tag = null;
            }
            if (item.discount_tag && /rel[âa]mpago/i.test(item.discount_tag)) {
              patchPayload.discount_tag = details.discount_tag || null;
            }
            hasPriceChange = true;
          }

          if (details.price_display && details.price_display !== item.price_display) {
            patchPayload.price_display = details.price_display;
            hasPriceChange = true;

            const oldNum = parsePrice(item.price_display);
            const newNum = parsePrice(details.price_display);
            if (oldNum > 0 && newNum > 0 && newNum < oldNum) {
              isPriceDrop = true;
              diff = oldNum - newNum;
              dropPct = Math.round((diff / oldNum) * 100);
              // Não injeta tag de selo 'Menor Preço' sem autorização: coloca apenas o desconto percentual
              if (dropPct > 0 && !patchPayload.discount_tag && !details.discount_tag) {
                patchPayload.discount_tag = `${dropPct}% OFF`;
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
          if (details.is_prime !== undefined && details.is_prime !== item.is_prime) {
            patchPayload.is_prime = details.is_prime;
            hasPriceChange = true;
          }
          if (details.is_imported !== undefined && details.is_imported !== item.is_imported) {
            patchPayload.is_imported = details.is_imported;
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
              action: isPriceDrop ? 'price_dropped' : (isExpiredFlash ? 'flash_expired_updated' : 'price_updated'),
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

