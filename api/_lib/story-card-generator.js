/**
 * FastSavory's - Gerador de Cards 9:16 para Instagram Stories
 * Transforma fotos quadradas (1:1) em Stories verticais (9:16 - 576x1024)
 * usando templates oficiais com molduras arredondadas e CTAs fixos na zona segura,
 * eliminando 100% o risco de falhas de fontes/textos do servidor.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const TEMPLATE_FALLBACK_URLS = {
  store: 'https://fastsavorys.vercel.app/assets/img/story_template_store.jpg',
  mercadolivre: 'https://fastsavorys.vercel.app/assets/img/story_template_mercadolivre.jpg',
  amazon: 'https://fastsavorys.vercel.app/assets/img/story_template_amazon.jpg'
};

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

  // Fallback via URL pública da Vercel
  const remoteUrl = TEMPLATE_FALLBACK_URLS[templateType] || TEMPLATE_FALLBACK_URLS.mercadolivre;
  console.log(`[Story Generator] Carregando template ${templateType} via fallback HTTP: ${remoteUrl}`);
  const resp = await fetch(remoteUrl);
  if (!resp.ok) {
    throw new Error(`Falha ao carregar template ${templateType}: ${resp.statusText}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Gera o Story Card 9:16 limpo e faz upload direto para o Supabase Storage
 * @param {Object} params
 * @param {'store'|'deal'} params.channel
 * @param {Object} [params.product] - Objeto do produto da loja
 * @param {Object} [params.deal] - Objeto do produto de achadinhos
 * @returns {Promise<string>} URL pública no Supabase Storage pronta para o Instagram Stories
 */
async function generateStoryCard({ channel, product, deal }) {
  console.log(`[Story Generator] Iniciando composição limpa 9:16 para canal: ${channel}...`);

  let templateType = 'store';
  let productImageUrl = '';
  let fitMode = 'cover';
  let frame;

  if (channel === 'store' || product) {
    templateType = 'store';
    productImageUrl = product?.image || product?.image_url;
    fitMode = 'cover';
    frame = { left: 63, top: 103, width: 450, height: 450, radius: 30 };
  } else {
    templateType = detectPlatform(deal?.affiliate_url);
    productImageUrl = deal?.image_url;
    fitMode = 'contain';
    frame = { left: 65, top: 204, width: 445, height: 455, radius: 32 };
  }

  if (!productImageUrl || !productImageUrl.startsWith('http')) {
    throw new Error(`URL de imagem do produto inválida para o story: "${productImageUrl}"`);
  }

  // 1. Carrega o template de fundo oficial 9:16 (576 x 1024)
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

  // 4. Compõe a foto na moldura central do template
  const compositeBuffer = await sharp(templateBuffer)
    .composite([
      { input: roundedProductBuffer, top: frame.top, left: frame.left }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  // 5. Upload seguro para o Supabase Storage (bucket fast-images)
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
  console.log(`[Story Generator] ✅ Card 9:16 limpo gerado e salvo com sucesso: ${publicUrl}`);
  return publicUrl;
}

module.exports = {
  generateStoryCard,
  detectPlatform
};
