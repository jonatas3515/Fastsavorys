/**
 * FastSavory's - Autonomous Deals Miner for Mercado Livre
 * Scrapes high-discount, top-rated promotions from Mercado Livre
 * and automatically registers them into Supabase `fast_affiliate_products`
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

function detectCategory(title = '', description = '', url = '') {
  const text = `${title} ${description} ${url}`.toLowerCase();

  const rules = [
    { category: 'confeitaria_sobremesas', keywords: ['chocolate', 'bombom', 'biscoito', 'bolacha', 'doce de leite', 'nutella', 'pasta de amendoim', 'leite condensado', 'creme de leite', 'barra de chocolate', 'cacau', 'granulado', 'cobertura chocolate', 'achocolatado', 'nescau', 'toddy'] },
    { category: 'alimentos_basicos', keywords: ['arroz', 'feijao', 'feijão', 'azeite', 'oleo de soja', 'óleo de soja', 'macarrao', 'macarrão', 'massa', 'farinha de trigo', 'sal refinado', 'açucar', 'acucar', 'feijao preto', 'feijao carioca'] },
    { category: 'molhos_temperos', keywords: ['molho de tomate', 'extrato de tomate', 'tempero', 'molho shoyu', 'maionese', 'ketchup', 'mostarda', 'atum', 'sardinha', 'conserva', 'oregano', 'pimenta', 'curry', 'chimichurri'] },
    { category: 'bebidas_snacks', keywords: ['whisky', 'gin', 'vodka', 'cerveja', 'vinho', 'espumante', 'refrigerante', 'coca cola', 'suco', 'cafe', 'café', 'capsula cafe', 'cha', 'chá', 'snack', 'salgadinho', 'doritos', 'batata frita', 'amendoim', 'energetico', 'energético', 'red bull', 'monster'] },
    { category: 'formas_utensilios', keywords: ['forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'assadeira bolo', 'manga de confeitar', 'tapete silicone'] },
    { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'caixa bolo', 'caixa doce', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita'] },
    { category: 'festas', keywords: ['artigo de festa', 'decoracao festa', 'decoração festa', 'balao', 'balão', 'bexiga', 'topo de bolo', 'vela aniversario', 'vela aniversário', 'painel festa', 'lembrancinha', 'presente', 'kit festa'] },
    { category: 'quarto', keywords: ['guarda roupa', 'cama box', 'colchao', 'colchão', 'cabeceira', 'comoda', 'cômoda', 'mesa de cabeceira', 'criado mudo', 'beliche'] },
    { category: 'sala_estar', keywords: ['sofa', 'sofá', 'poltrona', 'rack tv', 'painel tv', 'mesa de centro', 'tapete sala', 'cortina sala', 'almofada'] },
    { category: 'sala_jantar', keywords: ['mesa de jantar', 'cadeira de jantar', 'conjunto jantar', 'buffet sala', 'aparador', 'banqueta'] },
    { category: 'escritorio_organizacao', keywords: ['cadeira de escritorio', 'cadeira escritório', 'cadeira gamer', 'mesa escritorio', 'mesa escritório', 'escrivaninha', 'estante livros', 'gaveteiro'] },
    { category: 'cozinha', keywords: ['air fryer', 'airfryer', 'fritadeira', 'panela', 'panelas', 'frigideira', 'liquidificador', 'batedeira', 'cafeteira', 'nespresso', 'dolce gusto', 'sanduicheira', 'grill', 'mixer', 'processador', 'chaleira', 'faqueiro', 'faca chef', 'prato', 'copo', 'talher', 'balanca cozinha', 'balança digital', 'garrafa termica'] },
    { category: 'cama_mesa_banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro', 'toalha de mesa'] },
    { category: 'organizacao', keywords: ['organizador', 'organizadora', 'pote hermetico', 'potes hermeticos', 'vassoura', 'mop', 'rodo', 'dispenser', 'lixeira', 'cabide', 'varal', 'cesto organizador', 'prateleira', 'caixa organizadora', 'sapateira'] },
    { category: 'decoracao_basica', keywords: ['quadro decorativo', 'espelho', 'vaso decorativo', 'relogio de parede', 'luminaria mesa', 'abajur', 'difusor aroma'] },
    { category: 'grandes_eletros', keywords: ['geladeira', 'refrigerador', 'fogao', 'fogão', 'cooktop', 'forno de embutir', 'microondas', 'micro-ondas', 'freezer', 'cervejeira', 'adega climatizada'] },
    { category: 'lavagem_secagem', keywords: ['lavadora', 'maquina de lavar', 'máquina de lavar', 'lava e seca', 'secadora de roupas', 'tanquinho'] },
    { category: 'climatizacao', keywords: ['ar condicionado', 'ventilador', 'climatizador', 'aquecedor', 'umidificador'] },
    { category: 'tv_audio_video', keywords: ['smart tv', 'tv 50', 'tv 55', 'tv 65', 'televisao', 'televisão', 'soundbar', 'home theater', 'projetor', 'chromecast', 'fire stick', 'roku', 'tv box'] },
    { category: 'celulares', keywords: ['smartphone', 'celular', 'iphone', 'xiaomi', 'galaxy', 'motorola', 'redmi', 'poco', 'realme', 'capinha', 'pelicula celular', 'carregador tipo c', 'carregador celular', 'suporte celular', 'ring light'] },
    { category: 'smart_home', keywords: ['alexa', 'echo dot', 'lampada inteligente', 'fechadura digital', 'camera de seguranca', 'sensor inteligente', 'tomada inteligente'] },
    { category: 'informatica', keywords: ['notebook', 'computador', 'computador gamer', 'laptop', 'macbook', 'mouse', 'teclado', 'monitor', 'impressora', 'ssd', 'memoria ram', 'pendrive', 'pen drive', 'roteador', 'placa de video', 'gabinete', 'fonte atx', 'webcam', 'tablet', 'ipad'] },
    { category: 'audio_gadgets', keywords: ['fone de ouvido', 'fone bluetooth', 'headphone', 'airpod', 'caixa de som', 'jbl', 'microfone', 'power bank', 'carregador portatil', 'smartband', 'drone'] },
    { category: 'consoles', keywords: ['playstation', 'ps5', 'ps4', 'xbox series', 'xbox one', 'nintendo switch', 'console'] },
    { category: 'jogos_midias', keywords: ['jogos ps5', 'jogos ps4', 'jogos switch', 'jogos xbox', 'midia fisica', 'game pass'] },
    { category: 'controles_acessorios_gamer', keywords: ['controle ps5', 'controle xbox', 'gamepad', 'joystick', 'headset gamer', 'volante gamer', 'teclado mecanico', 'mouse gamer', 'mousepad gamer'] },
    { category: 'colecionaveis_geek', keywords: ['action figure', 'funko pop', 'boneco colecionavel', 'estatua anime', 'colecionavel', 'cosplay'] },
    { category: 'ferramentas', keywords: ['furadeira', 'parafusadeira', 'martelete', 'martelo', 'chave de fenda', 'chave phillips', 'trena', 'serra eletrica', 'serra circular', 'esmerilhadeira', 'ferramenta', 'jogo de ferramentas'] },
    { category: 'construcao_eletrica', keywords: ['torneira', 'chuveiro', 'tomada', 'extensao eletrica', 'lampada led', 'tinta parede', 'fio eletrico', 'disjuntor', 'cano pvc'] },
    { category: 'automotivo', keywords: ['automotivo', 'carro', 'moto', 'motocicleta', 'pneu', 'capacete', 'farol', 'oleo motor', 'óleo motor', 'som automotivo', 'camera de re', 'capa automotiva', 'cera automotiva', 'lavagem automotiva', 'vonixx', 'pretinho'] },
    { category: 'petshop', keywords: ['racao', 'ração', 'cachorro', 'gato', 'pet', 'coleira', 'guia cachorro', 'arranhador', 'caminha pet', 'cama pet', 'petisco', 'comedouro', 'bebedouro pet', 'areia gato', 'tapete higienico', 'shampoo pet'] },
    { category: 'roupas', keywords: ['camisa', 'camiseta', 'calca', 'calça', 'vestido', 'saia', 'bermuda', 'short', 'jaqueta', 'moletom', 'casaco', 'biquini', 'biquíni', 'lingerie', 'meia', 'cueca', 'sutia'] },
    { category: 'calcados', keywords: ['tenis', 'tênis', 'sapato', 'sandalia', 'sandália', 'bota', 'chinelo', 'havaianas', 'chuteira', 'rasteirinha'] },
    { category: 'bolsas_malas', keywords: ['bolsa', 'mochila', 'mala de viagem', 'mochila escolar', 'carteira', 'necessaire', 'pochete', 'pasta notebook'] },
    { category: 'relogios_oculos', keywords: ['relogio', 'relógio', 'smartwatch', 'oculos de sol', 'óculos de sol', 'armacao oculos', 'joia', 'jóia', 'semijoia', 'brinco', 'colar', 'pulseira'] },
    { category: 'cabelos', keywords: ['shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'secador de cabelo', 'chapinha', 'modelador de cachos', 'escova secadora', 'tonico capilar'] },
    { category: 'pele_rosto', keywords: ['skincare', 'serum facial', 'sérum', 'protetor solar', 'hidratante facial', 'gel de limpeza facial', 'agua micelar', 'vitamina c facial', 'antirrugas'] },
    { category: 'maquiagem_unhas', keywords: ['maquiagem', 'batom', 'base facial', 'rimel', 'rímel', 'delineador', 'paleta de sombras', 'esmalte', 'unha postica', 'cabine led unha'] },
    { category: 'perfumaria_higiene', keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'sabonete', 'escova de dentes', 'fio dental', 'hidratante corporal'] },
    { category: 'suplementos', keywords: ['whey', 'creatina', 'suplemento', 'bcaa', 'glutamina', 'pre treino', 'pré treino', 'termogenico', 'vitamina', 'omega 3', 'colageno', 'hipercalorico', 'barra de proteina'] },
    { category: 'treino_funcional', keywords: ['haltere', 'colchonete', 'elastico treino', 'kettlebell', 'corda de pular', 'caneleira', 'barra fixa', 'faixa elastica', 'luva academia', 'tapete yoga', 'roda abdominal'] },
    { category: 'monitoramento_saude', keywords: ['medidor de pressao', 'termometro', 'inalador', 'nebulizador', 'oximetro', 'glicosimetro', 'massageador', 'balanca corporal', 'balança digital bioimpedancia', 'joelheira', 'corretor postural'] },
    { category: 'brinquedos_pedagogicos', keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime', 'bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'mordedor'] },
    { category: 'jogos_tabuleiro', keywords: ['jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'domino', 'baralho', 'xadrez', 'war', 'banco imobiliario'] },
    { category: 'papelaria_escolar', keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel', 'tinta guache'] }
  ];

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return rule.category;
      }
    }
  }

  return 'cozinha';
}

async function scrapeMercadoLivreDeals() {
  const url = 'https://www.mercadolivre.com.br/ofertas?container_id=MLB779362-1&page=1';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
    }
  });

  if (!res.ok) {
    throw new Error(`Falha ao carregar ofertas do Mercado Livre: HTTP ${res.status}`);
  }

  const html = await res.text();
  const cardChunks = html.split(/<div\s+class=["'][^"']*poly-card\s+poly-card--grid[^"']*["']/i);
  cardChunks.shift(); // Remove header

  const deals = [];

  for (const chunk of cardChunks) {
    const linkMatch = chunk.match(/<a\s+[^>]*href=["'](https:\/\/[^"'\s]+)["'][^>]*class=["']poly-component__title[^"']*["']/i) ||
                      chunk.match(/class=["'][^"']*poly-component__title[^"']*["'][^>]*><a\s+[^>]*href=["'](https:\/\/[^"'\s]+)["']/i);
    if (!linkMatch) continue;
    const cleanUrl = linkMatch[1].split('#')[0].split('?')[0];

    const titleMatch = chunk.match(/class=["']poly-component__title[^"']*["'][^>]*><a[^>]*>([\s\S]*?)<\/a>/i) ||
                       chunk.match(/class=["']poly-component__title[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim() : '';

    const imgMatch = chunk.match(/class=["']poly-component__picture[^"']*["'][\s\S]*?src=["']([^"']+)["']/i) ||
                     chunk.match(/class=["']poly-component__picture[^"']*["'][\s\S]*?data-src=["']([^"']+)["']/i);
    const imageUrl = imgMatch ? imgMatch[1] : '';

    const ratingMatch = chunk.match(/class=["'][^"']*poly-component__review-compacted[^"']*["'][\s\S]*?<span[^>]*>([0-9.]+)</i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    let price = '';
    const currentAmountMatch = chunk.match(/class=["']poly-price__current[^"']*["'][\s\S]*?aria-label=["']([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
    if (currentAmountMatch) {
      const frac = currentAmountMatch[1];
      const cents = currentAmountMatch[2] ? currentAmountMatch[2].padStart(2, '0') : '00';
      price = `R$ ${frac},${cents}`;
    }

    let originalPrice = '';
    const prevAmountMatch = chunk.match(/class=["']andes-money-amount--previous[^"']*["'][^>]*aria-label=["']Antes:\s*([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i);
    if (prevAmountMatch) {
      const frac = prevAmountMatch[1];
      const cents = prevAmountMatch[2] ? prevAmountMatch[2].padStart(2, '0') : '00';
      originalPrice = `R$ ${frac},${cents}`;
    }

    const discMatch = chunk.match(/class=["'][^"']*(?:poly-price__discount|polylabel-pill|andes-money-amount__discount)[^"']*["'][^>]*>([0-9]+)%\s*OFF</i);
    const discountPercent = discMatch ? parseInt(discMatch[1], 10) : 0;

    const badgeMatch = chunk.match(/class=["']polylabel-fs-xs\s+polylabel-fw-semibold["']>([^<]+)</i);
    const badgeText = badgeMatch ? badgeMatch[1].trim() : '';

    if (rawTitle && price && cleanUrl) {
      deals.push({
        title: rawTitle,
        cleanUrl,
        imageUrl,
        price,
        originalPrice,
        discountPercent,
        discountTag: discountPercent > 0 ? `${discountPercent}% OFF` : '',
        rating,
        badgeText,
        category: detectCategory(rawTitle, badgeText, cleanUrl)
      });
    }
  }

  return deals;
}

async function handleMineDeals(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query?.limit || req.body?.limit || '3', 10), 1), 15);
  const minDiscount = Math.max(parseInt(req.query?.min_discount || req.body?.min_discount || '25', 10), 0);
  const minRating = parseFloat(req.query?.min_rating || req.body?.min_rating || '4.0');
  const dryRun = req.query?.dry_run === 'true' || req.body?.dry_run === true;
  const targetCategory = req.query?.category || req.body?.category || null;

  try {
    console.log(`[Deals Miner] Iniciando mineração no Mercado Livre (Min ${minDiscount}% OFF, Min ${minRating}⭐, Limite: ${limit})...`);

    // 1. Scrape all current promotion cards
    const allDeals = await scrapeMercadoLivreDeals();
    console.log(`[Deals Miner] Total de ofertas varridas: ${allDeals.length}`);

    // 2. Filter qualified deals
    let qualified = allDeals.filter(d => {
      if (d.discountPercent < minDiscount) return false;
      if (minRating > 0 && d.rating > 0 && d.rating < minRating) return false;
      if (targetCategory && d.category !== targetCategory) return false;
      return true;
    });

    console.log(`[Deals Miner] Ofertas qualificadas: ${qualified.length}`);

    if (qualified.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nenhuma oferta atendeu a todos os critérios de filtro nesta execução.',
        totalScanned: allDeals.length,
        qualifiedCount: 0,
        insertedCount: 0,
        deals: []
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        totalScanned: allDeals.length,
        qualifiedCount: qualified.length,
        candidateDeals: qualified.slice(0, limit)
      });
    }

    // 3. Query existing products in Supabase to avoid duplicates
    let existingUrls = new Set();
    let existingTitles = new Set();

    try {
      const getRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=id,title,affiliate_url&limit=200`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (getRes.ok) {
        const existingData = await getRes.json();
        if (Array.isArray(existingData)) {
          existingData.forEach(p => {
            if (p.affiliate_url) existingUrls.add(p.affiliate_url.toLowerCase().split('?')[0].split('#')[0]);
            if (p.title) existingTitles.add(p.title.toLowerCase().trim());
          });
        }
      }
    } catch (dbErr) {
      console.warn('[Deals Miner] Aviso ao checar duplicatas no banco:', dbErr.message);
    }

    // 4. Select only non-duplicate items
    const dealsToInsert = [];
    for (const deal of qualified) {
      const cleanUrlNorm = deal.cleanUrl.toLowerCase().split('?')[0].split('#')[0];
      const titleNorm = deal.title.toLowerCase().trim();

      if (existingUrls.has(cleanUrlNorm) || existingTitles.has(titleNorm)) {
        continue;
      }

      // Determine smart badge & color
      let badgeTag = deal.discountTag || `${deal.discountPercent}% OFF`;
      let badgeColor = 'pink';

      if (deal.discountPercent >= 50) {
        badgeTag = '💥 Oferta Imperdível';
        badgeColor = 'blue';
      } else if (deal.badgeText && deal.badgeText.toUpperCase().includes('MAIS VENDIDO')) {
        badgeTag = '🔥 Mais Vendido';
        badgeColor = 'orange';
      } else if (deal.discountPercent >= 35) {
        badgeTag = '🌸 Oferta';
        badgeColor = 'pink';
      } else {
        badgeTag = '🔴 Menor Preço';
        badgeColor = 'rose';
      }

      dealsToInsert.push({
        title: deal.title,
        description: deal.badgeText ? `🔸 ${deal.badgeText} no Mercado Livre` : null,
        affiliate_url: deal.cleanUrl,
        image_url: deal.imageUrl,
        price_display: deal.price,
        original_price: deal.originalPrice || null,
        category: deal.category || 'cozinha',
        discount_tag: badgeTag,
        badge_color: badgeColor,
        is_fast_pick: false,
        position: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Mark as seen in this run
      existingUrls.add(cleanUrlNorm);
      existingTitles.add(titleNorm);

      if (dealsToInsert.length >= limit) {
        break;
      }
    }

    if (dealsToInsert.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Todas as ofertas qualificadas já estão cadastradas no banco.',
        totalScanned: allDeals.length,
        qualifiedCount: qualified.length,
        insertedCount: 0,
        skippedDuplicates: true,
        deals: []
      });
    }

    // 5. Insert newly mined deals into Supabase
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(dealsToInsert)
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[Deals Miner] Erro ao inserir no Supabase:', errText);
      throw new Error(`Falha no banco de dados: ${insertRes.status} - ${errText}`);
    }

    const insertedData = await insertRes.json();
    console.log(`[Deals Miner] ✅ ${dealsToInsert.length} novas ofertas cadastradas com sucesso!`);

    return res.status(200).json({
      success: true,
      message: `🎉 ${dealsToInsert.length} novas ofertas mineradas e cadastradas no FastSavory's com sucesso!`,
      totalScanned: allDeals.length,
      qualifiedCount: qualified.length,
      insertedCount: dealsToInsert.length,
      deals: insertedData
    });

  } catch (error) {
    console.error('[Deals Miner] ❌ Erro na mineração:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro durante a mineração de ofertas',
      details: error.message
    });
  }
}

module.exports = {
  handleMineDeals,
  scrapeMercadoLivreDeals,
  detectCategory
};
