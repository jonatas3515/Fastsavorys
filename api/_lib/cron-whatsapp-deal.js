/**
 * FastSavory's - Sub-módulo: Disparo de Ofertas no WhatsApp
 * Suporta:
 * 1. Produtos de Afiliados (Achadinhos: Amazon, Shopee, Mercado Livre)
 * 2. Produtos Próprios da FastSavory's (Salgados, Kits Festa, Bolos, etc.)
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseAdmin = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
} else if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

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
  const discountText = pct > 0 ? ` (${pct}% OFF)` : '';
  const origPriceText = product.original_price ? `~${product.original_price}~ ➔ ` : '';
  const descText = product.description && product.description.trim() ? `\n${product.description.trim()}\n` : '';

  return `${sealHeader}🛍️ *ACHADINHO ${platform}* ⭐\n🔥 *${product.title}*\n${descText}\n💰 *Preço:* ${origPriceText}*${product.price_display || 'Confira no link'}*${discountText}\n\n👉 *COMPRE COM DESCONTO AQUI:*\n${product.affiliate_url}\n\n💬 *Entre no canal de avisos Achadinhos Fast no WhatsApp:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
}

function buildFastSavorysProductText(product) {
  const categoryEmoji = {
    'salgados': '🥟',
    'mini': '✨',
    'kits': '🎉',
    'bolos': '🎂',
    'bebidas': '🥤',
    'adicionais': '🍟'
  }[(product.category || '').toLowerCase()] || '🥟';

  const categoryName = (product.category || 'Salgados').toUpperCase();
  const descText = product.description && product.description.trim() ? `\n${product.description.trim()}\n` : '';
  const numPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price);
  const priceFormatted = !isNaN(numPrice) && numPrice > 0
    ? numPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : (product.price ? `R$ ${product.price}` : 'Consulte no site');

  return `😋 *FASTSAVORY'S - ${categoryName}* ${categoryEmoji}\n🔥 *${product.name}*\n${descText}\n💰 *Preço:* *${priceFormatted}*\n\n🛒 *FAÇA SEU PEDIDO AGORA NO SITE:*\nhttps://fastsavorys.vercel.app\n\n💬 *Entre no canal de avisos Achadinhos Fast no WhatsApp:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
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

  // Identificação do modo (auto, fastsavorys, affiliate)
  const mode = req.query.mode || (req.body && req.body.mode) || 'auto';
  let targetType = mode;

  if (mode === 'auto') {
    // Horário de Brasília (UTC-3)
    const now = new Date();
    const utcHours = now.getUTCHours();
    const brtHours = (utcHours - 3 + 24) % 24;
    // Às 11h, 13h, 15h e 17h envia produtos próprios da FastSavory's
    const isFastSavorysHour = [11, 13, 15, 17].includes(brtHours);
    targetType = isFastSavorysHour ? 'fastsavorys' : 'affiliate';
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
        // Filtra itens principais do cardápio (exclui sachês, taxas ou descartáveis)
        const validStoreProducts = storeProducts.filter(p => {
          const name = (p.name || '').toLowerCase();
          if (name.includes('sache') || name.includes('sachê') || name.includes('taxa') || name.includes('copo') || name.includes('guardanapo')) return false;
          const price = typeof p.price === 'number' ? p.price : parseFloat(p.price);
          return p.active !== false && !isNaN(price) && price > 0;
        });

        const pool = validStoreProducts.length > 0 ? validStoreProducts : storeProducts;
        // Rotação inteligente por dia e hora para nunca repetir o mesmo salgado em horários seguidos
        const now = new Date();
        const daySeed = now.getDate();
        const monthSeed = now.getMonth() + 1;
        const hourIndex = [11, 13, 15, 17].indexOf(brtHours);
        const slotIdx = hourIndex >= 0 ? hourIndex : (brtHours % 4);
        const selectedIndex = (daySeed * 3 + monthSeed * 5 + slotIdx) % pool.length;

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

    let sendSuccess = false;
    let sendResponse = null;

    // Disparo com imagem via sendMedia
    if (mediaUrl && mediaUrl.startsWith('http')) {
      try {
        const mediaEndpoint = `${evolutionApiUrl}/message/sendMedia/${evolutionInstance}`;
        const response = await fetch(mediaEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey
          },
          body: JSON.stringify({
            number: targetGroupJid,
            media: mediaUrl,
            mediatype: 'image',
            mimetype: 'image/jpeg',
            caption: messageCaption,
            fileName: 'produto.jpg'
          })
        });

        if (response.ok) {
          sendSuccess = true;
          sendResponse = await response.json();
        } else {
          const errText = await response.text();
          console.warn('[WhatsApp Deal] Falha ao enviar mídia, tentando texto:', errText);
        }
      } catch (mediaErr) {
        console.warn('[WhatsApp Deal] Erro na requisição de mídia:', mediaErr.message);
      }
    }

    // Fallback: Disparo de Texto simples se mídia falhar
    if (!sendSuccess) {
      const textEndpoint = `${evolutionApiUrl}/message/sendText/${evolutionInstance}`;
      const response = await fetch(textEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify({
          number: targetGroupJid,
          text: messageCaption,
          linkPreview: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro ao enviar mensagem no WhatsApp: ${errText}`);
      }

      sendSuccess = true;
      sendResponse = await response.json();
    }

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

module.exports = { handleSendWhatsAppDeal };
