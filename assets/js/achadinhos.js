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

    // Filtros de Categoria (Desktop Sidebar)
    const categoryButtons = document.querySelectorAll('.affiliate-category-btn');
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category') || 'all';
        setCategory(cat);
      });
    });

    // Filtro de Categoria (Mobile Select Dropdown)
    const mobileSelect = document.getElementById('affiliateMobileCategorySelect');
    if (mobileSelect) {
      mobileSelect.addEventListener('change', (e) => {
        setCategory(e.target.value || 'all');
      });
    }
  }

  function setCategory(cat) {
    currentCategory = cat;

    // Sincroniza botões da sidebar desktop
    const categoryButtons = document.querySelectorAll('.affiliate-category-btn');
    categoryButtons.forEach(b => {
      if (b.getAttribute('data-category') === cat) {
        b.classList.add('bg-yellow-400', 'text-gray-950', 'shadow-sm', 'font-bold');
        b.classList.remove('text-gray-700', 'hover:bg-gray-100');
      } else {
        b.classList.remove('bg-yellow-400', 'text-gray-950', 'shadow-sm', 'font-bold');
        b.classList.add('text-gray-700', 'hover:bg-gray-100');
      }
    });

    // Sincroniza select mobile
    const mobileSelect = document.getElementById('affiliateMobileCategorySelect');
    if (mobileSelect && mobileSelect.value !== cat) {
      mobileSelect.value = cat;
    }

    renderProducts();
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
      const isFastPick = Boolean(item.is_fast_pick || item.badge_color === 'fast_seal');

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
      if (item.badge_color === 'fast_seal') badgeStyle = 'bg-gradient-to-r from-pink-600 to-purple-600 text-white font-extrabold shadow-sm border-transparent';

      // Selo FastSavory's especial
      const fastSealBadgeHtml = isFastPick
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-black rounded-full bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-white shadow-md tracking-wide flex-shrink-0 animate-pulse">✨ Selo FastSavory's</span>`
        : '';

      const fastPickBannerHtml = isFastPick
        ? `<div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 mb-2 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 text-[11px] font-extrabold text-pink-700 shadow-2xs">
             <span>👑</span> <span>Testado & Recomendado FastSavory's</span>
           </div>`
        : '';

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

      const originalPriceHtml = item.original_price 
        ? `<span class="text-xs text-gray-400 line-through mr-1.5">${escapeHtml(item.original_price)}</span>` 
        : '';

      const cardClasses = isFastPick
        ? "bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border-2 border-pink-400 overflow-hidden flex flex-col group transform hover:-translate-y-1 relative ring-1 ring-purple-300/40"
        : "bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden flex flex-col group transform hover:-translate-y-1 relative";

      const imageContainerClasses = isFastPick
        ? "relative w-full pt-[80%] bg-gradient-to-br from-pink-50/90 via-purple-50/50 to-white overflow-hidden border-b-2 border-pink-300"
        : "relative w-full pt-[80%] bg-gray-50 overflow-hidden";

      const imageInnerBorder = isFastPick
        ? `<div class="absolute inset-1.5 rounded-xl border-2 border-pink-400/50 pointer-events-none z-0"></div>`
        : '';

      return `
        <div class="${cardClasses}">
          <!-- Imagem com Borda Diferenciada e Badges -->
          <div class="${imageContainerClasses}">
            ${imageInnerBorder}
            <img 
              src="${escapeHtml(item.image_url)}" 
              alt="${escapeHtml(item.title)}" 
              loading="lazy"
              class="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300 relative z-1"
              onerror="this.src='../assets/img/fast-logo.png'; this.className='absolute inset-0 w-full h-full object-contain p-8 opacity-40';"
            />
            <!-- Badges Lado a Lado -->
            <div class="absolute top-2 left-2 right-2 flex flex-row flex-wrap items-center gap-1.5 z-10">
              ${fastSealBadgeHtml}
              ${discountBadgeHtml}
              ${tagHtml}
            </div>
          </div>

          <!-- Conteúdo -->
          <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <div>
              ${fastPickBannerHtml}
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
                  class="flex-1 py-2.5 px-3 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-500 hover:to-amber-500 text-gray-900 font-extrabold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 text-center group-hover:ring-2 group-hover:ring-yellow-400 group-hover:ring-offset-1"
                >
                  <span>Ver no Mercado Livre</span>
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

    return `${sealHeader}🛍️ *ACHADINHO FASTSAVORY'S* ⭐\n🔥 *${item.title}*\n${descText}\n💰 *Preço:* ${origPriceText}*${item.price_display || 'Confira no link'}*${discountText}\n\n👉 *COMPRE COM DESCONTO AQUI:*\n${item.affiliate_url}\n\n✨ FastSavory's • Recomendações Mercado Livre\n🌐 https://fastsavorys.vercel.app/pages/achadinhos.html`;
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
