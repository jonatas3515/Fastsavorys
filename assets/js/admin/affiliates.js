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

    const filtered = productsList.filter(item => {
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
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

    tbody.innerHTML = filtered.map(item => {
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

      return `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
          <td class="p-3 text-center text-xs font-bold text-gray-400 w-12">${item.position || 0}</td>
          <td class="p-3 w-16">
            <img src="${escapeHtml(item.image_url)}" alt="" class="w-12 h-12 object-contain rounded-lg border bg-white p-1" 
                 onerror="this.src='../assets/img/fast-logo.png'" />
          </td>
          <td class="p-3 font-medium text-gray-900 max-w-xs">
            <div class="font-bold text-sm truncate">${escapeHtml(item.title)}</div>
            <div class="flex items-center gap-1 mt-0.5">
              ${discountBadge}
              ${item.discount_tag ? `<span class="inline-block text-[10px] bg-orange-100 text-orange-950 font-bold px-1.5 py-0.2 rounded border border-orange-200">${escapeHtml(item.discount_tag)}</span>` : ''}
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
              <a href="${escapeHtml(item.affiliate_url)}" target="_blank" rel="noopener noreferrer" 
                 class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Testar link no ML">🔗</a>
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
    document.getElementById('affiliateModalTitle').textContent = '➕ Novo Achadinho (Mercado Livre)';
    document.getElementById('affiliateId').value = '';
    document.getElementById('affiliateBadgeColorInput').value = 'orange';
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
    document.getElementById('affiliateTagInput').value = item.discount_tag || '';
    document.getElementById('affiliateBadgeColorInput').value = item.badge_color || 'orange';
    document.getElementById('affiliatePositionInput').value = item.position || 1;
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

      // Preenche tag se tiver desconto significativo
      if (info.discount_tag && !document.getElementById('affiliateTagInput').value.trim()) {
        document.getElementById('affiliateTagInput').value = `⚡ ${info.discount_tag}`;
      } else if (info.discount_percent > 0 && !document.getElementById('affiliateTagInput').value.trim()) {
        document.getElementById('affiliateTagInput').value = `⚡ ${info.discount_percent}% OFF`;
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

    const payload = {
      title,
      description: document.getElementById('affiliateDescriptionInput').value.trim() || null,
      affiliate_url,
      image_url,
      price_display: document.getElementById('affiliatePriceInput').value.trim() || null,
      original_price: document.getElementById('affiliateOriginalPriceInput').value.trim() || null,
      category: document.getElementById('affiliateCategoryInput').value,
      discount_tag: document.getElementById('affiliateTagInput').value.trim() || null,
      badge_color: document.getElementById('affiliateBadgeColorInput').value,
      position: parseInt(document.getElementById('affiliatePositionInput').value) || 1,
      is_active: document.getElementById('affiliateActiveInput').checked,
      updated_at: new Date().toISOString()
    };

    try {
      if (window.supabaseClient) {
        if (editingId) {
          const { error } = await window.supabaseClient
            .from('fast_affiliate_products')
            .update(payload)
            .eq('id', editingId);

          if (error) throw error;
        } else {
          payload.created_at = new Date().toISOString();
          const { error } = await window.supabaseClient
            .from('fast_affiliate_products')
            .insert([payload]);

          if (error) throw error;
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

  function calcDiscountPercent(origStr, currStr) {
    if (!origStr || !currStr) return 0;
    const parseNum = (str) => {
      const clean = String(str).replace(/[^\d,\.]/g, '').replace(',', '.');
      return parseFloat(clean);
    };
    const orig = parseNum(origStr);
    const curr = parseNum(currStr);
    if (!orig || !curr || orig <= curr) return 0;
    const pct = Math.round(((orig - curr) / orig) * 100);
    return pct > 0 && pct < 100 ? pct : 0;
  }

  async function checkAllLinksHealth() {
    if (!productsList || productsList.length === 0) {
      alert('Nenhum produto cadastrado para verificar.');
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
    if (statusText) statusText.textContent = `Testando ${productsList.length} links no Mercado Livre...`;

    try {
      const response = await fetch('/api/check-affiliate-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: productsList })
      });

      if (!response.ok) throw new Error('Falha na resposta do verificador');

      const data = await response.json();
      const results = data.results || [];

      let okCount = 0;
      let pausedCount = 0;
      let errorCount = 0;

      resultsContainer.innerHTML = results.map(res => {
        const prod = productsList.find(p => p.id == res.id) || { title: res.title || 'Produto', image_url: '../assets/img/fast-logo.png' };
        
        let statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800 flex items-center gap-1">🟢 Online</span>`;
        if (res.status === 'paused') {
          pausedCount++;
          statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 flex items-center gap-1">🔴 Pausado</span>`;
        } else if (res.status === 'error' || res.status === 'timeout' || res.status === 'warning') {
          errorCount++;
          statusBadge = `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">⚠️ Atenção</span>`;
        } else {
          okCount++;
        }

        const pauseBtn = res.status === 'paused' && prod.is_active !== false
          ? `<button onclick="AffiliatesModule.toggleProductActive(${prod.id}, false)" class="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200 transition">Pausar no Site</button>`
          : '';

        return `
          <div class="p-3 bg-white border border-gray-100 rounded-xl flex items-center justify-between gap-3 shadow-sm">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${escapeHtml(prod.image_url)}" alt="" class="w-10 h-10 object-contain rounded-lg bg-gray-50 border p-0.5 flex-shrink-0" onerror="this.src='../assets/img/fast-logo.png'" />
              <div class="min-w-0">
                <div class="font-bold text-sm text-gray-900 truncate">${escapeHtml(prod.title || res.title)}</div>
                <div class="text-xs text-gray-500 truncate">${escapeHtml(res.statusText || res.url)}</div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              ${statusBadge}
              ${pauseBtn}
              <a href="${escapeHtml(res.url)}" target="_blank" rel="noopener noreferrer" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Abrir link no ML">🔗</a>
            </div>
          </div>
        `;
      }).join('');

      if (progress) progress.classList.add('hidden');
      if (resultsContainer) resultsContainer.classList.remove('hidden');
      if (summary) summary.textContent = `Resultado: ${okCount} online, ${pausedCount} pausados, ${errorCount} instáveis/aviso.`;

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

  async function toggleProductActive(id, newStatus) {
    try {
      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;
      }

      if (window.showToast) window.showToast(newStatus ? 'Produto ativado no site!' : 'Produto pausado no site!', 'info');
      await loadProducts();
      closeHealthModal();
    } catch (e) {
      console.error('[ToggleActive] Erro:', e);
      alert('Erro ao alterar status do produto.');
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
    fetchProductDataFromML,
    insertBullet,
    pasteFromClipboard,
    detectCategoryClient
  };
})();
