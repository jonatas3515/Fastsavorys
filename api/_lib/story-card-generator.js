/**
 * FastSavory's - Gerador Dinâmico de Cards 9:16 para Instagram Stories
 * Transforma fotos quadradas (1:1) em Stories verticais (9:16 - 576x1024)
 * usando templates oficiais com molduras arredondadas, títulos e preços estilizados.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const TEMPLATE_FALLBACK_URLS = {
  store: 'https://vqjyjdllapqbqpylshkw.supabase.co/storage/v1/object/public/fast-images/templates/story_template_store.jpg',
  mercadolivre: 'https://vqjyjdllapqbqpylshkw.supabase.co/storage/v1/object/public/fast-images/templates/story_template_mercadolivre.jpg',
  amazon: 'https://vqjyjdllapqbqpylshkw.supabase.co/storage/v1/object/public/fast-images/templates/story_template_amazon.jpg'
};

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return 'amazon';
  }
  return 'mercadolivre';
}

function escapeXml(unsafe = '') {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function formatTitle(title, maxLen = 26) {
  if (!title) return '';
  const clean = String(title).trim().toUpperCase();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trim() + '...';
}

function formatPriceDisplay(price) {
  if (price === null || price === undefined) return '';
  if (typeof price === 'number') {
    return price.toFixed(2).replace('.', ',');
  }
  let s = String(price).trim();
  s = s.replace(/R\$\s*/gi, '').trim();
  return s;
}

