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
  if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return { name: 'Amazon' };
  }
  if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
    return { name: 'Shopee' };
  }
  return { name: 'Mercado Livre' };
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
  const discountText = pct > 0 ? ` (${pct}% OFF)` : (product.discount_tag ? ` (${product.discount_tag})` : '');
  const origPriceText = product.original_price ? `~${product.original_price}~ ➔ ` : '';
  const descText = product.description ? `\n${product.description}\n` : '';
  
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

  return `${eventHeader}${flashHeader}${sealHeader}🛍️ *ACHADINHO ${platform}* ⭐\n🔥 *${product.title}*\n${descText}\n${pricePrefix}${origPriceText}*${product.price_display || 'Confira no link'}*${discountText}${couponText}\n\n${ctaLine}\n${product.affiliate_url}\n\n💬 *Entre no canal VIP de ofertas da FastSavory's:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
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
  const evolutionApiUrl = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  const defaultApiKey = (process.env.EVOLUTION_API_KEY || '').trim();
  const evolutionApiKey = (options.apiKey || defaultApiKey).trim();
  const defaultInstance = (process.env.EVOLUTION_INSTANCE || 'fastsavorys').trim();
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
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const mediaEndpoint = `${evolutionApiUrl}/message/sendMedia/${evolutionInstance}`;
      const response = await fetch(mediaEndpoint, {
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
        console.warn(`[WhatsApp Dispatch] Resposta sendMedia (${evolutionInstance} -> ${targetRecipient}, HTTP ${response.status}):`, errText);
        return { success: false, status: response.status, error: errText };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Dispatch] sendMedia (${evolutionInstance}) erro/timeout:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // 2. Se NÃO houver imagem, envia apenas texto (se o destinatário aceitar texto)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

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

async function handleSendWhatsAppDeal(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase não encontrada.' });
  }

  const evolutionApiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || '';
  const evolutionInstance = process.env.EVOLUTION_INSTANCE || 'fastsavorys';
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

  // Arredonda para o intervalo de 15 minutos mais próximo (tolerância de +/- 7 minutos para atrasos de rede/cron)
  const roundedMinutes = Math.round(totalBrtMinutes / 15) * 15;
  const roundedBrtHours = Math.floor(roundedMinutes / 60) % 24;
  const roundedSlotMinute = roundedMinutes % 60;
  const timeKey = `${String(roundedBrtHours).padStart(2, '0')}:${String(roundedSlotMinute).padStart(2, '0')}`;

  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  const force = req.query.force === 'true' || (req.body && req.body.force === true);
  let targetType = mode;

  // 9 Horários estratégicos da FastSavory's intercalados (Almoço, Sobremesas, Fornadas, Lanche e Encomendas da tarde)
  const fastSavorysSlots = ['11:30', '12:00', '12:45', '13:30', '14:00', '15:00', '15:45', '16:30', '17:30'];

  const { isDoubleDay, eventLabel } = getDoubleDayContext();

  if (mode === 'auto' && !force) {
    if (isDoubleDay) {
      // MEGA EVENTO (ex: 09/09, 10/10, 11/11, 12/12):
      // Disparos a cada 15 min das 07h00 às 22h00
      const isWithinEventHours = roundedBrtHours >= 7 && roundedBrtHours <= 22;
      if (!isWithinEventHours) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Horário ${timeKey} fora da janela do Mega Evento ${eventLabel} (07h às 22h).`,
          isDoubleDay: true,
          eventLabel
        });
      }
      const isFastSavorysSlot = fastSavorysSlots.includes(timeKey);
      targetType = isFastSavorysSlot ? 'fastsavorys' : 'affiliate';
    } else {
      // DIAS NORMAIS:
      // Apenas slots de 30 min (:00 e :30) ou os horários estratégicos da FastSavory's
      const isStandardSlot = (roundedSlotMinute === 0 || roundedSlotMinute === 30);
      const isFastSavorysSlot = fastSavorysSlots.includes(timeKey);

      if (!isStandardSlot && !isFastSavorysSlot) {
        return res.status(200).json({
          success: true,
          skipped: true,
          message: `Horário ${timeKey} (:15/:45) reservado exclusivamente para Mega Eventos (dias duplos). Em dias normais, disparos ocorrem a cada 30 min.`,
          isDoubleDay: false
        });
      }
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
        // Filtra itens principais do cardápio: SOMENTE ATIVOS, VISÍVEIS e com FOTO REAL (exclui sachês, descartáveis, condimentos ou itens ocultos)
        const validStoreProducts = storeProducts.filter(p => {
          const name = (p.name || '').toLowerCase();
          if (
            name.includes('sache') || 
            name.includes('sachê') || 
            name.includes('taxa') || 
            name.includes('copo') || 
            name.includes('guardanapo') ||
            name.includes('ketchup') ||
            name.includes('maionese') ||
            name.includes('mostarda') ||
            name.includes('embalagem')
          ) return false;
          
          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
          const isVisible = p.visible === true && !p.unavailable_today && p.catalog_enabled !== false;
          const hasValidImage = Boolean(p.image && typeof p.image === 'string' && p.image.startsWith('http'));
          
          return isVisible && hasValidImage && !isNaN(price) && price > 0;
        });

        // Se por algum motivo todos estiverem sem foto, usa os visíveis como fallback
        const fallbackVisible = storeProducts.filter(p => p.visible === true && !p.unavailable_today && p.catalog_enabled !== false);
        const pool = validStoreProducts.length > 0 ? validStoreProducts : (fallbackVisible.length > 0 ? fallbackVisible : storeProducts);
        
        // Rotação inteligente por dia e horário para nunca repetir o mesmo produto nos 9 disparos do dia
        const daySeed = now.getDate();
        const monthSeed = now.getMonth() + 1;
        const hourIndex = fastSavorysSlots.indexOf(timeKey);
        const slotIdx = hourIndex >= 0 ? hourIndex : (roundedBrtHours % fastSavorysSlots.length);
        const selectedIndex = (daySeed * 5 + monthSeed * 3 + slotIdx) % pool.length;

        product = pool[selectedIndex];
        isFastSavorysStore = true;
        messageCaption = buildFastSavorysProductText(product);
        mediaUrl = product.image || product.image_url;
      }
    }

    // 2. Se for modo afiliado ou se não encontrou produto de loja, busca nos achadinhos
    if (!product) {
      // 2.1 PRIORIDADE RELÂMPAGO: Se houver oferta relâmpago ativa que não foi enviada nas últimas 3h, fura a fila!
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const { data: flashCandidates } = await supabaseAdmin
        .from('fast_affiliate_products')
        .select('*')
        .eq('is_active', true)
        .or('badge_color.eq.flash_deal,discount_tag.ilike.%relâmpago%,discount_tag.ilike.%relampago%')
        .or(`last_posted_at.is.null,last_posted_at.lt.${threeHoursAgo}`)
        .order('last_posted_at', { ascending: true, nullsFirst: true })
        .limit(1);

      if (flashCandidates && flashCandidates.length > 0) {
        const candidate = flashCandidates[0];
        // Verifica se ainda está no prazo de expiração (se definido)
        if (!candidate.flash_deal_end || new Date(candidate.flash_deal_end) > new Date()) {
          product = candidate;
          console.log(`[WhatsApp Deal] ⚡ Prioridade Relâmpago ativada: furando fila para "${product.title}"`);
        }
      }

      // 2.2 Rotação padrão se não houver oferta relâmpago prioritária
      if (!product) {
        const { data: affiliateProducts, error: affErr } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true)
          .order('last_posted_at', { ascending: true, nullsFirst: true })
          .order('position', { ascending: true })
          .limit(1);

      if (affErr) {
        throw new Error(`Erro no banco Supabase: ${affErr.message}`);
      }

      if (!affiliateProducts || affiliateProducts.length === 0) {
        return res.status(200).json({
          success: false,
          message: 'Nenhum produto ativo encontrado para disparo.'
        });
      }

        product = affiliateProducts[0];
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
    const sendResponse = await dispatchWhatsAppMessage(messageCaption, mediaUrl, {
      instance: evolutionInstance,
      targetJid: targetGroupJid
    });

    // Atualiza data do último envio (last_posted_at) na tabela correspondente
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

    return res.status(200).json({
      success: true,
      message: `Oferta enviada com sucesso para o grupo (${product.title || product.name})`,
      type: isFastSavorysStore ? 'fastsavorys_store' : 'affiliate_deal',
      productId: product.id,
      productTitle: product.title || product.name,
      timeKey,
      postedAt: nowIso,
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
          if (
            name.includes('sache') || name.includes('sachê') || 
            name.includes('taxa') || name.includes('copo') || 
            name.includes('guardanapo') || name.includes('ketchup') || 
            name.includes('maionese') || name.includes('mostarda') ||
            name.includes('embalagem')
          ) return false;
          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
          const isVisible = p.visible === true && !p.unavailable_today && p.catalog_enabled !== false;
          const hasValidImage = Boolean(p.image && typeof p.image === 'string' && p.image.startsWith('http'));
          return isVisible && hasValidImage && !isNaN(price) && price > 0;
        });

        const pool = validStoreProducts.length > 0 ? validStoreProducts : storeProducts.filter(p => p.visible === true);
        const daySeed = now.getDate();
        const monthSeed = now.getMonth() + 1;
        const slotIdx = storeSlots.indexOf(timeKey) >= 0 ? storeSlots.indexOf(timeKey) : (brtHours % 4);
        const selectedIndex = (daySeed * 7 + monthSeed * 3 + slotIdx) % pool.length;
        const product = pool[selectedIndex];

        const caption = buildFastSavorysStatusText(product);
        const mediaUrl = product.image || product.image_url;

        const sendRes = await dispatchWhatsAppMessage(caption, mediaUrl, {
          instance: storeInstance,
          apiKey: storeApiKey,
          targetJid: 'status@broadcast'
        });

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
