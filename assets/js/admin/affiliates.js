/**
 * FastSavory's - Admin Módulo de Achadinhos & Afiliados
 */

window.AffiliatesModule = (function () {
  let productsList = [];
  let editingId = null;
  let searchQuery = '';
  let categoryFilter = 'all';
  let statusFilter = 'all';

  async function loadProducts() {
    const tbody = document.getElementById('affiliateAdminTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-500">Carregando achadinhos...</td></tr>`;
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

  function handleSearch(val) {
    searchQuery = (val || '').toLowerCase().trim();
    renderTable();
  }

  function handleCategoryFilter(val) {
    categoryFilter = val || 'all';
    renderTable();
  }

  function handleStatusFilter(val) {
    statusFilter = val || 'all';
    renderTable();
  }

  function clearFilters() {
    searchQuery = '';
    categoryFilter = 'all';
    statusFilter = 'all';
    const sInput = document.getElementById('affiliateAdminSearchInput');
    const cSelect = document.getElementById('affiliateAdminCategoryFilter');
    const stSelect = document.getElementById('affiliateAdminStatusFilter');
    if (sInput) sInput.value = '';
    if (cSelect) cSelect.value = 'all';
    if (stSelect) stSelect.value = 'all';
    renderTable();
  }

  function getFilteredProducts() {
    return productsList.filter(item => {
      let matchCat = false;
      if (categoryFilter === 'all') {
        matchCat = true;
      } else if (categoryFilter === 'fast_picks') {
        matchCat = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
      } else {
        matchCat = item.category === categoryFilter;
      }

      const matchStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && item.is_active !== false) ||
        (statusFilter === 'paused' && item.is_active === false);
      const matchSearch = !searchQuery || 
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.description && item.description.toLowerCase().includes(searchQuery)) ||
        (item.category && item.category.toLowerCase().includes(searchQuery)) ||
        (item.discount_tag && item.discount_tag.toLowerCase().includes(searchQuery));

      return matchCat && matchStatus && matchSearch;
    });
  }

  function detectPlatform(url = '') {
    const u = (url || '').toLowerCase();
    if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
      return { id: 'amazon', name: 'Amazon', icon: '📦', badge: 'bg-amber-100 text-amber-900 border-amber-300' };
    }
    if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
      return { id: 'shopee', name: 'Shopee', icon: '🧡', badge: 'bg-orange-100 text-orange-900 border-orange-300' };
    }
    return { id: 'mercadolivre', name: 'Mercado Livre', icon: '💛', badge: 'bg-yellow-100 text-yellow-900 border-yellow-300' };
  }

  function renderTable() {
    const tbody = document.getElementById('affiliateAdminTableBody');
    if (!tbody) return;

    if (productsList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400">
            Nenhum achadinho cadastrado ainda. Clique em "➕ Novo Achadinho" para começar.
          </td>
        </tr>
      `;
      return;
    }

    const filtered = getFilteredProducts();

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400">
            Nenhum achadinho encontrado para os filtros selecionados.
            <button onclick="AffiliatesModule.clearFilters()" class="ml-2 text-yellow-600 underline font-semibold">Limpar Filtros</button>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((item, index) => {
      const activeBadge = item.is_active 
        ? `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Ativo</span>`
        : `<span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Pausado</span>`;

      const categoryMap = {
        cozinha: '🍳 Cozinha & Eletro',
        confeitaria: '🍰 Confeitaria',
        embalagens: '📦 Embalagens',
        utilidades: '🏠 Casa & Utilidades',
        moda: '👗 Moda & Calçados',
        joias: '⌚ Joias & Relógios',
        supermercado: '🛒 Supermercado',
        perfumaria: '🧴 Perfumaria',
        banho: '🚿 Cama, Mesa & Banho',
        eletronicos: '⚡ Eletrônicos',
        celulares: '📱 Celulares',
        informatica: '💻 Informática',
        brinquedos: '🧸 Brinquedos',
        presentes: '🎁 Presentes',
        bebes: '🍼 Bebês',
        veiculos: '🚗 Veículos',
        livros: '📚 Livros',
        petshop: '🐶 Pet Shop',
        construcao: '🔨 Construção'
      };
      const catLabel = categoryMap[item.category] || item.category || 'Geral';

      const pct = calcDiscountPercent(item.original_price, item.price_display);
      const discountBadge = pct > 0 
        ? `<span class="inline-block text-[10px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded mt-0.5 shadow-sm">🔥 ${pct}% OFF</span>`
        : '';

      const platformInfo = detectPlatform(item.affiliate_url);
      const platformBadge = `<span class="inline-flex items-center gap-1 text-[10px] ${platformInfo.badge} font-bold px-1.5 py-0.2 rounded border">${platformInfo.icon} ${platformInfo.name}</span>`;

      const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
      const fastPickBadge = isFastPick
        ? `<span class="inline-flex items-center gap-1 text-[10px] bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white font-black px-2 py-0.5 rounded-full shadow-xs">✨ Selo Fast</span>`
        : '';

      // Evita duplicidade de tag se já for apenas a indicação de desconto
      let showCustomTag = false;
      const customTagText = item.discount_tag ? item.discount_tag.trim() : '';
      if (customTagText) {
        const isDiscountOnly = /^[⚡🔥\s]*\d+%\s*OFF/i.test(customTagText);
        if (!isDiscountOnly || pct === 0) {
          showCustomTag = true;
        }
      }

      const customTagBadge = showCustomTag
        ? `<span class="inline-block text-[10px] bg-orange-100 text-orange-950 font-bold px-1.5 py-0.2 rounded border border-orange-200">${escapeHtml(customTagText)}</span>`
        : '';

      return `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100 ${isFastPick ? 'bg-pink-50/20' : ''}">
          <td class="p-3 text-center text-xs font-bold text-gray-500 w-12">${index + 1}</td>
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
              ${discountBadge}
              ${customTagBadge}
            </div>
          </td>
          <td class="p-3 text-xs text-gray-600">${escapeHtml(catLabel)}</td>
          <td class="p-3 font-bold text-sm text-gray-800">
            <div>${escapeHtml(item.price_display || '-')}</div>
            ${item.original_price ? `<div class="text-[10px] text-gray-400 line-through">${escapeHtml(item.original_price)}</div>` : ''}
          </td>
          <td class="p-3 text-center">${activeBadge}</td>
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
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

  function openNewModal() {
    editingId = null;
    const form = document.getElementById('affiliateForm');
    if (form) form.reset();
    document.getElementById('affiliateModalTitle').textContent = '➕ Novo Achadinho (ML, Amazon & Shopee)';
    document.getElementById('affiliateId').value = '';
    const discountEl = document.getElementById('affiliateDiscountInput');
    if (discountEl) discountEl.value = '';
    document.getElementById('affiliateTagInput').value = '';
    document.getElementById('affiliateBadgeColorInput').value = 'orange';
    const isFastPickEl = document.getElementById('affiliateIsFastPickInput');
    if (isFastPickEl) isFastPickEl.checked = false;
    document.getElementById('affiliateDescriptionInput').value = '🔸 ';
    document.getElementById('affiliateImagePreview').src = '../assets/img/fast-logo.png';
    document.getElementById('affiliateModal').classList.remove('hidden');
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

    const pct = calcDiscountPercent(item.original_price, item.price_display);
    const discountEl = document.getElementById('affiliateDiscountInput');
    if (discountEl) {
      discountEl.value = pct > 0 ? `${pct}% OFF` : '';
    }

    const tagVal = item.discount_tag || '';
    const isDiscountOnly = /^[⚡🔥\s]*\d+%\s*OFF/i.test(tagVal.trim());
    document.getElementById('affiliateTagInput').value = isDiscountOnly ? '' : tagVal;

    const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
    const isFastPickEl = document.getElementById('affiliateIsFastPickInput');
    if (isFastPickEl) isFastPickEl.checked = isFastPick;

    document.getElementById('affiliateBadgeColorInput').value = item.badge_color || (isFastPick ? 'fast_seal' : 'orange');
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

      // Preenche automaticamente o título se não tiver
      const titleEl = document.getElementById('affiliateTitleInput');
      if (info.title && (!titleEl.value.trim() || titleEl.value.trim() === '')) {
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

      // Preenche campo de Desconto (e NÃO preenche Selo/Tag para evitar duplicação)
      const discountEl = document.getElementById('affiliateDiscountInput');
      if (discountEl) {
        if (info.discount_percent > 0) {
          discountEl.value = `${info.discount_percent}% OFF`;
        } else if (info.discount_tag) {
          discountEl.value = info.discount_tag;
        }
      }

      // Preenche categoria detectada automaticamente
      const detectedCat = info.category || detectCategoryClient(info.title || '');
      if (detectedCat && document.getElementById('affiliateCategoryInput')) {
        document.getElementById('affiliateCategoryInput').value = detectedCat;
      }

      if (info.is_active === false) {
        document.getElementById('affiliateActiveInput').checked = false;
        alert('⚠️ Atenção: Este anúncio parece estar pausado ou finalizado no Mercado Livre.');
      }

      if (window.showToast) {
        window.showToast('✨ Dados do anúncio e categoria preenchidos automaticamente!', 'success');
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
    let badgeColorVal = document.getElementById('affiliateBadgeColorInput').value;
    if (isFastPick && badgeColorVal === 'orange') {
      badgeColorVal = 'fast_seal';
    }

    const payload = {
      title,
      description: document.getElementById('affiliateDescriptionInput').value.trim() || null,
      affiliate_url,
      image_url,
      price_display: document.getElementById('affiliatePriceInput').value.trim() || null,
      original_price: document.getElementById('affiliateOriginalPriceInput').value.trim() || null,
      category: document.getElementById('affiliateCategoryInput').value,
      discount_tag: document.getElementById('affiliateTagInput').value.trim() || null,
      badge_color: isFastPick ? 'fast_seal' : badgeColorVal,
      is_fast_pick: isFastPick,
      position: assignedPosition,
      is_active: document.getElementById('affiliateActiveInput').checked,
      updated_at: new Date().toISOString()
    };

    try {
      if (window.supabaseClient) {
        if (editingId) {
          let res = await window.supabaseClient
            .from('fast_affiliate_products')
            .update(payload)
            .eq('id', editingId);

          if (res.error && res.error.message && res.error.message.includes('is_fast_pick')) {
            delete payload.is_fast_pick;
            res = await window.supabaseClient
              .from('fast_affiliate_products')
              .update(payload)
              .eq('id', editingId);
          }
          if (res.error) throw res.error;
        } else {
          payload.created_at = new Date().toISOString();
          let res = await window.supabaseClient
            .from('fast_affiliate_products')
            .insert([payload]);

          if (res.error && res.error.message && res.error.message.includes('is_fast_pick')) {
            delete payload.is_fast_pick;
            res = await window.supabaseClient
              .from('fast_affiliate_products')
              .insert([payload]);
          }
          if (res.error) throw res.error;
        }
      }

      if (window.showToast) window.showToast('Achadinho salvo com sucesso!', 'success');
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('[Admin Affiliates] Erro ao salvar:', err);
      alert('Erro ao salvar no banco de dados. Verifique sua conexão.');
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
      let okCount = 0;
      let pausedCount = 0;
      let errorCount = 0;
      let priceChangedCount = 0;
      let pausedToDeactivateCount = 0;

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

      const itemsHtml = allResults.map(res => {
        const prod = itemsToCheck.find(p => p.id == res.id) || 
                     productsList.find(p => p.id == res.id) || 
                     { title: res.title || 'Produto', image_url: '../assets/img/fast-logo.png', price_display: '' };
        
        let statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800 flex items-center gap-1">🟢 Online no ML</span>`;
        if (res.status === 'paused') {
          pausedCount++;
          if (prod.is_active !== false) pausedToDeactivateCount++;
          statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 flex items-center gap-1">🔴 Pausado no ML</span>`;
        } else if (res.status === 'error' || res.status === 'timeout' || res.status === 'warning') {
          errorCount++;
          statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">⚠️ Instável</span>`;
        } else {
          okCount++;
        }

        // Price comparison
        const livePriceNum = parsePrice(res.price);
        const storedPriceNum = parsePrice(prod.price_display);
        const hasPriceDiff = livePriceNum > 0 && storedPriceNum > 0 && Math.abs(livePriceNum - storedPriceNum) >= 0.01;

        let priceDiffHtml = '';
        if (hasPriceDiff) {
          priceChangedCount++;
          const isLower = livePriceNum < storedPriceNum;
          priceDiffHtml = `
            <div class="mt-2 p-2.5 ${isLower ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'} border rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="font-medium flex items-center gap-1.5 flex-wrap">
                <span>${isLower ? '📉' : '📈'}</span>
                <span>Preço no ML:</span>
                <span class="line-through text-gray-500">${escapeHtml(prod.price_display)}</span>
                <span>➔</span>
                <strong class="text-sm font-black ${isLower ? 'text-emerald-700' : 'text-amber-800'}">${escapeHtml(res.price)}</strong>
              </div>
              <button id="sync-price-btn-${prod.id}" onclick="AffiliatesModule.syncProductPrice(${prod.id}, '${escapeHtml(res.price)}', '${escapeHtml(res.original_price || '')}', this)" 
                      class="px-2.5 py-1 ${isLower ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white font-bold rounded-lg shadow-sm transition text-xs flex items-center gap-1 active:scale-95">
                🔄 Atualizar no Site
              </button>
            </div>
          `;
        }

        // Action button for active/paused status
        let actionBtn = '';
        if (res.status === 'paused') {
          if (prod.is_active !== false) {
            actionBtn = `<button id="pause-btn-${prod.id}" onclick="AffiliatesModule.toggleProductActive(${prod.id}, false, this)" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95">Pausar no Site</button>`;
          } else {
            actionBtn = `<span class="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg border border-gray-200">⏸️ Já Pausado</span>`;
          }
        } else if (res.status === 'active' && prod.is_active === false) {
          actionBtn = `<button id="pause-btn-${prod.id}" onclick="AffiliatesModule.toggleProductActive(${prod.id}, true, this)" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95">Reativar no Site</button>`;
        }

        return `
          <div class="p-3.5 bg-white border border-gray-100 hover:border-gray-200 rounded-2xl shadow-sm transition">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <img src="${escapeHtml(prod.image_url)}" alt="" class="w-11 h-11 object-contain rounded-xl bg-gray-50 border p-0.5 flex-shrink-0" onerror="this.src='../assets/img/fast-logo.png'" />
                <div class="min-w-0">
                  <div class="font-bold text-sm text-gray-900 truncate">${escapeHtml(prod.title || res.title)}</div>
                  <div class="text-xs text-gray-500 truncate flex items-center gap-2 mt-0.5">
                    <span>${escapeHtml(res.statusText || res.url)}</span>
                    ${prod.price_display && !hasPriceDiff ? `<span class="text-gray-400">• Preço atual: <strong>${escapeHtml(prod.price_display)}</strong></span>` : ''}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                ${statusBadge}
                ${actionBtn}
                <a href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Abrir link no Mercado Livre">🔗</a>
              </div>
            </div>
            ${priceDiffHtml}
          </div>
        `;
      }).join('');

      let batchActionsHeader = '';
      if (pausedToDeactivateCount > 0 || priceChangedCount > 0) {
        batchActionsHeader = `
          <div class="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 mb-3 shadow-xs">
            <div class="text-xs text-amber-950 font-medium">
              ⚡ <strong>Ações Rápidas em Massa:</strong>
              ${pausedToDeactivateCount > 0 ? `<span class="ml-1 font-bold text-red-700">• ${pausedToDeactivateCount} pausados no ML</span>` : ''}
              ${priceChangedCount > 0 ? `<span class="ml-1 font-bold text-amber-800">• ${priceChangedCount} com preço alterado</span>` : ''}
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              ${pausedToDeactivateCount > 0 ? `<button onclick="AffiliatesModule.pauseAllInactiveProducts(this)" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition active:scale-95">⏸️ Pausar Todos (${pausedToDeactivateCount})</button>` : ''}
              ${priceChangedCount > 0 ? `<button onclick="AffiliatesModule.syncAllChangedPrices(this)" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl shadow-sm transition active:scale-95">🔄 Atualizar Todos os Preços (${priceChangedCount})</button>` : ''}
            </div>
          </div>
        `;
      }

      resultsContainer.innerHTML = batchActionsHeader + itemsHtml;

      if (progress) progress.classList.add('hidden');
      if (resultsContainer) resultsContainer.classList.remove('hidden');
      if (summary) summary.textContent = `Resultado: ${okCount} online, ${pausedCount} pausados no ML, ${priceChangedCount} com preço diferente (${itemsToCheck.length} verificados).`;

    } catch (err) {
      console.error('[HealthCheck] Erro:', err);
      if (progress) progress.classList.add('hidden');
      if (resultsContainer) {
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-center text-sm font-medium">Erro ao verificar links: ${escapeHtml(err.message)}</div>`;
      }
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

      // Update individual buttons inside health checker
      ids.forEach(id => {
        const itemBtn = document.getElementById(`pause-btn-${id}`);
        if (itemBtn) {
          itemBtn.className = 'px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg border border-gray-200 cursor-default';
          itemBtn.innerHTML = '⏸️ Pausado no Site';
          itemBtn.disabled = true;
        }
      });

      if (btnElement) {
        btnElement.className = 'px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-default';
        btnElement.innerHTML = `✅ ${ids.length} Pausados no Site!`;
      }

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

  async function syncAllChangedPrices(btnElement = null) {
    if (!lastHealthCheckResults || lastHealthCheckResults.length === 0) return;

    const itemsToUpdate = [];
    lastHealthCheckResults.forEach(res => {
      if (!res.price) return;
      const prod = productsList.find(p => p.id == res.id);
      if (!prod) return;
      const liveNumeric = parsePrice(res.price);
      const currentNumeric = parsePrice(prod.price_display);
      if (liveNumeric > 0 && currentNumeric > 0 && Math.abs(liveNumeric - currentNumeric) >= 0.01) {
        itemsToUpdate.push({
          id: prod.id,
          newPrice: res.price,
          newOrigPrice: res.original_price || prod.original_price || ''
        });
      }
    });

    if (itemsToUpdate.length === 0) {
      alert('Nenhuma alteração de preço para sincronizar.');
      return;
    }

    if (!confirm(`Deseja sincronizar os preços de todos os ${itemsToUpdate.length} produtos com a loja parceira?`)) {
      return;
    }

    try {
      if (btnElement) {
        btnElement.disabled = true;
        btnElement.textContent = 'Atualizando preços...';
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

        const itemBtn = document.getElementById(`sync-price-btn-${item.id}`);
        if (itemBtn) {
          itemBtn.className = 'px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 cursor-default';
          itemBtn.innerHTML = '✅ Preço Atualizado!';
          itemBtn.disabled = true;
        }
      }

      renderTable();

      if (btnElement) {
        btnElement.className = 'px-3 py-1.5 bg-emerald-200 text-emerald-900 text-xs font-bold rounded-lg cursor-default';
        btnElement.innerHTML = `✅ ${itemsToUpdate.length} Preços Atualizados!`;
      }

      if (window.showToast) {
        window.showToast(`${itemsToUpdate.length} preços atualizados com sucesso!`, 'success');
      }
    } catch (e) {
      console.error('[SyncAllPrices] Erro:', e);
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.textContent = 'Tentar novamente';
      }
      alert('Erro ao sincronizar preços: ' + (e.message || e));
    }
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
      { category: 'joias', keywords: ['relogio', 'relógio', 'smartwatch', 'pulseira', 'colar', 'brinco', 'anel', 'corrente', 'pingente', 'alianca', 'aliança', 'joia', 'jóia', 'semijoia', 'ouro 18k', 'prata 925'] },
      { category: 'celulares', keywords: ['smartphone', 'celular', 'iphone', 'xiaomi', 'galaxy', 'motorola', 'redmi', 'poco', 'realme', 'capinha', 'pelicula celular', 'carregador tipo c', 'carregador celular', 'suporte celular', 'ring light'] },
      { category: 'informatica', keywords: ['notebook', 'computador', 'laptop', 'macbook', 'mouse', 'teclado', 'monitor', 'impressora', 'ssd', 'memoria ram', 'pendrive', 'pen drive', 'roteador', 'placa de video', 'gamer', 'gabinete', 'tablet', 'ipad'] },
      { category: 'eletronicos', keywords: ['smart tv', 'tv', 'televisao', 'televisão', 'alexa', 'echo dot', 'fone de ouvido', 'fone bluetooth', 'headphone', 'airpod', 'caixa de som', 'jbl', 'soundbar', 'microfone', 'projetor', 'camera digital', 'drone', 'power bank'] },
      { category: 'confeitaria', keywords: ['confeitaria', 'forma de bolo', 'forma silicone', 'bico de confeitar', 'bailarina bolo', 'espatula bolo', 'espátula bolo', 'cortador bolo', 'pasta americana', 'corante alimenticio', 'assadeira bolo'] },
      { category: 'cozinha', keywords: ['air fryer', 'airfryer', 'fritadeira', 'panela', 'panelas', 'frigideira', 'liquidificador', 'batedeira', 'microondas', 'micro-ondas', 'fogao', 'fogão', 'cooktop', 'forno', 'cafeteira', 'nespresso', 'sanduicheira', 'grill', 'mixer', 'processador', 'chaleira', 'faqueiro', 'faca chef', 'prato', 'copo', 'talher', 'balanca cozinha', 'balança digital', 'garrafa termica'] },
      { category: 'embalagens', keywords: ['embalagem', 'embalagens', 'caixa papelao', 'caixa papelão', 'caixa presente', 'saco kraft', 'sacola kraft', 'sacola papel', 'saquinho', 'fita adesiva', 'plastico bolha', 'saco plastico', 'descartavel', 'descartável', 'copo descartavel', 'marmita', 'kit festa'] },
      { category: 'supermercado', keywords: ['whisky', 'gin', 'vodka', 'cerveja', 'vinho', 'espumante', 'refrigerante', 'suco', 'cafe em graos', 'café', 'capsula cafe', 'cha', 'chá', 'azeite', 'arroz', 'feijao', 'feijão', 'chocolate', 'bombom', 'biscoito', 'bolacha', 'doce de leite', 'nutella', 'snack', 'whey', 'creatina', 'suplemento', 'tempero', 'molho', 'bebida', 'alimento'] },
      { category: 'perfumaria', keywords: ['perfume', 'colonia', 'colônia', 'eau de parfum', 'desodorante', 'hidratante', 'sabonete', 'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'skincare', 'serum facial', 'protetor solar', 'maquiagem', 'batom', 'base facial', 'rimel', 'delineador', 'esmalte'] },
      { category: 'banho', keywords: ['toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'lencol', 'lençol', 'edredom', 'cobertor', 'manta', 'travesseiro', 'fronha', 'cobre leito', 'jogo de cama', 'cortina banheiro', 'tapete banheiro'] },
      { category: 'moda', keywords: ['camisa', 'camiseta', 'calca', 'calça', 'vestido', 'saia', 'bermuda', 'short', 'tenis', 'tênis', 'sapato', 'sandalia', 'sandália', 'bota', 'chinelo', 'havaianas', 'bolsa', 'mochila', 'carteira', 'cinto', 'jaqueta', 'moletom', 'casaco', 'biquini', 'biquíni', 'lingerie', 'meia', 'cueca', 'sutia', 'oculos de sol'] },
      { category: 'brinquedos', keywords: ['brinquedo', 'brinquedos', 'boneca', 'boneco', 'carrinho', 'lego', 'jogo de tabuleiro', 'quebra cabeca', 'quebra-cabeça', 'pelucia', 'pelúcia', 'nerf', 'patinete', 'barbie', 'hot wheels', 'massinha', 'slime'] },
      { category: 'bebes', keywords: ['bebe', 'bebê', 'fralda', 'pampers', 'huggies', 'mamadeira', 'chupeta', 'carrinho de bebe', 'berco', 'berço', 'body bebe', 'macacao bebe', 'mordedor', 'babador', 'lenço umedecido', 'cadeirinha carro'] },
      { category: 'petshop', keywords: ['racao', 'ração', 'cachorro', 'gato', 'pet', 'coleira', 'guia cachorro', 'arranhador', 'caminha pet', 'cama pet', 'petisco', 'comedouro', 'bebedouro pet', 'areia gato', 'tapete higienico', 'shampoo pet'] },
      { category: 'veiculos', keywords: ['automotivo', 'carro', 'moto', 'motocicleta', 'pneu', 'capacete', 'farol', 'oleo motor', 'óleo motor', 'som automotivo', 'camera de re', 'capa automotiva', 'cera automotiva'] },
      { category: 'livros', keywords: ['livro', 'gibi', 'manga', 'mangá', 'quadrinhos', 'caderno', 'caneta', 'lapis de cor', 'estojo', 'papelaria', 'planner', 'agenda', 'marca texto', 'resma papel'] },
      { category: 'construcao', keywords: ['furadeira', 'parafusadeira', 'martelete', 'martelo', 'chave de fenda', 'chave phillips', 'trena', 'serra eletrica', 'serra circular', 'esmerilhadeira', 'ferramenta', 'jogo de ferramentas', 'torneira', 'chuveiro', 'tomada', 'extensao eletrica', 'lampada led', 'tinta parede'] },
      { category: 'presentes', keywords: ['presente', 'lembrancinha', 'caneca personalizada', 'kit presente', 'cesta cafe da manha', 'quadro decorativo', 'luminaria 3d', 'porta retrato', 'chaveiro'] },
      { category: 'utilidades', keywords: ['organizador', 'pote hermetico', 'potes hermeticos', 'vassoura', 'mop', 'rodo', 'dispenser', 'lixeira', 'cabide', 'varal', 'cesto organizador', 'tapete', 'cortina', 'almofada', 'decoracao', 'decoração', 'prateleira', 'espelho', 'umidificador'] }
    ];

    for (const rule of rules) {
      for (const kw of rule.keywords) {
        if (text.includes(kw)) {
          return rule.category;
        }
      }
    }
    return 'utilidades';
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

    return `${sealHeader}🛍️ *ACHADINHO ${platformInfo.name.toUpperCase()}* ⭐\n🔥 *${item.title}*\n${descText}\n💰 *Preço:* ${origPriceText}*${item.price_display || 'Confira no link'}*${discountText}\n\n👉 *COMPRE COM DESCONTO AQUI:*\n${item.affiliate_url}\n\n✨ FastSavory's • Recomendações ${platformInfo.name}\n🌐 https://fastsavorys.vercel.app/pages/achadinhos.html`;
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

  return {
    init: loadProducts,
    loadProducts,
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
    toggleProductActive,
    syncProductPrice,
    pauseAllInactiveProducts,
    syncAllChangedPrices,
    fetchProductDataFromML,
    insertBullet,
    pasteFromClipboard,
    detectCategoryClient,
    openShareModal,
    closeShareModal,
    shareToWhatsApp,
    shareToTelegram,
    shareToFacebook,
    shareNative,
    copyShareText,
    copyShareLinkOnly
  };
})();
