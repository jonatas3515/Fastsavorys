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
    { category: 'limpeza_organizacao', keywords: ['detergente', 'amaciante', 'sabao em po', 'sabão em pó', 'sabao liquido', 'desinfetante', 'agua sanitaria', 'água sanitária', 'esponja', 'pano microfibra', 'lustra moveis', 'inseticida', 'saco de lixo', 'cloro', 'alcool 70'] },
    { category: 'eletroportateis', keywords: ['air fryer', 'airfryer', 'fritadeira sem oleo', 'liquidificador', 'batedeira', 'sanduicheira', 'grill', 'mixer', 'processador de alimentos', 'chaleira eletrica', 'panela de pressao eletrica', 'panela eletrica', 'torradeira', 'crepeira', 'pipoqueira'] },
    { category: 'eletrodomesticos', keywords: ['microondas', 'micro-ondas', 'forno eletrico', 'fogao', 'fogão', 'cooktop', 'depurador', 'coifa', 'bebedouro', 'purificador de agua', 'adega'] },
    { category: 'cafe_cha_expresso', keywords: ['cafeteira', 'nespresso', 'dolce gusto', 'tres coracoes', 'moedor de cafe', 'cafeteira expresso', 'cafeteira italiana', 'prensa francesa', 'capsula', 'xicara cafe', 'caneca'] },
    { category: 'panelas_loucas_copos', keywords: ['jogo de panelas', 'conjunto panelas', 'panela antiaderente', 'frigideira', 'cacarola', 'panela de pressao', 'aparelho de jantar', 'pratos', 'jogo de copos', 'tacas', 'taças', 'travessa vidro'] },
    { category: 'utensilios_domesticos', keywords: ['faqueiro', 'faca chef', 'jogo de facas', 'espatula', 'espátula', 'concha', 'pegador', 'tabua de corte', 'pote hermetico', 'potes hermeticos', 'pote de vidro', 'escorredor de louca', 'balanca de cozinha', 'garrafa termica', 'cortador de legumes'] },
    { category: 'cama_mesa_banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro', 'toalha de mesa', 'jogo americano'] },
    { category: 'grandes_eletros', keywords: ['geladeira', 'refrigerador', 'freezer', 'cervejeira', 'adega climatizada'] },
    { category: 'lavagem_secagem', keywords: ['lavadora', 'maquina de lavar', 'máquina de lavar', 'lava e seca', 'secadora de roupas', 'tanquinho', 'centrifuga de roupas'] },
    { category: 'climatizacao', keywords: ['ar condicionado', 'split inverter', 'climatizador de ar', 'aquecedor', 'umidificador de ar', 'desumidificador'] },
    { category: 'ventiladores', keywords: ['ventilador', 'ventilador de mesa', 'ventilador de coluna', 'ventilador de teto', 'circulador de ar', 'turbo silencioso', 'mondial turbo', 'arno turbo'] },
    { category: 'tv_audio_video', keywords: ['smart tv', 'tv 50', 'tv 55', 'tv 65', 'televisao', 'televisão', 'soundbar', 'home theater', 'projetor', 'chromecast', 'fire stick', 'roku', 'tv box'] },
    { category: 'cabelos', keywords: ['shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'secador de cabelo', 'chapinha', 'modelador de cachos', 'escova secadora', 'tonico capilar', 'leave in', 'cronograma capilar'] },
    { category: 'pele_rosto', keywords: ['skincare', 'serum facial', 'sérum', 'protetor solar', 'hidratante facial', 'gel de limpeza facial', 'agua micelar', 'vitamina c facial', 'antirrugas', 'acido hialuronico'] },
    { category: 'maquiagem_unhas', keywords: ['maquiagem', 'batom', 'base facial', 'rimel', 'rímel', 'delineador', 'paleta de sombras', 'esmalte', 'unha postica', 'cabine led unha', 'corretivo', 'po compacto', 'blush'] },
    { category: 'perfumaria_higiene', keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'sabonete', 'escova de dentes', 'fio dental', 'hidratante corporal', 'body splash'] },
    { category: 'barbear_depilacao', keywords: ['barbeador', 'barbeador eletrico', 'maquina de cortar cabelo', 'depilador', 'depilador eletrico', 'lamina de barbear', 'gillette', 'espuma de barbear', 'pos barba', 'aparador de pelos'] },
    { category: 'ingredientes_profissionais', keywords: ['pasta americana', 'corante alimenticio', 'desmoldante', 'essencia', 'emulsificante', 'glucose', 'chantilly', 'cobertura fracionada', 'harald', 'sicao', 'callebaut'] },
    { category: 'formas_utensilios', keywords: ['forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'assadeira bolo', 'manga de confeitar', 'tapete silicone'] },
    { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'caixa bolo', 'caixa doce', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita'] },
    { category: 'festas', keywords: ['artigo de festa', 'decoracao festa', 'decoração festa', 'balao', 'balão', 'bexiga', 'topo de bolo', 'vela aniversario', 'vela aniversário', 'painel festa', 'lembrancinha', 'presente', 'kit festa'] },
    { category: 'quarto', keywords: ['guarda roupa', 'cama box', 'colchao', 'colchão', 'cabeceira', 'comoda', 'cômoda', 'mesa de cabeceira', 'criado mudo', 'beliche'] },
    { category: 'sala_estar', keywords: ['sofa', 'sofá', 'poltrona', 'rack tv', 'painel tv', 'mesa de centro', 'tapete sala', 'cortina sala', 'almofada'] },
    { category: 'sala_jantar', keywords: ['mesa de jantar', 'cadeira de jantar', 'conjunto jantar', 'buffet sala', 'aparador', 'banqueta'] },
    { category: 'escritorio_organizacao', keywords: ['cadeira de escritorio', 'cadeira escritório', 'cadeira gamer', 'mesa escritorio', 'mesa escritório', 'escrivaninha', 'estante livros', 'gaveteiro'] },
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
    { category: 'suplementos', keywords: ['whey', 'creatina', 'suplemento', 'bcaa', 'glutamina', 'pre treino', 'pré treino', 'termogenico', 'vitamina', 'omega 3', 'colageno', 'hipercalorico', 'barra de proteina'] },
    { category: 'treino_funcional', keywords: ['haltere', 'colchonete', 'elastico treino', 'kettlebell', 'corda de pular', 'caneleira', 'barra fixa', 'faixa elastica', 'luva academia', 'tapete yoga', 'roda abdominal'] },
    { category: 'monitoramento_saude', keywords: ['medidor de pressao', 'termometro', 'inalador', 'nebulizador', 'oximetro', 'glicosimetro', 'massageador', 'balanca corporal', 'balança digital bioimpedancia', 'joelheira', 'corretor postural'] },
    { category: 'brinquedos_pedagogicos', keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime', 'bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'mordedor'] },
    { category: 'jogos_tabuleiro', keywords: ['jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'domino', 'baralho', 'xadrez', 'war', 'banco imobiliario'] },
    { category: 'papelaria_escolar', keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel', 'tinta guache'] },
    { category: 'escritorio_envelopamento', keywords: ['plastificadora', 'guilhotina papel', 'perfurador papel', 'grampeador', 'fita crepe', 'envelopamento', 'bobina papel'] }
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
  const targetUrls = [
    'https://www.mercadolivre.com.br/ofertas?container_id=MLB779362-1&page=1',
    'https://www.mercadolivre.com.br/ofertas',
    'https://www.mercadolivre.com.br/ofertas?promotion_type=DEAL_OF_THE_DAY'
  ];

  const deals = [];
  const seenUrls = new Set();

  for (const url of targetUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'WhatsApp/2.24.8.85 i',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      if (!res.ok) continue;

      const html = await res.text();
      // O Mercado Livre coloca atributos como id="..." antes de class="poly-card...",
      // por isso precisamos aceitar qualquer atributo antes de class=["']...
      const cardChunks = html.split(/<(?:div|li)\b[^>]*\bclass=["'][^"']*(?:poly-card\b(?!__)|ui-search-result\b(?!__)|promotion-item\b(?!__))[^"']*["']/i);
      cardChunks.shift(); // Remove header

      for (const chunk of cardChunks) {
        const linkMatch = chunk.match(/<a\s+[^>]*href=["'](https:\/\/[^"'\s]+)["'][^>]*class=["'][^"']*(?:poly-component__title|ui-search-item__title|ui-search-link)[^"']*["']/i) ||
                          chunk.match(/class=["'][^"']*(?:poly-component__title|ui-search-item__title)[^"']*["'][^>]*><a\s+[^>]*href=["'](https:\/\/[^"'\s]+)["']/i) ||
                          chunk.match(/<a\s+[^>]*href=["'](https:\/\/[^"'\s]+)["']/i);
        if (!linkMatch) continue;
        const rawUrl = linkMatch[1].replace(/&amp;/g, '&');
        const cleanUrl = rawUrl.split('#')[0].split('?')[0];
        if (seenUrls.has(cleanUrl)) continue;

        const titleMatch = chunk.match(/class=["'][^"']*(?:poly-component__title|ui-search-item__title)[^"']*["'][^>]*><a[^>]*>([\s\S]*?)<\/a>/i) ||
                           chunk.match(/class=["'][^"']*(?:poly-component__title|ui-search-item__title)[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
                           chunk.match(/aria-label=["']([^"']+)["']/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim() : '';

        let imageUrl = '';
        const imgMatch = chunk.match(/data-src=["'](https?:\/\/[^"'\s]+)["']/i) ||
                         chunk.match(/data-srcset=["'](https?:\/\/[^"'\s,]+)/i) ||
                         chunk.match(/srcset=["'](https?:\/\/[^"'\s,]+)/i) ||
                         chunk.match(/src=["'](https?:\/\/[^"'\s]+mlstatic\.com\/[^"'\s]+)["']/i) ||
                         chunk.match(/class=["'][^"']*(?:poly-component__picture|ui-search-result-image__element)[^"']*["'][\s\S]*?src=["'](https?:\/\/[^"'\s]+)["']/i) ||
                         chunk.match(/(https:\/\/http2\.mlstatic\.com\/D_[^\s"']+)/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
        }

        const ratingMatch = chunk.match(/class=["'][^"']*(?:poly-component__review-compacted|ui-search-reviews)[^"']*["'][\s\S]*?<span[^>]*>([0-9.]+)</i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        let price = '';
        const currentAmountMatch = chunk.match(/class=["'][^"']*(?:poly-price__current|andes-money-amount)[^"']*["'][\s\S]*?aria-label=["']([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i) ||
                                   chunk.match(/class=["'][^"']*poly-price__current[^"']*["'][\s\S]*?class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)</i) ||
                                   chunk.match(/<span\s+class=["'][^"']*andes-money-amount__fraction[^"']*["']>([0-9.]+)<\/span>/i);
        if (currentAmountMatch) {
          const frac = currentAmountMatch[1];
          const centsMatch = chunk.match(/class=["'][^"']*poly-price__current[^"']*["'][\s\S]*?class=["'][^"']*andes-money-amount__cents[^"']*["']>([0-9]{2})</i);
          const cents = centsMatch ? centsMatch[1] : (currentAmountMatch[2] ? currentAmountMatch[2].padStart(2, '0') : '00');
          price = `R$ ${frac},${cents}`;
        }

        let originalPrice = '';
        const prevAmountMatch = chunk.match(/class=["'][^"']*(?:andes-money-amount--previous|andes-money-amount--strike)[^"']*["'][^>]*aria-label=["']Antes:\s*([0-9.]+)\s*reais(?:\s*com\s*([0-9]{1,2})\s*centavos)?["']/i) ||
                                chunk.match(/<s>[\s\S]*?([0-9.,]+)<\/s>/i);
        if (prevAmountMatch) {
          const frac = prevAmountMatch[1];
          const cents = prevAmountMatch[2] ? prevAmountMatch[2].padStart(2, '0') : '00';
          originalPrice = `R$ ${frac},${cents}`;
        }

        const discMatch = chunk.match(/class=["'][^"']*(?:poly-price__discount|polylabel-pill|andes-money-amount__discount|ui-search-price__discount)[^"']*["'][^>]*>([0-9]+)%\s*OFF</i) ||
                          chunk.match(/([0-9]+)%\s*OFF/i);
        const discountPercent = discMatch ? parseInt(discMatch[1], 10) : 0;

        const badgeMatch = chunk.match(/class=["'][^"']*(?:polylabel-fs-xs|ui-search-item__highlight-label)[^"']*["']>([^<]+)</i);
        const badgeText = badgeMatch ? badgeMatch[1].trim() : '';

        if (rawTitle && price && cleanUrl) {
          seenUrls.add(cleanUrl);
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

      if (deals.length >= 24) break;
    } catch (e) {
      console.warn('[Deals Miner Scraper] Erro na URL', url, e.message);
    }
  }

  return deals;
}

async function handleMineDeals(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query?.limit || req.body?.limit || '12', 10), 1), 48);
  const minDiscount = Math.max(parseInt(req.query?.min_discount || req.body?.min_discount || '20', 10), 0);
  const minRating = parseFloat(req.query?.min_rating || req.body?.min_rating || '0');
  const dryRun = req.query?.dry_run === 'true' || req.body?.dry_run === true;
  const targetCategory = req.query?.category || req.body?.category || null;

  try {
    console.log(`[Deals Miner] Iniciando mineração no Mercado Livre (Min ${minDiscount}% OFF, Limite: ${limit})...`);

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
        scraped_count: allDeals.length,
        totalScanned: allDeals.length,
        qualified_count: 0,
        qualifiedCount: 0,
        inserted_count: 0,
        insertedCount: 0,
        duplicate_count: 0,
        ignored_discount_count: allDeals.length,
        deals: [],
        items: []
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        scraped_count: allDeals.length,
        totalScanned: allDeals.length,
        qualified_count: qualified.length,
        qualifiedCount: qualified.length,
        inserted_count: 0,
        candidateDeals: qualified.slice(0, limit),
        items: qualified.slice(0, limit)
      });
    }

    // 3. Query existing products in Supabase to avoid duplicates
    let existingUrls = new Set();
    let existingTitles = new Set();

    try {
      const getRes = await fetch(`${SUPABASE_URL}/rest/v1/fast_affiliate_products?select=id,title,affiliate_url&limit=300`, {
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

    // 4. Select and enrich non-duplicate items
    const dealsToInsert = [];
    let duplicatesSkipped = 0;

    for (const deal of qualified) {
      const cleanUrlNorm = deal.cleanUrl.toLowerCase().split('?')[0].split('#')[0];
      const titleNorm = deal.title.toLowerCase().trim();

      if (existingUrls.has(cleanUrlNorm) || existingTitles.has(titleNorm)) {
        duplicatesSkipped++;
        continue;
      }

      // Se a imagem estiver vazia ou com placeholder, busca a página do produto para extrair foto oficial em alta resolução
      let finalImg = deal.imageUrl;
      let finalCoupon = '';
      if (!finalImg || !finalImg.startsWith('http')) {
        try {
          const { fetchProductDetails } = require('../check-affiliate-links');
          const details = await fetchProductDetails(deal.cleanUrl);
          if (details && details.image_url) {
            finalImg = details.image_url;
          }
          if (details && details.coupon_code) {
            finalCoupon = details.coupon_code;
          }
        } catch (fetchErr) {
          console.warn('[Deals Miner] Fallback fetch de imagem:', fetchErr.message);
        }
      }

      // Determine smart badge & color
      let discountTag = deal.discountTag || (deal.discountPercent > 0 ? `${deal.discountPercent}% OFF` : '');
      let badgeColor = 'orange';

      if (deal.discountPercent >= 50) {
        badgeColor = 'blue';
      } else if (deal.badgeText && deal.badgeText.toUpperCase().includes('MAIS VENDIDO')) {
        badgeColor = 'orange';
      } else if (deal.discountPercent >= 35) {
        badgeColor = 'pink';
      } else {
        badgeColor = 'rose';
      }

      dealsToInsert.push({
        title: deal.title,
        description: deal.badgeText ? `🔸 ${deal.badgeText} no Mercado Livre` : null,
        affiliate_url: deal.cleanUrl,
        image_url: finalImg || '',
        price_display: deal.price,
        original_price: deal.originalPrice || null,
        category: deal.category || 'cozinha',
        discount_tag: discountTag || null,
        coupon_code: finalCoupon || null,
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
        scraped_count: allDeals.length,
        totalScanned: allDeals.length,
        qualified_count: qualified.length,
        qualifiedCount: qualified.length,
        inserted_count: 0,
        insertedCount: 0,
        duplicate_count: duplicatesSkipped,
        ignored_discount_count: allDeals.length - qualified.length,
        skippedDuplicates: true,
        deals: [],
        items: []
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
      scraped_count: allDeals.length,
      totalScanned: allDeals.length,
      qualified_count: qualified.length,
      qualifiedCount: qualified.length,
      inserted_count: dealsToInsert.length,
      insertedCount: dealsToInsert.length,
      duplicate_count: duplicatesSkipped,
      ignored_discount_count: allDeals.length - qualified.length,
      deals: insertedData,
      items: dealsToInsert
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
