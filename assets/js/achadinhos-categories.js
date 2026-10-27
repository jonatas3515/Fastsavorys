/**
 * FastSavory's - Módulo Central de Categorias de Achadinhos (Compartilhado)
 * Gerencia a árvore de categorias dinâmicas, aliases, sincronização com Supabase e renderização.
 */

window.AchadinhosCategories = (function () {
  const STORAGE_KEY = 'fast_achadinhos_categories_v7';
  const VERSION_KEY = 'fast_achadinhos_categories_version';

  // Árvore Padrão (8 Macro Grupos e Subcategorias Otimizadas)
  const DEFAULT_TREE = [
    {
      id: 'group_supermercado_festas',
      label: 'Supermercado, Confeitaria & Festas',
      icon: '🛒',
      subcategories: [
        { slug: 'alimentos_basicos', label: 'Alimentos Básicos & Grãos', aliases: ['alimentos_basicos_graos', 'mercearia_salgada'] },
        { slug: 'molhos_temperos', label: 'Molhos, Temperos & Conservas', aliases: ['molhos_temperos_conservas'] },
        { slug: 'bebidas_snacks', label: 'Bebidas & Snacks', aliases: ['supermercado'] },
        { slug: 'limpeza_organizacao', label: 'Limpeza e Organização', aliases: ['limpeza', 'organizacao_limpeza'] },
        { slug: 'confeitaria_sobremesas', label: 'Confeitaria & Sobremesas', aliases: ['mercearia_doce'] },
        { slug: 'ingredientes_profissionais', label: 'Ingredientes Profissionais', aliases: [] },
        { slug: 'embalagens', label: 'Embalagens & Descartáveis', aliases: [] },
        { slug: 'festas', label: 'Artigos de Festa & Decoração', aliases: ['presentes'] }
      ]
    },
    {
      id: 'group_casa',
      label: 'Cozinha',
      icon: '🍳',
      subcategories: [
        { slug: 'eletros', label: 'Eletros', aliases: ['eletroportateis', 'eletrodomesticos', 'grandes_eletros', 'cozinha', 'eletroportateis_cozinha', 'fogao', 'microondas'] },
        { slug: 'formas_utensilios', label: 'Formas e Maquinários', aliases: ['formas_maquinarios', 'confeitaria'] },
        { slug: 'facas_faqueiros', label: 'Facas, Faqueiros e Afins', aliases: ['faqueiros', 'facas', 'faca_chef', 'jogo_facas'] },
        { slug: 'panelas_loucas_copos', label: 'Panelas, Louças & Copos', aliases: ['panelas', 'loucas', 'copos'] },
        { slug: 'cafe_cha_expresso', label: 'Café, Chá & Expresso', aliases: ['cafe', 'cafeteira', 'cha_expresso'] },
        { slug: 'utensilios_domesticos', label: 'Utensílios Domésticos', aliases: ['utensilios', 'organizacao', 'utilidades', 'decoracao_basica'] }
      ]
    },
    {
      id: 'group_moveis_eletros',
      label: 'Móveis, TV & Climatização',
      icon: '🛋️',
      subcategories: [
        { slug: 'sala_estar', label: 'Sala de Estar', aliases: [] },
        { slug: 'quarto', label: 'Quarto', aliases: [] },
        { slug: 'sala_jantar', label: 'Sala de Jantar', aliases: [] },
        { slug: 'escritorio_organizacao', label: 'Escritório & Organização', aliases: [] },
        { slug: 'decoracao_iluminacao', label: 'Decoração & Iluminação', aliases: ['decoracao_basica', 'iluminacao', 'quadros', 'luminarias'] },
        { slug: 'cama_mesa_banho', label: 'Cama, Mesa & Banho', aliases: ['banho', 'mesa'] },
        { slug: 'tv_audio_video', label: 'TVs, Áudio & Vídeo', aliases: ['tv', 'audio_video'] },
        { slug: 'climatizacao', label: 'Climatização & Ar-Condicionado', aliases: ['ar_condicionado'] },
        { slug: 'ventiladores', label: 'Ventiladores', aliases: ['ventilador', 'circuladores'] },
        { slug: 'lavagem_secagem', label: 'Lavagem & Secagem', aliases: ['lavanderia'] },
        { slug: 'aspiradores_limpeza', label: 'Aspiradores & Limpeza', aliases: ['robo_aspiradores_de_po', 'aspiradores', 'extratoras', 'aspirador'] }
      ]
    },
    {
      id: 'group_beleza_saude',
      label: 'Beleza, Saúde & Bem-Estar',
      icon: '💄',
      subcategories: [
        { slug: 'cabelos', label: 'Cabelos', aliases: ['cabelo'] },
        { slug: 'pele_rosto', label: 'Cuidados com a Pele & Rosto', aliases: ['pele', 'rosto'] },
        { slug: 'maquiagem_unhas', label: 'Maquiagem & Unhas', aliases: ['maquiagem', 'unhas'] },
        { slug: 'perfumaria_higiene', label: 'Perfumaria & Higiene', aliases: ['beleza', 'perfumaria', 'higiene', 'higiene_pessoal'] },
        { slug: 'barbear_depilacao', label: 'Barbear & Depilação', aliases: ['barbear', 'depilacao', 'barba'] },
        { slug: 'suplementos', label: 'Suplementos & Nutrição', aliases: [] },
        { slug: 'treino_funcional', label: 'Treino & Equipamentos Funcionais', aliases: ['fitness'] },
        { slug: 'esportes_lazer', label: 'Esportes & Lazer', aliases: ['esportes_e_lazer', 'lazer'] },
        { slug: 'monitoramento_saude', label: 'Monitoramento & Saúde', aliases: ['saude'] }
      ]
    },
    {
      id: 'group_tech',
      label: 'Tecnologia & Celulares',
      icon: '⚡',
      subcategories: [
        { slug: 'celulares', label: 'Celulares & Smartphones', aliases: [] },
        { slug: 'smart_home', label: 'Smart Home & Segurança', aliases: [] },
        { slug: 'informatica', label: 'Informática & Periféricos', aliases: [] },
        { slug: 'audio_gadgets', label: 'Áudio Portátil & Instrumentos', aliases: ['eletronicos', 'instrumentos_musicais'] },
        { slug: 'pilhas_baterias', label: 'Pilhas, Baterias & Carregadores', aliases: ['pilhas', 'carregador_pilhas', 'baterias', 'pilha'] }
      ]
    },
    {
      id: 'group_games_infantil',
      label: 'Games, Brinquedos & Papelaria',
      icon: '🎮',
      subcategories: [
        { slug: 'consoles', label: 'Consoles & Aparelhos', aliases: ['games'] },
        { slug: 'jogos_midias', label: 'Jogos & Mídias Digitais', aliases: [] },
        { slug: 'controles_acessorios_gamer', label: 'Controles & Acessórios Gamer', aliases: [] },
        { slug: 'colecionaveis_geek', label: 'Colecionáveis & Universo Geek', aliases: [] },
        { slug: 'bebes_cuidados', label: 'Bebês & Primeiros Passos', aliases: ['bebes', 'puericultura', 'fraldas'] },
        { slug: 'brinquedos_pedagogicos', label: 'Brinquedos & Pedagógicos', aliases: ['brinquedos'] },
        { slug: 'jogos_tabuleiro', label: 'Jogos de Cartas, Tabuleiro & Família', aliases: ['jogos', 'tabuleiro', 'cartas', 'baralho', 'uno', 'domino'] },
        { slug: 'livros_leitura', label: 'Livros, Bíblias & Leitura', aliases: ['livros_e_revistas', 'livros', 'biblia'] },
        { slug: 'papelaria_escolar', label: 'Papelaria & Material de Escritório', aliases: ['papelaria', 'escritorio_envelopamento', 'envelopamento', 'material_escritorio'] }
      ]
    },
    {
      id: 'group_moda',
      label: 'Moda & Acessórios',
      icon: '👗',
      subcategories: [
        { slug: 'roupas', label: 'Roupas', aliases: ['moda'] },
        { slug: 'calcados', label: 'Calçados', aliases: [] },
        { slug: 'bolsas_malas', label: 'Bolsas, Mochilas & Malas', aliases: ['acessorios'] },
        { slug: 'relogios_oculos', label: 'Relógios & Óculos', aliases: ['joias', 'chapeus_bones_e_gorros'] }
      ]
    },
    {
      id: 'group_outros',
      label: 'Ferramentas, Auto & Pet',
      icon: '🛠️',
      subcategories: [
        { slug: 'ferramentas', label: 'Ferramentas Elétricas & Manuais', aliases: ['construcao', 'ferramentas_manuais', 'ferramentas_eletricas'] },
        { slug: 'construcao_eletrica', label: 'Construção, Elétrica & Hidráulica', aliases: ['casa_construcao', 'eletrica'] },
        { slug: 'automotivo', label: 'Automotivo & Moto', aliases: ['veiculos'] },
        { slug: 'petshop', label: 'Pet Shop', aliases: [] }
      ]
    }
  ];

  let currentTree = null;
  let currentVersion = 0;

  /**
   * Clona a árvore padrão para evitar mutações acidentais
   */
  function getDefaultTree() {
    return JSON.parse(JSON.stringify(DEFAULT_TREE));
  }

  /**
   * Obtém a árvore ativa em memória ou cache local
   */
  function getTree() {
    if (currentTree && Array.isArray(currentTree) && currentTree.length > 0) {
      return currentTree;
    }

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          currentTree = parsed;
          return currentTree;
        }
      }
    } catch (e) {
      console.warn('[AchadinhosCategories] Erro ao ler do localStorage:', e);
    }

    currentTree = getDefaultTree();
    return currentTree;
  }

  let remoteColumnDisabled = false;

  /**
   * Carrega categorias do Supabase com stale-while-revalidate
   */
  async function loadCategories(force = false) {
    // 1. Garante que temos pelo menos o cache local carregado
    getTree();

    if (remoteColumnDisabled) return getTree();

    // 2. Busca do Supabase em background (silencioso)
    try {
      if (window.supabaseClient) {
        const { data, error } = await window.supabaseClient
          .from('fast_store_config')
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        if (error || !data) {
          remoteColumnDisabled = true;
          return getTree();
        }

        if (data && data.affiliate_categories) {
          let remoteData = data.affiliate_categories;
          if (typeof remoteData === 'string') {
            try { remoteData = JSON.parse(remoteData); } catch (err) {}
          }

          if (remoteData && (Array.isArray(remoteData) || remoteData.tree)) {
            const tree = Array.isArray(remoteData) ? remoteData : remoteData.tree;
            const version = remoteData.version || new Date(data.updated_at || Date.now()).getTime();

            if (Array.isArray(tree) && tree.length > 0) {
              currentTree = tree;
              currentVersion = version;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
              localStorage.setItem(VERSION_KEY, String(version));
              return currentTree;
            }
          }
        }
      }
    } catch (e) {
      remoteColumnDisabled = true;
    }

    return getTree();
  }

  /**
   * Salva a árvore no Supabase e atualiza o cache local
   */
  async function saveTree(tree) {
    if (!Array.isArray(tree) || tree.length === 0) {
      throw new Error('A árvore de categorias não pode estar vazia.');
    }

    currentTree = JSON.parse(JSON.stringify(tree));
    currentVersion = Date.now();

    // 1. Salva no localStorage imediatamente
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentTree));
    localStorage.setItem(VERSION_KEY, String(currentVersion));

    // 2. Salva no Supabase (fast_store_config)
    if (window.supabaseClient && !remoteColumnDisabled) {
      const payload = {
        affiliate_categories: {
          version: currentVersion,
          tree: currentTree
        },
        updated_at: new Date().toISOString()
      };

      try {
        const { error } = await window.supabaseClient
          .from('fast_store_config')
          .update(payload)
          .eq('id', 1);

        if (error) {
          remoteColumnDisabled = true;
        }
      } catch (err) {
        remoteColumnDisabled = true;
      }
    }

    return currentTree;
  }

  /**
   * Retorna um mapa de slug -> label (incluindo aliases legados)
   */
  function getCategoryMap() {
    const tree = getTree();
    const map = {};

    tree.forEach(group => {
      (group.subcategories || []).forEach(sub => {
        map[sub.slug] = `${group.icon ? group.icon + ' ' : ''}${sub.label}`;
        if (Array.isArray(sub.aliases)) {
          sub.aliases.forEach(alias => {
            if (!map[alias]) {
              map[alias] = `${group.icon ? group.icon + ' ' : ''}${sub.label}`;
            }
          });
        }
      });
    });

    return map;
  }

  /**
   * Retorna os Macro Grupos no formato esperado pelo achadinhos.js
   */
  function getMacroGroups() {
    const tree = getTree();
    const groups = {};

    tree.forEach(group => {
      const allSlugs = [];
      (group.subcategories || []).forEach(sub => {
        allSlugs.push(sub.slug);
        if (Array.isArray(sub.aliases)) {
          allSlugs.push(...sub.aliases);
        }
      });

      groups[group.id] = {
        label: group.label,
        icon: group.icon || '📂',
        categories: allSlugs
      };
    });

    // Mapeamento retrocompatível para IDs de grupos legados
    const legacyMap = {
      group_supermercado: 'group_supermercado_festas',
      group_festas: 'group_supermercado_festas',
      group_beleza: 'group_beleza_saude',
      group_saude: 'group_beleza_saude',
      group_games: 'group_games_infantil',
      group_infantil: 'group_games_infantil',
      group_moveis: 'group_moveis_eletros',
      group_eletros: 'group_moveis_eletros'
    };

    Object.keys(legacyMap).forEach(oldId => {
      const newId = legacyMap[oldId];
      if (groups[newId] && !groups[oldId]) {
        groups[oldId] = groups[newId];
      }
    });

    return groups;
  }

  /**
   * Popula qualquer elemento <select> com os optgroups e options da árvore
   */
  function populateSelect(selectEl, selectedValue = '', options = {}) {
    if (!selectEl) return;
    const tree = getTree();

    let html = '';
    if (options.includeAll) {
      html += `<option value="all">🏷️ Todas as Categorias</option>`;
    }
    if (options.includeUncategorized) {
      html += `<option value="sem_categoria">⚠️ Sem Categoria (Início)</option>`;
    }
    if (options.includeFastPicks) {
      html += `<option value="fast_picks">✨ Testados Fast</option>`;
    }

    tree.forEach(group => {
      html += `<optgroup label="${escapeHtml(group.icon || '')} ${escapeHtml(group.label)}">`;
      if (options.includeGroupMacroOption) {
        html += `<option value="${escapeHtml(group.id)}">${escapeHtml(group.icon || '')} Ver Tudo de ${escapeHtml(group.label)}</option>`;
      }
      (group.subcategories || []).forEach(sub => {
        html += `<option value="${escapeHtml(sub.slug)}">${escapeHtml(sub.label)}</option>`;
      });
      html += `</optgroup>`;
    });

    selectEl.innerHTML = html;
    if (selectedValue) {
      selectEl.value = selectedValue;
    }
  }

  /**
   * Helper para gerar um slug limpo a partir de um texto
   */
  function generateSlug(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'nova_categoria';
  }

  /**
   * Verifica quantos produtos utilizam um determinado slug
   */
  function countProductsInSlug(slug, productsList = []) {
    if (!slug || !Array.isArray(productsList)) return 0;
    return productsList.filter(p => p.category === slug).length;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    getTree,
    loadCategories,
    saveTree,
    getDefaultTree,
    getCategoryMap,
    getMacroGroups,
    populateSelect,
    generateSlug,
    countProductsInSlug,
    escapeHtml
  };
})();
