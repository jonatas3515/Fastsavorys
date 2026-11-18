/**
 * FastSavory's - Sub-módulo: Disparo de Ofertas no WhatsApp
 * Suporta:
 * 1. Produtos de Afiliados (Achadinhos: Amazon, Shopee, Mercado Livre)
 * 2. Produtos Próprios da FastSavory's (Salgados, Kits Festa, Bolos, etc.)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon.com.br') || u.includes('link.amazon') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return { id: 'amazon', name: 'Amazon' };
  }
  if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
    return { id: 'shopee', name: 'Shopee' };
  }
  return { id: 'mercadolivre', name: 'Mercado Livre' };
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

function calcDiscountPercent(origStr, currStr) {
  if (!origStr || !currStr) return 0;
  const orig = parsePrice(origStr);
  const curr = parsePrice(currStr);
  if (!orig || !curr || orig <= curr) return 0;
  const pct = Math.round(((orig - curr) / orig) * 100);
  return pct > 0 && pct < 100 ? pct : 0;
}

function getDoubleDayContext(referenceDate = new Date()) {
  const brtTime = new Date(referenceDate.getTime() - 3 * 3600 * 1000);
  const day = brtTime.getUTCDate();
  const month = brtTime.getUTCMonth() + 1; // 1 a 12
  const isDoubleDay = day === month;
  const eventLabel = `${day}.${month}`;
  return { isDoubleDay, day, month, eventLabel };
}

function buildWhatsAppDealText(product, customContext = null) {
  const isFastPick = Boolean(product.is_fast_pick || product.badge_color === 'fast_seal');
  const sealHeader = isFastPick ? '👑 *PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S* ✨\n' : '';
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const pct = calcDiscountPercent(product.original_price, product.price_display);
  
  // Desconto formatado com suporte a No Pix, No Pix c/ Cupom, Com Cupom ou OFF
  const rawDisc = (product.discount_tag || '').trim();
  let discountText = '';
  if (/no pix c(om|\/)?\s*cupom/i.test(rawDisc)) {
    discountText = pct > 0 ? ` (${pct}% OFF no Pix c/ Cupom)` : ` (No Pix c/ Cupom)`;
  } else if (/no pix/i.test(rawDisc)) {
    discountText = pct > 0 ? ` (${pct}% OFF no Pix)` : ` (No Pix)`;
  } else if (/c(om|\/)?\s*cupom/i.test(rawDisc)) {
    discountText = pct > 0 ? ` (${pct}% OFF c/ Cupom)` : ` (c/ Cupom)`;
  } else if (pct > 0) {
    discountText = ` (${pct}% OFF)`;
  } else if (rawDisc && (/off/i.test(rawDisc) || /^\d+%/.test(rawDisc))) {
    discountText = ` (${rawDisc})`;
  }

  // Tag Destaque (ex: Indicado, Mais Vendido, Oferta)
  let tagText = '';
  const rawBadge = (product.badge_tag || '').trim();
  if (rawBadge) {
    if (rawBadge.toLowerCase().includes('indicado')) tagText = `🏷️ *Destaque:* 🟠 Indicado\n`;
    else if (rawBadge.toLowerCase().includes('oferta')) tagText = `🏷️ *Destaque:* 🩷 Oferta\n`;
    else tagText = `🏷️ *Destaque:* ${rawBadge}\n`;
  }

  // Destaque Amazon Prime
  const isPrime = Boolean(product.is_prime);
  const primeLine = isPrime ? '🚚 *Entrega Rápida e Grátis com Amazon Prime!* ✓\n' : '';

  const origPriceText = product.original_price ? `~${product.original_price}~ ➔ ` : '';
  
  let couponText = '';
  if (product.coupon_code) {
    const raw = String(product.coupon_code).trim();
    if (/ativar|resgatar|anúncio|anuncio|página|pagina|aplicar/i.test(raw)) {
      const formatted = raw.replace(/^Ativar\s*(?:o\s*)?(?:cupom\s*)?/i, 'Ative o cupom ');
      couponText = `\n🎟️ *CUPOM DISPONÍVEL:* ${formatted} antes de comprar para garantir o menor preço!\n`;
    } else {
      couponText = `\n🎟️ *CUPOM DISPONÍVEL:* Use o cupom *${raw}* na finalização!\n`;
    }
  }

  const { isDoubleDay, eventLabel } = customContext || getDoubleDayContext();
  const eventHeader = isDoubleDay
    ? `🔥🎯 *MEGA EVENTO ${eventLabel} | DIA DE SUPER OFERTAS!* 🏷️⚡\n💥 *Aproveite os cupons liberados e os maiores descontos do mês!*\n\n`
    : '';

  const isFlashDeal = Boolean(
    product.badge_color === 'flash_deal' || 
    (product.discount_tag && /rel[âa]mpago/i.test(product.discount_tag)) ||
    (product.flash_deal_end && new Date(product.flash_deal_end) > new Date())
  );

  const flashHeader = isFlashDeal
    ? `⚡⏰ *OFERTA RELÂMPAGO ${platform}!* ⏰⚡\n⏳ *CORRE! Válida por tempo limitado (ou até esgotar o estoque promocional)!*\n\n`
    : '';

  const pricePrefix = isFlashDeal ? '💥 *Preço Relâmpago:* ' : '💰 *Preço:* ';
  const ctaLine = isFlashDeal ? '👉 *GARANTA COM O PREÇO RELÂMPAGO AQUI:*' : '👉 *COMPRE COM DESCONTO AQUI:*';

  return `${eventHeader}${flashHeader}${sealHeader}🛍️ *ACHADINHO ${platform}* ⭐\n${tagText}🔥 *${product.title}*\n\n${pricePrefix}${origPriceText}*${product.price_display || 'Confira no link'}*${discountText}\n${primeLine}${couponText}\n\n${ctaLine}\n${product.affiliate_url}\n\n💬 *Entre no canal VIP de ofertas da FastSavory's:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
}

function getStoreContext() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const brtHours = (utcHours - 3 + 24) % 24;
  const dayOfWeek = (new Date(now.getTime() - 3 * 3600 * 1000)).getUTCDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  const isSunday = dayOfWeek === 0;
  const isOperatingHours = !isSunday && (brtHours >= 14 && brtHours < 18);
  const isMorningBooking = !isSunday && (brtHours >= 8 && brtHours < 14);
  const isNightBooking = !isSunday && (brtHours >= 18 || brtHours < 8);

  return { isSunday, isOperatingHours, isMorningBooking, isNightBooking, dayOfWeek, brtHours };
}

function buildFastSavorysProductText(product) {
  const price = typeof product.price === 'number' ? `R$ ${product.price.toFixed(2).replace('.', ',')}` : (product.price || '');
  const desc = product.description ? `\n${product.description}\n` : '';
  const { isSunday, isOperatingHours, isMorningBooking } = getStoreContext();

  let callToAction = '';
  if (isSunday) {
    callToAction = `📅 *Garanta seus salgados para a semana! Agende com antecedência pelo cardápio online:*\nhttps://fastsavorys.vercel.app/pages/fast.html\n\n💬 *Dúvidas e encomendas no WhatsApp:* (73) 99936-6554`;
  } else if (isOperatingHours) {
    callToAction = `🛵 *Peça agora quentinho pelo nosso cardápio online:*\nhttps://fastsavorys.vercel.app/pages/fast.html\n\n💬 *Ou faça seu pedido direto pelo WhatsApp:* (73) 99936-6554`;
  } else if (isMorningBooking) {
    callToAction = `📅 *Agendamentos abertos para hoje a partir das 14h! Garanta o seu pelo cardápio online:*\nhttps://fastsavorys.vercel.app/pages/fast.html\n\n💬 *Ou agende direto pelo WhatsApp:* (73) 99936-6554`;
  } else {
    callToAction = `📅 *Agende com antecedência para amanhã pelo nosso cardápio online:*\nhttps://fastsavorys.vercel.app/pages/fast.html\n\n💬 *Ou faça seu agendamento no WhatsApp:* (73) 99936-6554`;
  }

  const header = isSunday
    ? `😋 *PLANEJANDO O LANCHE DA SEMANA? DIRETO DA FASTSAVORY'S!* 🥟📅`
    : `😋 *BATEU AQUELA FOME? DIRETO DA COZINHA FASTSAVORY'S!* 🥟🔥`;

  return `${header}\n\n✨ *${product.name}*\n${desc}\n💰 *Apenas:* *${price}*\n\n${callToAction}`;
}

function buildFastSavorysStatusText(product) {
  const { isSunday, isOperatingHours, isMorningBooking } = getStoreContext();

  if (isSunday) {
    return `🥟 BATEU AQUELA VONTADE? 📅 Agende seus salgados para a semana pelo nosso cardápio online:\nhttps://fastsavorys.vercel.app/pages/fast.html`;
  }
  if (isOperatingHours) {
    return `😋 FORNADA SAINDO AGORA! 🛵 Peça quentinho pelo nosso cardápio online:\nhttps://fastsavorys.vercel.app/pages/fast.html`;
  }
  if (isMorningBooking) {
    return `🥟 BATEU AQUELA FOME? 📅 Agende seu pedido para hoje a partir das 14h pelo nosso cardápio:\nhttps://fastsavorys.vercel.app/pages/fast.html`;
  }
  return `🥟 BATEU AQUELA FOME? 📅 Agende com antecedência pelo nosso cardápio online:\nhttps://fastsavorys.vercel.app/pages/fast.html`;
}

function buildWhatsAppStatusDealText(product) {
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const price = product.price_display ? `Apenas ${product.price_display}!` : 'Confira no link!';
  return `🛍️ ACHADINHO ${platform}\n🔥 ${price} 👉 GARANTA COM O MENOR PREÇO AQUI:\n${product.affiliate_url}`;
}

function buildPriceDropAlertText(product, oldPrice, newPrice, customContext = null) {
  const isFastPick = Boolean(product.is_fast_pick || product.badge_color === 'fast_seal');
  const sealHeader = isFastPick ? '👑 *PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S* ✨\n' : '';
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const pct = calcDiscountPercent(oldPrice, newPrice);
  const discountText = pct > 0 ? ` (${pct}% DE QUEDA)` : '';

  const { isDoubleDay, eventLabel } = customContext || getDoubleDayContext();
  const alertHeader = isDoubleDay
    ? `🚨 *QUEDA DE PREÇO RELÂMPAGO NO ${eventLabel}!* 📉⚡\n🔥🎯 *SUPER DESCONTO DETECTADO AGORA!*\n`
    : `🚨 *ALERTA DE QUEDA DE PREÇO NO AR!* 📉⚡\n`;

  return `${alertHeader}${sealHeader}🛍️ *ACHADINHO ${platform}*\n🔥 *${product.title}*\n\n💥 *BAIXOU AGORA:* de ~${oldPrice}~ por apenas *${newPrice}*!${discountText}\n\n👉 *GARANTA COM O MENOR PREÇO AQUI:*\n${product.affiliate_url}\n\n💬 *Entre no canal VIP de ofertas da FastSavory's:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
}

async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('http')) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      return `data:${contentType};base64,${base64}`;
    }
  } catch (err) {
    console.warn('[WhatsApp] Falha ao converter imagem para base64:', err.message);
  }
  return null;
}

async function dispatchWhatsAppMessage(messageCaption, mediaUrl, options = {}) {
  let evolutionApiUrl = (options.apiUrl || process.env.EVOLUTION_API_URL || 'http://136.248.121.245:8080').trim().replace(/\/+$/, '');
  let defaultApiKey = (process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976').trim();
  let evolutionApiKey = (options.apiKey || defaultApiKey).trim();

  const configuredInstance = (process.env.EVOLUTION_INSTANCE || '').trim();
  const defaultInstance = (configuredInstance === 'fastsavorys' || !configuredInstance) ? 'fast_pessoal' : configuredInstance;
  const evolutionInstance = (options.instance || defaultInstance).trim();
  const defaultTargetJid = (process.env.WHATSAPP_DEALS_GROUP_JID || '').trim();
  const targetRecipient = (options.targetJid || defaultTargetJid).trim();

  if (!evolutionApiUrl || !evolutionApiKey || !targetRecipient) {
    throw new Error('Configuração do WhatsApp não encontrada nas variáveis de ambiente da Vercel (EVOLUTION_API_URL, EVOLUTION_API_KEY ou destinatário JID).');
  }

  // Normaliza URL da imagem
  if (mediaUrl && !mediaUrl.startsWith('http')) {
    mediaUrl = `https://fastsavorys.vercel.app${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
  }

  // 0. Disparo específico para STATUS DO WHATSAPP (Stories)
  if (targetRecipient === 'status@broadcast') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const statusEndpoint = `${evolutionApiUrl}/message/sendStatus/${evolutionInstance}`;
      const isImage = Boolean(mediaUrl && mediaUrl.startsWith('http'));

      const statusPayload = isImage ? {
        type: 'image',
        content: mediaUrl,
        caption: messageCaption || '',
        allContacts: true
      } : {
        type: 'text',
        content: messageCaption || '',
        allContacts: true
      };

      const resStatus = await fetch(statusEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify(statusPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (resStatus.ok) {
        return await resStatus.json();
      }

      const errText = await resStatus.text();
      console.warn(`[WhatsApp Status] Resposta sendStatus (${evolutionInstance}):`, errText);
      return { success: false, error: errText };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Status] sendStatus (${evolutionInstance}) erro:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // 1. Se possuir URL de imagem, envia EXCLUSIVAMENTE via sendMedia (evita mensagens duplicadas)
  if (mediaUrl && mediaUrl.startsWith('http')) {
    const controller = new AbortController();
    // 45 segundos de timeout para acomodar download e envio da imagem
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const mediaEndpoint = `${evolutionApiUrl}/message/sendMedia/${evolutionInstance}`;
      let response = await fetch(mediaEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify({
          number: targetRecipient,
          media: mediaUrl,
          mediatype: 'image',
          mimetype: 'image/jpeg',
          caption: messageCaption,
          fileName: 'oferta.jpg',
          options: {
            delay: 1200,
            presence: 'composing'
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return await response.json();
      } else {
        const errText = await response.text();
        // Auto-reconexão: se o WhatsApp Web fechou a conexão (Connection Closed), reinicia a instância na Evolution e retenta
        if (errText.includes('Connection Closed') || errText.includes('connectionClosed') || response.status === 500) {
          console.warn(`[WhatsApp Dispatch] Conexão fechada detectada na Evolution API (${evolutionInstance}). Reiniciando instância e retentando...`);
          try {
            await fetch(`${evolutionApiUrl}/instance/restart/${evolutionInstance}`, {
              method: 'POST',
              headers: { 'apikey': evolutionApiKey }
            });
            await new Promise(r => setTimeout(r, 2000));
            const retryRes = await fetch(mediaEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionApiKey
              },
              body: JSON.stringify({
                number: targetRecipient,
                media: mediaUrl,
                mediatype: 'image',
                mimetype: 'image/jpeg',
                caption: messageCaption,
                fileName: 'oferta.jpg',
                options: { delay: 1000 }
              })
            });
            if (retryRes.ok) {
              console.log(`[WhatsApp Dispatch] ✅ Reenvio com sucesso após reinício da instância ${evolutionInstance}!`);
              return await retryRes.json();
            }
          } catch (reErr) {
            console.error('[WhatsApp Dispatch] Erro na auto-reconexão:', reErr.message);
          }
        }
        console.warn(`[WhatsApp Dispatch] Falha no sendMedia (${evolutionInstance} -> ${targetRecipient}, HTTP ${response.status}):`, errText);
        return { success: false, status: response.status, error: errText };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Dispatch] sendMedia (${evolutionInstance}) erro/timeout:`, err.message);
      // NUNCA chamar sendText de fallback quando a imagem falhar/der timeout,
      // para evitar que o WhatsApp entregue a imagem com legenda E depois repita o texto avulso embaixo!
      return { success: false, error: err.message };
    }
  }

  // 2. Apenas se NÃO houver imagem (mediaUrl vazio), envia texto formatado com link preview
  const controller = new AbortController();
  // 18 segundos de timeout para envio de texto no fallback
  const timeoutId = setTimeout(() => controller.abort(), 18000);

  try {
    const textEndpoint = `${evolutionApiUrl}/message/sendText/${evolutionInstance}`;
    const response = await fetch(textEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify({
        number: targetRecipient,
        text: messageCaption,
        linkPreview: true,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: true
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, status: response.status, error: errText };
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    return { success: false, error: err.message };
  }
}

async function sendPriceDropAlertToWhatsApp(product, oldPrice, newPrice) {
  try {
    const caption = buildPriceDropAlertText(product, oldPrice, newPrice);
    const mediaUrl = product.image_url || product.image;
    return await dispatchWhatsAppMessage(caption, mediaUrl);
  } catch (e) {
    console.warn('[Price Drop Alert] Não foi possível disparar no WhatsApp:', e.message);
    return null;
  }
}

async function sendProductDealToWhatsApp(product) {
  const caption = buildWhatsAppDealText(product);
  const mediaUrl = product.image_url || product.image;
  return await dispatchWhatsAppMessage(caption, mediaUrl);
}

/**
 * Seleciona um produto garantindo variedade máxima e intercalação inteligente:
 * 1. PLATAFORMAS: Se o anterior foi Shopee, prioriza fortemente Mercado Livre ou Amazon.
 *    Se a mesma loja saiu 2x seguidas, proíbe 100% repetir a mesma loja.
 * 2. CATEGORIAS: Se a mesma categoria saiu 2x seguidas, proíbe 100% repetir.
 * 3. EQUILÍBRIO: Garante que o catálogo inteiro circule, sem ficar preso apenas nos últimos cadastrados.
 */
