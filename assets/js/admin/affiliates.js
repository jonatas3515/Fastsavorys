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

      return `
        <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
          <td class="p-3 text-center text-xs font-bold text-gray-400 w-12">${item.position || 0}</td>
          <td class="p-3 w-16">
            <img src="${escapeHtml(item.image_url)}" alt="" class="w-12 h-12 object-contain rounded-lg border bg-white p-1" 
                 onerror="this.src='../assets/img/fast-logo.png'" />
          </td>
          <td class="p-3 font-medium text-gray-900 max-w-xs">
            <div class="font-bold text-sm truncate">${escapeHtml(item.title)}</div>
            ${item.discount_tag ? `<span class="inline-block text-[10px] bg-yellow-100 text-yellow-800 font-bold px-1.5 py-0.2 rounded mt-0.5">${escapeHtml(item.discount_tag)}</span>` : ''}
          </td>
          <td class="p-3 text-xs text-gray-600">${escapeHtml(catLabel)}</td>
          <td class="p-3 font-bold text-sm text-gray-800">${escapeHtml(item.price_display || '-')}</td>
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
    document.getElementById('affiliateBadgeColorInput').value = item.badge_color || 'amber';
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
    clearFilters
  };
})();
