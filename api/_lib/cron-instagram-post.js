/**
 * FastSavory's - Sub-módulo: Publicação Automática no Instagram (Meta Graph API)
 * 
 * Funcionalidades:
 * 1. Publica Fotos + Legendas no Feed do Instagram via Instagram Content Publishing API Oficial.
 * 2. Suporta canal da Loja (channel=store -> Salgados, Kits, Bolos da FastSavory's).
 * 3. Suporta canal de Achadinhos (channel=deal -> Ofertas Mercado Livre, Amazon, Shopee).
 * 4. Legendas otimizadas com Gatilhos para ManyChat (ex: Comente "QUERO" ou "CARDAPIO" para receber o link na DM).
 * 5. Rotatividade automática via last_posted_at no Supabase.
 */

const { createClient } = require('@supabase/supabase-js');
const { generateStoryCard } = require('./story-card-generator');

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

/**
 * Gera legenda do Instagram para Achadinhos com Gatilho do ManyChat
 */
function buildInstagramDealCaption(product) {
  const isFastPick = Boolean(product.is_fast_pick || product.badge_color === 'fast_seal');
  const sealHeader = isFastPick ? '👑 PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S ✨\n\n' : '';
  const platform = detectPlatform(product.affiliate_url).name.toUpperCase();
  const pct = calcDiscountPercent(product.original_price, product.price_display);
  const discountText = pct > 0 ? ` (${pct}% DE DESCONTO)` : (product.discount_tag ? ` (${product.discount_tag})` : '');
  const origPriceText = product.original_price ? `De ${product.original_price} por apenas ` : '';
  const descText = product.description ? `\n${product.description}\n` : '';
  let couponText = '';
  if (product.coupon_code) {
    const raw = String(product.coupon_code).trim();
    if (/ativar|resgatar|anúncio|anuncio|página|pagina|aplicar/i.test(raw)) {
      const formatted = raw.replace(/^Ativar\s*(?:o\s*)?(?:cupom\s*)?/i, 'Ative o cupom ');
      couponText = `\n🎟️ Cupom disponível: ${formatted} antes de finalizar para garantir o desconto!\n`;
    } else {
      couponText = `\n🎟️ Cupom disponível: use ${raw} no fechamento do pedido!\n`;
    }
  }

  return `${sealHeader}🚨 ACHADINHO IMPERDÍVEL ${platform}! 📉⚡

🛍️ ${product.title}
${descText}
💥 ${origPriceText}${product.price_display || 'Confira o menor preço'}${discountText}
${couponText}
━━━━━━━━━━━━━━━━━━━
💬 COMO RECEBER O LINK?
👇 Comente "QUERO" ou "LINK" aqui nos comentários que enviamos o link direto no seu direct agora mesmo!

👉 Ou acesse o link no perfil / nos Stories!
━━━━━━━━━━━━━━━━━━━
#achadinhos #promocao #desconto #ofertas #mercadolivre #amazonbrasil #shopeebrasil #achadinhosdashopee #achados #comprinhas`;
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

function isAdvanceOrderProduct(product) {
  const name = (product?.name || '').toLowerCase();
  const desc = (product?.description || '').toLowerCase();
  const cat = (product?.category || '').toLowerCase();
  return (
    name.includes('bolo') ||
    name.includes('torta') ||
    name.includes('kit') ||
    name.includes('empadão') ||
    name.includes('empadao') ||
    desc.includes('antecedência') ||
    desc.includes('encomenda') ||
    cat.includes('bolo') ||
    cat.includes('kit')
  );
}

/**
 * Gera legenda do Instagram para Produtos da FastSavory's com Gatilho do ManyChat e Contexto de Horário
 */
function buildInstagramStoreCaption(product) {
  const price = typeof product.price === 'number' ? `R$ ${product.price.toFixed(2).replace('.', ',')}` : (product.price || '');
  const desc = product.description ? `\n${product.description}\n` : '';
  const { isSunday, isOperatingHours, isMorningBooking } = getStoreContext();
  const isAdvance = isAdvanceOrderProduct(product);

  let header = `😋 BATEU AQUELA FOME? DIRETO DA COZINHA FASTSAVORY'S! 🥟🔥`;
  let orderInfo = '';

  if (isAdvance) {
    header = `🎂 PLANEJANDO SUA FESTA OU CELEBRAÇÃO? DIRETO DA FASTSAVORY'S! 🎉✨`;
    orderInfo = `📅 PRODUTO PREPARADO EXCLUSIVAMENTE SOB ENCOMENDA!
🕒 ATENÇÃO: Bolos, Kits Festa, Tortas e Empadões são feitos sob medida e necessitam de pelo menos 1 dia (24h) de antecedência!
👇 Comente "CARDAPIO" ou "ENCOMENDA" aqui nos comentários que te enviamos todas as opções direto no direct!`;
  } else if (isSunday) {
    header = `😋 PLANEJANDO O LANCHE DA SEMANA? DIRETO DA FASTSAVORY'S! 🥟📅`;
    orderInfo = `📅 COMO FAZER SEU PEDIDO?
🕒 Aos domingos estamos fechados recarregando as energias.
🕒 De Segunda a Sábado atendemos pedidos de salgados do dia a partir das 12h, com entregas das 14h às 18h!
🎂 (Bolos, Kits Festa e Empadões exigem 24h de antecedência).
👇 Comente "CARDAPIO" ou "QUERO" aqui nos comentários para receber no direct!`;
  } else if (isOperatingHours) {
    header = `😋 FORNADA SAINDO AGORA! DIRETO DA COZINHA FASTSAVORY'S! 🥟🔥`;
    orderInfo = `🛵 PEDIDOS DO DIA ABERTOS AGORA!
🕒 Salgados e lanches quentinhos para entrega hoje (atendimento a todo vapor até as 18h)!
🎂 (Bolos, Kits Festa e Empadões exigem 24h de antecedência).
👇 Comente "CARDAPIO" ou "QUERO" aqui nos comentários para pedir quentinho agora mesmo!`;
  } else if (isMorningBooking) {
    header = `😋 BATEU AQUELA FOME? DIRETO DA COZINHA FASTSAVORY'S! 🥟✨`;
    orderInfo = `🛵 PEDIDOS DO DIA (SALGADOS & LANCHES):
🕒 Atendimento para pedidos de salgados a partir das 12h, com entregas e fornadas saindo das 14h às 18h!
🎂 ATENÇÃO: Bolos, Kits Festa e Empadões exigem encomenda com no mínimo 1 dia (24h) de antecedência!
👇 Comente "CARDAPIO" ou "QUERO" aqui nos comentários para pedir pelo direct!`;
  } else {
    header = `😋 PLANEJANDO SEU LANCHE PARA AMANHÃ? DIRETO DA FASTSAVORY'S! 🥟✨`;
    orderInfo = `📅 AGENDAMENTO PARA O PRÓXIMO DIA!
🕒 Funcionamos de Segunda a Sábado das 14h às 18h (pedidos do dia a partir das 12h).
🎂 Bolos, Kits Festa e Empadões: encomendas com 24h de antecedência!
👇 Comente "CARDAPIO" ou "QUERO" aqui nos comentários para garantir seu pedido no direct!`;
  }

  return `${header}

✨ ${product.name}
${desc}
💰 Apenas: ${price}

Feito com ingredientes selecionados, quentinho e crocante na medida certa para o seu lanche ou festa! 🎉
━━━━━━━━━━━━━━━━━━━
${orderInfo}

💬 Ou clique no link da bio para pedir pelo WhatsApp: (73) 99936-6554
━━━━━━━━━━━━━━━━━━━
#fastsavorys #salgados #lanchonete #delivery #coxinha #lanche #salgadinhos #festa #salgadosfritos #salgadosassados #itabuna #ilheus`;
}

/**
 * Envia uma foto para o Feed ou Stories do Instagram usando a Meta Graph API Oficial
 * Requer: INSTAGRAM_ACCOUNT_ID e INSTAGRAM_ACCESS_TOKEN
 */
async function publishToInstagramFeed(imageUrl, caption, options = {}) {
  const target = (options.target || 'feed').toLowerCase();
  const isStory = target === 'story' || target === 'stories';

  const accountId = (process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
  const accessToken = (process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();

  if (!accountId || !accessToken) {
    throw new Error('Credenciais do Instagram ausentes. Configure INSTAGRAM_ACCOUNT_ID e INSTAGRAM_ACCESS_TOKEN nas variáveis de ambiente da Vercel.');
  }

  // Garante que a URL da imagem seja pública e HTTPS
  let finalImageUrl = imageUrl;
  if (!finalImageUrl.startsWith('http')) {
    finalImageUrl = `https://fastsavorys.vercel.app${finalImageUrl.startsWith('/') ? '' : '/'}${finalImageUrl}`;
  }

  const isIgToken = accessToken.startsWith('IG');
  const baseUrl = isIgToken ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
  const targetId = isIgToken ? 'me' : accountId;

  console.log(`[Instagram API] Criando container para ${isStory ? 'STORIES' : 'FEED'} na conta ${targetId} via ${baseUrl}...`);

  // 1. Criar container de mídia no Instagram (POST /{targetId}/media)
  const containerUrl = new URL(`${baseUrl}/${targetId}/media`);
  containerUrl.searchParams.set('image_url', finalImageUrl);
  if (isStory) {
    containerUrl.searchParams.set('media_type', 'STORIES');
  } else if (caption) {
    containerUrl.searchParams.set('caption', caption);
  }
  containerUrl.searchParams.set('access_token', accessToken);

  const containerRes = await fetch(containerUrl.toString(), {
    method: 'POST',
    headers: { 'Accept': 'application/json' }
  });

  const containerData = await containerRes.json();

  if (!containerRes.ok || !containerData.id) {
    console.error('[Instagram API] Erro ao criar container:', containerData);
    const errMsg = containerData?.error?.message || JSON.stringify(containerData);
    throw new Error(`Falha na Meta Graph API (Criação do Container): ${errMsg}`);
  }

  const creationId = containerData.id;
  console.log(`[Instagram API] Container criado com ID: ${creationId}. Publicando no ${isStory ? 'Stories' : 'Feed'}...`);

  // Pequena pausa para processamento da imagem pelos servidores do Meta
  await new Promise(r => setTimeout(r, 2500));

  // 2. Publicar o container (POST /{targetId}/media_publish)
  const publishUrl = new URL(`${baseUrl}/${targetId}/media_publish`);
  publishUrl.searchParams.set('creation_id', creationId);
  publishUrl.searchParams.set('access_token', accessToken);

  const publishRes = await fetch(publishUrl.toString(), {
    method: 'POST',
    headers: { 'Accept': 'application/json' }
  });

  const publishData = await publishRes.json();

  if (!publishRes.ok || !publishData.id) {
    console.error('[Instagram API] Erro ao publicar mídia:', publishData);
    const errMsg = publishData?.error?.message || JSON.stringify(publishData);
    throw new Error(`Falha na Meta Graph API (Publicação da Mídia): ${errMsg}`);
  }

  console.log(`[Instagram API] ✅ Post publicado com sucesso no ${isStory ? 'Stories' : 'Feed'}! IG Media ID: ${publishData.id}`);
  return {
    success: true,
    mediaId: publishData.id,
    creationId,
    target: isStory ? 'story' : 'feed'
  };
}

/**
 * Handler principal acionado pelo Cron ou via manual
 * Parâmetro: ?channel=store (FastSavory's) ou ?channel=deal (Achadinhos)
 * Parâmetro: ?target=feed (padrão) ou ?target=story (Stories)
 */
async function handleSendInstagramPost(req, res) {
  const channel = (req.query?.channel || req.body?.channel || 'store').toLowerCase();
  const target = (req.query?.target || req.body?.target || 'feed').toLowerCase();
  const dryRun = req.query?.dry_run === 'true' || req.body?.dry_run === true;

  // REGRA DE OURO: Bloqueio estrito de Achadinhos no Feed
  if (target === 'feed' && (channel === 'deal' || channel === 'affiliate')) {
    return res.status(400).json({
      success: false,
      error: 'Achadinhos estão permanentemente proibidos de serem postados no Feed do Instagram.'
    });
  }

  console.log(`[Instagram Cron] Iniciando publicação para canal: ${channel} | Alvo: ${target} (dryRun: ${dryRun})`);

  try {
    // -------------------------------------------------------------
    // CANAL 1: PRODUTOS DA FASTSAVORY'S (LOJA)
    // -------------------------------------------------------------
    if (channel === 'store' || channel === 'fastsavorys' || channel === 'lanchonete') {
      const { data: storeProducts, error: storeError } = await supabaseAdmin
        .from('fast_products')
        .select('*')
        .order('last_posted_at', { ascending: true, nullsFirst: true });

      if (storeError) {
        throw new Error(`Erro ao buscar produtos da lanchonete: ${storeError.message}`);
      }

      // Filtra produtos disponíveis com imagem válida
      const validStoreProducts = (storeProducts || []).filter(p => {
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

      if (validStoreProducts.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Nenhum produto da lanchonete disponível com foto válida para publicar no Instagram.',
          channel: 'store'
        });
      }

      const chosenProduct = validStoreProducts[0];
      const caption = buildInstagramStoreCaption(chosenProduct);
      let imageUrl = chosenProduct.image;

      if (target === 'story' || target === 'stories') {
        console.log(`[Instagram Cron] Gerando card 9:16 oficial para o Story da FastSavory's ("${chosenProduct.name}")...`);
        imageUrl = await generateStoryCard({
          channel: 'store',
          product: chosenProduct
        });
      }

      if (dryRun) {
        return res.status(200).json({
          success: true,
          dryRun: true,
          channel: 'store',
          target,
          product: { id: chosenProduct.id, name: chosenProduct.name, image: imageUrl },
          caption
        });
      }

      const publishResult = await publishToInstagramFeed(imageUrl, caption, { target });

      // Atualiza last_posted_at do produto da lanchonete
      try {
        await supabaseAdmin
          .from('fast_products')
          .update({ last_posted_at: new Date().toISOString() })
          .eq('id', chosenProduct.id);
      } catch (e) {
        console.warn('[Instagram Cron] Aviso ao atualizar last_posted_at em products:', e.message);
      }

      return res.status(200).json({
        success: true,
        message: `✅ Post da FastSavory's ("${chosenProduct.name}") publicado com sucesso no Instagram!`,
        channel: 'store',
        target,
        product: { id: chosenProduct.id, name: chosenProduct.name },
        mediaId: publishResult.mediaId
      });
    }

    // -------------------------------------------------------------
    // CANAL 2: ACHADINHOS (MERCADO LIVRE, AMAZON, SHOPEE)
    // -------------------------------------------------------------
    const { data: deals, error: dealsError } = await supabaseAdmin
      .from('fast_affiliate_products')
      .select('*')
      .eq('is_active', true)
      .order('last_posted_at', { ascending: true, nullsFirst: true })
      .limit(10);

    if (dealsError) {
      throw new Error(`Erro ao buscar achadinhos: ${dealsError.message}`);
    }

    // Filtra produtos com imagem válida
    const validDeals = (deals || []).filter(d => {
      return d.image_url && typeof d.image_url === 'string' && d.image_url.startsWith('http');
    });

    if (validDeals.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nenhum achadinho ativo com foto válida para publicar no Instagram.',
        channel: 'deal'
      });
    }

    const chosenDeal = validDeals[0];
    const caption = buildInstagramDealCaption(chosenDeal);
    let imageUrl = chosenDeal.image_url;

    if (target === 'story' || target === 'stories') {
      console.log(`[Instagram Cron] Gerando card 9:16 oficial para o Story de Achadinho ("${chosenDeal.title}")...`);
      imageUrl = await generateStoryCard({
        channel: 'deal',
        deal: chosenDeal
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        channel: 'deal',
        target,
        product: { id: chosenDeal.id, title: chosenDeal.title, image_url: imageUrl },
        caption
      });
    }

    const publishResult = await publishToInstagramFeed(imageUrl, caption, { target });

    // Atualiza last_posted_at do produto de afiliados
    try {
      await supabaseAdmin
        .from('fast_affiliate_products')
        .update({ last_posted_at: new Date().toISOString() })
        .eq('id', chosenDeal.id);
    } catch (e) {
      console.warn('[Instagram Cron] Aviso ao atualizar last_posted_at em fast_affiliate_products:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: `✅ Achadinho ("${chosenDeal.title}") publicado com sucesso no Instagram!`,
      channel: 'deal',
      target,
      product: { id: chosenDeal.id, title: chosenDeal.title },
      mediaId: publishResult.mediaId
    });

  } catch (error) {
    console.error('[Instagram Cron] ❌ Erro ao publicar no Instagram:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao publicar no Instagram',
      channel
    });
  }
}

module.exports = {
  handleSendInstagramPost,
  publishToInstagramFeed,
  buildInstagramDealCaption,
  buildInstagramStoreCaption
};