function selectDiverseProduct(candidates, options = {}) {
  if (!candidates || candidates.length === 0) return null;

  const {
    lastCat = null,
    sameCategoryTwice = false,
    lastPlatform = null,
    samePlatformTwice = false,
    recentCats = []
  } = (typeof options === 'object' && options !== null) ? options : { lastCat: options };

  const normalizeCat = (c) => (c || 'outros').trim().toLowerCase();
  const getPlat = (p) => {
    return (detectPlatform(p.affiliate_url || p.url).id || 'generic').toLowerCase();
  };

  const scored = candidates.map(product => {
    const plat = getPlat(product);
    const cat = normalizeCat(product.category);
    let score = 50;

    // 1. DIVERSIDADE DE LOJA / PLATAFORMA (Shopee / Amazon / Mercado Livre)
    if (lastPlatform) {
      if (plat !== lastPlatform) {
        score += 85; // Forte incentivo para trocar de loja
      } else {
        if (samePlatformTwice) {
          score -= 1000; // PROÍBE 3 disparos seguidos da mesma loja
        } else {
          score -= 60; // Penaliza se for a mesma loja do último envio
        }
      }
    }

    // 2. DIVERSIDADE DE CATEGORIA (ESTRITA ALTERNÂNCIA)
    if (lastCat) {
      if (cat === lastCat) {
        score -= sameCategoryTwice ? 1500 : 400; // ENORME penalidade se for a mesma categoria do último disparo
      } else {
        score += 100; // Forte incentivo para trocar de categoria
      }
    }

    // Bônus adicional para categorias que NÃO saíram nos últimos envios
    if (recentCats && recentCats.length > 0) {
      const idx = recentCats.indexOf(cat);
      if (idx === -1) {
        score += 120; // Categoria fresca/diferente!
      } else if (idx === 0) {
        score -= 250; // Foi a última que saiu
      } else if (idx === 1) {
        score -= 100;
      }
    }

    // 3. EQUILÍBRIO NOVO vs CATÁLOGO
    // Inéditos ganham bônus (+25), mas isso NUNCA supera a penalidade de categoria repetida (-400)
    if (!product.last_posted_at) {
      score += 25;
    }

    // Oferta relâmpago com prazo ativo ganha bônus
    if (product.badge_color === 'flash_deal' || (product.flash_deal_end && new Date(product.flash_deal_end) > new Date())) {
      score += 25;
    }

    // Produtos com desconto alto (>= 30% OFF) ganham bônus
    const discPct = calcDiscountPercent(product.original_price, product.price_display);
    if (discPct >= 30) score += 15;

    // Jitter aleatório leve (+0 a 10) para desempate fluido
    score += Math.random() * 10;

    return { product, score, plat, cat };
  });

  // Ordena pelo maior score
  scored.sort((a, b) => b.score - a.score);

  // Filtra candidatos válidos (com score > 0)
  const validCandidates = scored.filter(s => s.score > 0);
  const poolToPick = (validCandidates.length > 0 ? validCandidates : scored).slice(0, 3);
  const chosen = poolToPick[Math.floor(Math.random() * poolToPick.length)].product;

  console.log(`[WhatsApp Deal] 🎯 Selecionado: "${chosen.title}" | Loja: ${getPlat(chosen).toUpperCase()} | Categoria: ${normalizeCat(chosen.category)} | Inédito: ${!chosen.last_posted_at}`);
  return chosen;
}

