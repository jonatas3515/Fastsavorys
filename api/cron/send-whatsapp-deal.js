/**
 * FastSavory's - Automação de Disparo de Ofertas no WhatsApp
 * Endpoint seguro chamado pelo GitHub Actions (09h, 12h, 15h)
 */

const { createClient } = require('@supabase/supabase-js');

// 1. Inicializa o cliente Supabase Admin
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

// 2. Helper: Detecta a plataforma pelo link
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

// 3. Helper: Calcula a porcentagem de desconto
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

// 4. Helper: Constrói a mensagem formatada para WhatsApp
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

// 5. Helper: Baixa imagem e converte para base64 (evita bloqueio de hotlink 403 da Shopee/Amazon)
async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('http')) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

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
    console.warn('[WhatsApp Deal] Falha ao converter imagem para base64:', err.message);
  }
  return null;
}

module.exports = async function handler(req, res) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Verificação de Segurança (CRON_SECRET)
  const requiredCronSecret = process.env.CRON_SECRET;
  if (requiredCronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim() ||
      req.headers['x-cron-secret'] ||
      req.query.key ||
      req.query.secret;

    if (!providedSecret || providedSecret !== requiredCronSecret) {
      console.warn('[WhatsApp Deal Cron] ⛔ Acesso negado: Secret inválido ou ausente.');
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid cron secret' });
    }
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Configuração do Supabase não encontrada.' });
  }

  // 2. Variáveis da Evolution API
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

  try {
    // 3. Busca o produto ativo com maior tempo sem postar (Fila Anti-Repetição)
    const { data: products, error: dbError } = await supabaseAdmin
      .from('fast_affiliate_products')
      .select('*')
      .eq('is_active', true)
      .order('last_posted_at', { ascending: true, nullsFirst: true })
      .order('position', { ascending: true })
      .limit(1);

    if (dbError) {
      throw new Error(`Erro no banco Supabase: ${dbError.message}`);
    }

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'Nenhum produto ativo encontrado para disparo.'
      });
    }

    const product = products[0];
    const messageCaption = buildWhatsAppDealText(product);

    // 4. Prepara o envio da imagem
    const base64Image = await fetchImageAsBase64(product.image_url);
    const mediaPayload = base64Image || product.image_url;

    let sendSuccess = false;
    let sendResponse = null;

    // Tentativa A: Envio como Imagem com Legenda (sendMedia)
    if (mediaPayload) {
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
            media: mediaPayload,
            mediatype: 'image',
            mimetype: 'image/jpeg',
            caption: messageCaption,
            fileName: 'achadinho.jpg'
          })
        });

        if (response.ok) {
          sendSuccess = true;
          sendResponse = await response.json();
        } else {
          const errText = await response.text();
          console.warn('[WhatsApp Deal] Falha ao enviar mídia, tentando texto puro:', errText);
        }
      } catch (mediaErr) {
        console.warn('[WhatsApp Deal] Erro na requisição de mídia:', mediaErr.message);
      }
    }

    // Tentativa B (Fallback): Se a imagem falhar, envia como mensagem de texto com link
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

    // 5. Atualiza o carimbo last_posted_at no banco
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('fast_affiliate_products')
      .update({ last_posted_at: nowIso, updated_at: nowIso })
      .eq('id', product.id);

    return res.status(200).json({
      success: true,
      message: `Oferta enviada com sucesso para o grupo (${product.title})`,
      productId: product.id,
      productTitle: product.title,
      postedAt: nowIso,
      evolutionResponse: sendResponse
    });

  } catch (error) {
    console.error('[WhatsApp Deal Cron] ❌ Erro no processo:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao processar disparo.'
    });
  }
};