async function loadTemplateBuffer(templateType) {
  const fileName = `story_template_${templateType}.jpg`;
  const localCandidates = [
    path.join(__dirname, '../../assets/img', fileName),
    path.join(process.cwd(), 'assets/img', fileName),
    path.join(__dirname, '../assets/img', fileName)
  ];

  for (const p of localCandidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }

  // Fallback: Baixa do Supabase Storage
  const remoteUrl = TEMPLATE_FALLBACK_URLS[templateType] || TEMPLATE_FALLBACK_URLS.mercadolivre;
  console.log(`[Story Generator] Carregando template ${templateType} via fallback HTTP: ${remoteUrl}`);
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error(`Falha ao baixar template ${templateType} remoto: ${resp.statusText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Gera o Story Card completo (9:16) e faz upload direto para o Supabase Storage
 * @param {Object} params
 * @param {'store'|'deal'} params.channel
 * @param {Object} [params.product] - Objeto do produto da loja
 * @param {Object} [params.deal] - Objeto do produto de achadinhos
 * @returns {Promise<string>} URL pública no Supabase Storage pronta para o Instagram
 */
async function generateStoryCard({ channel, product, deal }) {
  console.log(`[Story Generator] Gerando card para canal: ${channel}...`);

  let templateType = 'store';
  let rawTitle = '';
  let rawPrice = '';
  let productImageUrl = '';
  let fitMode = 'contain';

  if (channel === 'store' || product) {
    templateType = 'store';
    rawTitle = product?.name || 'FastSavory\'s';
    rawPrice = formatPriceDisplay(product?.price);
    productImageUrl = product?.image || product?.image_url;
    fitMode = 'cover';
  } else {
    templateType = detectPlatform(deal?.affiliate_url);
    rawTitle = deal?.title || 'Oferta Exclusiva';
    rawPrice = formatPriceDisplay(deal?.price_display || deal?.price);
    productImageUrl = deal?.image_url;
    fitMode = 'contain';
  }

  if (!productImageUrl || !productImageUrl.startsWith('http')) {
    throw new Error(`URL de imagem do produto inválida para o story: "${productImageUrl}"`);
  }

  // Configurações de layout por template
  let frame;
  let titleStyle;
  let priceStyle;

  if (templateType === 'store') {
    frame = { left: 63, top: 103, width: 450, height: 450, radius: 30 };
    titleStyle = {
      x: 288,
      y: 685,
      fontSize: 26,
      fill: '#1a1a1a',
      fontWeight: 'bold',
      textAnchor: 'middle'
    };
    priceStyle = {
      x: 235,
      y: 820,
      fontSize: 44,
      fill: '#ffffff',
      shadowFill: '#4a1500',
      shadowDx: 2,
      shadowDy: 2,
      fontWeight: '900',
      textAnchor: 'start'
    };
  } else if (templateType === 'amazon') {
    frame = { left: 65, top: 204, width: 445, height: 455, radius: 32 };
    titleStyle = {
      x: 288,
      y: 728,
      fontSize: 24,
      fill: '#141419',
      fontWeight: 'bold',
      textAnchor: 'middle'
    };
    priceStyle = {
      x: 185,
      y: 858,
      fontSize: 44,
      fill: '#d66000',
      shadowFill: null,
      shadowDx: 0,
      shadowDy: 0,
      fontWeight: '900',
      textAnchor: 'start'
    };
  } else {
    // Mercado Livre (e padrão para outros achadinhos)
    templateType = 'mercadolivre';
    frame = { left: 65, top: 204, width: 445, height: 455, radius: 32 };
    titleStyle = {
      x: 288,
      y: 728,
      fontSize: 24,
      fill: '#002882',
      fontWeight: 'bold',
      textAnchor: 'middle'
    };
    priceStyle = {
      x: 235,
      y: 852,
      fontSize: 44,
      fill: '#ffffff',
      shadowFill: '#00195a',
      shadowDx: 2,
      shadowDy: 2,
      fontWeight: '900',
      textAnchor: 'start'
    };
  }

  // 1. Carrega o template de fundo
  const templateBuffer = await loadTemplateBuffer(templateType);

  // 2. Baixa a foto do produto
  const imgResp = await fetch(productImageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  if (!imgResp.ok) {
    throw new Error(`Falha ao baixar imagem do produto (${imgResp.status}): ${productImageUrl}`);
  }
  const prodRawBuffer = Buffer.from(await imgResp.arrayBuffer());

  // 3. Cria máscara com cantos arredondados
  const maskSvg = Buffer.from(`
    <svg width="${frame.width}" height="${frame.height}">
      <rect x="0" y="0" width="${frame.width}" height="${frame.height}" rx="${frame.radius}" ry="${frame.radius}" fill="#fff"/>
    </svg>
  `);

  // Redimensiona mantendo proporção e aplica máscara
  const resizeOptions = {
    fit: fitMode,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  };

  const roundedProductBuffer = await sharp(prodRawBuffer)
    .resize(frame.width, frame.height, resizeOptions)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 4. Monta SVG de texto
  const safeTitle = escapeXml(formatTitle(rawTitle, 26));
  const safePrice = escapeXml(rawPrice);

  let shadowSvg = '';
  if (priceStyle.shadowFill && safePrice) {
    shadowSvg = `<text x="${priceStyle.x + priceStyle.shadowDx}" y="${priceStyle.y + priceStyle.shadowDy}" font-family="Arial, Helvetica, sans-serif" font-weight="${priceStyle.fontWeight}" font-size="${priceStyle.fontSize}px" fill="${priceStyle.shadowFill}" text-anchor="${priceStyle.textAnchor}">${safePrice}</text>`;
  }

  let priceSvg = '';
  if (safePrice) {
    priceSvg = `<text x="${priceStyle.x}" y="${priceStyle.y}" font-family="Arial, Helvetica, sans-serif" font-weight="${priceStyle.fontWeight}" font-size="${priceStyle.fontSize}px" fill="${priceStyle.fill}" text-anchor="${priceStyle.textAnchor}">${safePrice}</text>`;
  }

  const textSvg = Buffer.from(`
    <svg width="576" height="1024" xmlns="http://www.w3.org/2000/svg">
      <text x="${titleStyle.x}" y="${titleStyle.y}" font-family="Arial, Helvetica, sans-serif" font-weight="${titleStyle.fontWeight}" font-size="${titleStyle.fontSize}px" fill="${titleStyle.fill}" text-anchor="${titleStyle.textAnchor}">${safeTitle}</text>
      ${shadowSvg}
      ${priceSvg}
    </svg>
  `);

  // 5. Compõe imagem final em 9:16 (576x1024)
  const compositeBuffer = await sharp(templateBuffer)
    .composite([
      { input: roundedProductBuffer, top: frame.top, left: frame.left },
      { input: textSvg, top: 0, left: 0 }
    ])
    .jpeg({ quality: 94 })
    .toBuffer();

  // 6. Upload para Supabase Storage (bucket fast-images)
  const fileName = `stories/story_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('fast-images')
    .upload(fileName, compositeBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (uploadError) {
    console.error('[Story Generator] Erro no upload para Supabase:', uploadError);
    throw new Error(`Erro ao salvar card no Supabase Storage: ${uploadError.message}`);
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('fast-images')
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;
  console.log(`[Story Generator] ✅ Card de Story gerado e salvo: ${publicUrl}`);
  return publicUrl;
}

module.exports = {
  generateStoryCard,
  detectPlatform
};