async function handleSendWhatsAppDeal(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase não encontrada.' });
  }

  let evolutionApiUrl = (process.env.EVOLUTION_API_URL || 'http://136.248.121.245:8080').replace(/\/+$/, '');
  let evolutionApiKey = process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976';
  const configuredInstance = (process.env.EVOLUTION_INSTANCE || '').trim();
  const defaultInstance = (configuredInstance === 'fastsavorys' || !configuredInstance) ? 'fast_pessoal' : configuredInstance;
  const evolutionInstance = (req.query.instance || (req.body && req.body.instance) || defaultInstance).trim();
  const targetGroupJid = process.env.WHATSAPP_DEALS_GROUP_JID || '';

  if (!evolutionApiUrl || !evolutionApiKey || !targetGroupJid) {
    return res.status(400).json({
      success: false,
      error: 'Variáveis de ambiente do WhatsApp não configuradas (EVOLUTION_API_URL, EVOLUTION_API_KEY ou WHATSAPP_DEALS_GROUP_JID).'
    });
  }

  // Identificação do modo e Horário de Brasília (UTC-3)
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  // Converte para minutos totais do dia no Horário de Brasília (UTC-3)
  const totalBrtMinutes = ((utcHours - 3 + 24) % 24) * 60 + utcMinutes;

  const { isDoubleDay, eventLabel } = getDoubleDayContext(now);

  // Intervalo e timeKey:
  // - Em Datas Duplas: intervalo contínuo de 5 minutos (06:00 às 22:35)
  // - Em Dias Normais: intervalo exato de 15 minutos (:00, :15, :30, :45) das 07:00 às 22:30
  const slotInterval = isDoubleDay ? 5 : 15;
  const remainder = totalBrtMinutes % slotInterval;
  const distanceToSlot = Math.min(remainder, slotInterval - remainder);
  const roundedMinutes = Math.round(totalBrtMinutes / slotInterval) * slotInterval;
  const roundedBrtHours = Math.floor(roundedMinutes / 60) % 24;
  const roundedSlotMinute = roundedMinutes % 60;
  const timeKey = `${String(roundedBrtHours).padStart(2, '0')}:${String(roundedSlotMinute).padStart(2, '0')}`;

  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  const force = req.query.force === 'true' || (req.body && req.body.force === true);
  let targetType = mode;

  // Variável para rastrear o índice do disparo nas datas duplas (1 a 200)
  let doubleDayDispatchIndex = null;

  // Contador dedicado de disparos do dia e trava por slot específico em fast_data_versions
  const brtDate = new Date(now.getTime() - 3 * 3600 * 1000);
  const todayBrt = brtDate.toISOString().split('T')[0];
  const counterKey = `wa_deals_${todayBrt}`;
  const slotLockKey = `wa_slot_${todayBrt}_${timeKey}`;
  let dailySentCount = 0;
  let lastSentAtMs = 0;
  let slotAlreadySent = false;

  if (mode === 'auto' && !force) {
    try {
      const { data: lockRows } = await supabaseAdmin
        .from('fast_data_versions')
        .select('key, version, updated_at')
        .in('key', [counterKey, slotLockKey]);

      if (lockRows && lockRows.length > 0) {
        for (const row of lockRows) {
          if (row.key === counterKey) {
            dailySentCount = Number(row.version) || 0;
            lastSentAtMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          }
          if (row.key === slotLockKey) {
            slotAlreadySent = true;
          }
        }
      } else {
        // Fallback para o 1º disparo do dia (contador ainda inexistente)
        const todayStartIso = new Date(`${todayBrt}T00:00:00.000-03:00`).toISOString();
        const { count: legacyCount } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('id', { count: 'exact', head: true })
          .gte('last_posted_at', todayStartIso);
        dailySentCount = Number(legacyCount) || 0;
      }
    } catch (lockErr) {
      console.warn('[WhatsApp Deal] Aviso ao verificar contador diário e trava de slot:', lockErr.message);
    }
  }

  if (isDoubleDay) {
    // REGRAS ESPECÍFICAS PARA DATAS DUPLAS (01/01, 02/02, ..., 11/11, 12/12):
    // 1. Volume de envios: Exatamente 200 disparos por dia ativo
    // 2. Horário de início: 1º disparo pontualmente às 06:00 (minuto 360)
    // 3. Intervalo entre envios: 1 mensagem a cada 5 minutos de forma contínua
    // 4. Horário de encerramento: 200º e último disparo pontualmente às 22:35 (minuto 1355)
    const startMinute = 6 * 60; // 06:00 BRT = 360 minutos
    const endMinute = 22 * 60 + 35; // 22:35 BRT = 1355 minutos
    doubleDayDispatchIndex = Math.round((roundedMinutes - startMinute) / 5) + 1;

    if (mode === 'auto' && !force) {
      if (roundedMinutes < startMinute) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Horário ${timeKey} fora da janela oficial de Mega Evento ${eventLabel} (06h00 às 22h35). O 1º disparo ocorrerá pontualmente às 06h00.`,
          timeKey,
          isDoubleDay: true,
          eventLabel
        });
      }

      if (roundedMinutes > endMinute) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Fila diária de 200 disparos do Mega Evento ${eventLabel} encerrada pontualmente às 22h35. Nenhum disparo restante para hoje.`,
          timeKey,
          isDoubleDay: true,
          eventLabel
        });
      }

      if (dailySentCount >= 200) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `O limite diário de 200 disparos do Mega Evento ${eventLabel} já foi concluído com sucesso hoje (${dailySentCount}/200). Fila diária finalizada.`,
          dailySentCount,
          timeKey,
          isDoubleDay: true,
          eventLabel
        });
      }

      // Trava de slot: evita duplo disparo no mesmo slot de 5 minutos
      if (slotAlreadySent) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Disparo ignorado: o slot oficial ${timeKey} de 5 min do Mega Evento ${eventLabel} já foi enviado hoje.`,
          timeKey,
          isDoubleDay: true,
          eventLabel
        });
      }

      // Em datas duplas, todos os 200 envios são promoções de ofertas para o grupo
      targetType = 'affiliate';
    }
  } else {
    // DIAS NORMAIS (HORÁRIOS EXATOS DE 15 EM 15 MINUTOS):
    // 9 Horários estratégicos da FastSavory's intercalados (Almoço, Sobremesas, Fornadas, Lanche e Encomendas da tarde)
    const fastSavorysSlots = ['11:30', '12:00', '12:45', '13:30', '14:00', '15:00', '15:45', '16:30', '17:30'];

    if (mode === 'auto' && !force) {
      // Janela oficial: das 07h00 até as 22h30 rigorosamente
      const startMinute = 7 * 60; // 07:00 BRT
      const endMinute = 22 * 60 + 30; // 22:30 BRT
      if (roundedMinutes < startMinute || roundedMinutes > endMinute) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Horário ${timeKey} fora da janela oficial de disparos (07h00 às 22h30). O primeiro disparo ocorre pontualmente às 07h00 e o último às 22h30.`,
          timeKey,
          isDoubleDay: false
        });
      }

      // REGRA DE HORÁRIO EXATO (elimina minutos quebrados como :05, :10, :20, :25, :33, :40):
      // Aceita apenas chamadas com tolerância de até ±2 minutos do slot oficial (:00, :15, :30, :45).
      if (distanceToSlot > 2) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Minuto atual fora do horário exato de 15 minutos. Os envios ocorrem rigorosamente nos horários cheios (:00, :15, :30, :45). Próximo slot oficial: ${timeKey}.`,
          timeKey,
          distanceToSlot,
          isDoubleDay: false
        });
      }

      // Trava por slot exato: se o slot (ex: 07:15, 07:30) já foi enviado hoje, NÃO repete!
      if (slotAlreadySent) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Disparo ignorado: o slot oficial ${timeKey} de hoje já foi enviado com sucesso. Aguardando próximo horário exato em 15 minutos.`,
          timeKey,
          isDoubleDay: false
        });
      }

      // Disparos a cada 15 minutos com intercalação de slots do cardápio FastSavory's
      const isFastSavorysSlot = fastSavorysSlots.includes(timeKey);
      targetType = isFastSavorysSlot ? 'fastsavorys' : 'affiliate';
    }
  }

  try {
    let product = null;
    let isFastSavorysStore = false;
    let messageCaption = '';
    let mediaUrl = null;

    if (targetType === 'fastsavorys') {
      // 1. Busca produtos do cardápio FastSavory's
      const { data: storeProducts, error: storeErr } = await supabaseAdmin
        .from('fast_products')
        .select('*');

      if (!storeErr && storeProducts && storeProducts.length > 0) {
        // Filtra itens principais do cardápio: SOMENTE ATIVOS, VISÍVEIS e com FOTO REAL
        // Exclui sachês, descartáveis, condimentos, bebidas avulsas (a menos que seja combo/kit) e toppers
        const validStoreProducts = storeProducts.filter(p => {
          const name = (p.name || '').toLowerCase();
          const cat = (p.category || '').toLowerCase();
          const isCombo = name.includes('combo') || name.includes('kit');

          if (
            name.includes('sache') || 
            name.includes('sachê') || 
            name.includes('taxa') || 
            name.includes('copo') || 
            name.includes('guardanapo') ||
            name.includes('ketchup') ||
            name.includes('maionese') ||
            name.includes('mostarda') ||
            name.includes('embalagem') ||
            name === 'topper'
          ) return false;

          // Bebidas avulsas não devem ser protagonistas de disparo
          if (!isCombo && (cat === 'bebidas' || name.includes('coca') || name.includes('fanta') || name.includes('guaran') || name.includes('refrigerante') || name.includes('água') || name.includes('agua'))) {
            return false;
          }
          
          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
          const isVisible = p.visible === true && !p.unavailable_today && p.catalog_enabled !== false;
          const hasValidImage = Boolean(p.image && typeof p.image === 'string' && p.image.startsWith('http'));
          
          return isVisible && hasValidImage && !isNaN(price) && price > 0;
        });

        // Se por algum motivo todos estiverem sem foto, usa os visíveis como fallback
        const fallbackVisible = storeProducts.filter(p => p.visible === true && !p.unavailable_today && p.catalog_enabled !== false);
        const pool = validStoreProducts.length > 0 ? validStoreProducts : (fallbackVisible.length > 0 ? fallbackVisible : storeProducts);
        
        // Rotação estrita por data do último envio (FIFO): quem nunca foi enviado ou foi enviado há mais tempo tem prioridade absoluta!
        // Impede qualquer repetição do mesmo produto até que todos os outros salgados/bolos tenham sido enviados.
        pool.sort((a, b) => {
          if (!a.last_posted_at && b.last_posted_at) return -1;
          if (a.last_posted_at && !b.last_posted_at) return 1;
          if (!a.last_posted_at && !b.last_posted_at) return (a.id - b.id);
          return new Date(a.last_posted_at).getTime() - new Date(b.last_posted_at).getTime();
        });

        product = pool[0];
        isFastSavorysStore = true;
        messageCaption = buildFastSavorysProductText(product);
        mediaUrl = product.image || product.image_url;
      }
    }

    // 2. Se for modo afiliado ou se não encontrou produto de loja, busca nos achadinhos
    if (!product) {
      // 2.0 HISTÓRICO DE DISPAROS: Busca as 5 últimas postagens para alternar loja e categoria
      let lastCat = null;
      let secondLastCat = null;
      let sameCategoryTwice = false;
      let lastPlatform = null;
      let secondLastPlatform = null;
      let samePlatformTwice = false;
      let recentCats = [];

      try {
        const { data: recentDispatches } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('id, category, last_posted_at, affiliate_url')
          .not('last_posted_at', 'is', null)
          .order('last_posted_at', { ascending: false })
          .limit(5);

        if (recentDispatches && recentDispatches.length > 0) {
          recentCats = recentDispatches.map(p => (p.category || 'outros').trim().toLowerCase());
          lastCat = recentCats[0] || null;
          secondLastCat = recentCats[1] || null;
          sameCategoryTwice = Boolean(lastCat && secondLastCat && lastCat === secondLastCat);

          const recentPlats = recentDispatches.map(p => (detectPlatform(p.affiliate_url).id || 'generic').toLowerCase());
          lastPlatform = recentPlats[0] || null;
          secondLastPlatform = recentPlats[1] || null;
          samePlatformTwice = Boolean(lastPlatform && secondLastPlatform && lastPlatform === secondLastPlatform);

          console.log(`[WhatsApp Deal] 📊 Histórico Recente: Lojas [${recentPlats.join(' -> ')}] | Categorias [${recentCats.join(' -> ')}]`);
        }
      } catch (histErr) {
        console.warn('[WhatsApp Deal] Aviso ao consultar histórico:', histErr.message);
      }

      // 2.1 CONSTRUÇÃO DO POOL DE CANDIDATOS (EQUILÍBRIO INÉDITOS + CATÁLOGO EXISTENTE)
      // Para evitar que um lote minerado domine todas as próximas horas,
      // juntamos no pool produtos inéditos (novos) E produtos consolidados do catálogo (antigos)!
      const candidatePool = [];
      const seenIds = new Set();

      // GUARDA DE AFILIAÇÃO: Garante que NENHUM produto do Mercado Livre seja disparado sem link comissionado oficial (/sec/ ou meli.la)
      const isValidAffiliateCandidate = (p) => {
        if (!p || !p.affiliate_url) return false;
        const url = String(p.affiliate_url).toLowerCase();
        const isML = url.includes('mercadolivre') || url.includes('mercadolibre') || url.includes('meli.la');
        if (isML && !url.includes('/sec/') && !url.includes('meli.la')) {
          return false;
        }
        return true;
      };

      // a) Produtos com contador RELÂMPAGO ativo (Prioridade alta)
      const nowIso = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      try {
        const { data: flashCandidates } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true)
          .gt('flash_deal_end', nowIso)
          .or(`last_posted_at.is.null,last_posted_at.lt.${twentyFourHoursAgo}`)
          .limit(10);

        if (flashCandidates) {
          flashCandidates.forEach(p => {
            if (!seenIds.has(p.id) && isValidAffiliateCandidate(p)) { seenIds.add(p.id); candidatePool.push(p); }
          });
        }
      } catch (e) { }

      // b) Produtos INÉDITOS (que nunca foram postados): busca até 30
      try {
        const { data: unpostedProducts } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true)
          .is('last_posted_at', null)
          .order('created_at', { ascending: false })
          .limit(30);

        if (unpostedProducts) {
          unpostedProducts.forEach(p => {
            if (!seenIds.has(p.id) && isValidAffiliateCandidate(p)) { seenIds.add(p.id); candidatePool.push(p); }
          });
        }
      } catch (e) { }

      // c) Produtos do CATÁLOGO GERAL (Amazon, Mercado Livre, Shopee que faz mais tempo sem sair)
      // Busca 60 produtos com last_posted_at mais antigo para garantir opções de todas as lojas e categorias
      try {
        const { data: catalogProducts } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true)
          .not('last_posted_at', 'is', null)
          .order('last_posted_at', { ascending: true })
          .limit(60);

        if (catalogProducts) {
          catalogProducts.forEach(p => {
            if (!seenIds.has(p.id) && isValidAffiliateCandidate(p)) { seenIds.add(p.id); candidatePool.push(p); }
          });
        }
      } catch (e) { }

      if (candidatePool.length === 0) {
        return res.status(200).json({
          success: false,
          message: 'Nenhum produto ativo encontrado no catálogo para disparo.'
        });
      }

      // 2.2 SELEÇÃO INTELIGENTE COM ROTAÇÃO ESTRITA DE CATEGORIA E PLATAFORMA
      // Executa loop de até 3 tentativas: se um produto estiver pausado/esgotado na loja de origem,
      // ele é desativado no banco e o sistema escolhe AUTOMATICAMENTE outro produto para não perder o horário de envio!
      let pool = [...candidatePool];
      let chosenProduct = null;

      for (let attempt = 1; attempt <= 3 && pool.length > 0; attempt++) {
        const candidate = selectDiverseProduct(pool, {
          lastCat,
          sameCategoryTwice,
          lastPlatform,
          samePlatformTwice,
          recentCats
        }) || pool[0];

        if (!candidate) break;

        let isAvailable = true;
        if (candidate.affiliate_url) {
          try {
            const { fetchProductDetails } = require('../check-affiliate-links');
            if (typeof fetchProductDetails === 'function') {
              // Timeout rápido de 8s para não prender a execução do cron
              const freshPromise = fetchProductDetails(candidate.affiliate_url);
              const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 8000));
              const fresh = await Promise.race([freshPromise, timeoutPromise]);

              if (fresh) {
                if (fresh.is_active === false) {
                  console.log(`[WhatsApp Deal] ⚠️ Produto ${candidate.id} ("${candidate.title}") pausado/esgotado na loja. Desativando e buscando outro...`);
                  await supabaseAdmin
                    .from('fast_affiliate_products')
                    .update({ is_active: false, updated_at: new Date().toISOString() })
                    .eq('id', candidate.id);
                  // Remove do pool e tenta o próximo candidato
                  pool = pool.filter(p => p.id !== candidate.id);
                  isAvailable = false;
                } else {
                  let changed = false;
                  const updateFields = {};
                  if (fresh.price_display && fresh.price_display !== candidate.price_display) {
                    console.log(`[WhatsApp Deal] Preço atualizado para ${candidate.id}: de "${candidate.price_display}" para "${fresh.price_display}"`);
                    candidate.price_display = fresh.price_display;
                    updateFields.price_display = fresh.price_display;
                    changed = true;
                  }
                  if (fresh.original_price && fresh.original_price !== candidate.original_price) {
                    candidate.original_price = fresh.original_price;
                    updateFields.original_price = fresh.original_price;
                    changed = true;
                  }
                  if (fresh.discount_tag && fresh.discount_tag !== candidate.discount_tag) {
                    candidate.discount_tag = fresh.discount_tag;
                    updateFields.discount_tag = fresh.discount_tag;
                    changed = true;
                  }
                  if (fresh.is_prime !== undefined && fresh.is_prime !== candidate.is_prime) {
                    candidate.is_prime = fresh.is_prime;
                    updateFields.is_prime = fresh.is_prime;
                    changed = true;
                  }
                  if (fresh.coupon_code && fresh.coupon_code !== candidate.coupon_code) {
                    candidate.coupon_code = fresh.coupon_code;
                    updateFields.coupon_code = fresh.coupon_code;
                    changed = true;
                  }
                  if (fresh.is_imported !== undefined && fresh.is_imported !== candidate.is_imported) {
                    candidate.is_imported = fresh.is_imported;
                    updateFields.is_imported = fresh.is_imported;
                    changed = true;
                  }
                  if (changed) {
                    updateFields.updated_at = new Date().toISOString();
                    supabaseAdmin
                      .from('fast_affiliate_products')
                      .update(updateFields)
                      .eq('id', candidate.id)
                      .then()
                      .catch(() => {});
                  }
                }
              }
            }
          } catch (fetchErr) {
            console.warn('[WhatsApp Deal] Rechecagem em tempo real falhou, mantendo dados do banco:', fetchErr.message);
          }
        }

        if (isAvailable) {
          chosenProduct = candidate;
          break;
        }
      }

      product = chosenProduct || candidatePool[0];
      // GUARDA DE SANIDADE: Proteção de Credibilidade do Grupo VIP
      // Bloqueia qualquer produto com preço quebrado/irrisório para pacotes ou kits (ex: R$ 1,42 para 12 unidades)
      const numPrice = parsePrice(product.price_display);
      const isMultiPack = /\b(\d+)\s*(unidades?|unids?|peças?|pecas?|rolos?|fraldas?|c[áa]psulas?|itens|sach[êe]s?|latas?|garrafas?)\b/i.test(product.title) ||
                          /\bkit\s*(com|c\/)?\s*(\d+)/i.test(product.title);

      if ((isMultiPack && numPrice < 4.0) || (numPrice > 0 && numPrice < 1.90)) {
        console.warn(`[WhatsApp Guard] Disparo bloqueado para ${product.id} ("${product.title}"): preço ${product.price_display} suspeito de erro de scraping/preço unitário.`);
        await supabaseAdmin
          .from('fast_affiliate_products')
          .update({ last_posted_at: new Date().toISOString() })
          .eq('id', product.id);

        return res.status(200).json({
          success: false,
          skipped: true,
          message: `Produto "${product.title}" bloqueado: preço ${product.price_display} suspeito de ser preço unitário fracionado. Protegendo a credibilidade do grupo VIP.`
        });
      }

      isFastSavorysStore = false;
      messageCaption = buildWhatsAppDealText(product);
      mediaUrl = product.image_url || product.image;
    }

    // Normaliza URL da imagem
    if (mediaUrl && !mediaUrl.startsWith('http')) {
      mediaUrl = `https://fastsavorys.vercel.app${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
    }

    // Disparo centralizado via dispatchWhatsAppMessage
    let sendResponse = await dispatchWhatsAppMessage(messageCaption, mediaUrl, {
      instance: evolutionInstance,
      targetJid: targetGroupJid
    });

    let isSendOk = sendResponse &&
      sendResponse.success !== false &&
      !sendResponse.error &&
      (Boolean(sendResponse.key) || typeof sendResponse.status === 'string' || !sendResponse.status || (typeof sendResponse.status === 'number' && sendResponse.status < 400));

    // Contingência: Apenas para produtos do cardápio da FastSavory's.
    // Para Achadinhos de Afiliados (Mercado Livre, Amazon, Shopee), o usuário exige EXCLUSIVAMENTE o seu número pessoal!
    if (!isSendOk && isFastSavorysStore) {
      const backupInstance = 'fast_lanchonete';
      console.warn(`[WhatsApp Deal Cron] ⚠️ Instância principal falhou para produto da loja. Tentando ${backupInstance}...`);
      const fallbackResponse = await dispatchWhatsAppMessage(messageCaption, mediaUrl, {
        instance: backupInstance,
        targetJid: targetGroupJid
      });
      const isFallbackOk = fallbackResponse &&
        fallbackResponse.success !== false &&
        !fallbackResponse.error &&
        (Boolean(fallbackResponse.key) || typeof fallbackResponse.status === 'string' || !fallbackResponse.status || (typeof fallbackResponse.status === 'number' && fallbackResponse.status < 400));

      if (isFallbackOk) {
        console.log(`[WhatsApp Deal Cron] ✅ Envio de produto da loja bem-sucedido via ${backupInstance}!`);
        sendResponse = fallbackResponse;
        isSendOk = true;
      }
    }

    if (!isSendOk) {
      const errMsg = sendResponse?.error || (typeof sendResponse === 'object' ? JSON.stringify(sendResponse) : 'Falha desconhecida no WhatsApp');
      console.error(`[WhatsApp Deal Cron] ❌ Falha no envio para o grupo VIP (${evolutionInstance}):`, errMsg);
      return res.status(500).json({
        success: false,
        error: `Falha no envio da mensagem pelo WhatsApp: ${errMsg}`,
        productId: product.id,
        evolutionResponse: sendResponse
      });
    }

    // Atualiza data do último envio (last_posted_at) na tabela correspondente apenas se o envio foi bem-sucedido
    const nowIso = new Date().toISOString();
    const targetTable = isFastSavorysStore ? 'fast_products' : 'fast_affiliate_products';

    try {
      await supabaseAdmin
        .from(targetTable)
        .update({ last_posted_at: nowIso, updated_at: nowIso })
        .eq('id', product.id);
    } catch (updateErr) {
      console.warn(`[WhatsApp Deal] Aviso ao atualizar last_posted_at em ${targetTable}:`, updateErr.message);
    }

    // Registra a trava do slot oficial e incrementa o contador diário em fast_data_versions
    try {
      const brtDay = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const key = `wa_deals_${brtDay}`;
      const slotKey = `wa_slot_${brtDay}_${timeKey}`;

      const { data: row } = await supabaseAdmin
        .from('fast_data_versions')
        .select('version')
        .eq('key', key)
        .maybeSingle();

      await Promise.all([
        supabaseAdmin
          .from('fast_data_versions')
          .upsert({ key, version: (Number(row && row.version) || 0) + 1, updated_at: nowIso }),
        supabaseAdmin
          .from('fast_data_versions')
          .upsert({ key: slotKey, version: 1, updated_at: nowIso })
      ]);
    } catch (counterErr) {
      console.warn('[WhatsApp Deal] Aviso ao incrementar contador/trava de slot:', counterErr.message);
    }

    return res.status(200).json({
      success: true,
      message: isDoubleDay
        ? `Oferta ${doubleDayDispatchIndex ? `${doubleDayDispatchIndex}/200 ` : ''}do Mega Evento ${eventLabel} enviada com sucesso para o grupo (${product.title || product.name})`
        : `Oferta enviada com sucesso para o grupo (${product.title || product.name})`,
      type: isFastSavorysStore ? 'fastsavorys_store' : 'affiliate_deal',
      productId: product.id,
      productTitle: product.title || product.name,
      timeKey,
      postedAt: nowIso,
      isDoubleDay,
      eventLabel: isDoubleDay ? eventLabel : null,
      dispatchNumber: isDoubleDay ? doubleDayDispatchIndex : null,
      totalDispatchesTarget: isDoubleDay ? 200 : null,
      evolutionResponse: sendResponse
    });


  } catch (error) {
    console.error('[WhatsApp Deal Cron] ❌ Erro:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao processar disparo.'
    });
  }
}

/**
 * Disparo Automático para STATUS DO WHATSAPP (Stories)
 * 1. Lanchonete (73 99936-6554): 4 disparos por dia (13h, 14h, 15h, 16h) - Apenas FastSavory's
 * 2. Pessoal (73 99934-8552): 3 disparos por dia (10h, 14h, 18h) - Apenas Achadinhos
 */
async function handleSendWhatsAppStatus(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase não encontrada.' });
  }

  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  const targetChannel = req.query.channel || (req.body && req.body.channel) || '';

  // Bloqueio definitivo do número pessoal (solicitação do usuário)
  if (targetChannel === 'personal' || mode === 'personal' || mode === 'achadinhos') {
    return res.status(200).json({
      success: false,
      skipped: true,
      message: 'Disparos de Status no WhatsApp pessoal foram permanentemente desativados. Apenas a lanchonete está ativa.'
    });
  }

  const evolutionApiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || '';
  const storeApiKey = (process.env.EVOLUTION_STORE_API_KEY || process.env.EVOLUTION_STORE_KEY || evolutionApiKey).trim();
  const storeInstance = (process.env.EVOLUTION_STORE_INSTANCE || 'fast_lanchonete').trim();

  if (!evolutionApiUrl || !evolutionApiKey) {
    return res.status(400).json({
      success: false,
      error: 'EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas na Vercel.'
    });
  }

  const now = new Date();
  const utcHours = now.getUTCHours();
  const brtHours = (utcHours - 3 + 24) % 24;
  const utcMinutes = now.getUTCMinutes();
  const slotMinute = (utcMinutes >= 15 && utcMinutes < 45) ? '30' : '00';
  const timeKey = `${String(brtHours).padStart(2, '0')}:${slotMinute}`;

  // Horários oficiais definidos pelo usuário (Apenas Lanchonete FastSavory's)

  // Horários oficiais definidos pelo usuário (Apenas Lanchonete FastSavory's)
  const storeSlots = ['13:00', '14:00', '15:00', '16:00'];

  let targetsToExecute = [];

  if (targetChannel === 'store' || mode === 'store' || mode === 'fastsavorys' || mode === 'all') {
    targetsToExecute.push('store');
  } else {
    // Modo automático por horário
    if (storeSlots.includes(timeKey)) {
      targetsToExecute.push('store');
    }
    // Se chamado fora dos slots oficiais
    if (targetsToExecute.length === 0) {
      const force = req.query.force === 'true' || (req.body && req.body.force === true);
      if (force) {
        targetsToExecute.push('store');
      } else {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Horário ${timeKey} fora das janelas programadas de Status da Lanchonete (13h, 14h, 15h, 16h).`,
          timeKey
        });
      }
    }
  }

  const results = [];

  for (const channel of targetsToExecute) {
    try {
      if (channel === 'store') {
        // --- 1. STATUS DA LANCHONETE (FastSavory's) ---
        const { data: storeProducts, error: storeErr } = await supabaseAdmin
          .from('fast_products')
          .select('*');

        if (storeErr || !storeProducts || storeProducts.length === 0) {
          results.push({ channel: 'store', success: false, error: 'Nenhum produto da loja encontrado.' });
          continue;
        }

        const validStoreProducts = storeProducts.filter(p => {
          const name = (p.name || '').toLowerCase();
          const cat = (p.category || '').toLowerCase();
          const isCombo = name.includes('combo') || name.includes('kit');

          if (
            name.includes('sache') || name.includes('sachê') || 
            name.includes('taxa') || name.includes('copo') || 
            name.includes('guardanapo') || name.includes('ketchup') || 
            name.includes('maionese') || name.includes('mostarda') ||
            name.includes('embalagem') ||
            name === 'topper'
          ) return false;

          // Bebidas avulsas não devem ser protagonistas de status/disparo
          if (!isCombo && (cat === 'bebidas' || name.includes('coca') || name.includes('fanta') || name.includes('guaran') || name.includes('refrigerante') || name.includes('água') || name.includes('agua'))) {
            return false;
          }

          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
          const isVisible = p.visible === true && !p.unavailable_today && p.catalog_enabled !== false;
          const hasValidImage = Boolean(p.image && typeof p.image === 'string' && p.image.startsWith('http'));
          return isVisible && hasValidImage && !isNaN(price) && price > 0;
        });

        const pool = validStoreProducts.length > 0 ? validStoreProducts : storeProducts.filter(p => p.visible === true);
        
        // Rotação estrita por data do último envio (FIFO)
        pool.sort((a, b) => {
          if (!a.last_posted_at && b.last_posted_at) return -1;
          if (a.last_posted_at && !b.last_posted_at) return 1;
          if (!a.last_posted_at && !b.last_posted_at) return (a.id - b.id);
          return new Date(a.last_posted_at).getTime() - new Date(b.last_posted_at).getTime();
        });

        const product = pool[0];

        const caption = buildFastSavorysStatusText(product);
        const mediaUrl = product.image || product.image_url;

        const sendRes = await dispatchWhatsAppMessage(caption, mediaUrl, {
          instance: storeInstance,
          apiKey: storeApiKey,
          targetJid: 'status@broadcast'
        });

        if (sendRes && sendRes.success !== false) {
          const nowIso = new Date().toISOString();
          try {
            await supabaseAdmin
              .from('fast_products')
              .update({ last_posted_at: nowIso, updated_at: nowIso })
              .eq('id', product.id);
          } catch (e) {
            console.warn('[WhatsApp Status] Erro ao atualizar last_posted_at:', e.message);
          }
        }

        results.push({
          channel: 'store_fastsavorys',
          instance: storeInstance,
          target: 'status@broadcast',
          productTitle: product.name,
          price: product.price,
          status: 'posted_to_status',
          evolutionResponse: sendRes
        });
      }
    } catch (chanErr) {
      console.error(`[WhatsApp Status] Erro no canal ${channel}:`, chanErr.message);
      results.push({ channel, success: false, error: chanErr.message });
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Processamento de Status do WhatsApp concluído.',
    timeKey,
    results
  });
}

