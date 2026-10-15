/**
 * FastSavory's - Admin Módulo de Achadinhos & Afiliados
 */

window.AffiliatesModule = (function () {
  let productsList = [];
  let editingId = null;
  let searchQuery = '';
  let categoryFilter = 'all';
  let statusFilter = 'all';
  let adminCurrentPage = 1;
  const ADMIN_ITEMS_PER_PAGE = 100;

  async function loadProducts() {
    const tbody = document.getElementById('affiliateAdminTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-500">Carregando achadinhos...</td></tr>`;
    }

    if (window.AchadinhosCategories) {
      await window.AchadinhosCategories.loadCategories();
      populateCategorySelects();
    }

    try {
      if (window.supabaseClient) {
        const { data, error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .select('*')
          .order('position', { ascending: true });

        if (!error && data) {
          productsList = data;
        } else {
          // Fallback inicial
          productsList = window.DEFAULT_AFFILIATE_PRODUCTS || [];
        }
      } else {
        productsList = window.DEFAULT_AFFILIATE_PRODUCTS || [];
      }
    } catch (e) {
      console.warn('[Admin Affiliates] Erro ao buscar produtos:', e);
      productsList = window.DEFAULT_AFFILIATE_PRODUCTS || [];
    }

    renderTable();
  }

  function populateCategorySelects() {
    if (!window.AchadinhosCategories) return;
    const catInput = document.getElementById('affiliateCategoryInput');
    if (catInput) {
      const cur = catInput.value || '';
      window.AchadinhosCategories.populateSelect(catInput, cur);
    }
    const filterSelect = document.getElementById('affiliateAdminCategoryFilter');
    if (filterSelect) {
      const curFilter = filterSelect.value || 'all';
      window.AchadinhosCategories.populateSelect(filterSelect, curFilter, {
        includeAll: true,
        includeUncategorized: true,
        includeFastPicks: true
      });
    }
  }

  function handleSearch(val) {
    searchQuery = (val || '').toLowerCase().trim();
    adminCurrentPage = 1;
    renderTable();
  }

  function handleCategoryFilter(val) {
    categoryFilter = val || 'all';
    adminCurrentPage = 1;
    renderTable();
  }

  function handleStatusFilter(val) {
    statusFilter = val || 'all';
    adminCurrentPage = 1;
    if (statusFilter === 'recent50' && searchQuery) {
      searchQuery = '';
      const sInput = document.getElementById('affiliateAdminSearchInput');
      if (sInput) sInput.value = '';
    }
    renderTable();
  }

  function clearFilters() {
    searchQuery = '';
    categoryFilter = 'all';
    statusFilter = 'all';
    adminCurrentPage = 1;
    const sInput = document.getElementById('affiliateAdminSearchInput');
    const cSelect = document.getElementById('affiliateAdminCategoryFilter');
    const stSelect = document.getElementById('affiliateAdminStatusFilter');
    if (sInput) sInput.value = '';
    if (cSelect) cSelect.value = 'all';
    if (stSelect) stSelect.value = 'all';
    renderTable();
  }

  function goToPage(page) {
    adminCurrentPage = page;
    renderTable();
    const tableEl = document.getElementById('affiliateAdminTableBody');
    if (tableEl) {
      tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function formatLastUpdated(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `Atualizado em ${day}/${month}/${year} às ${hours}h${minutes}`;
    } catch (e) {
      return '';
    }
  }

  function isItemUncategorized(item) {
    if (!item.category || item.category === '' || item.category === 'sem_categoria') return true;
    if (window.AchadinhosCategories) {
      const categoryMap = window.AchadinhosCategories.getCategoryMap();
      if (categoryMap && Object.keys(categoryMap).length > 0 && !categoryMap[item.category]) {
        return true;
      }
    }
    return false;
  }

  function matchesCategoryFilter(item, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'fast_picks') {
      return Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
    }
    if (filter === 'sem_categoria') {
      return isItemUncategorized(item);
    }
    if (filter.startsWith('group_')) {
      const macroGroups = window.AchadinhosCategories ? window.AchadinhosCategories.getMacroGroups() : {};
      const group = macroGroups[filter];
      return group ? (group.categories || []).includes(item.category) : false;
    }
    // Subcategoria específica ou alias
    if (item.category === filter) return true;
    if (window.AchadinhosCategories) {
      const tree = window.AchadinhosCategories.getTree();
      for (const g of tree) {
        const sub = (g.subcategories || []).find(s => s.slug === filter);
        if (sub && Array.isArray(sub.aliases) && sub.aliases.includes(item.category)) {
          return true;
        }
      }
    }
    return false;
  }

  function getFilteredProducts() {
    // Filtro Especial: 50 Últimos Adicionados (ordenados pelos mais novos)
    if (statusFilter === 'recent50') {
      return productsList
        .slice()
        .sort((a, b) => {
          const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
          const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
          if (dateA !== dateB) return dateB - dateA;
          return (Number(b.id) || 0) - (Number(a.id) || 0);
        })
        .filter(item => {
          const matchCat = matchesCategoryFilter(item, categoryFilter);
          const matchSearch = !searchQuery || 
            (item.title && item.title.toLowerCase().includes(searchQuery)) ||
            (item.description && item.description.toLowerCase().includes(searchQuery)) ||
            (item.category && item.category.toLowerCase().includes(searchQuery)) ||
            (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

          return matchCat && matchSearch;
        })
        .slice(0, 50);
    }

    // Filtro Especial: 📥 Sugestões da IA (Mineração)
    if (statusFilter === 'suggestions') {
      return productsList.filter(item => {
        const isSuggestion = item.is_ai_suggestion === true || item.source === 'miner' || (item.badge_color === 'purple' && item.is_active === false);
        const matchCat = matchesCategoryFilter(item, categoryFilter);
        const matchSearch = !searchQuery || 
          (item.title && item.title.toLowerCase().includes(searchQuery)) ||
          (item.description && item.description.toLowerCase().includes(searchQuery)) ||
          (item.category && item.category.toLowerCase().includes(searchQuery)) ||
          (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

        return isSuggestion && matchCat && matchSearch;
      });
    }

    // Filtro Especial: 🕒 Preço Mais Desatualizado (Antigos Primeiro)
    if (statusFilter === 'oldest_updated') {
      return productsList
        .slice()
        .sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || '1970-01-01').getTime();
          const dateB = new Date(b.updated_at || b.created_at || '1970-01-01').getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        })
        .filter(item => {
          const matchCat = matchesCategoryFilter(item, categoryFilter);
          const matchSearch = !searchQuery || 
            (item.title && item.title.toLowerCase().includes(searchQuery)) ||
            (item.description && item.description.toLowerCase().includes(searchQuery)) ||
            (item.category && item.category.toLowerCase().includes(searchQuery)) ||
            (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

          return matchCat && matchSearch;
        });
    }

    // Filtro Especial: 🕒 Preço Mais Recente (Novos Primeiro)
    if (statusFilter === 'newest_updated') {
      return productsList
        .slice()
        .sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || '1970-01-01').getTime();
          const dateB = new Date(b.updated_at || b.created_at || '1970-01-01').getTime();
          if (dateA !== dateB) return dateB - dateA;
          return (Number(b.id) || 0) - (Number(a.id) || 0);
        })
        .filter(item => {
          const matchCat = matchesCategoryFilter(item, categoryFilter);
          const matchSearch = !searchQuery || 
            (item.title && item.title.toLowerCase().includes(searchQuery)) ||
            (item.description && item.description.toLowerCase().includes(searchQuery)) ||
            (item.category && item.category.toLowerCase().includes(searchQuery)) ||
            (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

          return matchCat && matchSearch;
        });
    }

    const result = productsList.filter(item => {
      const matchCat = matchesCategoryFilter(item, categoryFilter);
      const matchStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && item.is_active !== false) ||
        (statusFilter === 'paused' && item.is_active === false) ||
        (statusFilter === 'platform_amazon' && detectPlatform(item.affiliate_url).id === 'amazon') ||
        (statusFilter === 'platform_shopee' && detectPlatform(item.affiliate_url).id === 'shopee') ||
        (statusFilter === 'platform_natura' && detectPlatform(item.affiliate_url).id === 'natura') ||
        (statusFilter === 'platform_avon' && detectPlatform(item.affiliate_url).id === 'avon') ||
        (statusFilter === 'platform_mercadolivre' && detectPlatform(item.affiliate_url).id === 'mercadolivre');
      const matchSearch = !searchQuery || 
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.description && item.description.toLowerCase().includes(searchQuery)) ||
        (item.category && item.category.toLowerCase().includes(searchQuery)) ||
        (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

      return matchCat && matchStatus && matchSearch;
    });

    // Ordenação: Itens SEM CATEGORIA no início (topo), e os demais agrupados por categoria
    return result.sort((a, b) => {
      const isUncatA = isItemUncategorized(a);
      const isUncatB = isItemUncategorized(b);

      if (isUncatA && !isUncatB) return -1;
      if (!isUncatA && isUncatB) return 1;

      const catA = (a.category || '').trim().toLowerCase();
      const catB = (b.category || '').trim().toLowerCase();

      if (catA !== catB) {
        return catA.localeCompare(catB);
      }

      return (Number(a.position) || 0) - (Number(b.position) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  }

  function detectPlatform(url = '') {
    const u = (url || '').toLowerCase();
    if (u.includes('amazon') || u.includes('amzn') || /(?:^|\/\/|\.)a\.co(?:\/|$)/.test(u) || u.includes('amzlinks')) {
      return { id: 'amazon', name: 'Amazon', icon: '📦', badge: 'bg-amber-100 text-amber-900 border-amber-300' };
    }
    if (u.includes('shopee') || u.includes('s.shopee') || u.includes('shope.ee')) {
      return { id: 'shopee', name: 'Shopee', icon: '🧡', badge: 'bg-orange-100 text-orange-900 border-orange-300' };
    }
    if (u.includes('natura') || u.includes('sovsls') || (u.includes('scvald') && !u.includes('avon'))) {
      return { id: 'natura', name: 'Natura', icon: '🌿', badge: 'bg-orange-100 text-orange-900 border-orange-300' };
    }
    if (u.includes('avon')) {
      return { id: 'avon', name: 'Avon', icon: '💄', badge: 'bg-rose-100 text-rose-900 border-rose-300' };
    }
    return { id: 'mercadolivre', name: 'Mercado Livre', icon: '💛', badge: 'bg-yellow-100 text-yellow-900 border-yellow-300' };
  }

  function renderTable() {
    const tbody = document.getElementById('affiliateAdminTableBody');
    const paginationContainer = document.getElementById('affiliatePaginationContainer');
    const paginationRange = document.getElementById('affiliatePaginationRange');
    const paginationTotal = document.getElementById('affiliatePaginationTotal');
    const paginationNav = document.getElementById('affiliatePaginationNav');

    if (!tbody) return;

    if (productsList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400">
            Nenhum achadinho cadastrado ainda. Clique em "➕ Novo Achadinho" para começar.
          </td>
        </tr>
      `;
      if (paginationContainer) paginationContainer.classList.add('hidden');
      return;
    }

    const filtered = getFilteredProducts();

    const bannerEl = document.getElementById('affiliateActiveFilterBanner');
    if (bannerEl) {
      if (statusFilter === 'recent50') {
        bannerEl.className = 'mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900 shadow-xs animate-fade-in';
        bannerEl.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-base">🆕</span>
            <div>
              <strong class="font-bold">Filtro Ativo:</strong> Exibindo os <strong>50 produtos mais recentemente adicionados</strong> (${filtered.length} encontrados), ordenados do mais novo para o mais antigo.
            </div>
          </div>
          <button type="button" onclick="AffiliatesModule.clearFilters()" class="text-amber-800 hover:text-amber-950 font-bold underline ml-3 whitespace-nowrap">✕ Limpar Filtro</button>
        `;
      } else if (statusFilter === 'suggestions') {
        bannerEl.className = 'mb-3 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between text-xs text-purple-900 shadow-xs animate-fade-in';
        bannerEl.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-base">📥</span>
            <div>
              <strong class="font-bold">Sugestões da IA:</strong> Exibindo produtos minerados (${filtered.length} encontrados).
            </div>
          </div>
          <button type="button" onclick="AffiliatesModule.clearFilters()" class="text-purple-800 hover:text-purple-950 font-bold underline ml-3 whitespace-nowrap">✕ Limpar Filtro</button>
        `;
      } else {
        bannerEl.className = 'hidden mb-3';
        bannerEl.innerHTML = '';
      }
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400">
            Nenhum achadinho encontrado para os filtros selecionados.
            <button onclick="AffiliatesModule.clearFilters()" class="ml-2 text-yellow-600 underline font-semibold">Limpar Filtros</button>
          </td>
        </tr>
      `;
      if (paginationContainer) paginationContainer.classList.add('hidden');
      return;
    }

    // Paginação de 100 em 100
    const totalPages = Math.ceil(filtered.length / ADMIN_ITEMS_PER_PAGE) || 1;
    if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
    if (adminCurrentPage < 1) adminCurrentPage = 1;

    const startIndex = (adminCurrentPage - 1) * ADMIN_ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ADMIN_ITEMS_PER_PAGE, filtered.length);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (paginationContainer) {
      paginationContainer.classList.remove('hidden');
      if (paginationRange) paginationRange.textContent = `${startIndex + 1}-${endIndex}`;
      if (paginationTotal) paginationTotal.textContent = filtered.length;

      if (paginationNav) {
        let navHtml = '';
        
        // Botão Anterior
        navHtml += `
          <button type="button" onclick="AffiliatesModule.goToPage(${adminCurrentPage - 1})"
                  ${adminCurrentPage === 1 ? 'disabled class="px-2.5 py-1 text-xs text-gray-300 cursor-not-allowed rounded border border-gray-200"' : 'class="px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-300 font-bold transition"'}>
            ‹ Anterior
          </button>
        `;

        // Abas Numéricas (1, 2, 3...)
        for (let p = 1; p <= totalPages; p++) {
          if (p === 1 || p === totalPages || (p >= adminCurrentPage - 2 && p <= adminCurrentPage + 2)) {
            const isActive = p === adminCurrentPage;
            navHtml += `
              <button type="button" onclick="AffiliatesModule.goToPage(${p})"
                      class="px-3 py-1 text-xs font-bold rounded-lg transition ${isActive ? 'bg-yellow-400 text-gray-950 shadow-sm border border-yellow-500 scale-105' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}">
                ${p}
              </button>
            `;
          } else if (p === adminCurrentPage - 3 || p === adminCurrentPage + 3) {
            navHtml += `<span class="px-1 text-gray-400 font-bold">...</span>`;
          }
        }

        // Botão Próximo
        navHtml += `
          <button type="button" onclick="AffiliatesModule.goToPage(${adminCurrentPage + 1})"
                  ${adminCurrentPage === totalPages ? 'disabled class="px-2.5 py-1 text-xs text-gray-300 cursor-not-allowed rounded border border-gray-200"' : 'class="px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-300 font-bold transition"'}>
            Próximo ›
          </button>
        `;

        paginationNav.innerHTML = navHtml;
      }
    }

    tbody.innerHTML = paginatedItems.map((item, index) => {
      const absoluteIdx = startIndex + index + 1;
      const activeBadge = item.is_active 
        ? `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Ativo</span>`
        : `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Pausado</span>`;

      const categoryMap = window.AchadinhosCategories ? window.AchadinhosCategories.getCategoryMap() : {};
      
      const isUncategorized = isItemUncategorized(item);
      const catLabel = isUncategorized 
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">⚠️ Sem Categoria</span>`
        : (categoryMap[item.category] || item.category || 'Geral');

      const pct = calcDiscountPercent(item.original_price, item.price_display);
      const rawDisc = (item.discount_tag || '').trim();
      let formattedDisc = '';
      if (/no pix c(om|\/)?\s*cupom/i.test(rawDisc)) {
        formattedDisc = pct > 0 ? `🔥 ${pct}% OFF no Pix c/ Cupom` : `🔥 No Pix c/ Cupom`;
      } else if (/no pix/i.test(rawDisc)) {
        formattedDisc = pct > 0 ? `🔥 ${pct}% OFF no Pix` : `🔥 No Pix`;
      } else if (/c(om|\/)?\s*cupom/i.test(rawDisc)) {
        formattedDisc = pct > 0 ? `🔥 ${pct}% OFF c/ Cupom` : `🔥 Com Cupom`;
      } else if (pct > 0) {
        formattedDisc = `🔥 ${pct}% OFF`;
      } else if (rawDisc && (/off/i.test(rawDisc) || /^\d+%/.test(rawDisc))) {
        formattedDisc = `🔥 ${rawDisc}`;
      }

      const discountBadge = formattedDisc 
        ? `<span class="inline-block text-[10px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded mt-0.5 shadow-sm">${escapeHtml(formattedDisc)}</span>` 
        : '';

      const platformInfo = detectPlatform(item.affiliate_url);
      const platformBadge = `<span class="inline-flex items-center gap-1 text-[10px] ${platformInfo.badge} font-bold px-1.5 py-0.2 rounded border">${platformInfo.icon} ${platformInfo.name}</span>`;

      const isPrime = Boolean(item.is_prime);
      const primeBadge = isPrime
        ? `<span class="inline-flex items-center gap-0.5 text-[10px] bg-[#00a8e1] text-white font-black px-1.5 py-0.2 rounded shadow-2xs" title="Produto Amazon Prime">✓ prime</span>`
        : '';

      const isImported = Boolean(item.is_imported);
      const importedBadge = isImported
        ? `<span class="inline-flex items-center gap-1 text-[10px] bg-slate-900 text-cyan-300 font-bold px-1.5 py-0.2 rounded border border-slate-700 shadow-2xs" title="Produto Importado / Compra Internacional">✈️ Importado</span>`
        : '';

      const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
      const fastPickBadge = isFastPick
        ? `<span class="inline-flex items-center gap-1 text-[10px] bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white font-black px-2 py-0.5 rounded-full shadow-xs">✨ Selo Fast</span>`
        : '';

      // Tag de destaque oficial (apenas se houver badge_tag cadastrado)
      let customTagText = item.badge_tag ? item.badge_tag.trim() : '';
      if (customTagText === 'none' || customTagText === 'null') {
        customTagText = '';
      }

      // Resolução inteligente de cor do selo (respeitando os presets oficiais)
      let resolvedColor = item.badge_color || 'orange';
      const normTag = customTagText.toLowerCase();
      if (normTag.includes('escolha da amazon') || normTag.includes("amazon's choice")) resolvedColor = 'black';
      else if (normTag.includes('menor preco') || normTag.includes('menor preço')) resolvedColor = 'rose';
      else if (normTag.includes('indicado')) resolvedColor = 'orange';
      else if (normTag === 'oferta' || (normTag.includes('oferta') && !normTag.includes('imperd'))) resolvedColor = 'pink';
      else if (normTag.includes('imperd') || normTag.includes('oferta imperdivel')) resolvedColor = 'blue';
      else if (normTag.includes('mais vendido')) resolvedColor = 'orange';
      else if (normTag.includes('buscado')) resolvedColor = 'purple';
      else if (normTag.includes('pratico') || normTag.includes('prático')) resolvedColor = 'amber';
      else if (normTag.includes('loja oficial') || normTag.includes('oficial')) resolvedColor = 'black';
      else if (normTag.includes('relampago') || normTag.includes('relâmpago') || resolvedColor === 'flash_deal') resolvedColor = 'flash_deal';

      let displayTagText = customTagText;
      if (customTagText.toLowerCase() === 'oferta' || customTagText.toLowerCase() === '🌸 oferta') {
        displayTagText = '🩷 Oferta';
      } else if (customTagText.toLowerCase() === 'indicado' || customTagText.toLowerCase() === 'indicado (laranja)') {
        displayTagText = '🟠 Indicado';
      }

      let badgeStyle = 'bg-orange-100 text-orange-950 border-orange-300 font-bold';
      if (resolvedColor === 'flash_deal') badgeStyle = 'bg-red-100 text-red-900 border-red-300 font-black animate-pulse';
      if (resolvedColor === 'amber' || resolvedColor === 'yellow') badgeStyle = 'bg-yellow-100 text-yellow-950 border-yellow-300 font-bold';
      if (resolvedColor === 'rose' || resolvedColor === 'red') badgeStyle = 'bg-rose-100 text-rose-950 border-rose-300 font-bold';
      if (resolvedColor === 'emerald' || resolvedColor === 'green') badgeStyle = 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold';
      if (resolvedColor === 'blue') badgeStyle = 'bg-blue-100 text-blue-950 border-blue-300 font-bold';
      if (resolvedColor === 'purple') badgeStyle = 'bg-purple-100 text-purple-950 border-purple-300 font-bold';
      if (resolvedColor === 'pink') badgeStyle = 'bg-pink-100 text-pink-950 border-pink-300 font-bold';
      if (resolvedColor === 'black') badgeStyle = 'bg-gray-900 text-white border-gray-950 font-bold';

      const customTagBadge = customTagText
        ? `<span class="inline-block text-[10px] ${badgeStyle} px-1.5 py-0.2 rounded border">${escapeHtml(displayTagText)}</span>`
        : '';

      const clicksBadge = (item.clicks_count && item.clicks_count > 0)
        ? `<span class="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-800 border border-sky-200 font-extrabold px-1.5 py-0.2 rounded" title="Total de cliques no link">👆 ${item.clicks_count} cliques</span>`
        : '';

      const couponBadge = item.coupon_code
        ? `<span class="inline-flex items-center gap-0.5 text-[10px] bg-indigo-50 text-indigo-900 border border-indigo-300 font-extrabold px-1.5 py-0.2 rounded" title="Cupom: ${escapeHtml(item.coupon_code)}">🎟️ ${escapeHtml(item.coupon_code)}</span>`
        : '';

      const lastUpdatedText = formatLastUpdated(item.updated_at || item.created_at);
      const createdDateText = item.created_at ? formatLastUpdated(item.created_at) : '';

      return `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100 ${isFastPick ? 'bg-pink-50/20' : ''}">
          <td class="p-3 text-center text-xs font-bold text-gray-500 w-12">
            ${statusFilter === 'recent50' 
              ? `<span class="text-amber-700 font-black">#${absoluteIdx}</span><div class="text-[9px] text-gray-400 font-mono">ID ${item.id}</div>` 
              : `${absoluteIdx}`}
          </td>
          <td class="p-3 w-16">
            <img src="${escapeHtml(item.image_url)}" alt="" class="w-12 h-12 object-contain rounded-lg border-2 ${isFastPick ? 'border-pink-500 ring-2 ring-pink-100' : 'border-gray-200'} bg-white p-1" 
                 onerror="this.src='../assets/img/fast-logo.png'" />
          </td>
          <td class="p-3 font-medium text-gray-900 max-w-xs">
            <div class="font-bold text-sm truncate flex items-center gap-1.5">
              <span>${escapeHtml(item.title)}</span>
              ${fastPickBadge}
            </div>
            <div class="flex items-center gap-1.5 mt-1 flex-wrap">
              ${platformBadge}
              ${primeBadge}
              ${importedBadge}
              ${discountBadge}
              ${couponBadge}
              ${customTagBadge}
              ${clicksBadge}
            </div>
          </td>
          <td class="p-3 text-xs text-gray-600">${escapeHtml(catLabel)}</td>
          <td class="p-3 font-bold text-sm text-gray-800">
            <div>${escapeHtml(item.price_display || '-')}</div>
            ${item.original_price ? `<div class="text-[10px] text-gray-400 line-through">${escapeHtml(item.original_price)}</div>` : ''}
            ${statusFilter === 'recent50' && createdDateText ? `<div class="text-[9.5px] text-emerald-700 font-bold mt-1 flex items-center gap-1" title="Data de cadastro do produto"><span>🆕</span><span>${escapeHtml(createdDateText.replace('Atualizado em ', 'Cadastrado em '))}</span></div>` : ''}
            ${lastUpdatedText && statusFilter !== 'recent50' ? `<div class="text-[9.5px] text-gray-400 font-normal mt-1 flex items-center gap-1" title="Data da última verificação automática"><span>🕒</span><span>${escapeHtml(lastUpdatedText)}</span></div>` : ''}
          </td>
          <td class="p-3 text-center">${activeBadge}</td>
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="AffiliatesModule.sendToWhatsApp(${item.id})" 
                      class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg text-xs font-bold" title="🚀 Disparar Oferta no WhatsApp VIP">🚀</button>
              <button onclick="AffiliatesModule.openShareModal(${item.id})" 
                      class="p-1.5 text-green-600 hover:bg-green-50 rounded-lg text-xs font-medium" title="Compartilhar Oferta">📤</button>
              <a href="${escapeHtml(item.affiliate_url)}" target="_blank" rel="noopener noreferrer" 
                 class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Testar link na loja">🔗</a>
              <button onclick="AffiliatesModule.openEditModal(${item.id})" 
                       class="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg text-xs font-medium" title="Editar">✏️</button>
              <button onclick="AffiliatesModule.deleteProduct(${item.id})" 
                       class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium" title="Excluir">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function detectBadgePreset(tag, color) {
    if (color === 'flash_deal' || (tag && /rel[âa]mpago/i.test(tag))) return '⚡ Oferta Relâmpago|flash_deal';
    if (!tag) return '';
    const norm = tag.toLowerCase().trim();
    if (norm.includes('escolha da amazon') || norm.includes("amazon's choice") || norm === 'escolha da amazon') return 'Escolha da Amazon|black';
    if (norm.includes('menor preco') || norm.includes('menor preço') || norm === 'menor preço' || norm === '🔴 menor preço') return 'Menor Preço|rose';
    if (norm.includes('indicado') || norm === 'indicado' || norm === '🟠 indicado') return 'Indicado|orange';
    if (norm === 'oferta' || norm === '🩷 oferta' || norm === '🌸 oferta' || (norm.includes('oferta') && !norm.includes('imperd') && !norm.includes('oficial'))) return 'Oferta|pink';
    if (norm.includes('imperd') || norm === '💥 oferta imperdível' || norm === 'oferta imperdível') return '💥 Oferta Imperdível|blue';
    if (norm.includes('mais vendido') || norm === '🔥 mais vendido' || norm === 'mais vendido') return '🔥 Mais Vendido|orange';
    if (norm.includes('buscado') || norm === '➕ buscado' || norm === '➕ mais buscado' || norm === 'mais buscado') return '➕ Buscado|purple';
    if (norm.includes('pratico') || norm.includes('prático') || norm === '⭐ prático' || norm === 'prático') return '⭐ Prático|amber';
    if (norm.includes('loja oficial') || norm.includes('oficial') || norm === '🛡️ loja oficial' || norm === 'loja oficial') return '🛡️ Loja Oficial|black';
    return 'custom';
  }

  function updateTagSelectVisual(val) {
    const sel = document.getElementById('affiliateTagPresetSelect');
    if (!sel) return;

    sel.className = 'w-full px-2.5 py-1.5 border rounded-lg outline-none font-medium text-xs focus:ring-2 focus:ring-amber-400 transition-all shadow-sm';

    if (!val || val === 'custom') {
      sel.classList.add('bg-white', 'text-gray-700', 'border-gray-200');
      return;
    }

    const color = val.includes('|') ? val.split('|')[1] : val;
    if (color === 'flash_deal') sel.classList.add('bg-red-50', 'text-red-700', 'border-red-300', 'font-black');
    else if (color === 'blue') sel.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
    else if (color === 'orange') sel.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-200');
    else if (color === 'purple') sel.classList.add('bg-purple-50', 'text-purple-700', 'border-purple-200');
    else if (color === 'amber' || color === 'yellow') sel.classList.add('bg-amber-50', 'text-amber-700', 'border-amber-200');
    else if (color === 'black') sel.classList.add('bg-slate-100', 'text-slate-700', 'border-slate-300');
    else if (color === 'pink') sel.classList.add('bg-pink-50', 'text-pink-700', 'border-pink-200');
    else if (color === 'rose' || color === 'red') sel.classList.add('bg-rose-50', 'text-rose-700', 'border-rose-200');
    else if (color === 'emerald' || color === 'green') sel.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    else sel.classList.add('bg-white', 'text-gray-700', 'border-gray-200');
  }

  function setFlashHours(hours) {
    const end = new Date(Date.now() + hours * 3600 * 1000);
    const tzOffset = end.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(end.getTime() - tzOffset)).toISOString().slice(0, 16);
    const input = document.getElementById('affiliateFlashDealEndInput');
    if (input) input.value = localISOTime;
  }

  function handleTagPresetChange(val) {
    const customBox = document.getElementById('affiliateCustomTagBox');
    const flashBox = document.getElementById('affiliateFlashDealBox');
    const tagInput = document.getElementById('affiliateTagInput');
    const colorInput = document.getElementById('affiliateBadgeColorInput');

    const isFlash = (val || '').includes('flash_deal');
    if (flashBox) {
      if (isFlash) {
        flashBox.classList.remove('hidden');
        const flashInput = document.getElementById('affiliateFlashDealEndInput');
        if (flashInput && !flashInput.value) {
          setFlashHours(4);
        }
      } else {
        flashBox.classList.add('hidden');
        const flashInput = document.getElementById('affiliateFlashDealEndInput');
        if (flashInput) flashInput.value = '';
        const discInput = document.getElementById('affiliateDiscountInput');
        if (discInput && /rel[âa]mpago/i.test(discInput.value)) {
          discInput.value = '';
          recalculateDiscount();
        }
      }
    }

    if (val === 'custom') {
      if (customBox) customBox.classList.remove('hidden');
    } else if (!val) {
      if (customBox) customBox.classList.add('hidden');
      if (tagInput) tagInput.value = '';
      if (colorInput) colorInput.value = 'orange';
      const discInput = document.getElementById('affiliateDiscountInput');
      if (discInput && !/off|pix|cupom|\d+%/i.test(discInput.value)) {
        discInput.value = '';
        recalculateDiscount();
      }
    } else {
      if (customBox) customBox.classList.add('hidden');
      const [tag, color] = val.split('|');
      if (tagInput) tagInput.value = tag;
      if (colorInput) colorInput.value = color;
    }

    updateTagSelectVisual(val);
  }

  function openNewModal() {
    editingId = null;
    const form = document.getElementById('affiliateForm');
    if (form) form.reset();
    document.getElementById('affiliateModalTitle').textContent = '➕ Novo Achadinho (ML, Amazon & Shopee)';
    document.getElementById('affiliateId').value = '';

    const presetSelect = document.getElementById('affiliateTagPresetSelect');
    if (presetSelect) presetSelect.value = '';
    const customBox = document.getElementById('affiliateCustomTagBox');
    if (customBox) customBox.classList.add('hidden');
    document.getElementById('affiliateTagInput').value = '';
    document.getElementById('affiliateBadgeColorInput').value = 'orange';

    const sel = document.getElementById('affiliateTagPresetSelect');
    if (sel) {
      sel.className = 'w-full px-2.5 py-1.5 border rounded-lg bg-white text-gray-700 border-gray-200 outline-none font-medium text-xs focus:ring-2 focus:ring-amber-400 transition-all shadow-sm';
    }

    const typeSelect = document.getElementById('affiliateDiscountTypeSelect');
    if (typeSelect) typeSelect.value = 'OFF';
    const discountEl = document.getElementById('affiliateDiscountInput');
    if (discountEl) discountEl.value = '';
    const badge = document.getElementById('affiliateDiscountCalcBadge');
    if (badge) badge.classList.add('hidden');

    const isFastPickEl = document.getElementById('affiliateIsFastPickInput');
    if (isFastPickEl) isFastPickEl.checked = false;
    const isPrimeEl = document.getElementById('affiliateIsPrimeInput');
    if (isPrimeEl) isPrimeEl.checked = false;
    const isImportedEl = document.getElementById('affiliateIsImportedInput');
    if (isImportedEl) isImportedEl.checked = false;
    const flashBox = document.getElementById('affiliateFlashDealBox');
    if (flashBox) flashBox.classList.add('hidden');
    const flashInput = document.getElementById('affiliateFlashDealEndInput');
    if (flashInput) flashInput.value = '';
    const couponEl = document.getElementById('affiliateCouponInput');
    if (couponEl) couponEl.value = '';
    document.getElementById('affiliateDescriptionInput').value = '🔸 ';
    document.getElementById('affiliateImagePreview').src = '../assets/img/fast-logo.png';
    document.getElementById('affiliateModal').classList.remove('hidden');
  }

  function recalculateDiscount() {
    const priceVal = document.getElementById('affiliatePriceInput')?.value || '';
    const origVal = document.getElementById('affiliateOriginalPriceInput')?.value || '';
    const typeSelect = document.getElementById('affiliateDiscountTypeSelect');
    const discountInput = document.getElementById('affiliateDiscountInput');
    const badge = document.getElementById('affiliateDiscountCalcBadge');

    const selectedType = typeSelect ? typeSelect.value : 'OFF';

    if (selectedType === 'manual') {
      if (badge) badge.classList.add('hidden');
      return;
    }

    const curr = parsePrice(priceVal);
    const orig = parsePrice(origVal);

    if (orig > 0 && curr > 0 && orig > curr) {
      const pct = Math.round(((orig - curr) / orig) * 100);
      if (pct > 0) {
        let label = `${pct}% OFF`;
        if (selectedType === 'Com Cupom') {
          label = `${pct}% OFF com Cupom`;
        } else if (selectedType === 'No Pix') {
          label = `${pct}% OFF no Pix`;
        } else if (selectedType === 'No Pix com Cupom') {
          label = `${pct}% OFF no Pix com Cupom`;
        }
        if (discountInput) discountInput.value = label;
        if (badge) {
          badge.textContent = `${pct}% Calculado`;
          badge.classList.remove('hidden');
        }
        return;
      }
    }

    if (badge) badge.classList.add('hidden');
    if (discountInput && !discountInput.value.includes('%')) {
      if (selectedType === 'Com Cupom') {
        discountInput.value = 'Com Cupom';
      } else if (selectedType === 'No Pix') {
        discountInput.value = 'No Pix';
      } else if (selectedType === 'No Pix com Cupom') {
        discountInput.value = 'No Pix com Cupom';
      }
    }
  }

  function openEditModal(id) {
    const item = productsList.find(p => p.id == id);
    if (!item) return;

    editingId = id;
    document.getElementById('affiliateModalTitle').textContent = '✏️ Editar Achadinho';
    document.getElementById('affiliateId').value = item.id;
    document.getElementById('affiliateTitleInput').value = item.title || '';
    document.getElementById('affiliateDescriptionInput').value = item.description || '';
    document.getElementById('affiliateUrlInput').value = item.affiliate_url || '';
    document.getElementById('affiliateImageUrlInput').value = item.image_url || '';
    document.getElementById('affiliatePriceInput').value = item.price_display || '';
    document.getElementById('affiliateOriginalPriceInput').value = item.original_price || '';
    document.getElementById('affiliateCategoryInput').value = item.category || 'cozinha';

    const typeSelect = document.getElementById('affiliateDiscountTypeSelect');
    const discountEl = document.getElementById('affiliateDiscountInput');
    const rawDiscount = (item.discount_tag || '').trim();

    // Detecta o tipo de desconto de forma precisa
    let detectedType = 'OFF';
    if (/no pix c(om|\/)?\s*cupom/i.test(rawDiscount)) {
      detectedType = 'No Pix com Cupom';
    } else if (/no pix/i.test(rawDiscount)) {
      detectedType = 'No Pix';
    } else if (/c(om|\/)?\s*cupom/i.test(rawDiscount)) {
      detectedType = 'Com Cupom';
    } else if (rawDiscount && !/off/i.test(rawDiscount) && !/\d+%/.test(rawDiscount)) {
      detectedType = 'manual';
    }

    if (typeSelect) typeSelect.value = detectedType;
    if (discountEl) discountEl.value = rawDiscount;
    recalculateDiscount();

    // Tag Destaque (respeita estritamente a escolha do administrador)
    let actualTag = (item.badge_tag || '').trim();
    if (actualTag === 'none' || actualTag === 'null') {
      actualTag = '';
    }

    // Se o produto estiver sem selo e discount_tag contiver texto antigo de tag, limpa para não reintroduzir tag
    if (!actualTag && rawDiscount && !/off|pix|cupom|\d+%/i.test(rawDiscount)) {
      if (discountEl) discountEl.value = '';
    }

    const preset = detectBadgePreset(actualTag, item.badge_color);
    const presetSelect = document.getElementById('affiliateTagPresetSelect');
    const customBox = document.getElementById('affiliateCustomTagBox');
    const tagInput = document.getElementById('affiliateTagInput');
    const colorInput = document.getElementById('affiliateBadgeColorInput');

    if (presetSelect) presetSelect.value = preset;
    if (tagInput) tagInput.value = actualTag;
    if (colorInput) colorInput.value = (item.badge_color && item.badge_color !== 'fast_seal') ? item.badge_color : 'orange';
    updateTagSelectVisual(preset);

    if (preset === 'custom') {
      if (customBox) customBox.classList.remove('hidden');
    } else {
      if (customBox) customBox.classList.add('hidden');
    }

    const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
    const isFastPickEl = document.getElementById('affiliateIsFastPickInput');
    if (isFastPickEl) isFastPickEl.checked = isFastPick;

    const isPrimeEl = document.getElementById('affiliateIsPrimeInput');
    if (isPrimeEl) isPrimeEl.checked = Boolean(item.is_prime);

    const isImportedEl = document.getElementById('affiliateIsImportedInput');
    if (isImportedEl) isImportedEl.checked = Boolean(item.is_imported);

    const isFlash = (item.badge_color === 'flash_deal') || (item.discount_tag && /rel[âa]mpago/i.test(item.discount_tag)) || (item.badge_tag && /rel[âa]mpago/i.test(item.badge_tag));
    const flashBox = document.getElementById('affiliateFlashDealBox');
    const flashInput = document.getElementById('affiliateFlashDealEndInput');
    if (item.flash_deal_end) {
      const end = new Date(item.flash_deal_end);
      const tzOffset = end.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(end.getTime() - tzOffset)).toISOString().slice(0, 16);
      if (flashInput) flashInput.value = localISOTime;
      if (flashBox) flashBox.classList.remove('hidden');
    } else {
      if (flashInput) flashInput.value = '';
      if (flashBox) {
        if (isFlash) flashBox.classList.remove('hidden');
        else flashBox.classList.add('hidden');
      }
    }

    const couponEl = document.getElementById('affiliateCouponInput');
    if (couponEl) couponEl.value = item.coupon_code || '';

    document.getElementById('affiliateActiveInput').checked = item.is_active !== false;

    // Atualiza preview da imagem
    updateImagePreview(item.image_url);

    document.getElementById('affiliateModal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('affiliateModal').classList.add('hidden');
  }

  function updateImagePreview(url) {
    const preview = document.getElementById('affiliateImagePreview');
    if (preview) {
      if (url && url.startsWith('http')) {
        preview.src = url;
      } else {
        preview.src = '../assets/img/fast-logo.png';
      }
    }
  }

  async function fetchProductDataFromML() {
    const urlInput = document.getElementById('affiliateUrlInput');
    const btn = document.getElementById('affiliateAutoFetchBtn');
    if (!urlInput || !urlInput.value.trim()) {
      alert('Por favor, cole primeiro o link de afiliado ou do produto no campo de URL!');
      urlInput?.focus();
      return;
    }

    const rawUrl = urlInput.value.trim();
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Buscando dados...</span>`;
    }

    try {
      const resp = await fetch(`/api/check-affiliate-links?action=fetch&url=${encodeURIComponent(rawUrl)}`);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível extrair os dados do anúncio.');
      }

      const info = data.data;

      // Regra de Preservação de Links Curtos:
      // Se a URL digitada já for curta (amzn.to, a.co, meli.la, s.shopee.com.br, etc.), NUNCA sobrescreve por link longo!
      const isInputShort = /(?:amzn\.to|a\.co|meli\.la|mercadolivre\.com\/sec\/|s\.shopee\.com\.br|shope\.ee|link\.amazon|amzlinks\.in)/i.test(rawUrl);
      if (!isInputShort && info.affiliate_url && info.affiliate_url.startsWith('http') && info.affiliate_url !== rawUrl) {
        const isOutputShort = /(?:amzn\.to|a\.co|meli\.la|mercadolivre\.com\/sec\/|s\.shopee\.com\.br|shope\.ee)/i.test(info.affiliate_url);
        if (isOutputShort) {
          document.getElementById('affiliateUrlInput').value = info.affiliate_url;
        }
      }

      // Preenche automaticamente o título
      const titleEl = document.getElementById('affiliateTitleInput');
      if (info.title && (!titleEl.value.trim() || titleEl.value.trim().startsWith('Produto '))) {
        titleEl.value = info.title;
      }

      // Preenche foto
      if (info.image_url) {
        document.getElementById('affiliateImageUrlInput').value = info.image_url;
        updateImagePreview(info.image_url);
      }

      // Preenche preço atual
      if (info.price_display) {
        document.getElementById('affiliatePriceInput').value = info.price_display;
      }

      // Preenche preço original riscado
      if (info.original_price) {
        document.getElementById('affiliateOriginalPriceInput').value = info.original_price;
      }

      // Preenche campo de Desconto e recalcula
      const discountEl = document.getElementById('affiliateDiscountInput');
      if (discountEl) {
        if (info.discount_percent > 0) {
          discountEl.value = `${info.discount_percent}% OFF`;
        } else if (info.discount_tag) {
          discountEl.value = info.discount_tag;
        }
      }

      recalculateDiscount();

      // Preenche cupom detectado automaticamente
      if (info.coupon_code && document.getElementById('affiliateCouponInput')) {
        document.getElementById('affiliateCouponInput').value = info.coupon_code;
      }

      // Preenche indicação Amazon Prime se detectada
      if (info.is_prime !== undefined && document.getElementById('affiliateIsPrimeInput')) {
        document.getElementById('affiliateIsPrimeInput').checked = Boolean(info.is_prime);
      }

      // Preenche indicação de produto importado se detectada
      if (info.is_imported !== undefined && document.getElementById('affiliateIsImportedInput')) {
        document.getElementById('affiliateIsImportedInput').checked = Boolean(info.is_imported);
      }

      // Preenche categoria detectada automaticamente
      const detectedCat = info.category || detectCategoryClient(info.title || '');
      if (detectedCat && document.getElementById('affiliateCategoryInput')) {
        document.getElementById('affiliateCategoryInput').value = detectedCat;
      }

      const platformName = info.platform === 'amazon' ? 'Amazon' : (info.platform === 'shopee' ? 'Shopee' : (info.platform === 'natura' ? 'Natura' : (info.platform === 'avon' ? 'Avon' : 'Mercado Livre')));
      if (info.is_active === false) {
        document.getElementById('affiliateActiveInput').checked = false;
        alert(`⚠️ Atenção: Este anúncio parece estar pausado ou finalizado na ${platformName}.`);
      }

      if (window.showToast) {
        window.showToast(`✨ Dados da ${platformName} preenchidos automaticamente!`, 'success');
      }
    } catch (err) {
      console.warn('[AutoFetch ML] Erro:', err);
      alert(`Aviso: ${err.message || 'Não foi possível buscar automaticamente'}. Você ainda pode preencher os campos manualmente.`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
      }
    }
  }

  async function saveProduct(event) {
    if (event) event.preventDefault();

    const title = document.getElementById('affiliateTitleInput').value.trim();
    const affiliate_url = document.getElementById('affiliateUrlInput').value.trim();
    const image_url = document.getElementById('affiliateImageUrlInput').value.trim();

    if (!title || !affiliate_url || !image_url) {
      alert('Por favor, preencha o Título, Link de Afiliado e Link da Foto!');
      return;
    }

    const currentItem = editingId ? productsList.find(p => p.id == editingId) : null;
    const assignedPosition = currentItem && currentItem.position ? currentItem.position : (productsList.length + 1);

    const isFastPick = document.getElementById('affiliateIsFastPickInput') ? document.getElementById('affiliateIsFastPickInput').checked : false;
    const isPrime = document.getElementById('affiliateIsPrimeInput') ? document.getElementById('affiliateIsPrimeInput').checked : false;
    const isImported = document.getElementById('affiliateIsImportedInput') ? document.getElementById('affiliateIsImportedInput').checked : false;

    const discountVal = document.getElementById('affiliateDiscountInput')?.value?.trim() || null;
    const couponVal = document.getElementById('affiliateCouponInput')?.value?.trim() || null;
    const presetSelect = document.getElementById('affiliateTagPresetSelect');
    const presetVal = presetSelect ? presetSelect.value : '';
    let badgeTag = null;
    let finalColor = 'orange';

    if (presetVal === 'custom') {
      const customTag = document.getElementById('affiliateTagInput')?.value?.trim();
      if (customTag) badgeTag = customTag;
      finalColor = document.getElementById('affiliateBadgeColorInput')?.value || 'orange';
    } else if (presetVal) {
      const [tag, color] = presetVal.split('|');
      if (tag) badgeTag = tag;
      finalColor = color || 'orange';
    }

    const flashEndVal = document.getElementById('affiliateFlashDealEndInput')?.value;
    let flashDealEndIso = null;
    const isFlashPreset = (presetVal && presetVal.includes('flash_deal')) || (finalColor === 'flash_deal');
    if (isFlashPreset) {
      if (flashEndVal) {
        flashDealEndIso = new Date(flashEndVal).toISOString();
      } else {
        flashDealEndIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      }
    } else {
      flashDealEndIso = null;
    }

    let cleanDiscountVal = discountVal;
    if (!isFlashPreset && cleanDiscountVal && /rel[âa]mpago/i.test(cleanDiscountVal)) {
      cleanDiscountVal = null;
    }
    if (!presetVal && cleanDiscountVal && !/off|pix|cupom|\d+%/i.test(cleanDiscountVal)) {
      cleanDiscountVal = null;
    }

    const priceDisp = document.getElementById('affiliatePriceInput').value.trim() || null;
    let origPriceDisp = document.getElementById('affiliateOriginalPriceInput').value.trim() || null;
    if (origPriceDisp && priceDisp) {
      const oNum = parsePrice(origPriceDisp);
      const cNum = parsePrice(priceDisp);
      if (oNum <= cNum) {
        origPriceDisp = null; // Preço riscado menor ou igual ao atual é inválido
      }
    }

    const payload = {
      title,
      description: document.getElementById('affiliateDescriptionInput').value.trim() || null,
      affiliate_url,
      image_url,
      price_display: priceDisp,
      original_price: origPriceDisp,
      category: document.getElementById('affiliateCategoryInput').value || 'cozinha',
      discount_tag: cleanDiscountVal,
      badge_tag: badgeTag,
      coupon_code: couponVal,
      badge_color: finalColor || 'orange',
      flash_deal_end: flashDealEndIso,
      is_fast_pick: isFastPick,
      is_prime: isPrime,
      is_imported: isImported,
      position: Number(assignedPosition) || 1,
      is_active: document.getElementById('affiliateActiveInput').checked,
      updated_at: new Date().toISOString()
    };

    try {
      if (window.supabaseClient) {
        let currentPayload = { ...payload };
        if (!editingId) {
          currentPayload.created_at = new Date().toISOString();
        }

        let maxAttempts = 5;
        let lastError = null;

        while (maxAttempts > 0) {
          maxAttempts--;
          let query;
          if (editingId) {
            query = window.supabaseClient
              .from('fast_affiliate_products')
              .update(currentPayload)
              .eq('id', editingId);
          } else {
            query = window.supabaseClient
              .from('fast_affiliate_products')
              .insert([currentPayload]);
          }

          const res = await query;
          if (!res.error) {
            lastError = null;
            break;
          }

          lastError = res.error;
          console.warn(`[Admin Affiliates] Tentativa com erro (tentativas restantes: ${maxAttempts}):`, res.error);

          const errMsg = (res.error.message || '') + ' ' + (res.error.details || '');
          // Detecta qualquer coluna que não exista no banco e a remove do payload para tentar novamente
          const colMatch = errMsg.match(/'([^']+)' column/i) || errMsg.match(/column\s+"?([^"\s]+)"?\s+does not exist/i);
          if (colMatch && colMatch[1] && currentPayload.hasOwnProperty(colMatch[1])) {
            delete currentPayload[colMatch[1]];
            continue;
          }

          if (errMsg.includes('is_fast_pick') && currentPayload.hasOwnProperty('is_fast_pick')) {
            delete currentPayload.is_fast_pick;
            continue;
          }
          if (errMsg.includes('badge_color') && currentPayload.hasOwnProperty('badge_color')) {
            delete currentPayload.badge_color;
            continue;
          }
          if (errMsg.includes('discount_tag') && currentPayload.hasOwnProperty('discount_tag')) {
            delete currentPayload.discount_tag;
            continue;
          }
          if (errMsg.includes('original_price') && currentPayload.hasOwnProperty('original_price')) {
            delete currentPayload.original_price;
            continue;
          }

          // Se for erro diferente de coluna desconhecida, sai do loop
          break;
        }

        if (lastError) {
          throw lastError;
        }
      }

      if (window.showToast) window.showToast('Achadinho salvo com sucesso!', 'success');
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('[Admin Affiliates] Erro ao salvar:', err);
      const msg = err.message || err.details || (typeof err === 'string' ? err : 'Verifique sua conexão');
      alert(`Erro ao salvar no banco de dados: ${msg}`);
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Deseja realmente excluir este achadinho?')) return;

    try {
      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      if (window.showToast) window.showToast('Achadinho excluído.', 'info');
      await loadProducts();
    } catch (e) {
      console.error('[Admin Affiliates] Erro ao deletar:', e);
      alert('Erro ao excluir produto.');
    }
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

  let lastHealthCheckResults = [];
  let currentHealthFilterTab = 'all';

  async function checkAllLinksHealth() {
    const itemsToCheck = getFilteredProducts();
    if (!itemsToCheck || itemsToCheck.length === 0) {
      alert('Nenhum achadinho encontrado para os filtros atuais para verificar.');
      return;
    }

    const modal = document.getElementById('affiliateHealthModal');
    const progress = document.getElementById('healthCheckerProgress');
    const resultsContainer = document.getElementById('healthCheckerResults');
    const statusText = document.getElementById('healthCheckerStatusText');
    const summary = document.getElementById('healthCheckerSummary');

    if (modal) modal.classList.remove('hidden');
    if (progress) progress.classList.remove('hidden');
    if (resultsContainer) {
      resultsContainer.classList.add('hidden');
      resultsContainer.innerHTML = '';
    }

    const filterName = categoryFilter !== 'all' ? `da categoria "${categoryFilter}"` : 'da lista atual';
    if (statusText) statusText.textContent = `Iniciando verificação de ${itemsToCheck.length} links ${filterName}...`;

    try {
      const chunkSize = 25;
      let allResults = [];

      for (let i = 0; i < itemsToCheck.length; i += chunkSize) {
        const chunk = itemsToCheck.slice(i, i + chunkSize);
        const chunkIndexEnd = Math.min(i + chunkSize, itemsToCheck.length);
        if (statusText) {
          statusText.textContent = `Verificando links ${i + 1} a ${chunkIndexEnd} de ${itemsToCheck.length}...`;
        }

        const response = await fetch('/api/check-affiliate-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk })
        });

        if (!response.ok) throw new Error('Falha na resposta do verificador');

        const data = await response.json();
        const results = data.results || [];
        allResults = allResults.concat(results);
      }

      lastHealthCheckResults = allResults;
      currentHealthFilterTab = 'all';
      renderHealthCheckView();

      if (progress) progress.classList.add('hidden');
      if (resultsContainer) resultsContainer.classList.remove('hidden');

    } catch (err) {
      console.error('[HealthCheck] Erro:', err);
      if (progress) progress.classList.add('hidden');
      if (resultsContainer) {
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-center text-sm font-medium">Erro ao verificar links: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function setHealthFilterTab(tab) {
    currentHealthFilterTab = tab;
    renderHealthCheckView();
  }

  function renderHealthCheckView() {
    const resultsContainer = document.getElementById('healthCheckerResults');
    const summary = document.getElementById('healthCheckerSummary');
    if (!resultsContainer || !lastHealthCheckResults) return;

    let okCount = 0;
    let pausedCount = 0;
    let errorCount = 0;
    let priceDropCount = 0;
    let priceIncreaseCount = 0;
    let pausedToDeactivateCount = 0;

    const enrichedResults = lastHealthCheckResults.map(res => {
      const prod = productsList.find(p => p.id == res.id) || 
                   { title: res.title || 'Produto', image_url: '../assets/img/fast-logo.png', price_display: '' };
      
      const livePriceNum = parsePrice(res.price);
      const storedPriceNum = parsePrice(prod.price_display);
      const hasPriceDiff = livePriceNum > 0 && storedPriceNum > 0 && Math.abs(livePriceNum - storedPriceNum) >= 0.01;
      const isDrop = hasPriceDiff && livePriceNum < storedPriceNum;
      const isIncrease = hasPriceDiff && livePriceNum > storedPriceNum;

      if (res.status === 'paused') {
        pausedCount++;
        if (prod.is_active !== false) pausedToDeactivateCount++;
      } else if (res.status === 'error' || res.status === 'timeout' || res.status === 'warning') {
        errorCount++;
      } else {
        okCount++;
      }

      if (isDrop) priceDropCount++;
      if (isIncrease) priceIncreaseCount++;

      return {
        ...res,
        prod,
        livePriceNum,
        storedPriceNum,
        hasPriceDiff,
        isDrop,
        isIncrease
      };
    });

    // Filter items based on current tab
    const filteredResults = enrichedResults.filter(item => {
      if (currentHealthFilterTab === 'drops') return item.isDrop;
      if (currentHealthFilterTab === 'increases') return item.isIncrease;
      if (currentHealthFilterTab === 'paused') return item.status === 'paused';
      return true; // 'all'
    });

    const itemsHtml = filteredResults.map(item => {
      const prod = item.prod;
      let statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800 flex items-center gap-1">🟢 Online</span>`;
      if (item.status === 'paused') {
        statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 flex items-center gap-1">🔴 Pausado no ML</span>`;
      } else if (item.status === 'error' || item.status === 'timeout' || item.status === 'warning') {
        statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">⚠️ Instável</span>`;
      }

      let priceDiffHtml = '';
      if (item.hasPriceDiff) {
        const isLower = item.isDrop;
        priceDiffHtml = `
          <div class="mt-2 p-2.5 ${isLower ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'} border rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="font-medium flex items-center gap-1.5 flex-wrap">
              <span>${isLower ? '📉' : '📈'}</span>
              <span>Preço no ML:</span>
              <span class="line-through text-gray-500">${escapeHtml(prod.price_display)}</span>
              <span>➔</span>
              <strong class="text-sm font-black ${isLower ? 'text-emerald-700' : 'text-amber-800'}">${escapeHtml(item.price)}</strong>
              ${isLower ? '<span class="bg-emerald-600 text-white font-extrabold px-1.5 py-0.5 rounded text-[10px]">Baixou! 🔥</span>' : '<span class="bg-amber-600 text-white font-extrabold px-1.5 py-0.5 rounded text-[10px]">Aumentou ⚠️</span>'}
            </div>
            <button id="sync-price-btn-${prod.id}" onclick="AffiliatesModule.syncProductPrice(${prod.id}, '${escapeHtml(item.price)}', '${escapeHtml(item.original_price || '')}', this)" 
                    class="px-2.5 py-1 ${isLower ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white font-bold rounded-lg shadow-sm transition text-xs flex items-center gap-1 active:scale-95">
              🔄 Atualizar no Site
            </button>
          </div>
        `;
      }

      let actionBtn = '';
      if (item.status === 'paused') {
        if (prod.is_active !== false) {
          actionBtn = `<button id="pause-btn-${prod.id}" onclick="AffiliatesModule.toggleProductActive(${prod.id}, false, this)" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95">Pausar no Site</button>`;
        } else {
          actionBtn = `<span class="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg border border-gray-200">⏸️ Já Pausado</span>`;
        }
      } else if (item.status === 'active' && prod.is_active === false) {
        actionBtn = `<button id="pause-btn-${prod.id}" onclick="AffiliatesModule.toggleProductActive(${prod.id}, true, this)" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95">Reativar no Site</button>`;
      }

      return `
        <div class="p-3.5 bg-white border border-gray-100 hover:border-gray-200 rounded-2xl shadow-sm transition">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${escapeHtml(prod.image_url)}" alt="" class="w-11 h-11 object-contain rounded-xl bg-gray-50 border p-0.5 flex-shrink-0" onerror="this.src='../assets/img/fast-logo.png'" />
              <div class="min-w-0">
                <div class="font-bold text-sm text-gray-900 truncate">${escapeHtml(prod.title || item.title)}</div>
                <div class="text-xs text-gray-500 truncate flex items-center gap-2 mt-0.5">
                  <span>${escapeHtml(item.statusText || item.url)}</span>
                  ${prod.price_display && !item.hasPriceDiff ? `<span class="text-gray-400">• Preço atual: <strong>${escapeHtml(prod.price_display)}</strong></span>` : ''}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${statusBadge}
              ${actionBtn}
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Abrir link original">🔗</a>
            </div>
          </div>
          ${priceDiffHtml}
        </div>
      `;
    }).join('');

    // TWO SEPARATE ACTION BUTTONS HEADER: ONE FOR DROPS AND ONE FOR INCREASES
    const batchActionsHeader = `
      <div class="space-y-3 mb-4">
        <!-- Action Buttons Bar -->
        <div class="p-3.5 bg-gradient-to-r from-gray-50 to-amber-50/50 border border-gray-200 rounded-2xl shadow-xs">
          <div class="flex flex-wrap items-center justify-between gap-2.5">
            <div class="text-xs text-gray-800 font-bold flex items-center gap-2">
              <span>⚡ Sincronização Inteligente de Preços:</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              ${priceDropCount > 0 ? `
                <button onclick="AffiliatesModule.syncAllPriceDrops(this)" 
                        class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5">
                  <span>📉</span> Atualizar Preços que Baixaram (${priceDropCount})
                </button>
              ` : ''}
              ${priceIncreaseCount > 0 ? `
                <button onclick="AffiliatesModule.syncAllPriceIncreases(this)" 
                        class="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5">
                  <span>📈</span> Atualizar Preços que Aumentaram (${priceIncreaseCount})
                </button>
              ` : ''}
              ${pausedToDeactivateCount > 0 ? `
                <button onclick="AffiliatesModule.pauseAllInactiveProducts(this)" 
                        class="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5">
                  <span>⏸️</span> Pausar Todos Inativos (${pausedToDeactivateCount})
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Filter Tabs -->
        <div class="flex items-center gap-1.5 border-b pb-2 overflow-x-auto text-xs">
          <button onclick="AffiliatesModule.setHealthFilterTab('all')" 
                  class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${currentHealthFilterTab === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">
            Todos (${enrichedResults.length})
          </button>
          <button onclick="AffiliatesModule.setHealthFilterTab('drops')" 
                  class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${currentHealthFilterTab === 'drops' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'}">
            📉 Preços que Baixaram (${priceDropCount})
          </button>
          <button onclick="AffiliatesModule.setHealthFilterTab('increases')" 
                  class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${currentHealthFilterTab === 'increases' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'}">
            📈 Preços que Aumentaram (${priceIncreaseCount})
          </button>
          <button onclick="AffiliatesModule.setHealthFilterTab('paused')" 
                  class="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 ${currentHealthFilterTab === 'paused' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'}">
            ⏸️ Pausados (${pausedCount})
          </button>
        </div>
      </div>
    `;

    resultsContainer.innerHTML = batchActionsHeader + (itemsHtml || '<div class="p-6 text-center text-gray-400 text-xs">Nenhum item nesta visualização.</div>');

    if (summary) {
      summary.textContent = `Resultado: ${okCount} online, ${pausedCount} pausados, ${priceDropCount} que baixaram, ${priceIncreaseCount} que aumentaram (${enrichedResults.length} verificados).`;
    }
  }

  function closeHealthModal() {
    document.getElementById('affiliateHealthModal')?.classList.add('hidden');
  }

  async function toggleProductActive(id, newStatus, btnElement = null) {
    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Salvando...';
      }

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;
      }

      const item = productsList.find(p => p.id == id);
      if (item) {
        item.is_active = newStatus;
      }

      renderTable();

      if (btnElement) {
        btnElement.className = newStatus
          ? 'px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-lg border border-green-200 cursor-default'
          : 'px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg border border-gray-200 cursor-default';
        btnElement.innerHTML = newStatus ? '✅ Ativado no Site' : '⏸️ Pausado no Site';
      }

      if (window.showToast) {
        window.showToast(newStatus ? 'Produto reativado no site!' : 'Produto pausado no site!', 'info');
      }
    } catch (e) {
      console.error('[ToggleActive] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao alterar status do produto: ' + (e.message || e));
    }
  }

  async function syncProductPrice(id, newPrice, newOrigPrice, btnElement = null) {
    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Salvando...';
      }

      const item = productsList.find(p => p.id == id);
      const discountPct = calcDiscountPercent(newOrigPrice || (item?.original_price), newPrice);

      const updatePayload = {
        price_display: newPrice,
        updated_at: new Date().toISOString()
      };
      if (newOrigPrice) {
        updatePayload.original_price = newOrigPrice;
      }
      if (discountPct > 0) {
        updatePayload.discount_tag = `${discountPct}% OFF`;
      }

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .update(updatePayload)
          .eq('id', id);

        if (error) throw error;
      }

      if (item) {
        Object.assign(item, updatePayload);
      }

      renderTable();

      if (btnElement) {
        btnElement.className = 'px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 cursor-default';
        btnElement.innerHTML = '✅ Preço Atualizado!';
      }

      if (window.showToast) {
        window.showToast(`Preço atualizado para ${newPrice}!`, 'success');
      }
    } catch (e) {
      console.error('[SyncPrice] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao atualizar preço do produto: ' + (e.message || e));
    }
  }

  async function pauseAllInactiveProducts(btnElement = null) {
    if (!lastHealthCheckResults || lastHealthCheckResults.length === 0) return;

    const pausedItemsToUpdate = lastHealthCheckResults.filter(res => {
      if (res.status !== 'paused') return false;
      const prod = productsList.find(p => p.id == res.id);
      return prod && prod.is_active !== false;
    });

    if (pausedItemsToUpdate.length === 0) {
      alert('Todos os itens pausados já estão pausados no site.');
      return;
    }

    if (!confirm(`Deseja pausar todos os ${pausedItemsToUpdate.length} produtos no site?`)) {
      return;
    }

    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Pausando todos...';
      }

      const ids = pausedItemsToUpdate.map(item => item.id);

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('id', ids);

        if (error) throw error;
      }

      ids.forEach(id => {
        const prod = productsList.find(p => p.id == id);
        if (prod) prod.is_active = false;
      });

      renderTable();

      if (btnElement) {
        btnElement.className = 'px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-default';
        btnElement.innerHTML = `✅ ${ids.length} Pausados!`;
      }

      renderHealthCheckView();

      if (window.showToast) {
        window.showToast(`${ids.length} produtos foram pausados no site!`, 'success');
      }
    } catch (e) {
      console.error('[PauseAll] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao pausar produtos: ' + (e.message || e));
    }
  }

  async function syncAllPriceDrops(btnElement = null) {
    if (!lastHealthCheckResults || lastHealthCheckResults.length === 0) return;

    const itemsToUpdate = [];
    lastHealthCheckResults.forEach(res => {
      if (!res.price) return;
      const prod = productsList.find(p => p.id == res.id);
      if (!prod) return;
      const liveNumeric = parsePrice(res.price);
      const currentNumeric = parsePrice(prod.price_display);
      if (liveNumeric > 0 && currentNumeric > 0 && liveNumeric < currentNumeric) {
        itemsToUpdate.push({
          id: prod.id,
          newPrice: res.price,
          newOrigPrice: res.original_price || prod.original_price || ''
        });
      }
    });

    if (itemsToUpdate.length === 0) {
      alert('Nenhum produto com preço que baixou para sincronizar.');
      return;
    }

    if (!confirm(`Deseja sincronizar os ${itemsToUpdate.length} produtos que BAIXARAM de preço?`)) {
      return;
    }

    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Atualizando baixas...';
      }

      for (const item of itemsToUpdate) {
        const prod = productsList.find(p => p.id == item.id);
        const discountPct = calcDiscountPercent(item.newOrigPrice, item.newPrice);
        const updatePayload = {
          price_display: item.newPrice,
          updated_at: new Date().toISOString()
        };
        if (item.newOrigPrice) {
          updatePayload.original_price = item.newOrigPrice;
        }
        if (discountPct > 0) {
          updatePayload.discount_tag = `${discountPct}% OFF`;
        }

        if (window.supabaseClient) {
          await window.supabaseClient
            .from('fast_affiliate_products')
            .update(updatePayload)
            .eq('id', item.id);
        }

        if (prod) {
          Object.assign(prod, updatePayload);
        }
      }

      renderTable();
      renderHealthCheckView();

      if (btnElement) {
        btnElement.className = 'px-3 py-1.5 bg-emerald-200 text-emerald-900 text-xs font-bold rounded-lg cursor-default';
        btnElement.innerHTML = `✅ ${itemsToUpdate.length} Preços Baixados Atualizados!`;
      }

      if (window.showToast) {
        window.showToast(`${itemsToUpdate.length} produtos atualizados com preços promocionais!`, 'success');
      }
    } catch (e) {
      console.error('[SyncPriceDrops] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao sincronizar preços: ' + (e.message || e));
    }
  }

  async function syncAllPriceIncreases(btnElement = null) {
    if (!lastHealthCheckResults || lastHealthCheckResults.length === 0) return;

    const itemsToUpdate = [];
    lastHealthCheckResults.forEach(res => {
      if (!res.price) return;
      const prod = productsList.find(p => p.id == res.id);
      if (!prod) return;
      const liveNumeric = parsePrice(res.price);
      const currentNumeric = parsePrice(prod.price_display);
      if (liveNumeric > 0 && currentNumeric > 0 && liveNumeric > currentNumeric) {
        itemsToUpdate.push({
          id: prod.id,
          newPrice: res.price,
          newOrigPrice: res.original_price || prod.original_price || ''
        });
      }
    });

    if (itemsToUpdate.length === 0) {
      alert('Nenhum produto com preço que aumentou para sincronizar.');
      return;
    }

    if (!confirm(`Deseja sincronizar os ${itemsToUpdate.length} produtos que AUMENTARAM de preço?`)) {
      return;
    }

    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Atualizando aumentos...';
      }

      for (const item of itemsToUpdate) {
        const prod = productsList.find(p => p.id == item.id);
        const discountPct = calcDiscountPercent(item.newOrigPrice, item.newPrice);
        const updatePayload = {
          price_display: item.newPrice,
          updated_at: new Date().toISOString()
        };
        if (item.newOrigPrice) {
          updatePayload.original_price = item.newOrigPrice;
        }
        if (discountPct > 0) {
          updatePayload.discount_tag = `${discountPct}% OFF`;
        }

        if (window.supabaseClient) {
          await window.supabaseClient
            .from('fast_affiliate_products')
            .update(updatePayload)
            .eq('id', item.id);
        }

        if (prod) {
          Object.assign(prod, updatePayload);
        }
      }

      renderTable();
      renderHealthCheckView();

      if (btnElement) {
        btnElement.className = 'px-3 py-1.5 bg-amber-200 text-amber-900 text-xs font-bold rounded-lg cursor-default';
        btnElement.innerHTML = `✅ ${itemsToUpdate.length} Preços Aumentados Atualizados!`;
      }

      if (window.showToast) {
        window.showToast(`${itemsToUpdate.length} produtos atualizados com os novos preços!`, 'success');
      }
    } catch (e) {
      console.error('[SyncPriceIncreases] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao sincronizar preços: ' + (e.message || e));
    }
  }

  async function syncAllChangedPrices(btnElement = null) {
    await syncAllPriceDrops(btnElement);
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

  async function pasteFromClipboard(targetInputId = 'affiliateUrlInput') {
    const input = document.getElementById(targetInputId);
    if (!input) return;

    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          input.value = text.trim();
          input.focus();
          if (window.showToast) {
            window.showToast('📋 Link colado da área de transferência!', 'success');
          }
          return;
        }
      }
      input.focus();
      input.select();
      alert('Pressione Ctrl + V para colar o link copiado.');
    } catch (err) {
      console.warn('[Paste] Erro ao ler área de transferência:', err);
      input.focus();
      input.select();
      alert('Pressione Ctrl + V para colar.');
    }
  }

  function detectCategoryClient(title = '') {
    const text = (title || '').toLowerCase();
    const rules = [
      // 📺 Eletros, TV & Games
      { category: 'games', keywords: ['playstation', 'ps5', 'ps4', 'xbox', 'nintendo switch', 'console', 'gamepad', 'joystick', 'controle ps5', 'controle xbox', 'jogos ps5', 'jogos switch'] },
      { category: 'tv_audio_video', keywords: ['smart tv', 'tv 50', 'tv 55', 'tv 65', 'televisao', 'televisão', 'soundbar', 'home theater', 'projetor', 'chromecast', 'fire stick', 'roku', 'tv box'] },
      { category: 'eletrodomesticos', keywords: ['geladeira', 'refrigerador', 'lavadora', 'maquina de lavar', 'máquina de lavar', 'lava e seca', 'fogao', 'fogão', 'cooktop', 'forno de embutir', 'ar condicionado', 'microondas', 'micro-ondas', 'freezer', 'cervejeira', 'adega climatizada'] },

      // ⚡ Tecnologia & Celulares
      { category: 'audio_gadgets', keywords: ['fone de ouvido', 'fone bluetooth', 'headphone', 'airpod', 'caixa de som', 'jbl', 'alexa', 'echo dot', 'microfone', 'power bank', 'carregador portatil', 'smartband', 'drone', 'camera digital'] },
      { category: 'celulares', keywords: ['smartphone', 'celular', 'iphone', 'xiaomi', 'galaxy', 'motorola', 'redmi', 'poco', 'realme', 'capinha', 'pelicula celular', 'carregador tipo c', 'carregador celular', 'suporte celular', 'ring light'] },
      { category: 'informatica', keywords: ['notebook', 'computador', 'laptop', 'macbook', 'mouse', 'teclado', 'monitor', 'impressora', 'ssd', 'memoria ram', 'pendrive', 'pen drive', 'roteador', 'placa de video', 'gamer', 'gabinete', 'tablet', 'ipad', 'headset gamer', 'fonte atx', 'webcam'] },

      // 🎂 Confeitaria & Festas
      { category: 'confeitaria', keywords: ['confeitaria', 'forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'pasta americana', 'corante alimenticio', 'assadeira bolo', 'desmoldante'] },
      { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita'] },
      { category: 'festas', keywords: ['artigo de festa', 'decoracao festa', 'decoração festa', 'balao', 'balão', 'bexiga', 'topo de bolo', 'vela aniversario', 'vela aniversário', 'painel festa', 'lembrancinha', 'presente', 'kit festa'] },

      // 🏠 Casa & Utilidades
      { category: 'cozinha', keywords: ['air fryer', 'airfryer', 'fritadeira', 'panela', 'panelas', 'frigideira', 'liquidificador', 'batedeira', 'cafeteira', 'nespresso', 'dolce gusto', 'sanduicheira', 'grill', 'mixer', 'processador', 'chaleira', 'faqueiro', 'faca chef', 'prato', 'copo', 'talher', 'balanca cozinha', 'balança digital', 'garrafa termica'] },
      { category: 'cama_mesa_banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro', 'toalha de mesa'] },
      { category: 'organizacao', keywords: ['organizador', 'organizadora', 'pote hermetico', 'potes hermeticos', 'vassoura', 'mop', 'rodo', 'dispenser', 'lixeira', 'cabide', 'varal', 'cesto organizador', 'prateleira', 'caixa organizadora', 'sapateira'] },

      // 👗 Moda & Beleza
      { category: 'acessorios', keywords: ['relogio', 'relógio', 'smartwatch', 'bolsa', 'mochila', 'carteira', 'cinto', 'pulseira', 'colar', 'brinco', 'anel', 'corrente', 'pingente', 'oculos de sol', 'óculos de sol', 'joia', 'jóia', 'semijoia'] },
      { category: 'beleza', keywords: ['perfume', 'colonia', 'colônia', 'parfum', 'deo parfum', 'eau de parfum', 'una somos', 'natura una', 'kaiak', 'essencial', 'humor', 'biografia', 'ilia', 'ilía', 'luna', 'tododia', 'desodorante', 'hidratante', 'sabonete', 'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'skincare', 'serum facial', 'protetor solar', 'maquiagem', 'batom', 'base facial', 'rimel', 'delineador', 'esmalte', 'secador de cabelo', 'chapinha', 'modelador de cachos'] },
      { category: 'moda', keywords: ['camisa', 'camiseta', 'calca', 'calça', 'vestido', 'saia', 'bermuda', 'short', 'tenis', 'tênis', 'sapato', 'sandalia', 'sandália', 'bota', 'chinelo', 'havaianas', 'jaqueta', 'moletom', 'casaco', 'biquini', 'biquíni', 'lingerie', 'meia', 'cueca', 'sutia'] },

      // 💊 Saúde & Fitness
      { category: 'suplementos', keywords: ['whey', 'creatina', 'suplemento', 'bcaa', 'glutamina', 'pre treino', 'pré treino', 'termogenico', 'vitamina', 'omega 3', 'colageno', 'hipercalorico', 'barra de proteina'] },
      { category: 'fitness', keywords: ['haltere', 'colchonete', 'elastico treino', 'kettlebell', 'corda de pular', 'caneleira', 'barra fixa', 'faixa elastica', 'luva academia', 'smartwatch fitness', 'tapete yoga'] },
      { category: 'saude', keywords: ['medidor de pressao', 'termometro', 'inalador', 'nebulizador', 'oximetro', 'glicosimetro', 'massageador', 'balanca corporal', 'balança digital bioimpedancia', 'joelheira', 'corretor postural'] },

      // 🧸 Infantil & Papelaria
      { category: 'bebes', keywords: ['bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'berco', 'berço', 'body bebe', 'macacao bebe', 'mordedor', 'babador', 'lenço umedecido', 'cadeirinha carro'] },
      { category: 'brinquedos', keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime'] },
      { category: 'papelaria', keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel', 'mochila escolar'] },

      // 🛒 Supermercado & Mercearia
      { category: 'mercearia_doce', keywords: ['chocolate', 'bombom', 'biscoito', 'bolacha', 'doce de leite', 'nutella', 'pasta de amendoim', 'leite condensado', 'creme de leite', 'barra de chocolate', 'cacau em po', 'cacau em pó', 'granulado', 'cobertura chocolate', 'achocolatado', 'nescau', 'toddy'] },
      { category: 'mercearia_salgada', keywords: ['arroz', 'feijao', 'feijão', 'azeite', 'oleo de soja', 'óleo de soja', 'macarrao', 'macarrão', 'massa', 'molho de tomate', 'extrato de tomate', 'sal refinado', 'tempero', 'molho shoyu', 'maionese', 'ketchup', 'mostarda', 'atum', 'sardinha', 'conserva', 'farinha de trigo'] },
      { category: 'bebidas_snacks', keywords: ['whisky', 'gin', 'vodka', 'cerveja', 'vinho', 'espumante', 'refrigerante', 'coca cola', 'suco', 'cafe em graos', 'café', 'capsula cafe', 'cha', 'chá', 'snack', 'salgadinho', 'doritos', 'batata frita', 'amendoim', 'energetico', 'energético', 'red bull', 'monster'] },

      // 🛠️ Ferramentas, Auto & Pet
      { category: 'petshop', keywords: ['racao', 'ração', 'cachorro', 'gato', 'pet', 'coleira', 'guia cachorro', 'arranhador', 'caminha pet', 'cama pet', 'petisco', 'comedouro', 'bebedouro pet', 'areia gato', 'tapete higienico', 'shampoo pet'] },
      { category: 'veiculos', keywords: ['automotivo', 'carro', 'moto', 'motocicleta', 'pneu', 'capacete', 'farol', 'oleo motor', 'óleo motor', 'som automotivo', 'camera de re', 'capa automotiva', 'cera automotiva', 'lavagem automotiva', 'vonixx'] },
      { category: 'construcao', keywords: ['furadeira', 'parafusadeira', 'martelete', 'martelo', 'chave de fenda', 'chave phillips', 'trena', 'serra eletrica', 'serra circular', 'esmerilhadeira', 'ferramenta', 'jogo de ferramentas', 'torneira', 'chuveiro', 'tomada', 'extensao eletrica', 'lampada led', 'tinta parede'] }
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

  function insertBullet(symbol = '🔸') {
    const textarea = document.getElementById('affiliateDescriptionInput');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const prefix = (start > 0 && text[start - 1] !== '\n' && text[start - 1] !== ' ') ? ' ' : '';
    const insertion = `${prefix}${symbol} `;
    
    textarea.value = text.substring(0, start) + insertion + text.substring(end);
    textarea.focus();
    const newCursor = start + insertion.length;
    textarea.setSelectionRange(newCursor, newCursor);
  }

  // --- SHARE FUNCTIONALITY ---
  let currentShareItem = null;

  function buildShareText(item) {
    if (!item) return '';
    const pct = calcDiscountPercent(item.original_price, item.price_display);
    const discountText = pct > 0 ? ` (${pct}% OFF)` : '';
    const origPriceText = item.original_price ? `~${item.original_price}~ ➔ ` : '';
    const descText = item.description ? `\n${item.description}\n` : '';
    const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
    const sealHeader = isFastPick ? '👑 *PRODUTO TESTADO E RECOMENDADO PELA FASTSAVORY\'S* ✨\n' : '';
    const platformInfo = detectPlatform(item.affiliate_url);

    return `${sealHeader}🛍️ *ACHADINHO ${platformInfo.name.toUpperCase()}* ⭐\n🔥 *${item.title}*\n${descText}\n💰 *Preço:* ${origPriceText}*${item.price_display || 'Confira no link'}*${discountText}\n\n👉 *COMPRE COM DESCONTO AQUI:*\n${item.affiliate_url}\n\n💬 *Entre no canal de avisos Achadinhos Fast no WhatsApp:*\nhttps://chat.whatsapp.com/C7dT0ZWaUZKHm7atI3eOLE`;
  }

  function openShareModal(id) {
    const item = productsList.find(p => p.id == id);
    if (!item) return;

    currentShareItem = item;
    const modal = document.getElementById('affiliateShareModal');
    if (!modal) return;

    document.getElementById('shareModalProductImg').src = item.image_url || '../assets/img/fast-logo.png';
    document.getElementById('shareModalProductTitle').textContent = item.title;
    document.getElementById('shareModalProductPrice').textContent = item.price_display || 'Ver Preço';

    const pct = calcDiscountPercent(item.original_price, item.price_display);
    const discBadge = document.getElementById('shareModalProductDiscount');
    if (discBadge) {
      if (pct > 0) {
        discBadge.textContent = `🔥 ${pct}% OFF`;
        discBadge.classList.remove('hidden');
      } else {
        discBadge.classList.add('hidden');
      }
    }

    const shareMsg = buildShareText(item);
    document.getElementById('shareModalTextPreview').value = shareMsg;

    modal.classList.remove('hidden');
  }

  function closeShareModal() {
    const modal = document.getElementById('affiliateShareModal');
    if (modal) modal.classList.add('hidden');
  }

  function shareToWhatsApp() {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function shareToTelegram() {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    const url = `https://t.me/share/url?url=${encodeURIComponent(currentShareItem.affiliate_url)}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function shareToFacebook() {
    if (!currentShareItem) return;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentShareItem.affiliate_url)}`;
    window.open(url, '_blank');
  }

  async function shareNative() {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentShareItem.title,
          text: msg,
          url: currentShareItem.affiliate_url
        });
      } catch (e) {}
    } else {
      copyShareText();
    }
  }

  function copyShareText() {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => {
        alert('✨ Mensagem completa copiada! Agora basta colar no WhatsApp, Instagram, Telegram ou onde preferir.');
      });
    }
  }

  function copyShareLinkOnly() {
    if (!currentShareItem) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentShareItem.affiliate_url).then(() => {
        alert('🔗 Link de afiliado copiado!');
      });
    }
  }

  // --- CATEGORY MANAGER MODAL & ACTIONS ---
  let manageTreeCopy = null;

  async function openCategoriesModal() {
    const modal = document.getElementById('affiliateCategoriesManageModal');
    if (!modal) return;

    if (window.AchadinhosCategories) {
      await window.AchadinhosCategories.loadCategories();
      manageTreeCopy = JSON.parse(JSON.stringify(window.AchadinhosCategories.getTree()));
    } else {
      manageTreeCopy = [];
    }

    renderCategoriesManagerTree();
    modal.classList.remove('hidden');
  }

  function closeCategoriesModal() {
    const modal = document.getElementById('affiliateCategoriesManageModal');
    if (modal) modal.classList.add('hidden');
  }

  function renderCategoriesManagerTree() {
    const container = document.getElementById('affiliateCategoriesTreeContainer');
    if (!container) return;

    if (!manageTreeCopy || manageTreeCopy.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-gray-400 bg-gray-50 rounded-2xl border border-gray-100">
          Nenhum grupo de categorias cadastrado. Clique em "➕ Novo Grupo Principal" para criar.
        </div>
      `;
      return;
    }

    container.innerHTML = manageTreeCopy.map((group, groupIdx) => {
      const subListHtml = (group.subcategories || []).map((sub, subIdx) => {
        // Count products assigned to this subcategory slug or its aliases
        const allSlugs = [sub.slug, ...(sub.aliases || [])];
        const assignedCount = productsList.filter(p => p.category && allSlugs.includes(p.category)).length;
        const countBadge = assignedCount > 0
          ? `<span class="text-[10px] bg-indigo-100 text-indigo-900 font-extrabold px-2 py-0.5 rounded-full" title="${assignedCount} produtos vinculados">${assignedCount} prod.</span>`
          : `<span class="text-[10px] bg-gray-100 text-gray-400 font-semibold px-2 py-0.5 rounded-full">0 prod.</span>`;

        return `
          <div class="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 transition group/sub">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xs font-bold text-gray-800 truncate">${escapeHtml(sub.label)}</span>
              <span class="text-[10px] font-mono text-gray-400">(${escapeHtml(sub.slug)})</span>
              ${countBadge}
            </div>
            <div class="flex items-center gap-1">
              <button type="button" onclick="AffiliatesModule.promptEditSubcategory(${groupIdx}, ${subIdx})"
                title="Renomear Subcategoria"
                class="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                ✏️
              </button>
              <button type="button" onclick="AffiliatesModule.deleteSubcategory(${groupIdx}, ${subIdx})"
                title="Excluir Subcategoria"
                class="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 shadow-2xs">
          <div class="flex items-center justify-between pb-3 border-b border-gray-200/60 mb-3">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-xl">${escapeHtml(group.icon || '📂')}</span>
              <div>
                <h4 class="font-extrabold text-gray-900 text-sm">${escapeHtml(group.label)}</h4>
                <span class="text-[10px] font-mono text-gray-400">${(group.subcategories || []).length} subcategorias</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="AffiliatesModule.promptAddSubcategory(${groupIdx})"
                class="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition flex items-center gap-1 shadow-2xs">
                <span>➕</span> <span>Subcategoria</span>
              </button>
              <button type="button" onclick="AffiliatesModule.promptEditCategoryGroup(${groupIdx})"
                title="Editar Nome / Ícone do Grupo"
                class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition">
                ✏️
              </button>
              <button type="button" onclick="AffiliatesModule.deleteCategoryGroup(${groupIdx})"
                title="Excluir Grupo Inteiro"
                class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition">
                🗑️
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${subListHtml || '<div class="col-span-full text-xs text-gray-400 italic p-2">Nenhuma subcategoria neste grupo.</div>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function promptAddCategoryGroup() {
    const icon = prompt('Digite o Emoji / Ícone do novo grupo (ex: 🛋️, 🎮, 🏡):', '📂');
    if (icon === null) return;
    const label = prompt('Digite o Nome do Grupo Principal (ex: Móveis & Decoração):', '');
    if (!label || !label.trim()) return;

    const slug = window.AchadinhosCategories ? window.AchadinhosCategories.generateSlug(label) : 'grupo';
    const groupId = `group_${slug}`;

    if (!Array.isArray(manageTreeCopy)) manageTreeCopy = [];

    manageTreeCopy.push({
      id: groupId,
      label: label.trim(),
      icon: icon.trim() || '📂',
      subcategories: []
    });

    renderCategoriesManagerTree();
  }

  function promptEditCategoryGroup(groupIdx) {
    const group = manageTreeCopy[groupIdx];
    if (!group) return;

    const newIcon = prompt('Editar Ícone/Emoji:', group.icon || '📂');
    if (newIcon === null) return;
    const newLabel = prompt('Editar Nome do Grupo:', group.label);
    if (!newLabel || !newLabel.trim()) return;

    group.icon = newIcon.trim() || '📂';
    group.label = newLabel.trim();
    renderCategoriesManagerTree();
  }

  function deleteCategoryGroup(groupIdx) {
    const group = manageTreeCopy[groupIdx];
    if (!group) return;

    const subCount = (group.subcategories || []).length;
    if (subCount > 0) {
      if (!confirm(`⚠️ Este grupo contém ${subCount} subcategoria(s). Deseja realmente excluir o grupo "${group.label}" e todas as suas subcategorias?`)) {
        return;
      }
    } else {
      if (!confirm(`Deseja excluir o grupo "${group.label}"?`)) {
        return;
      }
    }

    manageTreeCopy.splice(groupIdx, 1);
    renderCategoriesManagerTree();
  }

  function promptAddSubcategory(groupIdx) {
    const group = manageTreeCopy[groupIdx];
    if (!group) return;

    const label = prompt(`Adicionar nova subcategoria em "${group.label}":`, '');
    if (!label || !label.trim()) return;

    const slug = window.AchadinhosCategories ? window.AchadinhosCategories.generateSlug(label) : 'nova_sub';

    if (!Array.isArray(group.subcategories)) {
      group.subcategories = [];
    }

    group.subcategories.push({
      slug,
      label: label.trim(),
      aliases: []
    });

    renderCategoriesManagerTree();
  }

  function promptEditSubcategory(groupIdx, subIdx) {
    const group = manageTreeCopy[groupIdx];
    if (!group || !group.subcategories || !group.subcategories[subIdx]) return;
    const sub = group.subcategories[subIdx];

    const newLabel = prompt('Editar Nome da Subcategoria:', sub.label);
    if (!newLabel || !newLabel.trim()) return;

    sub.label = newLabel.trim();
    renderCategoriesManagerTree();
  }

  function deleteSubcategory(groupIdx, subIdx) {
    const group = manageTreeCopy[groupIdx];
    if (!group || !group.subcategories || !group.subcategories[subIdx]) return;
    const sub = group.subcategories[subIdx];

    const allSlugs = [sub.slug, ...(sub.aliases || [])];
    const assignedCount = productsList.filter(p => p.category && allSlugs.includes(p.category)).length;

    if (assignedCount > 0) {
      const ok = confirm(
        `⚠️ ATENÇÃO: Existem ${assignedCount} produto(s) vinculados à subcategoria "${sub.label}".\n\n` +
        `Se você excluí-la, esses produtos permanecerão salvos no banco, porém ficarão como "Sem Categoria" no topo da lista do Admin para você reclassificá-los quando quiser.\n\n` +
        `Deseja continuar com a exclusão?`
      );
      if (!ok) return;
    } else {
      if (!confirm(`Deseja excluir a subcategoria "${sub.label}"?`)) {
        return;
      }
    }

    group.subcategories.splice(subIdx, 1);
    renderCategoriesManagerTree();
  }

  function resetCategoriesToDefault() {
    if (!confirm('⚠️ Deseja restaurar a árvore oficial padrão com os 12 Macro Grupos e 46 Subcategorias da FastSavory\'s?\n\nSuas personalizações locais serão substituídas pela estrutura padrão.')) {
      return;
    }

    if (window.AchadinhosCategories) {
      manageTreeCopy = window.AchadinhosCategories.getDefaultTree();
    }
    renderCategoriesManagerTree();
  }

  async function saveCategoriesTree() {
    if (!manageTreeCopy || manageTreeCopy.length === 0) {
      alert('A árvore não pode estar vazia.');
      return;
    }

    try {
      if (window.AchadinhosCategories) {
        await window.AchadinhosCategories.saveTree(manageTreeCopy);
      }

      populateCategorySelects();
      renderTable();

      alert('✅ Categorias salvas e sincronizadas com sucesso com a Vitrine e o Banco!');
      closeCategoriesModal();
    } catch (err) {
      console.error('[Admin Affiliates] Erro ao salvar categorias:', err);
      alert('Erro ao salvar categorias: ' + (err.message || err));
    }
  }

  function detectCategoryClient(text = '') {
    const t = (text || '').toLowerCase();
    if (t.includes('bolo') || t.includes('doce') || t.includes('chocolate') || t.includes('confeitaria') || t.includes('forma')) {
      return 'confeitaria_sobremesas';
    }
    if (t.includes('air fryer') || t.includes('panela') || t.includes('liquidificador') || t.includes('cozinha')) {
      return 'cozinha';
    }
    if (t.includes('celular') || t.includes('smartphone') || t.includes('iphone') || t.includes('xiaomi')) {
      return 'celulares';
    }
    if (t.includes('relogio') || t.includes('bolsa') || t.includes('mochila') || t.includes('oculos')) {
      return 'bolsas_malas';
    }
    if (t.includes('suplemento') || t.includes('whey') || t.includes('creatina')) {
      return 'suplementos';
    }
    if (t.includes('lavagem') || t.includes('automotivo') || t.includes('carro') || t.includes('vonixx')) {
      return 'automotivo';
    }
    return 'confeitaria_sobremesas';
  }

  // ==========================================
  // DEALS MINER (AUTONOMOUS MERCADO LIVRE INGESTION)
  // ==========================================
  function openMinerModal() {
    const modal = document.getElementById('affiliateMinerModal');
    if (modal) {
      modal.classList.remove('hidden');
      const logBox = document.getElementById('minerLiveLogBox');
      if (logBox) logBox.classList.add('hidden');
    }
  }

  function closeMinerModal() {
    const modal = document.getElementById('affiliateMinerModal');
    if (modal) modal.classList.add('hidden');
  }

  async function runDealsMiner() {
    const btn = document.getElementById('minerRunBtn');
    const logBox = document.getElementById('minerLiveLogBox');
    const logEl = document.getElementById('minerLiveLog');
    const minDiscount = parseInt(document.getElementById('minerMinDiscount')?.value || '20', 10);
    const limit = parseInt(document.getElementById('minerLimit')?.value || '12', 10);

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Minerando Ofertas...`;
    }

    if (logBox && logEl) {
      logBox.classList.remove('hidden');
      logEl.innerHTML = `<div class="text-yellow-400 font-bold">[1/3] 📡 Conectando ao hub de ofertas do Mercado Livre...</div>`;
    }

    try {
      const resp = await fetch(`/api/affiliate-deals-miner?min_discount=${minDiscount}&limit=${limit}`);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Falha ao executar mineração');
      }

      if (logEl) {
        let lines = [];
        lines.push(`<div class="text-blue-400">[2/3] 🔍 Encontradas ${data.scraped_count || 0} promoções ativas no ML.</div>`);
        lines.push(`<div class="text-emerald-400 font-bold mt-1">[3/3] ✨ Resultado do Processamento:</div>`);
        lines.push(`<div class="pl-3 text-white">✅ Novos Cadastrados: <strong class="text-green-400">${data.inserted_count || 0}</strong></div>`);
        lines.push(`<div class="pl-3 text-white">⏩ Já existiam (Ignorados): <strong class="text-yellow-300">${data.duplicate_count || 0}</strong></div>`);
        lines.push(`<div class="pl-3 text-white">⏭️ Desconto menor que ${minDiscount}%: <strong class="text-gray-400">${data.ignored_discount_count || 0}</strong></div>`);
        
        if (data.scraped_count === 0 || data.is_waf_blocked) {
          lines.push(`
            <div class="mt-3 p-3 bg-amber-950/90 border border-amber-600 rounded-lg text-amber-200 text-xs">
              <div class="font-bold text-amber-300 flex items-center gap-1.5 mb-1 text-sm">
                <span>🛡️</span> <span>Proteção Anti-Robô do Mercado Livre</span>
              </div>
              <p class="text-[11px] leading-relaxed text-amber-100">
                O Mercado Livre bloqueou a varredura automática vinda dos servidores da nuvem (Vercel/EUA) com tela de captcha/verificação de tráfego.
              </p>
              <div class="mt-2.5 pt-2 border-t border-amber-700/60 flex items-center justify-between flex-wrap gap-2">
                <span class="text-[11px] font-semibold text-white">💡 Solução 100% Livre de Bloqueio:</span>
                <button type="button" onclick="AffiliatesModule.closeMinerModal(); AffiliatesModule.openBookmarkletModal();" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow transition cursor-pointer">
                  ⚡ Usar 1-Click Quick Clip
                </button>
              </div>
            </div>
          `);
        }

        if (data.items && data.items.length > 0) {
          lines.push(`<div class="mt-2 text-xs text-gray-300 border-t border-gray-700 pt-2 font-semibold">Itens processados recentemente:</div>`);
          data.items.slice(0, 5).forEach(item => {
            lines.push(`<div class="text-[11px] text-gray-300 truncate">📦 ${item.title || 'Produto'} - <span class="text-yellow-400">${item.price_display}</span> (${item.discount_tag})</div>`);
          });
        }

        logEl.innerHTML += lines.join('');
      }

      if (window.showToast) {
        if (data.inserted_count > 0) {
          window.showToast(`🤖 Mineração concluída! +${data.inserted_count} novas ofertas inseridas.`, 'success');
        } else if (data.scraped_count === 0 || data.is_waf_blocked) {
          window.showToast(`⚠️ Mercado Livre bloqueou a varredura da nuvem. Use o 1-Click Quick Clip!`, 'warning');
        } else {
          window.showToast(`Nenhuma nova oferta precisou ser cadastrada.`, 'info');
        }
      }

      await loadProducts();
    } catch (err) {
      console.error('[Deals Miner] Erro:', err);
      if (logEl) {
        logEl.innerHTML += `<div class="text-rose-400 font-bold mt-2">❌ Erro: ${err.message}</div>`;
      }
      if (window.showToast) {
        window.showToast(`Erro na mineração: ${err.message}`, 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>🚀 Iniciar Nova Mineração</span>`;
      }
    }
  }

  // ==========================================
  // SHOPEE DEALS MINER (GRAPHQL OPEN API)
  // ==========================================
  function openShopeeMinerModal() {
    const modal = document.getElementById('affiliateShopeeMinerModal');
    if (modal) {
      modal.classList.remove('hidden');
      const logBox = document.getElementById('shopeeMinerLiveLogBox');
      if (logBox) logBox.classList.add('hidden');
    }
  }

  function closeShopeeMinerModal() {
    const modal = document.getElementById('affiliateShopeeMinerModal');
    if (modal) modal.classList.add('hidden');
  }

  async function runShopeeMiner() {
    const btn = document.getElementById('shopeeMinerRunBtn');
    const logBox = document.getElementById('shopeeMinerLiveLogBox');
    const logEl = document.getElementById('shopeeMinerLiveLog');
    const keyword = encodeURIComponent(document.getElementById('shopeeMinerKeyword')?.value || '');
    const minDiscount = parseInt(document.getElementById('shopeeMinerMinDiscount')?.value || '15', 10);
    const minSales = parseInt(document.getElementById('shopeeMinerMinSales')?.value || '30', 10);
    const minRating = parseFloat(document.getElementById('shopeeMinerMinRating')?.value || '4.7');
    const onlyVerified = document.getElementById('shopeeMinerOnlyVerified')?.checked !== false;
    const limit = parseInt(document.getElementById('shopeeMinerLimit')?.value || '12', 10);

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Minerando Shopee...`;
    }

    if (logBox && logEl) {
      logBox.classList.remove('hidden');
      logEl.innerHTML = `<div class="text-amber-400 font-bold">[1/3] 📡 Conectando à API Oficial GraphQL da Shopee...</div>`;
    }

    try {
      const url = `/api/affiliate-deals-miner?platform=shopee&keyword=${keyword}&min_discount=${minDiscount}&min_sales=${minSales}&min_rating=${minRating}&only_verified=${onlyVerified}&limit=${limit}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Falha ao executar mineração da Shopee');
      }

      if (logEl) {
        let lines = [];
        lines.push(`<div class="text-blue-400">[2/3] 🔍 Varridas ${data.scraped_count || 0} ofertas ativas de lojas verificadas.</div>`);
        lines.push(`<div class="text-emerald-400 font-bold mt-1">[3/3] ✨ Resultado do Processamento:</div>`);
        lines.push(`<div class="pl-3 text-white">✅ Novos Cadastrados: <strong class="text-green-400">${data.inserted_count || 0}</strong></div>`);
        lines.push(`<div class="pl-3 text-white">⭐ Critérios Aplicados: <strong>Vendas >= ${minSales} | Avaliação >= ${minRating} | Selo Verificado</strong></div>`);

        if (data.items && data.items.length > 0) {
          lines.push(`<div class="mt-2 text-xs text-gray-300 border-t border-gray-700 pt-2 font-semibold">Ofertas cadastradas no FastSavory's:</div>`);
          data.items.slice(0, 6).forEach(item => {
            lines.push(`<div class="text-[11px] text-gray-300 truncate">🛍️ ${item.title || 'Produto'} - <span class="text-amber-400">${item.price_display}</span> (${item.discount_tag})</div>`);
          });
        }

        logEl.innerHTML += lines.join('');
      }

      if (window.showToast) {
        if (data.inserted_count > 0) {
          window.showToast(`🛍️ Mineração Shopee concluída! +${data.inserted_count} novas ofertas cadastradas.`, 'success');
        } else {
          window.showToast(`Nenhuma nova oferta atendeu aos filtros estritos ou já estavam no banco.`, 'info');
        }
      }

      await loadProducts();
    } catch (err) {
      console.error('[Shopee Miner Frontend] Erro:', err);
      if (logEl) {
        logEl.innerHTML += `<div class="text-rose-400 font-bold mt-2">❌ Erro: ${err.message}</div>`;
      }
      if (window.showToast) {
        window.showToast(`Erro ao minerar Shopee: ${err.message}`, 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>🛍️ Iniciar Mineração Shopee</span>`;
      }
    }
  }

  // ==========================================
  // 1-CLICK QUICK CLIP (BOOKMARKLET)
  // ==========================================
  function getBookmarkletCode() {
    return 'javascript:eval(decodeURIComponent("' + "%2F**%0A%20*%20FastSavory's%20Quick%20Clip%20Turbo%20(Universal%20In-Browser%20Extension%20%2F%20Bookmarklet)%0A%20*%20Suporta%3A%0A%20*%201.%20Minera%C3%A7%C3%A3o%20em%20LOTE%20no%20Hub%20de%20Afiliados%20do%20Mercado%20Livre%20(afiliados%2Fhub)%20com%20captura%20autom%C3%A1tica%20de%20links%20%2Fsec%2F%20oficiais.%0A%20*%202.%20Minera%C3%A7%C3%A3o%20individual%20em%201-Clique%20na%20Amazon%2C%20Shopee%2C%20Mercado%20Livre%20(PDP)%2C%20Natura%20e%20Avon.%0A%20*%2F%0A(function%20()%20%7B%0A%20%20try%20%7B%0A%20%20%20%20const%20host%20%3D%20window.location.hostname%3B%0A%20%20%20%20const%20href%20%3D%20window.location.href%3B%0A%0A%20%20%20%20%2F%2F%20%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%0A%20%20%20%20%2F%2F%201.%20MODO%20LOTE%3A%20HUB%20DE%20AFILIADOS%20MERCADO%20LIVRE%20OU%20OFERTAS%0A%20%20%20%20%2F%2F%20%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%0A%20%20%20%20const%20isMLHub%20%3D%20(host.includes('mercadolivre')%20%7C%7C%20host.includes('mercadolibre'))%20%26%26%0A%20%20%20%20%20%20(href.includes('%2Fafiliados')%20%7C%7C%20href.includes('%2Fofertas')%20%7C%7C%20(!href.includes('%2FMLB')%20%26%26%20!href.includes('%2Fp%2FMLB')))%3B%0A%0A%20%20%20%20if%20(isMLHub)%20%7B%0A%20%20%20%20%20%20runMLHubBatchMiner()%3B%0A%20%20%20%20%20%20return%3B%0A%20%20%20%20%7D%0A%0A%20%20%20%20%2F%2F%20%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%0A%20%20%20%20%2F%2F%202.%20MODO%20INDIVIDUAL%3A%20PRODUTOS%20AVULSOS%20(AMAZON%2C%20SHOPEE%2C%20ML%2C%20NATURA)%0A%20%20%20%20%2F%2F%20%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%3D%0A%20%20%20%20runSingleProductQuickClip(host%2C%20href)%3B%0A%0A%20%20%7D%20catch%20(e)%20%7B%0A%20%20%20%20alert('Erro%20Quick%20Clip%3A%20'%20%2B%20e.message)%3B%0A%20%20%7D%0A%0A%20%20%2F%2F%20------------------------------------------------------------%0A%20%20%2F%2F%20FUN%C3%87%C3%83O%3A%20MINERA%C3%87%C3%83O%20EM%20LOTE%20NO%20HUB%20DE%20AFILIADOS%20DO%20MERCADO%20LIVRE%0A%20%20%2F%2F%20------------------------------------------------------------%0A%20%20function%20runMLHubBatchMiner()%20%7B%0A%20%20%20%20const%20existingDrawer%20%3D%20document.getElementById('fastsavorys-hub-drawer')%3B%0A%20%20%20%20if%20(existingDrawer)%20%7B%0A%20%20%20%20%20%20existingDrawer.style.display%20%3D%20existingDrawer.style.display%20%3D%3D%3D%20'none'%20%3F%20'block'%20%3A%20'none'%3B%0A%20%20%20%20%20%20return%3B%0A%20%20%20%20%7D%0A%0A%20%20%20%20%2F%2F%20Cria%20Painel%20Flutuante%20na%20tela%20do%20usu%C3%A1rio%0A%20%20%20%20const%20drawer%20%3D%20document.createElement('div')%3B%0A%20%20%20%20drawer.id%20%3D%20'fastsavorys-hub-drawer'%3B%0A%20%20%20%20drawer.style.cssText%20%3D%20%60%0A%20%20%20%20%20%20position%3A%20fixed%3B%0A%20%20%20%20%20%20bottom%3A%2020px%3B%0A%20%20%20%20%20%20right%3A%2020px%3B%0A%20%20%20%20%20%20width%3A%20420px%3B%0A%20%20%20%20%20%20max-width%3A%2095vw%3B%0A%20%20%20%20%20%20max-height%3A%2085vh%3B%0A%20%20%20%20%20%20background%3A%20%230f172a%3B%0A%20%20%20%20%20%20color%3A%20%23f8fafc%3B%0A%20%20%20%20%20%20border%3A%201px%20solid%20%23334155%3B%0A%20%20%20%20%20%20border-radius%3A%2016px%3B%0A%20%20%20%20%20%20box-shadow%3A%200%2025px%2050px%20-12px%20rgba(0%2C%200%2C%200%2C%200.5)%2C%200%200%200%201px%20rgba(255%2C%20255%2C%20255%2C%200.05)%3B%0A%20%20%20%20%20%20z-index%3A%20999999999%3B%0A%20%20%20%20%20%20font-family%3A%20-apple-system%2C%20BlinkMacSystemFont%2C%20%22Segoe%20UI%22%2C%20Roboto%2C%20sans-serif%3B%0A%20%20%20%20%20%20display%3A%20flex%3B%0A%20%20%20%20%20%20flex-direction%3A%20column%3B%0A%20%20%20%20%20%20overflow%3A%20hidden%3B%0A%20%20%20%20%60%3B%0A%0A%20%20%20%20drawer.innerHTML%20%3D%20%60%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22background%3A%20linear-gradient(135deg%2C%20%231e293b%2C%20%230f172a)%3B%20padding%3A%2014px%2018px%3B%20border-bottom%3A%201px%20solid%20%23334155%3B%20display%3A%20flex%3B%20align-items%3A%20center%3B%20justify-content%3A%20space-between%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3A%20flex%3B%20align-items%3A%20center%3B%20gap%3A%208px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%20style%3D%22font-size%3A%2020px%3B%22%3E%E2%9A%A1%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cdiv%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Ch3%20style%3D%22margin%3A%200%3B%20font-size%3A%2015px%3B%20font-weight%3A%20700%3B%20color%3A%20%23fff%3B%20letter-spacing%3A%20-0.3px%3B%22%3EFastSavory's%20Hub%20Miner%3C%2Fh3%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cp%20style%3D%22margin%3A%200%3B%20font-size%3A%2011px%3B%20color%3A%20%2394a3b8%3B%22%3ECentral%20de%20Afiliados%20Mercado%20Livre%3C%2Fp%3E%0A%20%20%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3A%20flex%3B%20align-items%3A%20center%3B%20gap%3A%208px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%20id%3D%22fast-item-count%22%20style%3D%22background%3A%20%233b82f6%3B%20color%3A%20%23fff%3B%20font-size%3A%2011px%3B%20font-weight%3A%20700%3B%20padding%3A%202px%208px%3B%20border-radius%3A%20999px%3B%22%3E0%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22fast-close-btn%22%20style%3D%22background%3A%20transparent%3B%20border%3A%20none%3B%20color%3A%20%2394a3b8%3B%20font-size%3A%2018px%3B%20cursor%3A%20pointer%3B%20padding%3A%204px%3B%20line-height%3A%201%3B%22%3E%E2%9C%95%3C%2Fbutton%3E%0A%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22padding%3A%2012px%2018px%3B%20background%3A%20rgba(30%2C%2041%2C%2059%2C%200.5)%3B%20border-bottom%3A%201px%20solid%20%23334155%3B%20font-size%3A%2012px%3B%20color%3A%20%23cbd5e1%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Clabel%20style%3D%22display%3A%20flex%3B%20align-items%3A%20center%3B%20gap%3A%208px%3B%20cursor%3A%20pointer%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cinput%20type%3D%22checkbox%22%20id%3D%22fast-auto-share-links%22%20checked%20style%3D%22accent-color%3A%20%233b82f6%3B%20width%3A%2015px%3B%20height%3A%2015px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%3EGerar%20links%20%3Cstrong%3E%2Fsec%2F%20oficiais%3C%2Fstrong%3E%20(auto-clique%20em%20Compartilhar)%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%3C%2Flabel%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%0A%20%20%20%20%20%20%3Cdiv%20id%3D%22fast-items-list%22%20style%3D%22flex%3A%201%3B%20overflow-y%3A%20auto%3B%20padding%3A%2012px%2018px%3B%20display%3A%20flex%3B%20flex-direction%3A%20column%3B%20gap%3A%2010px%3B%20max-height%3A%2045vh%3B%22%3E%0A%20%20%20%20%20%20%20%20%3C!--%20Itens%20inseridos%20dinamicamente%20--%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%0A%20%20%20%20%20%20%3Cdiv%20id%3D%22fast-progress-bar-container%22%20style%3D%22display%3A%20none%3B%20padding%3A%2010px%2018px%3B%20background%3A%20%231e293b%3B%20border-top%3A%201px%20solid%20%23334155%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3A%20flex%3B%20justify-content%3A%20space-between%3B%20font-size%3A%2011px%3B%20color%3A%20%2394a3b8%3B%20margin-bottom%3A%204px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%20id%3D%22fast-progress-label%22%3EProcessando...%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%20id%3D%22fast-progress-pct%22%3E0%25%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22width%3A%20100%25%3B%20height%3A%206px%3B%20background%3A%20%23334155%3B%20border-radius%3A%20999px%3B%20overflow%3A%20hidden%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cdiv%20id%3D%22fast-progress-bar%22%20style%3D%22width%3A%200%25%3B%20height%3A%20100%25%3B%20background%3A%20%233b82f6%3B%20transition%3A%20width%200.2s%3B%22%3E%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%0A%20%20%20%20%20%20%3Cdiv%20style%3D%22padding%3A%2014px%2018px%3B%20background%3A%20%230f172a%3B%20border-top%3A%201px%20solid%20%23334155%3B%20display%3A%20flex%3B%20gap%3A%2010px%3B%22%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22fast-rescan-btn%22%20style%3D%22flex%3A%201%3B%20background%3A%20%23334155%3B%20color%3A%20%23fff%3B%20border%3A%20none%3B%20border-radius%3A%208px%3B%20padding%3A%2010px%3B%20font-size%3A%2012px%3B%20font-weight%3A%20600%3B%20cursor%3A%20pointer%3B%20transition%3A%200.2s%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%F0%9F%94%84%20Re-escanear%0A%20%20%20%20%20%20%20%20%3C%2Fbutton%3E%0A%20%20%20%20%20%20%20%20%3Cbutton%20id%3D%22fast-import-btn%22%20style%3D%22flex%3A%202%3B%20background%3A%20linear-gradient(135deg%2C%20%232563eb%2C%20%231d4ed8)%3B%20color%3A%20%23fff%3B%20border%3A%20none%3B%20border-radius%3A%208px%3B%20padding%3A%2010px%3B%20font-size%3A%2013px%3B%20font-weight%3A%20700%3B%20cursor%3A%20pointer%3B%20display%3A%20flex%3B%20align-items%3A%20center%3B%20justify-content%3A%20center%3B%20gap%3A%206px%3B%20transition%3A%200.2s%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%3E%F0%9F%9A%80%20Salvar%20no%20Site%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%3C%2Fbutton%3E%0A%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%60%3B%0A%0A%20%20%20%20document.body.appendChild(drawer)%3B%0A%0A%20%20%20%20document.getElementById('fast-close-btn').onclick%20%3D%20()%20%3D%3E%20drawer.remove()%3B%0A%0A%20%20%20%20function%20scanCards()%20%7B%0A%20%20%20%20%20%20const%20listEl%20%3D%20document.getElementById('fast-items-list')%3B%0A%20%20%20%20%20%20const%20countEl%20%3D%20document.getElementById('fast-item-count')%3B%0A%20%20%20%20%20%20listEl.innerHTML%20%3D%20''%3B%0A%0A%20%20%20%20%20%20%2F%2F%20Localiza%20todos%20os%20bot%C3%B5es%20%22Compartilhar%22%20ou%20cards%0A%20%20%20%20%20%20const%20allButtons%20%3D%20Array.from(document.querySelectorAll('button%2C%20a'))%3B%0A%20%20%20%20%20%20const%20shareButtons%20%3D%20allButtons.filter(b%20%3D%3E%20(b.innerText%20%7C%7C%20'').trim().toLowerCase()%20%3D%3D%3D%20'compartilhar')%3B%0A%0A%20%20%20%20%20%20let%20rawCards%20%3D%20%5B%5D%3B%0A%20%20%20%20%20%20if%20(shareButtons.length%20%3E%200)%20%7B%0A%20%20%20%20%20%20%20%20shareButtons.forEach(btn%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20%20%20const%20c%20%3D%20btn.closest('.andes-card')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20btn.closest('%5Bclass*%3D%22card%22%5D')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20btn.closest('%5Bclass*%3D%22poly%22%5D')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20btn.parentElement%3F.parentElement%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20btn.parentElement%3B%0A%20%20%20%20%20%20%20%20%20%20if%20(c%20%26%26%20!rawCards.some(rc%20%3D%3E%20rc.container%20%3D%3D%3D%20c))%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20rawCards.push(%7B%20container%3A%20c%2C%20shareBtn%3A%20btn%20%7D)%3B%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D)%3B%0A%20%20%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20%20%20const%20polyCards%20%3D%20Array.from(document.querySelectorAll('.poly-card%2C%20.ui-search-result%2C%20.andes-card%2C%20%5Bclass*%3D%22product-card%22%5D'))%3B%0A%20%20%20%20%20%20%20%20polyCards.forEach(c%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20%20%20if%20(c.innerText%20%26%26%20c.innerText.includes('R%24'))%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20rawCards.push(%7B%20container%3A%20c%2C%20shareBtn%3A%20c.querySelector('button')%20%7D)%3B%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D)%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20const%20parsedItems%20%3D%20%5B%5D%3B%0A%20%20%20%20%20%20rawCards.forEach((rc%2C%20idx)%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20c%20%3D%20rc.container%3B%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Imagem%0A%20%20%20%20%20%20%20%20const%20imgEl%20%3D%20c.querySelector('img%5Bsrc%5E%3D%22http%22%5D%2C%20img%5Bdata-src%5E%3D%22http%22%5D')%3B%0A%20%20%20%20%20%20%20%20const%20image_url%20%3D%20imgEl%20%3F%20(imgEl.src%20%7C%7C%20imgEl.getAttribute('data-src')%20%7C%7C%20'')%20%3A%20''%3B%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20T%C3%ADtulo%0A%20%20%20%20%20%20%20%20const%20titleEl%20%3D%20c.querySelector('h2%2C%20h3%2C%20h4%2C%20%5Bclass*%3D%22title%22%5D%2C%20a%5Btitle%5D')%3B%0A%20%20%20%20%20%20%20%20let%20title%20%3D%20(titleEl%20%3F%20(titleEl.innerText%20%7C%7C%20titleEl.getAttribute('title'))%20%3A%20'').trim()%3B%0A%20%20%20%20%20%20%20%20if%20(!title)%20%7B%0A%20%20%20%20%20%20%20%20%20%20const%20links%20%3D%20Array.from(c.querySelectorAll('a'))%3B%0A%20%20%20%20%20%20%20%20%20%20for%20(const%20l%20of%20links)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20const%20t%20%3D%20(l.innerText%20%7C%7C%20'').trim()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20if%20(t.length%20%3E%2015%20%26%26%20!t.includes('Compartilhar')%20%26%26%20!t.includes('R%24'))%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20title%20%3D%20t%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20break%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20if%20(!title)%20%7B%0A%20%20%20%20%20%20%20%20%20%20const%20paragraphs%20%3D%20Array.from(c.querySelectorAll('p%2C%20span%2C%20div'))%3B%0A%20%20%20%20%20%20%20%20%20%20for%20(const%20p%20of%20paragraphs)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20const%20t%20%3D%20(p.innerText%20%7C%7C%20'').trim()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20if%20(t.length%20%3E%2020%20%26%26%20!t.includes('Compartilhar')%20%26%26%20!t.includes('R%24')%20%26%26%20!t.includes('GANHOS'))%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20title%20%3D%20t%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20break%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Link%20de%20produto%20padr%C3%A3o%0A%20%20%20%20%20%20%20%20const%20linkEl%20%3D%20c.querySelector('a%5Bhref*%3D%22mercadolivre.com%22%5D%2C%20a%5Bhref*%3D%22MLB%22%5D%2C%20a%5Bhref*%3D%22%2Fp%2F%22%5D')%20%7C%7C%20c.querySelector('a')%3B%0A%20%20%20%20%20%20%20%20let%20product_url%20%3D%20linkEl%20%3F%20linkEl.href%20%3A%20''%3B%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Pre%C3%A7o%20atual%0A%20%20%20%20%20%20%20%20let%20price_display%20%3D%20''%3B%0A%20%20%20%20%20%20%20%20const%20priceMatches%20%3D%20(c.innerText%20%7C%7C%20'').match(%2FR%5C%24%5Cs*%5B0-9%5D%2B(%3F%3A%5C.%5B0-9%5D%7B3%7D)*(%3F%3A%2C%5B0-9%5D%7B2%7D)%3F%2Fg)%20%7C%7C%20%5B%5D%3B%0A%20%20%20%20%20%20%20%20if%20(priceMatches.length%20%3E%200)%20%7B%0A%20%20%20%20%20%20%20%20%20%20price_display%20%3D%20priceMatches%5BpriceMatches.length%20-%201%5D.replace(%2F%5Cs%2B%2Fg%2C%20'%20')%3B%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Pre%C3%A7o%20original%20(riscado)%0A%20%20%20%20%20%20%20%20let%20original_price%20%3D%20''%3B%0A%20%20%20%20%20%20%20%20const%20origEl%20%3D%20c.querySelector('s%2C%20del%2C%20%5Bclass*%3D%22original%22%5D%2C%20%5Bstyle*%3D%22line-through%22%5D')%3B%0A%20%20%20%20%20%20%20%20if%20(origEl)%20%7B%0A%20%20%20%20%20%20%20%20%20%20const%20m%20%3D%20(origEl.innerText%20%7C%7C%20'').match(%2FR%5C%24%5Cs*%5B0-9.%2C%5D%2B%2Fi)%3B%0A%20%20%20%20%20%20%20%20%20%20if%20(m)%20original_price%20%3D%20m%5B0%5D.replace(%2F%5Cs%2B%2Fg%2C%20'%20')%3B%0A%20%20%20%20%20%20%20%20%7D%20else%20if%20(priceMatches.length%20%3E%201)%20%7B%0A%20%20%20%20%20%20%20%20%20%20original_price%20%3D%20priceMatches%5B0%5D.replace(%2F%5Cs%2B%2Fg%2C%20'%20')%3B%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Desconto%20%25%0A%20%20%20%20%20%20%20%20let%20discount_tag%20%3D%20''%3B%0A%20%20%20%20%20%20%20%20const%20discMatch%20%3D%20(c.innerText%20%7C%7C%20'').match(%2F(%5B0-9%5D%7B1%2C2%7D%25%5Cs*OFF)%2Fi)%3B%0A%20%20%20%20%20%20%20%20if%20(discMatch)%20%7B%0A%20%20%20%20%20%20%20%20%20%20discount_tag%20%3D%20discMatch%5B1%5D.toUpperCase()%3B%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Comiss%C3%A3o%20%2F%20Ganhos%0A%20%20%20%20%20%20%20%20const%20comMatch%20%3D%20(c.innerText%20%7C%7C%20'').match(%2F(%3F%3AGANHOS%20EXTRAS%7CCOMISS%5B%C3%83A%5DO)%5Cs*(%5B0-9%25%5D%2B)%2Fi)%3B%0A%20%20%20%20%20%20%20%20const%20commission_tag%20%3D%20comMatch%20%3F%20comMatch%5B0%5D%20%3A%20''%3B%0A%0A%20%20%20%20%20%20%20%20if%20(title%20%26%26%20price_display)%20%7B%0A%20%20%20%20%20%20%20%20%20%20parsedItems.push(%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20id%3A%20idx%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20container%3A%20c%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20shareBtn%3A%20rc.shareBtn%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20title%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20image_url%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20product_url%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20price_display%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20original_price%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20discount_tag%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20commission_tag%0A%20%20%20%20%20%20%20%20%20%20%7D)%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D)%3B%0A%0A%20%20%20%20%20%20countEl.innerText%20%3D%20parsedItems.length%3B%0A%0A%20%20%20%20%20%20if%20(parsedItems.length%20%3D%3D%3D%200)%20%7B%0A%20%20%20%20%20%20%20%20listEl.innerHTML%20%3D%20%60%0A%20%20%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22text-align%3A%20center%3B%20padding%3A%2030px%2010px%3B%20color%3A%20%2394a3b8%3B%20font-size%3A%2013px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22font-size%3A%2028px%3B%20margin-bottom%3A%208px%3B%22%3E%F0%9F%94%8D%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cp%20style%3D%22margin%3A%200%200%206px%200%3B%20font-weight%3A%20600%3B%20color%3A%20%23e2e8f0%3B%22%3ENenhum%20produto%20detectado%20nesta%20visualiza%C3%A7%C3%A3o.%3C%2Fp%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cp%20style%3D%22margin%3A%200%3B%20font-size%3A%2011px%3B%22%3ERole%20a%20p%C3%A1gina%20do%20Mercado%20Livre%20para%20baixo%20para%20carregar%20os%20produtos%20e%20clique%20em%20%3Cstrong%3ERe-escanear%3C%2Fstrong%3E.%3C%2Fp%3E%0A%20%20%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%60%3B%0A%20%20%20%20%20%20%20%20return%20%5B%5D%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20parsedItems.forEach((item%2C%20index)%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20row%20%3D%20document.createElement('div')%3B%0A%20%20%20%20%20%20%20%20row.id%20%3D%20%60fast-row-%24%7Bindex%7D%60%3B%0A%20%20%20%20%20%20%20%20row.style.cssText%20%3D%20%60%0A%20%20%20%20%20%20%20%20%20%20display%3A%20flex%3B%0A%20%20%20%20%20%20%20%20%20%20align-items%3A%20center%3B%0A%20%20%20%20%20%20%20%20%20%20gap%3A%2010px%3B%0A%20%20%20%20%20%20%20%20%20%20background%3A%20%231e293b%3B%0A%20%20%20%20%20%20%20%20%20%20padding%3A%208px%2010px%3B%0A%20%20%20%20%20%20%20%20%20%20border-radius%3A%208px%3B%0A%20%20%20%20%20%20%20%20%20%20border%3A%201px%20solid%20%23334155%3B%0A%20%20%20%20%20%20%20%20%20%20font-size%3A%2012px%3B%0A%20%20%20%20%20%20%20%20%60%3B%0A%20%20%20%20%20%20%20%20row.innerHTML%20%3D%20%60%0A%20%20%20%20%20%20%20%20%20%20%3Cinput%20type%3D%22checkbox%22%20class%3D%22fast-item-check%22%20data-index%3D%22%24%7Bindex%7D%22%20checked%20style%3D%22accent-color%3A%20%233b82f6%3B%20width%3A%2015px%3B%20height%3A%2015px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cimg%20src%3D%22%24%7Bitem.image_url%20%7C%7C%20'https%3A%2F%2Fvia.placeholder.com%2F40'%7D%22%20style%3D%22width%3A%2036px%3B%20height%3A%2036px%3B%20object-fit%3A%20cover%3B%20border-radius%3A%206px%3B%20background%3A%20%23fff%3B%22%20%2F%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22flex%3A%201%3B%20min-width%3A%200%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22font-weight%3A%20600%3B%20color%3A%20%23f8fafc%3B%20white-space%3A%20nowrap%3B%20overflow%3A%20hidden%3B%20text-overflow%3A%20ellipsis%3B%20font-size%3A%2012px%3B%22%3E%24%7Bitem.title%7D%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%3Cdiv%20style%3D%22display%3A%20flex%3B%20align-items%3A%20center%3B%20gap%3A%206px%3B%20margin-top%3A%202px%3B%22%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%3Cspan%20style%3D%22color%3A%20%2338bdf8%3B%20font-weight%3A%20700%3B%22%3E%24%7Bitem.price_display%7D%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%24%7Bitem.original_price%20%3F%20%60%3Cspan%20style%3D%22color%3A%20%2364748b%3B%20text-decoration%3A%20line-through%3B%20font-size%3A%2010px%3B%22%3E%24%7Bitem.original_price%7D%3C%2Fspan%3E%60%20%3A%20''%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%24%7Bitem.discount_tag%20%3F%20%60%3Cspan%20style%3D%22background%3A%20%2310b981%3B%20color%3A%20%23fff%3B%20font-size%3A%209px%3B%20font-weight%3A%20700%3B%20padding%3A%201px%204px%3B%20border-radius%3A%204px%3B%22%3E%24%7Bitem.discount_tag%7D%3C%2Fspan%3E%60%20%3A%20''%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%24%7Bitem.commission_tag%20%3F%20%60%3Cspan%20style%3D%22background%3A%20%238b5cf6%3B%20color%3A%20%23fff%3B%20font-size%3A%209px%3B%20font-weight%3A%20700%3B%20padding%3A%201px%204px%3B%20border-radius%3A%204px%3B%22%3E%24%7Bitem.commission_tag%7D%3C%2Fspan%3E%60%20%3A%20''%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%20%20%3C%2Fdiv%3E%0A%20%20%20%20%20%20%20%20%20%20%3Cspan%20class%3D%22fast-item-status%22%20style%3D%22font-size%3A%2011px%3B%20color%3A%20%2394a3b8%3B%22%3EPronto%3C%2Fspan%3E%0A%20%20%20%20%20%20%20%20%60%3B%0A%20%20%20%20%20%20%20%20listEl.appendChild(row)%3B%0A%20%20%20%20%20%20%7D)%3B%0A%0A%20%20%20%20%20%20return%20parsedItems%3B%0A%20%20%20%20%7D%0A%0A%20%20%20%20let%20currentItems%20%3D%20scanCards()%3B%0A%0A%20%20%20%20document.getElementById('fast-rescan-btn').onclick%20%3D%20()%20%3D%3E%20%7B%0A%20%20%20%20%20%20currentItems%20%3D%20scanCards()%3B%0A%20%20%20%20%7D%3B%0A%0A%20%20%20%20%2F%2F%20BOT%C3%83O%20SALVAR%20NO%20SITE%20(PROCESSAMENTO%20E%20ENVIO%20EM%20LOTE)%0A%20%20%20%20document.getElementById('fast-import-btn').onclick%20%3D%20async%20()%20%3D%3E%20%7B%0A%20%20%20%20%20%20const%20checkboxes%20%3D%20Array.from(document.querySelectorAll('.fast-item-check%3Achecked'))%3B%0A%20%20%20%20%20%20if%20(checkboxes.length%20%3D%3D%3D%200)%20%7B%0A%20%20%20%20%20%20%20%20alert('Selecione%20ao%20menos%20um%20produto%20da%20lista!')%3B%0A%20%20%20%20%20%20%20%20return%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20const%20autoShare%20%3D%20document.getElementById('fast-auto-share-links').checked%3B%0A%20%20%20%20%20%20const%20progressContainer%20%3D%20document.getElementById('fast-progress-bar-container')%3B%0A%20%20%20%20%20%20const%20progressBar%20%3D%20document.getElementById('fast-progress-bar')%3B%0A%20%20%20%20%20%20const%20progressLabel%20%3D%20document.getElementById('fast-progress-label')%3B%0A%20%20%20%20%20%20const%20progressPct%20%3D%20document.getElementById('fast-progress-pct')%3B%0A%20%20%20%20%20%20const%20importBtn%20%3D%20document.getElementById('fast-import-btn')%3B%0A%0A%20%20%20%20%20%20importBtn.disabled%20%3D%20true%3B%0A%20%20%20%20%20%20importBtn.style.opacity%20%3D%20'0.5'%3B%0A%20%20%20%20%20%20progressContainer.style.display%20%3D%20'block'%3B%0A%0A%20%20%20%20%20%20const%20itemsToUpload%20%3D%20%5B%5D%3B%0A%0A%20%20%20%20%20%20for%20(let%20i%20%3D%200%3B%20i%20%3C%20checkboxes.length%3B%20i%2B%2B)%20%7B%0A%20%20%20%20%20%20%20%20const%20idx%20%3D%20parseInt(checkboxes%5Bi%5D.getAttribute('data-index')%2C%2010)%3B%0A%20%20%20%20%20%20%20%20const%20item%20%3D%20currentItems%5Bidx%5D%3B%0A%20%20%20%20%20%20%20%20const%20rowEl%20%3D%20document.getElementById(%60fast-row-%24%7Bidx%7D%60)%3B%0A%20%20%20%20%20%20%20%20const%20statusEl%20%3D%20rowEl%3F.querySelector('.fast-item-status')%3B%0A%0A%20%20%20%20%20%20%20%20const%20pct%20%3D%20Math.round(((i%20%2B%201)%20%2F%20checkboxes.length)%20*%20100)%3B%0A%20%20%20%20%20%20%20%20progressBar.style.width%20%3D%20%60%24%7Bpct%7D%25%60%3B%0A%20%20%20%20%20%20%20%20progressPct.innerText%20%3D%20%60%24%7Bpct%7D%25%60%3B%0A%20%20%20%20%20%20%20%20progressLabel.innerText%20%3D%20%60Processando%20%24%7Bi%20%2B%201%7D%20de%20%24%7Bcheckboxes.length%7D%3A%20%24%7B(item.title%20%7C%7C%20'').substring(0%2C%2020)%7D...%60%3B%0A%0A%20%20%20%20%20%20%20%20if%20(statusEl)%20%7B%0A%20%20%20%20%20%20%20%20%20%20statusEl.innerText%20%3D%20'Capturando%20link...'%3B%0A%20%20%20%20%20%20%20%20%20%20statusEl.style.color%20%3D%20'%2338bdf8'%3B%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20let%20affiliateUrl%20%3D%20item.product_url%3B%0A%0A%20%20%20%20%20%20%20%20%2F%2F%20Auto-clique%20em%20Compartilhar%20para%20obter%20link%20%2Fsec%2F%20oficial%0A%20%20%20%20%20%20%20%20if%20(autoShare%20%26%26%20item.shareBtn)%20%7B%0A%20%20%20%20%20%20%20%20%20%20try%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20item.shareBtn.click()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20await%20new%20Promise(r%20%3D%3E%20setTimeout(r%2C%20450))%3B%0A%0A%20%20%20%20%20%20%20%20%20%20%20%20%2F%2F%20Procura%20link%20%2Fsec%2F%20ou%20meli.la%20no%20modal%0A%20%20%20%20%20%20%20%20%20%20%20%20const%20secMatch%20%3D%20(document.body.innerText%20%7C%7C%20'').match(%2Fhttps%3F%3A%5C%2F%5C%2F(%3F%3Amercadolivre%5C.com%5C%2Fsec%7Cmeli%5C.la)%5C%2F%5Ba-zA-Z0-9_-%5D%2B%2Fi)%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20const%20inputLink%20%3D%20document.querySelector('input%5Bvalue*%3D%22%2Fsec%2F%22%5D%2C%20input%5Bvalue*%3D%22meli.la%22%5D%2C%20.andes-modal%20input')%3B%0A%0A%20%20%20%20%20%20%20%20%20%20%20%20if%20(inputLink%20%26%26%20inputLink.value)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20affiliateUrl%20%3D%20inputLink.value.trim()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%20else%20if%20(secMatch)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20affiliateUrl%20%3D%20secMatch%5B0%5D.trim()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20%20%20%20%20%2F%2F%20Fecha%20modal%0A%20%20%20%20%20%20%20%20%20%20%20%20const%20closeBtn%20%3D%20document.querySelector('.andes-modal__close-button%2C%20%5Baria-label*%3D%22Fechar%22%20i%5D%2C%20%5Baria-label*%3D%22Close%22%20i%5D%2C%20%5Bdata-testid%3D%22modal-close-button%22%5D')%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20if%20(closeBtn)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20closeBtn.click()%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.dispatchEvent(new%20KeyboardEvent('keydown'%2C%20%7B%20key%3A%20'Escape'%2C%20code%3A%20'Escape'%2C%20bubbles%3A%20true%20%7D))%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20await%20new%20Promise(r%20%3D%3E%20setTimeout(r%2C%20200))%3B%0A%20%20%20%20%20%20%20%20%20%20%7D%20catch%20(shareErr)%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20console.warn('%5BHub%20Miner%5D%20Erro%20no%20auto-compartilhar%3A'%2C%20shareErr)%3B%0A%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20if%20(statusEl)%20%7B%0A%20%20%20%20%20%20%20%20%20%20statusEl.innerText%20%3D%20affiliateUrl.includes('%2Fsec%2F')%20%7C%7C%20affiliateUrl.includes('meli.la')%20%3F%20'Link%20Oficial%20%E2%9C%85'%20%3A%20'OK'%3B%0A%20%20%20%20%20%20%20%20%20%20statusEl.style.color%20%3D%20'%2310b981'%3B%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20%20%20itemsToUpload.push(%7B%0A%20%20%20%20%20%20%20%20%20%20platform%3A%20'mercadolivre'%2C%0A%20%20%20%20%20%20%20%20%20%20title%3A%20item.title%2C%0A%20%20%20%20%20%20%20%20%20%20url%3A%20affiliateUrl%2C%0A%20%20%20%20%20%20%20%20%20%20affiliate_url%3A%20affiliateUrl%2C%0A%20%20%20%20%20%20%20%20%20%20image_url%3A%20item.image_url%2C%0A%20%20%20%20%20%20%20%20%20%20price_display%3A%20item.price_display%2C%0A%20%20%20%20%20%20%20%20%20%20original_price%3A%20item.original_price%2C%0A%20%20%20%20%20%20%20%20%20%20discount_tag%3A%20item.discount_tag%2C%0A%20%20%20%20%20%20%20%20%20%20badge_tag%3A%20item.commission_tag%20%3F%20'Comiss%C3%A3o%20Extra'%20%3A%20null%0A%20%20%20%20%20%20%20%20%7D)%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20progressLabel.innerText%20%3D%20%60Enviando%20%24%7BitemsToUpload.length%7D%20produtos%20para%20o%20FastSavory's...%60%3B%0A%0A%20%20%20%20%20%20try%20%7B%0A%20%20%20%20%20%20%20%20const%20res%20%3D%20await%20fetch('https%3A%2F%2Ffastsavorys.vercel.app%2Fapi%2Fcheck-affiliate-links%3Faction%3Dquick-save-batch'%2C%20%7B%0A%20%20%20%20%20%20%20%20%20%20method%3A%20'POST'%2C%0A%20%20%20%20%20%20%20%20%20%20headers%3A%20%7B%20'Content-Type'%3A%20'application%2Fjson'%20%7D%2C%0A%20%20%20%20%20%20%20%20%20%20body%3A%20JSON.stringify(%7B%20items%3A%20itemsToUpload%20%7D)%0A%20%20%20%20%20%20%20%20%7D)%3B%0A%20%20%20%20%20%20%20%20const%20data%20%3D%20await%20res.json()%3B%0A%0A%20%20%20%20%20%20%20%20if%20(data.success)%20%7B%0A%20%20%20%20%20%20%20%20%20%20progressLabel.innerText%20%3D%20%60%F0%9F%8E%89%20Conclu%C3%ADdo!%20%2B%24%7Bdata.inserted_count%20%7C%7C%20itemsToUpload.length%7D%20salvos%20no%20site!%60%3B%0A%20%20%20%20%20%20%20%20%20%20progressLabel.style.color%20%3D%20'%2310b981'%3B%0A%20%20%20%20%20%20%20%20%20%20alert(%60%F0%9F%8E%89%20Sucesso%20FastSavory's!%5Cn%5Cn%24%7Bdata.inserted_count%20%7C%7C%200%7D%20novas%20ofertas%20cadastradas.%5Cn%24%7Bdata.duplicates_skipped%20%7C%7C%200%7D%20j%C3%A1%20estavam%20no%20site.%5Cn%5CnVerifique%20no%20seu%20painel%20de%20admin!%60)%3B%0A%20%20%20%20%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20%20%20%20%20throw%20new%20Error(data.error%20%7C%7C%20'Erro%20ao%20salvar%20produtos')%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%20catch%20(err)%20%7B%0A%20%20%20%20%20%20%20%20progressLabel.innerText%20%3D%20%60%E2%9D%8C%20Erro%3A%20%24%7Berr.message%7D%60%3B%0A%20%20%20%20%20%20%20%20progressLabel.style.color%20%3D%20'%23f43f5e'%3B%0A%20%20%20%20%20%20%20%20alert(%60%E2%9D%8C%20Erro%20ao%20enviar%20para%20FastSavory's%3A%20%24%7Berr.message%7D%60)%3B%0A%20%20%20%20%20%20%7D%20finally%20%7B%0A%20%20%20%20%20%20%20%20importBtn.disabled%20%3D%20false%3B%0A%20%20%20%20%20%20%20%20importBtn.style.opacity%20%3D%20'1'%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%3B%0A%20%20%7D%0A%0A%20%20%2F%2F%20------------------------------------------------------------%0A%20%20%2F%2F%20FUN%C3%87%C3%83O%3A%20SALVAMENTO%20R%C3%81PIDO%20INDIVIDUAL%20(AMAZON%2C%20SHOPEE%2C%20ML%20PDP)%0A%20%20%2F%2F%20------------------------------------------------------------%0A%20%20function%20runSingleProductQuickClip(host%2C%20href)%20%7B%0A%20%20%20%20let%20payload%20%3D%20%7B%0A%20%20%20%20%20%20platform%3A%20'unknown'%2C%0A%20%20%20%20%20%20url%3A%20href%2C%0A%20%20%20%20%20%20title%3A%20''%2C%0A%20%20%20%20%20%20image_url%3A%20''%2C%0A%20%20%20%20%20%20price_display%3A%20''%2C%0A%20%20%20%20%20%20original_price%3A%20''%2C%0A%20%20%20%20%20%20discount_tag%3A%20''%2C%0A%20%20%20%20%20%20is_prime%3A%20false%2C%0A%20%20%20%20%20%20is_imported%3A%20false%0A%20%20%20%20%7D%3B%0A%0A%20%20%20%20if%20(host.includes('amazon'))%20%7B%0A%20%20%20%20%20%20payload.platform%20%3D%20'amazon'%3B%0A%20%20%20%20%20%20payload.title%20%3D%20(document.getElementById('productTitle')%3F.innerText%20%7C%7C%20document.title%20%7C%7C%20'').trim()%3B%0A%20%20%20%20%20%20const%20img%20%3D%20document.getElementById('landingImage')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('%23imgTagWrapperId%20img')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('%23main-image-container%20img')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('.a-dynamic-image')%3B%0A%20%20%20%20%20%20payload.image_url%20%3D%20img%3F.src%20%7C%7C%20img%3F.getAttribute('data-old-hires')%20%7C%7C%20''%3B%0A%0A%20%20%20%20%20%20const%20priceEl%20%3D%20document.querySelector('%23corePriceDisplay_desktop_feature_div%20.priceToPay%2C%20%23corePrice_desktop%20.priceToPay%2C%20%23apex_desktop%20.priceToPay%2C%20.priceToPay')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('%23corePriceDisplay_desktop_feature_div%20.a-price%3Anot(.apex-priceperunit-value)%3Anot(.a-text-price)%2C%20%23corePrice_desktop%20.a-price%3Anot(.apex-priceperunit-value)%3Anot(.a-text-price)')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('.a-price%3Anot(.apex-priceperunit-value)%3Anot(%5Bclass*%3D%22priceperunit%22%5D)%3Anot(.a-text-price)')%3B%0A%20%20%20%20%20%20const%20pw%20%3D%20priceEl%3F.querySelector('.a-price-whole')%3F.innerText%3F.replace(%2F%5B%5Cr%5Cn%5Ct%5D%2Fg%2C%20'').replace(%2F%5B%5E%5Cd.%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20const%20pf%20%3D%20priceEl%3F.querySelector('.a-price-fraction')%3F.innerText%3F.replace(%2F%5B%5E%5Cd%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20if%20(pw)%20%7B%0A%20%20%20%20%20%20%20%20payload.price_display%20%3D%20'R%24%20'%20%2B%20pw%20%2B%20(pf%20%3F%20'%2C'%20%2B%20pf%20%3A%20'%2C00')%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20const%20basis%20%3D%20document.querySelector('.basisPrice%20.a-offscreen%2C%20%23corePriceDisplay_desktop_feature_div%20.apex-basisprice-value%20.a-offscreen%2C%20.apex-basisprice-offscreen-label%2C%20%23corePrice_desktop%20.apex-basisprice-value%20.a-offscreen')%3F.innerText%3F.trim()%3B%0A%20%20%20%20%20%20if%20(basis)%20payload.original_price%20%3D%20basis%3B%0A%20%20%20%20%20%20const%20sav%20%3D%20document.querySelector('%23corePriceDisplay_desktop_feature_div%20.savingsPercentage%2C%20.savingsPercentage%2C%20.reinventPriceSavingsPercentageMargin')%3F.innerText%3F.trim()%3B%0A%20%20%20%20%20%20if%20(sav)%20payload.discount_tag%20%3D%20sav.replace('-'%2C%20'').trim()%20%2B%20'%20OFF'%3B%0A%20%20%20%20%20%20payload.is_prime%20%3D%20Boolean(document.querySelector('.a-icon-prime%2C%23prime-accordion%2C%5Bid*%3D%22prime%22%5D%2C.badge_delivery_prime%2C%5Baria-label*%3D%22Prime%22%5D')%20%7C%7C%20%2Ffrete%20gr%C3%A1tis%20com%20o%20prime%2Fi.test(document.querySelector('%23deliveryBlockMessage')%3F.innerText%20%7C%7C%20''))%3B%0A%20%20%20%20%20%20payload.is_imported%20%3D%20Boolean(document.querySelector('%23exports_desktop_qualified_buybox%2C%20%23agsk-detail-bullets%2C%20%23amazonGlobal_feature_div')%20%7C%7C%20document.querySelector('%23merchant-info%2C%20%23deliveryBlockMessage')%3F.innerText%3F.match(%2Ffora%20do%20brasil%7Camazon%20global%20store%7Cestados%20unidos%2Fi))%3B%0A%0A%20%20%20%20%7D%20else%20if%20(host.includes('mercadolivre')%20%7C%7C%20host.includes('mercadolibre'))%20%7B%0A%20%20%20%20%20%20payload.platform%20%3D%20'mercadolivre'%3B%0A%20%20%20%20%20%20payload.title%20%3D%20(document.querySelector('h1.ui-pdp-title')%3F.innerText%20%7C%7C%20document.title%20%7C%7C%20'').trim()%3B%0A%20%20%20%20%20%20const%20img%20%3D%20document.querySelector('.ui-pdp-gallery__figure%20img%2C%20.ui-pdp-image%2C%20img.ui-pdp-image')%3B%0A%20%20%20%20%20%20payload.image_url%20%3D%20img%3F.src%20%7C%7C%20''%3B%0A%0A%20%20%20%20%20%20const%20frac%20%3D%20document.querySelector('.ui-pdp-price__second-line%20.andes-money-amount__fraction')%3F.innerText%3F.replace(%2F%5B%5E%5Cd.%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20const%20cents%20%3D%20document.querySelector('.ui-pdp-price__second-line%20.andes-money-amount__cents')%3F.innerText%3F.replace(%2F%5B%5E%5Cd%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20if%20(frac)%20%7B%0A%20%20%20%20%20%20%20%20payload.price_display%20%3D%20'R%24%20'%20%2B%20frac%20%2B%20(cents%20%3F%20'%2C'%20%2B%20cents%20%3A%20'%2C00')%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20const%20origFrac%20%3D%20document.querySelector('.ui-pdp-price__original-value%20.andes-money-amount__fraction')%3F.innerText%3F.replace(%2F%5B%5E%5Cd.%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20if%20(origFrac)%20%7B%0A%20%20%20%20%20%20%20%20const%20origCents%20%3D%20document.querySelector('.ui-pdp-price__original-value%20.andes-money-amount__cents')%3F.innerText%3F.replace(%2F%5B%5E%5Cd%5D%2Fg%2C%20'').trim()%3B%0A%20%20%20%20%20%20%20%20payload.original_price%20%3D%20'R%24%20'%20%2B%20origFrac%20%2B%20(origCents%20%3F%20'%2C'%20%2B%20origCents%20%3A%20'%2C00')%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20const%20disc%20%3D%20document.querySelector('.ui-pdp-price__second-line%20.andes-money-amount__discount')%3F.innerText%3F.trim()%3B%0A%20%20%20%20%20%20if%20(disc)%20payload.discount_tag%20%3D%20disc%20%2B%20'%20OFF'%3B%0A%20%20%20%20%20%20payload.is_imported%20%3D%20Boolean(document.querySelector('.ui-pdp-buybox%2C%20%23shipping-summary%2C%20.ui-pdp-promotions-pill%2C%20.ui-pdp-seller__header')%3F.innerText%3F.match(%2Fcompra%5Cs%2Binternacional%7Cvendedor%5Cs%2Binternacional%2Fi))%3B%0A%0A%20%20%20%20%7D%20else%20if%20(host.includes('shopee'))%20%7B%0A%20%20%20%20%20%20payload.platform%20%3D%20'shopee'%3B%0A%20%20%20%20%20%20payload.title%20%3D%20(%0A%20%20%20%20%20%20%20%20document.querySelector('.product-briefing%20._44qnta')%3F.innerText%20%7C%7C%0A%20%20%20%20%20%20%20%20document.querySelector('.product-briefing%20h1')%3F.innerText%20%7C%7C%0A%20%20%20%20%20%20%20%20document.querySelector('h1')%3F.innerText%20%7C%7C%0A%20%20%20%20%20%20%20%20document.querySelector('meta%5Bproperty%3D%22og%3Atitle%22%5D')%3F.content%20%7C%7C%0A%20%20%20%20%20%20%20%20document.title%20%7C%7C%20''%0A%20%20%20%20%20%20).replace(%2F%5Cs*%5C%7C%5Cs*Shopee.*%24%2Fi%2C%20'').trim()%3B%0A%0A%20%20%20%20%20%20const%20img%20%3D%20document.querySelector('.product-briefing%20img')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('._39-Y7e%20img')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('.image-carousel%20img')%20%7C%7C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20document.querySelector('img%5Bsrc*%3D%22down-br.img.susercontent.com%22%5D')%3B%0A%20%20%20%20%20%20payload.image_url%20%3D%20img%3F.src%20%7C%7C%20document.querySelector('meta%5Bproperty%3D%22og%3Aimage%22%5D')%3F.content%20%7C%7C%20''%3B%0A%0A%20%20%20%20%20%20const%20priceCandidates%20%3D%20Array.from(document.querySelectorAll('.product-briefing%20div%2C%20.product-briefing%20span%2C%20.product-briefing%20p%2C%20%5Bclass*%3D%22flash-sale%22%5D%20span%2C%20%5Bclass*%3D%22price%22%5D%20span'))%3B%0A%20%20%20%20%20%20const%20foundPriceEl%20%3D%20priceCandidates.find(el%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20const%20t%20%3D%20(el.innerText%20%7C%7C%20'').trim()%3B%0A%20%20%20%20%20%20%20%20return%20%2F%5ER%5C%24%5Cs*%5B0-9.%2C%5D%2B%24%2Fi.test(t)%3B%0A%20%20%20%20%20%20%7D)%20%7C%7C%20document.querySelector('.product-briefing%20.pqTWkA%2C%20.product-briefing%20._3n5z6N%2C%20.product-briefing%20._2Sh71d%2C%20.product-briefing%20%5Bclass*%3D%22price%22%5D')%3B%0A%0A%20%20%20%20%20%20if%20(foundPriceEl)%20%7B%0A%20%20%20%20%20%20%20%20const%20pMatch%20%3D%20(foundPriceEl.innerText%20%7C%7C%20'').match(%2FR%5C%24%5Cs*%5B0-9.%2C%5D%2B%2Fi)%3B%0A%20%20%20%20%20%20%20%20if%20(pMatch)%20payload.price_display%20%3D%20pMatch%5B0%5D.replace(%2F%5Cs%2B%2Fg%2C%20'%20')%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20const%20origEl%20%3D%20document.querySelector('.product-briefing%20._1G_B1p%2C%20.product-briefing%20%5Bstyle*%3D%22line-through%22%5D%2C%20.product-briefing%20del%2C%20.product-briefing%20s')%3B%0A%20%20%20%20%20%20if%20(origEl)%20%7B%0A%20%20%20%20%20%20%20%20const%20oMatch%20%3D%20(origEl.innerText%20%7C%7C%20'').match(%2FR%5C%24%5Cs*%5B0-9.%2C%5D%2B%2Fi)%3B%0A%20%20%20%20%20%20%20%20if%20(oMatch)%20payload.original_price%20%3D%20oMatch%5B0%5D.replace(%2F%5Cs%2B%2Fg%2C%20'%20')%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20const%20discEl%20%3D%20document.querySelector('.product-briefing%20%5Bclass*%3D%22discount%22%5D%2C%20.product-briefing%20._10uUv7')%3B%0A%20%20%20%20%20%20if%20(discEl%20%26%26%20discEl.innerText.includes('OFF'))%20%7B%0A%20%20%20%20%20%20%20%20payload.discount_tag%20%3D%20discEl.innerText.trim()%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20payload.is_imported%20%3D%20Boolean(document.querySelector('.product-briefing%2C%20%5Bclass*%3D%22shop-detail%22%5D')%3F.innerText%3F.match(%2Fvendedor%20internacional%7Cenvio%20do%20exterior%2Fi))%3B%0A%0A%20%20%20%20%7D%20else%20if%20(host.includes('natura')%20%7C%7C%20host.includes('avon'))%20%7B%0A%20%20%20%20%20%20payload.platform%20%3D%20host.includes('avon')%20%3F%20'avon'%20%3A%20'natura'%3B%0A%20%20%20%20%20%20payload.title%20%3D%20(document.querySelector('h1')%3F.innerText%20%7C%7C%20document.querySelector('meta%5Bproperty%3D%22og%3Atitle%22%5D')%3F.content%20%7C%7C%20document.title%20%7C%7C%20'').replace(%2F%5Cs*%5C%7C%5Cs*(Natura%7CAvon).*%24%2Fi%2C%20'').trim()%3B%0A%20%20%20%20%20%20payload.image_url%20%3D%20document.querySelector('meta%5Bproperty%3D%22og%3Aimage%22%5D')%3F.content%20%7C%7C%20document.querySelector('img%5Bsrc*%3D%22natura%22%5D%2C%20img%5Bsrc*%3D%22avon%22%5D')%3F.src%20%7C%7C%20''%3B%0A%20%20%20%20%20%20const%20priceMeta%20%3D%20document.querySelector('meta%5Bproperty%3D%22product%3Aprice%3Aamount%22%5D')%3F.content%3B%0A%20%20%20%20%20%20if%20(priceMeta)%20%7B%0A%20%20%20%20%20%20%20%20payload.price_display%20%3D%20'R%24%20'%20%2B%20parseFloat(priceMeta).toFixed(2).replace('.'%2C%20'%2C')%3B%0A%20%20%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20%20%20const%20pEl%20%3D%20Array.from(document.querySelectorAll('span%2C%20p%2C%20div')).find(e%20%3D%3E%20%2F%5ER%5C%24%5Cs*%5B0-9.%2C%5D%2B%24%2F.test(e.innerText.trim()))%3B%0A%20%20%20%20%20%20%20%20if%20(pEl)%20payload.price_display%20%3D%20pEl.innerText.trim()%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20alert('%E2%9A%A0%EF%B8%8F%20Use%20este%20bot%C3%A3o%20em%20uma%20p%C3%A1gina%20de%20produto%20da%20Amazon%2C%20Mercado%20Livre%2C%20Shopee%20ou%20Natura!')%3B%0A%20%20%20%20%20%20return%3B%0A%20%20%20%20%7D%0A%0A%20%20%20%20if%20(!payload.title)%20%7B%0A%20%20%20%20%20%20alert('%E2%9A%A0%EF%B8%8F%20N%C3%A3o%20foi%20poss%C3%ADvel%20identificar%20o%20t%C3%ADtulo%20do%20produto.')%3B%0A%20%20%20%20%20%20return%3B%0A%20%20%20%20%7D%0A%0A%20%20%20%20if%20(payload.price_display)%20%7B%0A%20%20%20%20%20%20payload.price_display%20%3D%20payload.price_display.replace(%2F%2C%2B%2Fg%2C%20'%2C')%3B%0A%20%20%20%20%7D%0A%20%20%20%20if%20(payload.original_price)%20%7B%0A%20%20%20%20%20%20payload.original_price%20%3D%20payload.original_price.replace(%2F%2C%2B%2Fg%2C%20'%2C')%3B%0A%20%20%20%20%20%20const%20prN%20%3D%20parseFloat(payload.price_display.replace(%2F%5B%5E%5Cd%5D%2Fg%2C%20'')%20%7C%7C%200)%3B%0A%20%20%20%20%20%20const%20orN%20%3D%20parseFloat(payload.original_price.replace(%2F%5B%5E%5Cd%5D%2Fg%2C%20'')%20%7C%7C%200)%3B%0A%20%20%20%20%20%20if%20(orN%20%3C%3D%20prN)%20%7B%0A%20%20%20%20%20%20%20%20payload.original_price%20%3D%20''%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%0A%20%20%20%20const%20toast%20%3D%20document.createElement('div')%3B%0A%20%20%20%20toast.style.cssText%20%3D%20'position%3Afixed%3Btop%3A20px%3Bright%3A20px%3Bz-index%3A99999999%3Bbackground%3A%236366f1%3Bcolor%3A%23fff%3Bpadding%3A16px%2022px%3Bborder-radius%3A12px%3Bfont-family%3Asans-serif%3Bfont-weight%3Abold%3Bfont-size%3A14px%3Bbox-shadow%3A0%2010px%2025px%20rgba(0%2C0%2C0%2C0.3)%3B'%3B%0A%20%20%20%20toast.innerText%20%3D%20'%E2%9A%A1%20Enviando%20para%20FastSavory%5C's%20Achadinhos...'%3B%0A%20%20%20%20document.body.appendChild(toast)%3B%0A%0A%20%20%20%20fetch('https%3A%2F%2Ffastsavorys.vercel.app%2Fapi%2Fcheck-affiliate-links%3Faction%3Dquick-save'%2C%20%7B%0A%20%20%20%20%20%20method%3A%20'POST'%2C%0A%20%20%20%20%20%20headers%3A%20%7B%20'Content-Type'%3A%20'application%2Fjson'%20%7D%2C%0A%20%20%20%20%20%20body%3A%20JSON.stringify(payload)%0A%20%20%20%20%7D)%0A%20%20%20%20%20%20.then(r%20%3D%3E%20r.json())%0A%20%20%20%20%20%20.then(data%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20if%20(data.success)%20%7B%0A%20%20%20%20%20%20%20%20%20%20toast.style.background%20%3D%20'%2310b981'%3B%0A%20%20%20%20%20%20%20%20%20%20toast.innerHTML%20%3D%20'%F0%9F%8E%89%20Salvo%20com%20Sucesso%20no%20Site!%3Cbr%3E%3Cspan%20style%3D%22font-size%3A11px%3Bfont-weight%3Anormal%3B%22%3E'%20%2B%20(payload.title.substring(0%2C%2040))%20%2B%20'...%3C%2Fspan%3E'%3B%0A%20%20%20%20%20%20%20%20%20%20setTimeout(()%20%3D%3E%20toast.remove()%2C%203500)%3B%0A%20%20%20%20%20%20%20%20%7D%20else%20%7B%0A%20%20%20%20%20%20%20%20%20%20toast.style.background%20%3D%20'%23e11d48'%3B%0A%20%20%20%20%20%20%20%20%20%20toast.innerText%20%3D%20'%E2%9D%8C%20'%20%2B%20(data.error%20%7C%7C%20'Erro%20ao%20salvar')%3B%0A%20%20%20%20%20%20%20%20%20%20setTimeout(()%20%3D%3E%20toast.remove()%2C%204000)%3B%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D)%0A%20%20%20%20%20%20.catch(e%20%3D%3E%20%7B%0A%20%20%20%20%20%20%20%20toast.style.background%20%3D%20'%23e11d48'%3B%0A%20%20%20%20%20%20%20%20toast.innerText%20%3D%20'%E2%9D%8C%20Erro%20de%20conex%C3%A3o%3A%20'%20%2B%20e.message%3B%0A%20%20%20%20%20%20%20%20setTimeout(()%20%3D%3E%20toast.remove()%2C%204000)%3B%0A%20%20%20%20%20%20%7D)%3B%0A%20%20%7D%0A%7D)()%3B%0A" + '"))';
  }

  async function syncExpiredFlashDeals() {
    if (window.showToast) {
      window.showToast('⚡ Verificando ofertas relâmpago expiradas...', 'info');
    }
    try {
      const res = await fetch('/api/check-affiliate-links?action=sync-flash-expired');
      const data = await res.json();
      if (data.success) {
        if (data.count > 0) {
          if (window.showToast) {
            window.showToast(`🎉 ${data.count} oferta(s) relâmpago atualizada(s) com preços normais!`, 'success');
          } else {
            alert(`🎉 ${data.count} oferta(s) relâmpago atualizada(s) com preços normais!`);
          }
          await loadProducts();
        } else {
          if (window.showToast) {
            window.showToast('✅ Nenhuma oferta relâmpago expirada pendente.', 'success');
          } else {
            alert('✅ Nenhuma oferta relâmpago expirada pendente.');
          }
        }
      } else {
        throw new Error(data.error || 'Erro na verificação');
      }
    } catch (err) {
      console.error('[Sync Flash Error]:', err);
      if (window.showToast) {
        window.showToast('❌ Erro: ' + err.message, 'error');
      } else {
        alert('❌ Erro ao verificar ofertas relâmpago: ' + err.message);
      }
    }
  }

  function openBookmarkletModal() {
    const modal = document.getElementById('affiliateBookmarkletModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const code = getBookmarkletCode();
    const draggableLink = document.getElementById('affiliateBookmarkletDraggableLink');
    if (draggableLink) {
      draggableLink.setAttribute('href', code);
    }
    const preview = document.getElementById('affiliateBookmarkletCodePreview');
    if (preview) {
      preview.value = code;
    }
  }

  function closeBookmarkletModal() {
    const modal = document.getElementById('affiliateBookmarkletModal');
    if (modal) modal.classList.add('hidden');
  }

  function copyBookmarkletCode() {
    const code = getBookmarkletCode();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        if (window.showToast) {
          window.showToast('📋 Código do Bookmarklet copiado!', 'success');
        } else {
          alert('Código copiado para a área de transferência!');
        }
      }).catch(() => {
        prompt('Copie o código JS abaixo:', code);
      });
    } else {
      prompt('Copie o código JS abaixo:', code);
    }
  }

  async function sendToWhatsApp(id) {
    const item = productsList.find(p => p.id == id);
    if (!item) return;

    if (!confirm(`Deseja disparar este achadinho agora no Grupo VIP do WhatsApp?\n\n"${item.title}"`)) {
      return;
    }

    try {
      if (window.showToast) window.showToast('🚀 Enviando oferta para o WhatsApp...', 'info');
      const res = await fetch(`/api/check-affiliate-links?action=send-whatsapp&id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (window.showToast) window.showToast('✅ Oferta disparada com sucesso no grupo do WhatsApp!', 'success');
        else alert('✅ Oferta disparada com sucesso no grupo do WhatsApp!');
      } else if (data.configured === false) {
        if (window.showToast) {
          window.showToast('ℹ️ Disparo automático requer as variáveis da Evolution API na Vercel. Abrindo modal para envio direto...', 'info');
        } else {
          alert('ℹ️ Para envio 100% automático direto pelo servidor, configure as variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY e WHATSAPP_DEALS_GROUP_JID na Vercel.\n\nAbrindo janela de compartilhamento...');
        }
        openShareModal(id);
      } else {
        throw new Error(data.error || 'Erro ao enviar.');
      }
    } catch (err) {
      console.error('[Send to WhatsApp Error]', err);
      if (window.showToast) window.showToast('❌ ' + err.message, 'error');
      else alert('Aviso: ' + err.message);
      openShareModal(id);
    }
  }

  return {
    init: loadProducts,
    loadProducts,
    populateCategorySelects,
    openCategoriesModal,
    closeCategoriesModal,
    renderCategoriesManagerTree,
    promptAddCategoryGroup,
    promptEditCategoryGroup,
    deleteCategoryGroup,
    promptAddSubcategory,
    promptEditSubcategory,
    deleteSubcategory,
    resetCategoriesToDefault,
    saveCategoriesTree,
    openNewModal,
    openEditModal,
    closeModal,
    saveProduct,
    deleteProduct,
    updateImagePreview,
    handleSearch,
    handleCategoryFilter,
    handleStatusFilter,
    clearFilters,
    checkAllLinksHealth,
    closeHealthModal,
    setHealthFilterTab,
    toggleProductActive,
    syncProductPrice,
    pauseAllInactiveProducts,
    syncAllPriceDrops,
    syncAllPriceIncreases,
    syncAllChangedPrices,
    fetchProductDataFromML,
    recalculateDiscount,
    insertBullet,
    pasteFromClipboard,
    detectCategoryClient,
    openShareModal,
    closeShareModal,
    handleTagPresetChange,
    setFlashHours,
    shareToWhatsApp,
    shareToTelegram,
    shareToFacebook,
    shareNative,
    copyShareText,
    copyShareLinkOnly,
    sendToWhatsApp,
    openMinerModal,
    closeMinerModal,
    runDealsMiner,
    openShopeeMinerModal,
    closeShopeeMinerModal,
    runShopeeMiner,
    openBookmarkletModal,
    closeBookmarkletModal,
    copyBookmarkletCode,
    getBookmarkletCode,
    syncExpiredFlashDeals,
    goToPage
  };
})();
