/**
 * FastSavory's - Módulo de Achadinhos & Ofertas (Mercado Livre Afiliados)
 */

(function () {
  let affiliateProducts = [];
  let currentCategory = 'all';
  let currentSearch = '';

  const CATEGORY_GROUPS = {
    group_casa: {
      label: 'Casa & Cozinha',
      icon: '🏠',
      categories: ['cozinha', 'utilidades', 'banho']
    },
    group_festas: {
      label: 'Confeitaria & Festas',
      icon: '🎂',
      categories: ['confeitaria', 'embalagens', 'presentes']
    },
    group_tech: {
      label: 'Tecnologia & Celulares',
      icon: '⚡',
      categories: ['eletronicos', 'celulares', 'informatica']
    },
    group_moda: {
      label: 'Moda & Beleza',
      icon: '👗',
      categories: ['moda', 'perfumaria', 'joias']
    },
    group_infantil: {
      label: 'Infantil & Papelaria',
      icon: '🧸',
      categories: ['brinquedos', 'bebes', 'livros']
    },
    group_outros: {
      label: 'Pet, Auto & Outros',
      icon: '🐶',
      categories: ['petshop', 'veiculos', 'construcao', 'supermercado']
    }
  };

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

    // Botões fixos de topo (Todas as Ofertas e Testados Fast)
    const topCategoryBtns = document.querySelectorAll('.affiliate-category-btn[data-category="all"], .affiliate-category-btn[data-category="fast_picks"]');
    topCategoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        closeAllAccordions();
        const cat = btn.getAttribute('data-category') || 'all';
        setCategory(cat);
      });
    });

    // Accordion Headers (Macro grupos)
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const groupDiv = header.closest('.accordion-group');
        const groupId = groupDiv ? groupDiv.getAttribute('data-group-id') : null;
        const body = groupDiv ? groupDiv.querySelector('.accordion-body') : null;
        const chevron = header.querySelector('.accordion-chevron');
        const isCurrentlyOpen = body && !body.classList.contains('hidden');

        // Fecha todos os outros grupos (apenas 1 aberto por vez)
        document.querySelectorAll('.accordion-group').forEach(otherGroup => {
          if (otherGroup !== groupDiv) {
            const otherBody = otherGroup.querySelector('.accordion-body');
            const otherChevron = otherGroup.querySelector('.accordion-chevron');
            if (otherBody) otherBody.classList.add('hidden');
            if (otherChevron) otherChevron.classList.remove('rotate-180');
            otherGroup.classList.remove('border-yellow-400', 'bg-yellow-50/20');
          }
        });

        if (isCurrentlyOpen) {
          if (body) body.classList.add('hidden');
          if (chevron) chevron.classList.remove('rotate-180');
          if (groupDiv) groupDiv.classList.remove('border-yellow-400', 'bg-yellow-50/20');
        } else {
          if (body) body.classList.remove('hidden');
          if (chevron) chevron.classList.add('rotate-180');
          if (groupDiv) groupDiv.classList.add('border-yellow-400', 'bg-yellow-50/20');
        }

        // Aplica o filtro macro do grupo
        if (groupId) {
          setCategory(groupId);
        }
      });
    });

    // Subcategorias dentro do accordion
    const subcategoryBtns = document.querySelectorAll('.accordion-body .affiliate-category-btn');
    subcategoryBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cat = btn.getAttribute('data-category');
        setCategory(cat);
      });
    });

    // Filtro de Categoria (Mobile Select Dropdown com Optgroups)
    const mobileSelect = document.getElementById('affiliateMobileCategorySelect');
    if (mobileSelect) {
      mobileSelect.addEventListener('change', (e) => {
        setCategory(e.target.value || 'all');
      });
    }
  }

  function closeAllAccordions() {
    document.querySelectorAll('.accordion-group').forEach(group => {
      const body = group.querySelector('.accordion-body');
      const chevron = group.querySelector('.accordion-chevron');
      if (body) body.classList.add('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
      group.classList.remove('border-yellow-400', 'bg-yellow-50/20');
    });
  }

  function setCategory(cat) {
    currentCategory = cat;

    // Se for subcategoria, abre o accordion pai correspondente
    if (!cat.startsWith('group_') && cat !== 'all' && cat !== 'fast_picks') {
      for (const [groupId, groupData] of Object.entries(CATEGORY_GROUPS)) {
        if (groupData.categories.includes(cat)) {
          const groupEl = document.querySelector(`.accordion-group[data-group-id="${groupId}"]`);
          if (groupEl) {
            const body = groupEl.querySelector('.accordion-body');
            const chevron = groupEl.querySelector('.accordion-chevron');
            if (body) body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
            groupEl.classList.add('border-yellow-400', 'bg-yellow-50/20');
          }
        }
      }
    }

    // Sincroniza botões da sidebar desktop
    const categoryButtons = document.querySelectorAll('.affiliate-category-btn');
    categoryButtons.forEach(b => {
      const bCat = b.getAttribute('data-category');
      if (bCat === cat) {
        if (cat === 'fast_picks') {
          b.className = 'affiliate-category-btn text-left px-3 py-2 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 text-white font-black shadow-md transition flex items-center justify-between text-xs w-full group';
        } else if (cat === 'all') {
          b.className = 'affiliate-category-btn text-left px-3 py-2 rounded-xl bg-yellow-400 text-gray-950 font-bold shadow-sm transition flex items-center justify-between text-xs w-full group';
        } else {
          // Subcategoria ativa
          b.className = 'affiliate-category-btn text-left px-2.5 py-1.5 rounded-lg bg-yellow-400 text-gray-950 font-bold shadow-sm transition flex items-center justify-between text-xs w-full';
        }
      } else {
        if (bCat === 'fast_picks') {
          b.className = 'affiliate-category-btn text-left px-3 py-2 rounded-xl text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 font-bold transition flex items-center justify-between text-xs w-full group';
        } else if (bCat === 'all') {
          b.className = 'affiliate-category-btn text-left px-3 py-2 rounded-xl text-gray-700 hover:bg-gray-100 transition flex items-center justify-between text-xs w-full group';
        } else {
          // Subcategoria inativa
          b.className = 'affiliate-category-btn text-left px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition flex items-center justify-between text-xs w-full';
        }
      }
    });

    // Sincroniza estilo do Accordion Header quando o grupo macro está selecionado
    document.querySelectorAll('.accordion-header').forEach(header => {
      const hCat = header.getAttribute('data-category');
      if (hCat === cat) {
        header.classList.add('bg-yellow-200/90', 'text-gray-950');
      } else {
        header.classList.remove('bg-yellow-200/90', 'text-gray-950');
      }
    });

    // Sincroniza select mobile
    const mobileSelect = document.getElementById('affiliateMobileCategorySelect');
    if (mobileSelect && mobileSelect.value !== cat) {
      mobileSelect.value = cat;
    }

    renderProducts();
  }

  function updateCategoryCounts() {
    const counts = {
      all: affiliateProducts.length,
      fast_picks: affiliateProducts.filter(i => Boolean(i.is_fast_pick || i.badge_color === 'fast_seal')).length
    };

    // Subcategories count
    affiliateProducts.forEach(item => {
      if (item.category) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
    });

    // Groups count (sum of subcategories)
    Object.keys(CATEGORY_GROUPS).forEach(groupId => {
      const cats = CATEGORY_GROUPS[groupId].categories;
      counts[groupId] = cats.reduce((acc, cat) => acc + (counts[cat] || 0), 0);
    });

    // Update count badges
    document.querySelectorAll('.category-count[data-count-for]').forEach(el => {
      const key = el.getAttribute('data-count-for');
      const val = counts[key] || 0;
      el.textContent = val;
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

    updateCategoryCounts();
    renderProducts();
  }

  function detectPlatform(url = '') {
    const u = (url || '').toLowerCase();
    if (u.includes('amazon.com.br') || u.includes('amzn.to') || u.includes('a.co') || u.includes('amazon.')) {
      return { 
        id: 'amazon', 
        name: 'Amazon', 
        btnText: 'Comprar na Amazon', 
        btnClass: 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:from-amber-600 hover:to-amber-700 text-white group-hover:ring-amber-400',
        badge: 'bg-amber-100 text-amber-950 border-amber-300',
        icon: '📦'
      };
    }
    if (u.includes('shopee.com.br') || u.includes('s.shopee.com.br') || u.includes('shope.ee') || u.includes('shopee.')) {
      return { 
        id: 'shopee', 
        name: 'Shopee', 
        btnText: 'Comprar na Shopee', 
        btnClass: 'bg-gradient-to-r from-orange-500 via-rose-500 to-orange-500 hover:from-orange-600 hover:to-rose-600 text-white group-hover:ring-orange-400',
        badge: 'bg-orange-100 text-orange-950 border-orange-300',
        icon: '🧡'
      };
    }
    return { 
      id: 'mercadolivre', 
      name: 'Mercado Livre', 
      btnText: 'Ver no Mercado Livre', 
      btnClass: 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-500 hover:to-amber-500 text-gray-900 group-hover:ring-yellow-400',
      badge: 'bg-yellow-100 text-yellow-950 border-yellow-300',
      icon: '💛'
    };
  }

  function renderProducts() {
    const grid = document.getElementById('affiliateProductsGrid');
    const emptyState = document.getElementById('affiliateEmptyState');
    if (!grid) return;

    let filtered = affiliateProducts.filter(item => {
      let matchCat = false;
      if (currentCategory === 'all') {
        matchCat = true;
      } else if (currentCategory === 'fast_picks') {
        matchCat = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
      } else if (currentCategory.startsWith('group_')) {
        const group = CATEGORY_GROUPS[currentCategory];
        matchCat = group ? group.categories.includes(item.category) : false;
      } else {
        matchCat = item.category === currentCategory;
      }

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
      const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');
      const platformInfo = detectPlatform(item.affiliate_url);

      // Cálculo automático de porcentagem de desconto (Verde)
      const pct = calcDiscountPercent(item.original_price, item.price_display);
      const discountBadgeHtml = pct > 0 
        ? `<span class="inline-flex items-center px-2 py-0.5 text-xs font-black rounded-full bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm tracking-wide flex-shrink-0 animate-pulse">🔥 ${pct}% OFF</span>`
        : '';

      // Cores para as badges secundárias (Padrão: Laranja)
      let badgeStyle = 'bg-orange-100 text-orange-950 border-orange-300 font-bold';
      if (item.badge_color === 'amber') badgeStyle = 'bg-yellow-100 text-yellow-950 border-yellow-300 font-bold';
      if (item.badge_color === 'rose') badgeStyle = 'bg-rose-100 text-rose-950 border-rose-300 font-bold';
      if (item.badge_color === 'emerald') badgeStyle = 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold';
      if (item.badge_color === 'blue') badgeStyle = 'bg-blue-100 text-blue-950 border-blue-300 font-bold';
      if (item.badge_color === 'purple') badgeStyle = 'bg-purple-100 text-purple-950 border-purple-300 font-bold';
      if (item.badge_color === 'pink') badgeStyle = 'bg-pink-100 text-pink-950 border-pink-300 font-bold';
      if (item.badge_color === 'black') badgeStyle = 'bg-gray-900 text-white border-gray-950 font-bold shadow-xs';

      // Evita duplicidade de badge se a tag for apenas a indicação do mesmo desconto
      let showTag = false;
      const rawTag = item.discount_tag ? item.discount_tag.trim() : '';
      if (rawTag) {
        const isOnlyDiscountTag = /^[⚡🔥\s]*\d+%\s*OFF/i.test(rawTag);
        if (!isOnlyDiscountTag || pct === 0) {
          showTag = true;
        }
      }

      const tagHtml = showTag 
        ? `<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${badgeStyle} flex-shrink-0">${escapeHtml(rawTag)}</span>` 
        : '';

      const platformBadgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border ${platformInfo.badge} font-bold shadow-xs flex-shrink-0">${platformInfo.icon} ${platformInfo.name}</span>`;

      const originalPriceHtml = item.original_price 
        ? `<span class="text-xs text-gray-400 line-through mr-1.5">${escapeHtml(item.original_price)}</span>` 
        : '';

      const cardBorder = isFastPick 
        ? 'border-4 border-pink-500 shadow-lg shadow-pink-100/50 ring-2 ring-purple-400/20' 
        : 'border border-gray-100 shadow-sm';

      const sealMedalHtml = isFastPick 
        ? `<img src="../assets/img/fast-seal.png" alt="Selo FastSavory's" class="absolute top-1.5 right-1.5 w-11 h-15 sm:w-13 sm:h-17 object-contain drop-shadow-md z-20 pointer-events-none transform rotate-2 hover:rotate-0 transition-transform" />`
        : '';

      return `
        <div class="bg-white rounded-2xl ${cardBorder} hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col group transform hover:-translate-y-1">
          <!-- Imagem com Badges e Selo Medalha -->
          <div class="relative w-full pt-[80%] bg-gray-50 overflow-hidden ${isFastPick ? 'border-b-4 border-pink-500' : ''}">
            <img 
              src="${escapeHtml(item.image_url)}" 
              alt="${escapeHtml(item.title)}" 
              loading="lazy"
              class="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
              onerror="this.src='../assets/img/fast-logo.png'; this.className='absolute inset-0 w-full h-full object-contain p-8 opacity-40';"
            />
            <!-- Badges no topo esquerdo da imagem -->
            <div class="absolute top-2 left-2 flex flex-row flex-wrap items-center gap-1.5 z-10 max-w-[70%]">
              ${discountBadgeHtml}
              ${tagHtml}
              ${platformBadgeHtml}
            </div>
            <!-- Medalha Oficial FastSavory's no topo direito -->
            ${sealMedalHtml}
          </div>

          <!-- Selo FastSavory's em destaque no meio (2 linhas exatas) -->
          ${isFastPick ? `
            <div class="bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 text-white py-1 px-2 text-center shadow-sm">
              <div class="text-[9.5px] sm:text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-1 leading-tight">
                <span>👑</span> <span>PRODUTO TESTADO E RECOMENDADO</span>
              </div>
              <div class="text-[9.5px] sm:text-[10.5px] font-black uppercase tracking-wider text-pink-100 flex items-center justify-center gap-1 leading-tight mt-0.5">
                <span>PELA FASTSAVORY'S</span> <span>✨</span>
              </div>
            </div>
          ` : ''}

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

              <div class="flex items-center gap-2">
                <a 
                  href="${escapeHtml(item.affiliate_url)}" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  class="flex-1 py-2.5 px-3 ${platformInfo.btnClass} font-extrabold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 text-center group-hover:ring-2 group-hover:ring-offset-1"
                >
                  <span>${platformInfo.btnText}</span>
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <button 
                  type="button" 
                  onclick="window.openShareModal(${item.id})"
                  title="Compartilhar no WhatsApp, Telegram, etc."
                  class="p-2.5 bg-gray-100 hover:bg-yellow-100 text-gray-700 hover:text-gray-950 border border-gray-200 hover:border-yellow-300 rounded-xl transition flex items-center justify-center flex-shrink-0 shadow-sm active:scale-95"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
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

  window.openShareModal = function (id) {
    const item = affiliateProducts.find(p => p.id == id);
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
  };

  window.closeAffiliateShareModal = function () {
    const modal = document.getElementById('affiliateShareModal');
    if (modal) modal.classList.add('hidden');
  };

  window.shareToWhatsApp = function () {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  window.shareToTelegram = function () {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    const url = `https://t.me/share/url?url=${encodeURIComponent(currentShareItem.affiliate_url)}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  window.shareToFacebook = function () {
    if (!currentShareItem) return;
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentShareItem.affiliate_url)}`;
    window.open(url, '_blank');
  };

  window.shareNative = async function () {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentShareItem.title,
          text: msg,
          url: currentShareItem.affiliate_url
        });
      } catch (e) {
        // User cancelled or not supported
      }
    } else {
      window.copyShareText();
    }
  };

  window.copyShareText = function () {
    if (!currentShareItem) return;
    const msg = buildShareText(currentShareItem);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => {
        alert('✨ Mensagem completa copiada! Agora basta colar no WhatsApp, Instagram, Telegram ou onde preferir.');
      });
    }
  };

  window.copyShareLinkOnly = function () {
    if (!currentShareItem) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentShareItem.affiliate_url).then(() => {
        alert('🔗 Link de afiliado copiado!');
      });
    }
  };

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
