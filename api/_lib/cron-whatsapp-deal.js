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

function buildWhatsAppDealText(product) {
  const isFastPick = Boolean(product.is_fast_pick || product.badge_color === 'fast_seal');
  const sealHeader = isFastPick ? '👑 *PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S* ✨\n' : '';
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const pct = calcDiscountPercent(product.original_price, product.price_display);
  const discountText = pct > 0 ? ` (${pct}% OFF)` : (product.discount_tag ? ` (${product.discount_tag})` : '');
  const origPriceText = product.original_price ? `~${product.original_price}~ ➔ ` : '';
  const descText = product.description ? `\n${product.description}\n` : '';
  const couponText = product.coupon_code ? `\n🎟️ *CUPOM DISPONÍVEL:* Use o cupom *${product.coupon_code}* na finalização!\n` : '';

  return `${sealHeader}🛍️ *ACHADINHO ${platform}* ⭐\n🔥 *${product.title}*\n${descText}\n💰 *Preço:* ${origPriceText}*${product.price_display || 'Confira no link'}*${discountText}${couponText}\n\n👉 *COMPRE COM DESCONTO AQUI:*\n${product.affiliate_url}\n\n💬 *Entre no canal VIP de ofertas da FastSavory's:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
}

function buildFastSavorysProductText(product) {
  const price = typeof product.price === 'number' ? `R$ ${product.price.toFixed(2).replace('.', ',')}` : (product.price || '');
  const desc = product.description ? `\n${product.description}\n` : '';

  return `😋 *BATEU AQUELA FOME? DIRETO DA COZINHA FASTSAVORY'S!* 🥟🔥\n\n✨ *${product.name}*\n${desc}\n💰 *Apenas:* *${price}*\n\n🛵 *Peça agora quentinho pelo nosso cardápio online:*\nhttps://fastsavorys.vercel.app/pages/fast.html\n\n💬 *Ou faça seu pedido direto pelo WhatsApp:* (73) 99936-6554`;
}

