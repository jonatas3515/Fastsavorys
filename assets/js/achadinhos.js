/**
 * FastSavory's - Módulo de Achadinhos & Ofertas (Mercado Livre Afiliados)
 */

(function () {
  let affiliateProducts = [];
  let currentCategory = 'all';
  let currentSearch = '';

  document.addEventListener('DOMContentLoaded', async () => {
    initAffiliateShowcase();
  });

  async function initAffiliateShowcase() {
    setupEventListeners();
    await fetchAffiliateProducts();
  }

  function setupEventListeners() {
    // Busca em tempo real
    const searchInput = document.getElementById('affiliateSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase().trim();
        renderProducts();
      });
    }

    // Filtros de Categoria
    const categoryButtons = document.querySelectorAll('.affiliate-category-btn');
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        categoryButtons.forEach(b => {
          b.classList.remove('bg-yellow-400', 'text-gray-900', 'shadow-md', 'font-bold');
          b.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-200');
        });
        btn.classList.add('bg-yellow-400', 'text-gray-900', 'shadow-md', 'font-bold');
        btn.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-200');

        currentCategory = btn.getAttribute('data-category') || 'all';
        renderProducts();
      });
    });
  }

  async function fetchAffiliateProducts() {
    const grid = document.getElementById('affiliateProductsGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center">
          <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-yellow-400 border-t-transparent"></div>
          <p class="mt-3 text-gray-500 font-medium">Buscando as melhores ofertas para você...</p>
        </div>
      `;
    }

    try {
      if (window.supabaseClient) {
        const { data, error } = await window.supabaseClient
          .from('fast_affiliate_products')
          .select('*')
          .eq('is_active', true)
          .order('position', { ascending: true });

        if (!error && data && data.length > 0) {
          affiliateProducts = data;
        } else {
          // Fallback para os dados pré-definidos
          affiliateProducts = window.DEFAULT_AFFILIATE_PRODUCTS || [];
        }
      } else {
        affiliateProducts = window.DEFAULT_AFFILIATE_PRODUCTS || [];
      }
    } catch (err) {
      console.warn('[Achadinhos] Erro ao carregar do banco, usando fallback:', err);
      affiliateProducts = window.DEFAULT_AFFILIATE_PRODUCTS || [];
    }

    renderProducts();
  }

  function renderProducts() {
    const grid = document.getElementById('affiliateProductsGrid');
    const emptyState = document.getElementById('affiliateEmptyState');
    if (!grid) return;

    let filtered = affiliateProducts.filter(item => {
      const matchCat = currentCategory === 'all' || item.category === currentCategory;
      const matchSearch = !currentSearch || 
        (item.title && item.title.toLowerCase().includes(currentSearch)) ||
        (item.description && item.description.toLowerCase().includes(currentSearch)) ||
        (item.discount_tag && item.discount_tag.toLowerCase().includes(currentSearch));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = filtered.map(item => {
      // Cores para as badges
      let badgeStyle = 'bg-yellow-100 text-yellow-800 border-yellow-300';
      if (item.badge_color === 'rose') badgeStyle = 'bg-rose-100 text-rose-800 border-rose-300';
      if (item.badge_color === 'emerald') badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      if (item.badge_color === 'blue') badgeStyle = 'bg-blue-100 text-blue-800 border-blue-300';

      const tagHtml = item.discount_tag 
        ? `<span class="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badgeStyle} mb-2">${escapeHtml(item.discount_tag)}</span>` 
        : '';

      const originalPriceHtml = item.original_price 
        ? `<span class="text-xs text-gray-400 line-through mr-1.5">${escapeHtml(item.original_price)}</span>` 
        : '';

      return `
        <div class="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden flex flex-col group transform hover:-translate-y-1">
          <!-- Imagem com Badge -->
          <div class="relative w-full pt-[80%] bg-gray-50 overflow-hidden">
            <img 
              src="${escapeHtml(item.image_url)}" 
              alt="${escapeHtml(item.title)}" 
              loading="lazy"
              class="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
              onerror="this.src='../assets/img/fast-logo.png'; this.className='absolute inset-0 w-full h-full object-contain p-8 opacity-40';"
            />
            <div class="absolute top-2 left-2 flex flex-col gap-1">
              ${tagHtml}
            </div>
          </div>

          <!-- Conteúdo -->
          <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <div>
              <h3 class="font-bold text-gray-800 text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-amber-600 transition-colors">
                ${escapeHtml(item.title)}
              </h3>
              ${item.description ? `<p class="text-xs text-gray-500 mt-1 line-clamp-2">${escapeHtml(item.description)}</p>` : ''}
            </div>

            <!-- Preço e Botão de Ação -->
            <div class="mt-4 pt-3 border-t border-gray-100">
              <div class="flex items-baseline gap-1 mb-3">
                ${originalPriceHtml}
                <span class="text-lg sm:text-xl font-extrabold text-gray-900">${escapeHtml(item.price_display || 'Ver Preço')}</span>
              </div>

              <a 
                href="${escapeHtml(item.affiliate_url)}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="w-full py-2.5 px-4 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-500 hover:to-amber-500 text-gray-900 font-bold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 text-center group-hover:ring-2 group-hover:ring-yellow-400 group-hover:ring-offset-1"
              >
                <span>Ver no Mercado Livre</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');
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

  // Exportar para uso global
  window.reloadAffiliateShowcase = fetchAffiliateProducts;
})();
