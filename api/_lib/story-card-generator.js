/**
 * FastSavory's - Gerador de Cards 9:16 para Instagram Stories
 * Converte fotos quadradas (1:1) em Stories verticais (9:16 - 576x1024)
 * Desenha Nome e Preço do produto como CAMINHOS VETORIAIS (OpenType.js),
 * eliminando 100% de dependência das fontes do sistema operacional (zero risco de "tofu" ▯▯▯).
 */

const opentype = require('opentype.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

let cachedFont = null;

function loadFont() {
  if (cachedFont) return cachedFont;

  const fontCandidates = [
    path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf'),
    path.join(process.cwd(), 'assets/fonts/Roboto-Bold.ttf'),
    path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf')
  ];

  for (const fp of fontCandidates) {
    if (fs.existsSync(fp)) {
      const buf = fs.readFileSync(fp);
      cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      return cachedFont;
    }
  }

  throw new Error('Fonte Roboto-Bold.ttf não encontrada nos diretórios do projeto.');
}

function getUprightPath(text, x, y, fontSize, align = 'center') {
  if (!text) return '';
  const font = loadFont();
  const clean = String(text).trim();

  let startX = x;
  try {
    const pMeasure = font.getPath(clean, 0, 0, fontSize);
    const box = pMeasure.getBoundingBox();
    const textWidth = box.x2 - box.x1;
    if (align === 'center') {
      startX = x - (textWidth / 2);
    } else if (align === 'right') {
      startX = x - textWidth;
    }
  } catch (e) {
    if (align === 'center') startX = x - (clean.length * fontSize * 0.28);
  }

  const p = font.getPath(clean, startX, y, fontSize);
  // Converte orientação de TrueType (+Y cima) para SVG (+Y baixo)
  p.commands.forEach(cmd => {
    if (cmd.y !== undefined) cmd.y = 2 * y - cmd.y;
    if (cmd.y1 !== undefined) cmd.y1 = 2 * y - cmd.y1;
    if (cmd.y2 !== undefined) cmd.y2 = 2 * y - cmd.y2;
  });
  return p.toPathData();
}

function formatTitle(title, maxLen = 24) {
  if (!title) return '';
  const clean = String(title).trim().toUpperCase();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trim() + '...';
}

function formatPrice(price) {
  if (price === null || price === undefined) return '';
  if (typeof price === 'number') return price.toFixed(2).replace('.', ',');
  return String(price).replace(/R\$\s*/gi, '').trim();
}

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return 'amazon';
  }
  return 'mercadolivre';
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

  // Fallback via URL pública
  const remoteUrl = `https://fastsavorys.vercel.app/assets/img/${fileName}`;
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error(`Falha ao carregar template ${templateType}: ${resp.statusText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Gera o Story Card 9:16 com Foto, Nome e Preço em Alta Definição (Vetores)
 * @param {Object} params
 * @param {'store'|'deal'} params.channel
 * @param {Object} [params.product] - Objeto do produto da loja
 * @param {Object} [params.deal] - Objeto do produto de achadinhos
 * @returns {Promise<string>} URL pública no Supabase Storage pronta para o Instagram
 */
async function generateStoryCard({ channel, product, deal }) {
  const W = 576;
  const H = 1024;

  let templateType = 'store';
  let productImageUrl = '';
  let rawTitle = '';
  let rawPrice = '';
  let fitMode = 'contain';

  let frame;
  let titleX = 288;
  let titleY = 726;
  let titleColor = '#002882';
  let priceX = 232;
  let priceY = 848;
  let priceColor = '#ffffff';
  let priceShadowColor = '#00195a';

  if (channel === 'store' || product) {
    templateType = 'store';
    rawTitle = product?.name || 'FastSavory\'s';
    rawPrice = product?.price;
    productImageUrl = product?.image || product?.image_url;
    fitMode = 'cover';

    frame = { left: 63, top: 103, width: 450, height: 450, radius: 30 };
    titleY = 685;
    titleColor = '#1a1a1a';
    priceX = 235;
    priceY = 820;
    priceColor = '#ffffff';
    priceShadowColor = '#4a1500';
  } else {
    templateType = detectPlatform(deal?.affiliate_url);
    rawTitle = deal?.title || 'Oferta Imperdível';
    rawPrice = deal?.price_display || deal?.price;
    productImageUrl = deal?.image_url;
    fitMode = 'contain';

    frame = { left: 65, top: 204, width: 445, height: 455, radius: 32 };
    titleY = 726;

    if (templateType === 'amazon') {
      titleColor = '#141419';
      priceX = 185;
      priceY = 848;
      priceColor = '#d66000';
      priceShadowColor = null;
    } else {
      templateType = 'mercadolivre';
      titleColor = '#002882';
      priceX = 232;
      priceY = 848;
      priceColor = '#ffffff';
      priceShadowColor = '#00195a';
    }
  }

  if (!productImageUrl || !productImageUrl.startsWith('http')) {
    throw new Error(`URL de imagem do produto inválida para o story: "${productImageUrl}"`);
  }

  // 1. Carrega o template de fundo oficial 9:16
  const templateBuffer = await loadTemplateBuffer(templateType);

  // 2. Baixa a foto do produto
  const imgResp = await fetch(productImageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  if (!imgResp.ok) {
    throw new Error(`Falha ao baixar imagem do produto (${imgResp.status}): ${productImageUrl}`);
  }
  const prodRawBuffer = Buffer.from(await imgResp.arrayBuffer());

  // 3. Aplica máscara com cantos arredondados na foto do produto
  const maskSvg = Buffer.from(`
    <svg width="${frame.width}" height="${frame.height}">
      <rect x="0" y="0" width="${frame.width}" height="${frame.height}" rx="${frame.radius}" ry="${frame.radius}" fill="#fff"/>
    </svg>
  `);

  const resizeOptions = {
    fit: fitMode,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  };

  const roundedProductBuffer = await sharp(prodRawBuffer)
    .resize(frame.width, frame.height, resizeOptions)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 4. Gera os caminhos vetoriais do Nome e do Preço
  const cleanTitle = formatTitle(rawTitle, 24);
  const cleanPrice = formatPrice(rawPrice);

  const titlePath = getUprightPath(cleanTitle, titleX, titleY, 23, 'center');

  let priceShadowPath = '';
  if (priceShadowColor && cleanPrice) {
    priceShadowPath = `<path d="${getUprightPath(cleanPrice, priceX + 2, priceY + 2, 44, 'left')}" fill="${priceShadowColor}"/>`;
  }
  const pricePath = cleanPrice ? `<path d="${getUprightPath(cleanPrice, priceX, priceY, 44, 'left')}" fill="${priceColor}"/>` : '';

  const textOverlaySvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="${titlePath}" fill="${titleColor}"/>
      ${priceShadowPath}
      ${pricePath}
    </svg>
  `);

  // 5. Compõe imagem final 9:16 (576 x 1024)
  const compositeBuffer = await sharp(templateBuffer)
    .composite([
      { input: roundedProductBuffer, top: frame.top, left: frame.left },
      { input: textOverlaySvg, top: 0, left: 0 }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  // 6. Upload seguro para o Supabase Storage (bucket fast-images)
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
  console.log(`[Story Generator] ✅ Card 9:16 com Título e Preço gerado com sucesso: ${publicUrl}`);
  return publicUrl;
}

module.exports = {
  generateStoryCard,
  detectPlatform
};