/**
 * Disparo Automático: Convite do Grupo VIP do WhatsApp
 * Dispara toda quarta e domingo às 8h AM para o número pessoal e o da lanchonete
 */
async function handleSendVipGroupInvite(req, res) {
  const providedSecret = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim() ||
    req.headers['x-cron-secret'] ||
    req.query.secret ||
    req.query.key;
  const isAuthorized = Boolean(providedSecret && (providedSecret === process.env.CRON_SECRET || providedSecret === 'fastsavorys-cron-secret-2026'));
  const force = (req.query.force === 'true' || (req.body && req.body.force === true)) && isAuthorized;

  // 1. Data e Horário em Brasília (UTC-3)
  const now = new Date();
  const brtDate = new Date(now.getTime() - (3 * 3600 * 1000));
  const brtDayOfWeek = brtDate.getUTCDay(); // 0 = Domingo, 3 = Quarta
  const brtHours = brtDate.getUTCHours();
  const todayBRT = brtDate.toISOString().split('T')[0]; // YYYY-MM-DD

  // 2. Trava de Dia e Horário (Apenas Quarta-feira e Domingo às 8h AM BRT)
  const isAllowedDay = (brtDayOfWeek === 0 || brtDayOfWeek === 3);
  const isAllowedHour = (brtHours === 8); // Janela das 08h da manhã

  if (!force) {
    if (!isAllowedDay) {
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      console.log(`[VIP Invite] Ignorado: Hoje é ${dayNames[brtDayOfWeek]}. O convite só pode ser enviado na Quarta e no Domingo.`);
      return res.status(200).json({
        success: false,
        skipped: true,
        reason: `Hoje é ${dayNames[brtDayOfWeek]}. O convite VIP só é disparado nas Quartas e Domingos às 08h da manhã.`,
        todayBRT,
        brtHours
      });
    }

    if (!isAllowedHour) {
      console.log(`[VIP Invite] Ignorado: Horário atual em Brasília é ${brtHours}h. O envio só é permitido às 08h da manhã.`);
      return res.status(200).json({
        success: false,
        skipped: true,
        reason: `Horário atual (${brtHours}h BRT) fora da janela permitida das 08h da manhã.`,
        todayBRT,
        brtHours
      });
    }

    // 3. Trava de Idempotência no Supabase (NUNCA envia mais de uma vez no mesmo dia)
    try {
      const { data: lockRow, error: lockErr } = await supabaseAdmin
        .from('fast_data_versions')
        .select('updated_at')
        .eq('key', 'vip_invite_status')
        .single();

      if (!lockErr && lockRow && lockRow.updated_at) {
        const lastSentBrtDate = new Date(new Date(lockRow.updated_at).getTime() - (3 * 3600 * 1000));
        const lastSentDay = lastSentBrtDate.toISOString().split('T')[0];
        if (lastSentDay === todayBRT) {
          console.log(`[VIP Invite] Ignorado: O convite VIP já foi enviado hoje (${todayBRT}). Bloqueando envio duplicado.`);
          return res.status(200).json({
            success: false,
            skipped: true,
            reason: `O convite VIP já foi enviado hoje (${todayBRT}). Trava de segurança anti-duplicidade ativada.`,
            lastSentAt: lockRow.updated_at
          });
        }
      }
    } catch (lockCheckErr) {
      console.warn('[VIP Invite] Aviso ao checar trava no Supabase:', lockCheckErr.message);
    }
  }

  const inviteCaption = 'https://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE';
  const inviteImageUrl = 'https://fastsavorys.vercel.app/assets/img/Achadinhos.jpg';

  const storeInstance = (process.env.EVOLUTION_STORE_INSTANCE || 'fast_lanchonete').trim();
  const storeApiKey = (process.env.EVOLUTION_STORE_API_KEY || process.env.EVOLUTION_API_KEY || '').trim();

  const targets = [
    { label: 'Status Lanchonete', instance: storeInstance, apiKey: storeApiKey }
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const sendRes = await dispatchWhatsAppMessage(inviteCaption, inviteImageUrl, {
          instance: t.instance,
          apiKey: t.apiKey,
          targetJid: 'status@broadcast'
        });
        return { target: t.label, success: true, evolutionResponse: sendRes };
      } catch (e) {
        return { target: t.label, success: false, error: e.message };
      }
    })
  );

  // Registra no banco para travar imediatamente novos envios hoje
  try {
    await supabaseAdmin
      .from('fast_data_versions')
      .upsert({
        key: 'vip_invite_status',
        version: Date.now(),
        updated_at: new Date().toISOString()
      });
  } catch (upErr) {
    console.warn('[VIP Invite] Falha ao registrar trava de envio no Supabase:', upErr.message);
  }

  return res.status(200).json({
    success: true,
    message: 'Disparo de convite do Grupo VIP no Status processado com sucesso.',
    results
  });
}

module.exports = {
  dispatchWhatsAppMessage,
  handleSendWhatsAppDeal,
  handleSendWhatsAppStatus,
  handleSendVipGroupInvite,
  sendPriceDropAlertToWhatsApp,
  sendProductDealToWhatsApp,
  buildWhatsAppDealText,
  buildFastSavorysStatusText,
  buildWhatsAppStatusDealText,
  buildPriceDropAlertText,
  getDoubleDayContext
};