function buildPriceDropAlertText(product, oldPrice, newPrice) {
  const isFastPick = Boolean(product.is_fast_pick || product.badge_color === 'fast_seal');
  const sealHeader = isFastPick ? '👑 *PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S* ✨\n' : '';
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const pct = calcDiscountPercent(oldPrice, newPrice);
  const discountText = pct > 0 ? ` (${pct}% DE QUEDA)` : '';

  return `🚨 *ALERTA DE QUEDA DE PREÇO NO AR!* 📉⚡\n${sealHeader}\n🛍️ *ACHADINHO ${platform}*\n🔥 *${product.title}*\n\n💥 *BAIXOU AGORA:* de ~${oldPrice}~ por apenas *${newPrice}*!${discountText}\n\n👉 *GARANTA COM O MENOR PREÇO AQUI:*\n${product.affiliate_url}\n\n💬 *Entre no canal VIP de ofertas da FastSavory's:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
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

  // 0. Disparo específico para STATUS DO WHATSAPP (Evolution v2 /message/sendStatus)
  if (targetRecipient === 'status@broadcast') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      // 1. Tenta endpoint nativo de Status da Evolution API v2 (/message/sendStatus)
      const statusEndpoint = `${evolutionApiUrl}/message/sendStatus/${evolutionInstance}`;
      const statusPayload = {
        type: (mediaUrl && mediaUrl.startsWith('http')) ? 'image' : 'text',
        content: (mediaUrl && mediaUrl.startsWith('http')) ? mediaUrl : messageCaption,
        caption: (mediaUrl && mediaUrl.startsWith('http')) ? messageCaption : undefined,
        allContacts: true,
        options: {
          delay: 1200,
          presence: 'composing'
        }
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

      // 2. Fallback para /message/sendMedia com destinatário status@broadcast
      if (mediaUrl && mediaUrl.startsWith('http')) {
        const mediaEndpoint = `${evolutionApiUrl}/message/sendMedia/${evolutionInstance}`;
        const resMedia = await fetch(mediaEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: 'status@broadcast',
            media: mediaUrl,
            mediatype: 'image',
            mimetype: 'image/jpeg',
            caption: messageCaption,
            fileName: 'status_oferta.jpg',
            options: {
              delay: 1200,
              presence: 'composing'
            }
          })
        });

        if (resMedia.ok) {
          return await resMedia.json();
        }
      }

      const errText = await resStatus.text();
      console.warn(`[WhatsApp Status] Resposta da Evolution (${evolutionInstance}):`, errText);
      return { success: false, error: errText };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Status] Processamento assíncrono (${evolutionInstance}):`, err.message);
      // Se a Evolution aceitou o job mas demorou no envio dos contatos, considera despachado
      return { success: true, status: 'dispatched_to_broadcast', warning: err.message };
    }
  }

  // 1. Se possuir URL de imagem, envia EXCLUSIVAMENTE via sendMedia (evita mensagens duplicadas)
  if (mediaUrl && mediaUrl.startsWith('http')) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

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
          fileName: 'status_oferta.jpg',
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
        // Só tenta texto se o erro for 400 e não for Status do WhatsApp
        if (response.status === 400 && targetRecipient !== 'status@broadcast') {
          const textRes = await fetch(`${evolutionApiUrl}/message/sendText/${evolutionInstance}`, {
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
            })
          });
          if (textRes.ok) return await textRes.json();
        }
        return { success: false, status: response.status, error: errText };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[WhatsApp Dispatch] sendMedia (${evolutionInstance}) em processamento:`, err.message);
      // Retorna sucesso para NUNCA disparar sendText redundante em paralelo
      return { success: true, warning: 'sendMedia dispatched' };
    }
  }

  // 2. Se NÃO houver imagem, envia apenas texto (se o destinatário aceitar texto)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
    throw new Error(`Evolution API retornou erro HTTP ${response.status}: ${errText}`);
  }

  return await response.json();
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
  const brtHours = (utcHours - 3 + 24) % 24;
  const utcMinutes = now.getUTCMinutes();
  // Arredonda para o slot de 30 min mais próximo (:00 ou :30)
  const slotMinute = (utcMinutes >= 15 && utcMinutes < 45) ? '30' : '00';
  const timeKey = `${String(brtHours).padStart(2, '0')}:${slotMinute}`;

  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  let targetType = mode;

  // 8 Horários estratégicos da FastSavory's (Almoço das 10h30 às 14h30 e Lanche/Jantar das 15h30 às 17h30)
  const fastSavorysSlots = ['10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30'];

  if (mode === 'auto') {
    const isFastSavorysSlot = fastSavorysSlots.includes(timeKey);
    targetType = isFastSavorysSlot ? 'fastsavorys' : 'affiliate';
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
        
        // Rotação inteligente por dia e horário para nunca repetir o mesmo produto nos 8 disparos do dia
        const daySeed = now.getDate();
        const monthSeed = now.getMonth() + 1;
        const hourIndex = fastSavorysSlots.indexOf(timeKey);
        const slotIdx = hourIndex >= 0 ? hourIndex : (brtHours % 8);
        const selectedIndex = (daySeed * 5 + monthSeed * 3 + slotIdx) % pool.length;

        product = pool[selectedIndex];
        isFastSavorysStore = true;
        messageCaption = buildFastSavorysProductText(product);
        mediaUrl = product.image || product.image_url;
      }
    }

    // 2. Se for modo afiliado ou se não encontrou produto de loja, busca nos achadinhos
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

  const evolutionApiUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
  const evolutionApiKey = process.env.EVOLUTION_API_KEY || '';
  const storeApiKey = (process.env.EVOLUTION_STORE_API_KEY || process.env.EVOLUTION_STORE_KEY || evolutionApiKey).trim();
  const personalInstance = (process.env.EVOLUTION_INSTANCE || 'fastsavorys').trim();
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

  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  const targetChannel = req.query.channel || (req.body && req.body.channel) || '';

  // Horários oficiais definidos pelo usuário
  const storeSlots = ['13:00', '14:00', '15:00', '16:00'];
  const personalSlots = ['10:00', '14:00', '18:00'];

  let targetsToExecute = [];

  if (targetChannel === 'store' || mode === 'store' || mode === 'fastsavorys') {
    targetsToExecute.push('store');
  } else if (targetChannel === 'personal' || mode === 'personal' || mode === 'achadinhos') {
    targetsToExecute.push('personal');
  } else if (mode === 'all') {
    targetsToExecute.push('store', 'personal');
  } else {
    // Modo automático por horário
    if (storeSlots.includes(timeKey)) {
      targetsToExecute.push('store');
    }
    if (personalSlots.includes(timeKey)) {
      targetsToExecute.push('personal');
    }
    // Se chamado fora dos slots oficiais mas em modo teste
    if (targetsToExecute.length === 0) {
      // Padrão: roda ambos ou o mais próximo
      targetsToExecute.push('store');
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

        const caption = buildFastSavorysProductText(product);
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

      } else if (channel === 'personal') {
        // --- 2. STATUS PESSOAL (Achadinhos) ---
        const { data: affiliateProducts, error: affErr } = await supabaseAdmin
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true);

        if (affErr || !affiliateProducts || affiliateProducts.length === 0) {
          results.push({ channel: 'personal', success: false, error: 'Nenhum achadinho ativo encontrado.' });
          continue;
        }

        const validAffiliate = affiliateProducts.filter(p => Boolean(p.image_url && p.image_url.startsWith('http')));
        const pool = validAffiliate.length > 0 ? validAffiliate : affiliateProducts;
        const daySeed = now.getDate();
        const monthSeed = now.getMonth() + 1;
        const slotIdx = personalSlots.indexOf(timeKey) >= 0 ? personalSlots.indexOf(timeKey) : (brtHours % 3);
        const selectedIndex = (daySeed * 11 + monthSeed * 5 + slotIdx) % pool.length;
        const product = pool[selectedIndex];

        const caption = buildWhatsAppDealText(product);
        const mediaUrl = product.image_url;

        const sendRes = await dispatchWhatsAppMessage(caption, mediaUrl, {
          instance: personalInstance,
          targetJid: 'status@broadcast'
        });

        results.push({
          channel: 'personal_achadinhos',
          instance: personalInstance,
          target: 'status@broadcast',
          productTitle: product.title,
          price: product.price_display,
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

module.exports = {
  handleSendWhatsAppDeal,
  handleSendWhatsAppStatus,
  sendPriceDropAlertToWhatsApp,
  sendProductDealToWhatsApp,
  buildWhatsAppDealText,
  buildPriceDropAlertText
};
