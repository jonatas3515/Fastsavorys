/**
 * FastSavory's - Gerador Minimalista de Cards 9:16 para Instagram Stories
 * Design limpo baseado em cores da marca (sem templates de fundo pesados/distorcidos).
 * 100% vetorial, alta resolução (1080x1920) e ultra leve.
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

function getCenteredPath(text, targetCenterX, targetCenterY, fontSize) {
  if (!text) return '';
  const font = loadFont();
  const clean = String(text).trim();

  try {
    const pMeasure = font.getPath(clean, 0, 0, fontSize);
    const bb = pMeasure.getBoundingBox();

    const textCenterX = (bb.x1 + bb.x2) / 2;
    const textCenterY = (bb.y1 + bb.y2) / 2;

    const startX = targetCenterX - textCenterX;
    const baselineY = targetCenterY - textCenterY;

    const pFinal = font.getPath(clean, startX, baselineY, fontSize);
    return pFinal.toPathData({ flipY: false });
  } catch (e) {
    console.error('[Story Generator] getCenteredPath error:', e);
    return '';
  }
}

function splitTitleToTwoLines(title, maxPerLine = 24) {
  if (!title) return ['', ''];
  const words = String(title).trim().toUpperCase().split(/\s+/);
  let line1 = '';
  let line2 = '';

  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= maxPerLine && !line2) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      if ((line2 + ' ' + w).trim().length <= maxPerLine) {
        line2 = (line2 + ' ' + w).trim();
      } else {
        if (!line2) {
          line2 = w.slice(0, maxPerLine - 3) + '...';
        } else if (!line2.endsWith('...')) {
          line2 = line2.slice(0, maxPerLine - 3) + '...';
        }
        break;
      }
    }
  }
  return [line1, line2];
}

function formatPrice(price) {
  if (price === null || price === undefined) return '';
  if (typeof price === 'number') return `R$ ${price.toFixed(2).replace('.', ',')}`;
  const s = String(price).trim();
  return s.startsWith('R$') ? s : `R$ ${s}`;
}

function detectPlatform(url = '') {
  const u = (url || '').toLowerCase();
  if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
    return 'amazon';
  }
  if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
    return 'shopee';
  }
  if (u.includes('natura.com.br') || (u.includes('scvald.com') && !u.includes('avon'))) {
    return 'natura';
  }
  if (u.includes('avon.com.br') || u.includes('avon')) {
    return 'avon';
  }
  return 'mercadolivre';
}

const THEMES = {
  store: {
    bgStart: '#181412',
    bgEnd: '#0a0807',
    badgeBg: '#f59e0b',
    badgeText: '#181412',
    badgeLabel: "FASTSAVORY'S LANCHONETE",
    titleColor: '#ffffff',
    priceBg: '#ea580c',
    priceText: '#ffffff',
    ctaBg: '#27201c',
    ctaBorder: '#443730',
    ctaText: '#fbbf24',
    ctaLabel: 'PECA PELO CARDAPIO OU WHATSAPP',
    glow: '#f59e0b'
  },
  amazon: {
    bgStart: '#131921',
    bgEnd: '#090d12',
    badgeBg: '#ff9900',
    badgeText: '#131921',
    badgeLabel: 'ACHADINHO AMAZON',
    titleColor: '#ffffff',
    priceBg: '#ff9900',
    priceText: '#131921',
    ctaBg: '#232f3e',
    ctaBorder: '#37475a',
    ctaText: '#ff9900',
    ctaLabel: 'VEJA O LINK NOS STORIES OU DIRECT',
    glow: '#ff9900'
  },
  mercadolivre: {
    bgStart: '#0f172a',
    bgEnd: '#020617',
    badgeBg: '#ffe600',
    badgeText: '#002882',
    badgeLabel: 'MERCADO LIVRE OFERTAS',
    titleColor: '#ffffff',
    priceBg: '#ffe600',
    priceText: '#002882',
    ctaBg: '#1e293b',
    ctaBorder: '#334155',
    ctaText: '#ffe600',
    ctaLabel: 'VEJA O LINK NOS STORIES OU DIRECT',
    glow: '#ffe600'
  },
  shopee: {
    bgStart: '#1a100e',
    bgEnd: '#0d0605',
    badgeBg: '#ee4d2d',
    badgeText: '#ffffff',
    badgeLabel: 'SHOPEE ACHADINHOS',
    titleColor: '#ffffff',
    priceBg: '#ee4d2d',
    priceText: '#ffffff',
    ctaBg: '#2d1815',
    ctaBorder: '#4a2520',
    ctaText: '#ee4d2d',
    ctaLabel: 'VEJA O LINK NOS STORIES OU DIRECT',
    glow: '#ee4d2d'
  },
  natura: {
    bgStart: '#1b120c',
    bgEnd: '#0d0805',
    badgeBg: '#ff6a13',
    badgeText: '#ffffff',
    badgeLabel: 'ACHADINHO NATURA',
    titleColor: '#ffffff',
    priceBg: '#ff6a13',
    priceText: '#ffffff',
    ctaBg: '#2a1a10',
    ctaBorder: '#4a2c1a',
    ctaText: '#ff8c42',
    ctaLabel: 'VEJA O LINK NOS STORIES OU DIRECT',
    glow: '#ff6a13'
  },
  avon: {
    bgStart: '#1f0d14',
    bgEnd: '#0f0509',
    badgeBg: '#e40046',
    badgeText: '#ffffff',
    badgeLabel: 'ACHADINHO AVON',
    titleColor: '#ffffff',
    priceBg: '#e40046',
    priceText: '#ffffff',
    ctaBg: '#2f121d',
    ctaBorder: '#4f1a2e',
    ctaText: '#ff4d79',
    ctaLabel: 'VEJA O LINK NOS STORIES OU DIRECT',
    glow: '#e40046'
  }
};

/**
 * Gera o Story Card 9:16 Minimalista (Cores puras, sem card de fundo fixo)
 */
