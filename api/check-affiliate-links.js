/**
 * Vercel Serverless Function: FastSavory's Affiliate & Mercado Livre Suite (High-Precision Scraper)
 * Handles:
 * 1. Auto-fetch of product details (Title, Image, Genuine BuyBox Price, Discount)
 * 2. High-precision Health & Price Check of affiliate links (detects exact price drops and increases)
 */

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return 'amazon';
  }
  if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
    return 'shopee';
  }
  if (u.includes('mercadolivre.com') || u.includes('mercadolibre.com') || u.includes('meli.la')) {
    return 'mercadolivre';
  }
  return 'marketplace';
}

function cleanTitle(title = '', platform = '') {
  if (!title) return '';
  let clean = title.trim();
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
  return clean.trim();
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
  let isPaused = false;

  if (platform === 'amazon') {
    // 1. Availability check
    if (
      html.includes('Atualmente indisponível') ||
      html.includes('Currently unavailable') ||
      html.includes('Não disponível') ||
      html.includes('Não temos previsão de quando este produto') ||
      html.includes('produto não foi encontrado')
    ) {
      isPaused = true;
    }

    // 2. High-precision Amazon BuyBox Scoping
    const buyboxScope = html.match(/id=["'](?:corePrice_feature_div|corePriceDisplay_desktop_feature_div|apex_desktop|desktop_unifiedPrice)[^"']*["'][\s\S]*?<\/div>/i) ||
                        html.match(/class=["'][^"']*a-box-group[^"']*["'][\s\S]*?class=["'][^"']*a-price[^"']*["'][\s\S]*?<\/div>/i);
    const searchHtml = buyboxScope ? buyboxScope[0] : html;

    const amazonOffscreen = searchHtml.match(/class=["'][^"']*a-price[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>([^<]+)</i);
    if (amazonOffscreen && amazonOffscreen[1]) {
      const clean = amazonOffscreen[1].replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
      if (clean) price = `R$ ${clean}`;
    }

    if (!price) {
      const wholeMatch = searchHtml.match(/class=["'][^"']*a-price-whole[^"']*["']>([0-9.,]+)</i);
      const fracMatch = searchHtml.match(/class=["'][^"']*a-price-fraction[^"']*["']>([0-9]{2})</i);
      if (wholeMatch && wholeMatch[1]) {
        const whole = wholeMatch[1].replace(/[^\d.]/g, '');
        const frac = fracMatch ? fracMatch[1] : '00';
        price = `R$ ${whole},${frac}`;
      }
    }

    const amazonOriginal = searchHtml.match(/class=["'][^"']*a-text-price[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["']>([^<]+)</i);
    if (amazonOriginal && amazonOriginal[1]) {
      const clean = amazonOriginal[1].replace(/&nbsp;/g, ' ').replace(/[^\d.,]/g, '').trim();
      if (clean) originalPrice = `R$ ${clean}`;
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

    // LAYER 1: Extract from Official Structured JSON-LD Schema (100% accurate catalog data)
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

    // LAYER 2: Extract from Preloaded State / Initial State JSON
    if (!price) {
      const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});<\/script>/i) ||
                         html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});<\/script>/i);
      if (stateMatch && stateMatch[1]) {
        try {
          const stateData = JSON.parse(stateMatch[1]);
          const components = stateData?.initialState?.components || stateData?.components;
          if (components?.price) {
            const currentVal = components.price.current?.value || components.price.value;
            if (currentVal && Number(currentVal) > 0) {
              price = formatBrlNumber(Number(currentVal));
            }
            const origVal = components.price.original?.value || components.price.previous_price?.value;
            if (origVal && Number(origVal) > 0) {
              originalPrice = formatBrlNumber(Number(origVal));
            }
          }
        } catch (e) {}
      }
    }

    // LAYER 3: Strict BuyBox DOM Scoping (ignores recommendations & sidebars)
    if (!price) {
      const buyboxMatch = html.match(/class=["'][^"']*(?:ui-pdp-price__second-line|ui-pdp-price)[^"']*["'][\s\S]*?<\/div>/i) ||
                          html.match(/class=["'][^"']*ui-pdp-container__row--price[^"']*["'][\s\S]*?<\/div>/i);
      
      const targetScope = buyboxMatch ? buyboxMatch[0] : null;

      if (targetScope) {
        const fracMatch = targetScope.match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
        const centsMatch = targetScope.match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
        if (fracMatch && fracMatch[1]) {
          const frac = fracMatch[1];
          const cents = centsMatch ? centsMatch[1] : '00';
          price = `R$ ${frac},${cents}`;
        }
      }
    }

    // LAYER 4: Aria-label for Exact Price ("Agora: X reais com Y centavos")
    if (!price) {
      const agoraMatch = html.match(/aria-label=["']Agora:\s*([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
      if (agoraMatch && agoraMatch[1]) {
        const frac = agoraMatch[1];
        const cents = agoraMatch[2] ? agoraMatch[2].padStart(2, '0') : '00';
        price = `R$ ${frac},${cents}`;
      }
    }

    // LAYER 5: Previous Original Price (Struck-through)
    if (!originalPrice) {
      const previousMatch = html.match(/class=["'][^"']*andes-money-amount--previous[^"']*["'][\s\S]*?<\/(?:s|span|div)>/i);
      if (previousMatch) {
        const fracMatch = previousMatch[0].match(/class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i);
        const centsMatch = previousMatch[0].match(/class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
        if (fracMatch && fracMatch[1]) {
          const frac = fracMatch[1];
          const cents = centsMatch ? centsMatch[1] : '00';
          originalPrice = `R$ ${frac},${cents}`;
        }
      }
    }

    if (!originalPrice) {
      const antesMatch = html.match(/aria-label=["']Antes:\s*([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
      if (antesMatch && antesMatch[1]) {
        const frac = antesMatch[1];
        const cents = antesMatch[2] ? antesMatch[2].padStart(2, '0') : '00';
        originalPrice = `R$ ${frac},${cents}`;
      }
    }

    // LAYER 6: Fallback for Affiliate Showcase Cards (only if no PDP buybox exists)
    if (!price) {
      const polyCurrentMatch = html.match(/class=["'][^"']*poly-price__current[^"']*["'][\s\S]*?<\/div>/i);
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

    // Discount percentage tag
    const discMatch = html.match(/class=["'][^"']*(?:ui-pdp-price__discount|andes-money-amount__discount)[^"']*["']>([^<]+)</i);
    if (discMatch && discMatch[1]) {
      discountTag = discMatch[1].trim();
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

  return { price, originalPrice, discountTag, isPaused };
}

async function fetchProductDetails(rawUrl) {
  let targetUrl = rawUrl.trim();
  const platform = detectPlatform(targetUrl);

  // 1. Follow redirect for shortened links
  if (
    targetUrl.includes('meli.la') ||
    targetUrl.includes('mercadolivre.com/sec/') ||
    targetUrl.includes('amzn.to') ||
    targetUrl.includes('a.co') ||
    targetUrl.includes('s.shopee.com.br') ||
    targetUrl.includes('shope.ee')
  ) {
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
      console.warn('[Auto-Fetch] Falha no redirect follow:', e);
    }
  }

  // 2. Fetch page HTML
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
    html.match(/<h1[^>]*class=["'][^"']*(?:ui-pdp-title|poly-component__title)[^"']*["'][^>]*>([^<]+)<\/h1>/i) ||
    html.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*><a[^>]*>([^<]+)<\/a>/i) ||
    html.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*>([^<]+)<\//i) ||
    html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
    html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = cleanTitle(titleMatch[1], platform);
  }

  const imageMatch =
    html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
    html.match(/class=["'][^"']*ui-pdp-image[^"']*["'][\s\S]*?src=["']([^"']+)["']/i) ||
    html.match(/class=["'][^"']*poly-component__picture[^"']*["'][\s\S]*?src=["']([^"']+)["']/i);
  if (imageMatch && imageMatch[1]) {
    imageUrl = imageMatch[1];
  }

  if (!imageUrl && platform === 'amazon') {
    const amzImgMatch = html.match(/id=["']landingImage["'][\s\S]*?data-old-hires=["']([^"']+)["']/i) ||
                        html.match(/data-a-dynamic-image=["']\{&quot;([^&]+)&quot;/i);
    if (amzImgMatch && amzImgMatch[1]) {
      imageUrl = amzImgMatch[1];
    }
  }

  const { price, originalPrice, discountTag, isPaused } = extractProductPriceAndStatus(html, platform);

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
    { category: 'ingredientes_profissionais', keywords: ['pasta americana', 'corante alimenticio', 'desmoldante', 'essencia', 'emulsificante', 'glucose', 'chantilly', 'cobertura fracionada', 'harald', 'sicao', 'callebaut'] },
    { category: 'formas_utensilios', keywords: ['forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'assadeira bolo', 'manga de confeitar', 'tapete silicone'] },
    { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'caixa bolo', 'caixa doce', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita'] },
    { category: 'festas', keywords: ['artigo de festa', 'decoracao festa', 'decoração festa', 'balao', 'balão', 'bexiga', 'topo de bolo', 'vela aniversario', 'vela aniversário', 'painel festa', 'lembrancinha', 'presente', 'kit festa'] },
    { category: 'quarto', keywords: ['guarda roupa', 'cama box', 'colchao', 'colchão', 'cabeceira', 'comoda', 'cômoda', 'mesa de cabeceira', 'criado mudo', 'beliche'] },
    { category: 'sala_estar', keywords: ['sofa', 'sofá', 'poltrona', 'rack tv', 'painel tv', 'mesa de centro', 'tapete sala', 'cortina sala', 'almofada'] },
    { category: 'sala_jantar', keywords: ['mesa de jantar', 'cadeira de jantar', 'conjunto jantar', 'buffet sala', 'aparador', 'banqueta'] },
    { category: 'escritorio_organizacao', keywords: ['cadeira de escritorio', 'cadeira escritório', 'cadeira gamer', 'mesa escritorio', 'mesa escritório', 'escrivaninha', 'estante livros', 'gaveteiro'] },
    { category: 'cozinha', keywords: ['air fryer', 'airfryer', 'fritadeira', 'panela', 'panelas', 'frigideira', 'liquidificador', 'batedeira', 'cafeteira', 'nespresso', 'dolce gusto', 'sanduicheira', 'grill', 'mixer', 'processador', 'chaleira', 'faqueiro', 'faca chef', 'prato', 'copo', 'talher', 'balanca cozinha', 'balança digital', 'garrafa termica'] },
    { category: 'cama_mesa_banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro', 'toalha de mesa'] },
    { category: 'organizacao', keywords: ['organizador', 'organizadora', 'pote hermetico', 'potes hermeticos', 'vassoura', 'mop', 'rodo', 'dispenser', 'lixeira', 'cabide', 'varal', 'cesto organizador', 'prateleira', 'caixa organizadora', 'sapateira'] },
    { category: 'decoracao_basica', keywords: ['quadro decorativo', 'espelho', 'vaso decorativo', 'relogio de parede', 'luminaria mesa', 'abajur', 'difusor aroma'] },
    { category: 'grandes_eletros', keywords: ['geladeira', 'refrigerador', 'fogao', 'fogão', 'cooktop', 'forno de embutir', 'microondas', 'micro-ondas', 'freezer', 'cervejeira', 'adega climatizada'] },
    { category: 'lavagem_secagem', keywords: ['lavadora', 'maquina de lavar', 'máquina de lavar', 'lava e seca', 'secadora de roupas', 'tanquinho'] },
    { category: 'climatizacao', keywords: ['ar condicionado', 'ventilador', 'climatizador', 'aquecedor', 'umidificador'] },
    { category: 'tv_audio_video', keywords: ['smart tv', 'tv 50', 'tv 55', 'tv 65', 'televisao', 'televisão', 'soundbar', 'home theater', 'projetor', 'chromecast', 'fire stick', 'roku', 'tv box'] },
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
    { category: 'cabelos', keywords: ['shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'secador de cabelo', 'chapinha', 'modelador de cachos', 'escova secadora', 'tonico capilar'] },
    { category: 'pele_rosto', keywords: ['skincare', 'serum facial', 'sérum', 'protetor solar', 'hidratante facial', 'gel de limpeza facial', 'agua micelar', 'vitamina c facial', 'antirrugas'] },
    { category: 'maquiagem_unhas', keywords: ['maquiagem', 'batom', 'base facial', 'rimel', 'rímel', 'delineador', 'paleta de sombras', 'esmalte', 'unha postica', 'cabine led unha'] },
    { category: 'perfumaria_higiene', keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'sabonete', 'escova de dentes', 'fio dental', 'hidratante corporal'] },
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