async function generateStoryCard({ channel, product, deal }) {
  const W = 1080;
  const H = 1920;

  const isStore = channel === 'store' || Boolean(product);
  const platform = isStore ? 'store' : detectPlatform(deal?.affiliate_url);
  const theme = THEMES[platform] || THEMES.store;

  const rawTitle = isStore ? (product?.name || 'FastSavory\'s') : (deal?.title || 'Oferta Imperdível');
  const rawPrice = isStore ? product?.price : (deal?.price_display || deal?.price);
  const productImageUrl = isStore ? (product?.image || product?.image_url) : deal?.image_url;

  if (!productImageUrl || !productImageUrl.startsWith('http')) {
    throw new Error(`URL de imagem do produto inválida para o story: "${productImageUrl}"`);
  }

  const [line1, line2] = splitTitleToTwoLines(rawTitle, 26);
  const price = formatPrice(rawPrice);

  // Centralização vetorial matemática perfeita (Target Centers)
  // Badge: rect y=130, h=80 -> centerY = 170
  const badgePath = getCenteredPath(theme.badgeLabel, 540, 170, 32);

  // Title: entre a imagem e a pílula de preço
  const line1Path = getCenteredPath(line1, 540, line2 ? 1230 : 1260, 44);
  const line2Path = line2 ? getCenteredPath(line2, 540, 1290, 44) : '';

  // Pílula de preço: rect y=1380, h=124 -> centerY = 1442
  const pricePath = getCenteredPath(price, 540, 1442, 64);

  // CTA: rect y=1560, h=76 -> centerY = 1598
  const ctaPath = getCenteredPath(theme.ctaLabel, 540, 1598, 25);

  // Rodapé: centerY = 1750
  const footerPath = getCenteredPath('FASTSAVORYS.VERCEL.APP', 540, 1750, 22);

  const svgTemplate = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${theme.bgStart}"/>
        <stop offset="100%" stop-color="${theme.bgEnd}"/>
      </linearGradient>
      <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity="0.5"/>
      </filter>
      <filter id="pillShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>

    <!-- Fundo Limpo e Gradiente Suave da Marca -->
    <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
    <circle cx="540" cy="700" r="480" fill="${theme.glow}" opacity="0.08"/>

    <!-- Badge Superior -->
    <rect x="230" y="130" width="620" height="80" rx="40" fill="${theme.badgeBg}"/>
    <path d="${badgePath}" fill="${theme.badgeText}"/>

    <!-- Moldura Branca Limpa com Cantos Arredondados para a Foto -->
    <rect x="90" y="250" width="900" height="900" rx="48" fill="#ffffff" filter="url(#cardShadow)"/>

    <!-- Título do Produto -->
    <path d="${line1Path}" fill="${theme.titleColor}"/>
    ${line2Path ? `<path d="${line2Path}" fill="${theme.titleColor}"/>` : ''}

    <!-- Pílula de Preço em Destaque -->
    <rect x="280" y="1380" width="520" height="124" rx="62" fill="${theme.priceBg}" filter="url(#pillShadow)"/>
    <path d="${pricePath}" fill="${theme.priceText}"/>

    <!-- Chamada para Ação (CTA) -->
    <rect x="190" y="1560" width="700" height="76" rx="38" fill="${theme.ctaBg}" stroke="${theme.ctaBorder}" stroke-width="2"/>
    <path d="${ctaPath}" fill="${theme.ctaText}"/>

    <!-- Rodapé Sutil do Site -->
    <path d="${footerPath}" fill="#78716c"/>
  </svg>
  `;

  // Baixa imagem do produto
  const imgResp = await fetch(productImageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  if (!imgResp.ok) {
    throw new Error(`Falha ao baixar imagem do produto (${imgResp.status}): ${productImageUrl}`);
  }
  const prodRawBuffer = Buffer.from(await imgResp.arrayBuffer());

  // Máscara com cantos arredondados na foto
  const maskSvg = Buffer.from(`
    <svg width="840" height="840">
      <rect x="0" y="0" width="840" height="840" rx="36" ry="36" fill="#fff"/>
    </svg>
  `);

  const roundedProductBuffer = await sharp(prodRawBuffer)
    .resize(840, 840, { fit: 'contain', background: '#ffffff' })
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Compõe imagem final 9:16 (1080x1920)
  const compositeBuffer = await sharp(Buffer.from(svgTemplate))
    .composite([
      { input: roundedProductBuffer, top: 280, left: 120 }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  // Upload para Supabase Storage
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
  console.log(`[Story Generator] ✅ Card 9:16 minimalista gerado com sucesso: ${publicUrl}`);
  return publicUrl;
}

module.exports = {
  generateStoryCard,
  detectPlatform
};
