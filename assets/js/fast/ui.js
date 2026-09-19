/**
 * Fast Savory's - UI Module
 * Handles product rendering, toasts, and UI updates
 */

// Debounce helpers
let _renderProductsTimeout = null;
let _renderProductsLastRun = 0;

// Helper: Check product availability (using util logic if available, or simple check)
function isProductAvailable(product) {
    // Rely on global or util if possible, or implement simple check
    if (product.unavailableToday) return false;

    // Check dates
    if (product.startDate && product.endDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = window.safeDate(product.startDate);
        const end = window.safeDate(product.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (today < start || today > end) return false;
    }

    if (product.visible === false) return false;
    return true;
}

// Verifica se o produto requer 1 dia de antecedência (Empadão, Bolos grandes/tradicionais, Kits Festa)
function isProductPreorderRequired(product) {
    if (!product) return false;
    if (product.requires_preorder === true || product.is_encomenda === true || product.isEncomenda === true) {
        return true;
    }
    const name = (product.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const category = (product.category || '').toLowerCase();

    // Empadão exige 1 dia de antecedência
    if (name.includes('empadao')) return true;

    // Mini Pizza Festa exige 1 dia de antecedência
    if (name.includes('mini pizza festa') || name.includes('pizza festa')) return true;

    // Kits Festa exigem 1 dia de antecedência
    if (category === 'kits' || name.includes('kit festa') || name.includes('kit ')) return true;

    // Exceções de bolos que NÃO exigem 1 dia (podem ser no mesmo dia)
    if (name.includes('vulcao mini') || name.includes('mini vulcao') || name.includes('pote')) return false;

    // Bolos e Vulcão grande
    if (category === 'bolos' || name.includes('bolo') || name.includes('vulcao')) return true;

    return false;
}

// Render a single product card HTML
function createProductCard(product) {
    const isAdditional = product.category === 'adicionais';
    // FavoritesService is global from services.js
    const isFav = (typeof window.FavoritesService !== 'undefined')
        ? window.FavoritesService.isFavorite(window.currentClientPhone || localStorage.getItem('fastLastPhone'), product.id)
        : false;
    const heartIcon = isFav ? '❤️' : '🤍';

    // Preorder (1 dia de antecedência) & Promotion Logic
    const isPreorder = isProductPreorderRequired(product);
    const promotion = (window.promotions || []).find(p => p.productId === product.id);
    let displayPrice = product.price;
    let priceHtml = '';
    let promoBadge = '';
    let hasPromo = false;

    if (promotion) {
        hasPromo = true;
        if (promotion.type === 'percentage') {
            displayPrice = product.price * (1 - promotion.value / 100);
            promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-${promotion.value}%</span>`;
        } else {
            displayPrice = product.price - promotion.value;
            promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-R$${promotion.value}</span>`;
        }
        priceHtml = `<span class='line-through text-gray-400 text-sm mr-1'>R$ ${product.price.toFixed(2).replace('.', ',')}</span><span class='text-rose-600 font-bold'>R$ ${displayPrice.toFixed(2).replace('.', ',')}</span>`;
    } else {
        priceHtml = `<span class='text-rose-600 ${isAdditional ? "text-sm" : "text-lg"} font-bold'>R$ ${product.price.toFixed(2).replace('.', ',')}</span>`;
        if (product.promo && product.promo.active) {
            hasPromo = true;
            if (product.promo.type === 'percent') {
                displayPrice = product.price * (1 - product.promo.value / 100);
                promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-${product.promo.value}%</span>`;
            } else {
                displayPrice = product.price - product.promo.value;
                promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-R$${product.promo.value}</span>`;
            }
            priceHtml = `<span class='line-through text-gray-400 text-sm mr-1'>R$ ${product.price.toFixed(2).replace('.', ',')}</span><span class='text-rose-600 font-bold'>R$ ${displayPrice.toFixed(2).replace('.', ',')}</span>`;
        }
    }

    // Regra de bordas:
    // - Produtos com 1 dia de antecedência (Empadão, Bolos, Kits) = borda rosa
    // - Produtos em promoção = borda amarela
    // - Se houver conflito (promoção + 1 dia de antecedência), a linha rosa PREVALECE!
    let borderClass = 'border-gray-100';
    if (isPreorder) {
        borderClass = 'border-pink-500 border-2';
    } else if (hasPromo) {
        borderClass = 'border-yellow-400 border-2';
    }

    // Image logic
    const hasImage = (window.isValidImageUrl ? window.isValidImageUrl(product.image) : !!product.image);
    const imageHtml = hasImage
        ? `<img src='${product.image}' class='product-img-mobile'>`
        : `<div class='product-emoji-mobile'><span class='${isAdditional ? "text-3xl" : "text-4xl"}'>${product.emoji || '📦'}</span></div>`;

    // Top seller badge
    let topBadge = '';
    const topIds = window._topProductIds || [];
    const topIdx = topIds.findIndex(id => id === product.id || id === parseInt(product.id, 10) || String(id) === String(product.id));
    if (topIdx !== -1) {
        const medals = { 0: '🥇', 1: '🥈', 2: '🥉' };
        topBadge = `<span class='absolute -top-1 -left-1 text-lg z-10' title='Top ${topIdx + 1} mais pedido'>${medals[topIdx] || '🔥'}</span>`;
    }

    return `
    <div id='fast-product-${product.id}' data-product-id='${product.id}' class='bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-3 border ${borderClass} relative'>
        ${promoBadge}
        ${topBadge}
        <div class='flex items-stretch gap-3'>
            ${imageHtml}
            <div class='flex-1 min-w-0 flex flex-col justify-between'>
                <div>
                    <div class='flex items-start justify-between gap-1'>
                        <h3 class='font-semibold text-gray-800 ${isAdditional ? 'text-sm' : 'text-sm'} leading-tight'>${product.name}</h3>
                        <div class='flex items-center gap-0.5 flex-shrink-0'>
                            <button type='button' onclick='event.stopPropagation(); window.openFastProductShareModal("${product.id}")' class='p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition active:scale-95' title='Compartilhar este produto'>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                            </button>
                            <button class='favorite-btn text-lg p-0.5 hover:scale-110 transition-transform' data-id='${product.id}' title='Favorito'>${heartIcon}</button>
                        </div>
                    </div>
                    <p class='text-xs text-gray-500 line-clamp-2 mt-0.5'>${product.description || ''}</p>
                </div>
                <div class='flex items-center justify-between mt-2 flex-wrap gap-2'>
                    <div class='whitespace-nowrap'>${priceHtml}</div>
                    <button class='add-to-cart bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0' 
                        data-id='${product.id}' 
                        data-name='${product.name}' 
                        data-description='${product.description || ''}' 
                        data-price='${displayPrice}' 
                        data-category='${product.category}'>
                        Adicionar
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}


// Main render function
function renderProducts() {
    const now = Date.now();
    if (now - _renderProductsLastRun < 100) {
        if (_renderProductsTimeout) clearTimeout(_renderProductsTimeout);
        _renderProductsTimeout = setTimeout(renderProducts, 100);
        return;
    }
    _renderProductsLastRun = now;

    const map = {
        salgados: document.getElementById('salgadosContainer'),
        mini: document.getElementById('miniContainer'),
        kits: document.getElementById('kitsContainer'),
        bolos: document.getElementById('bolosContainer'),
        combo: document.getElementById('comboContainer'),
        combos: document.getElementById('comboContainer'),
        combosalgado: document.getElementById('comboContainer'),
        combosalgados: document.getElementById('comboContainer'),
        adicionais: document.getElementById('adicionaisContainer'),
        bebidas: document.getElementById('bebidasContainer')
    };

    // Clear containers
    Object.values(map).forEach(el => { if (el) el.innerHTML = ''; });

    // Debug categories
    const categoriesFound = new Set();
    (window.products || []).forEach(p => categoriesFound.add(`"${p.category}"`));
    console.log('[UI] Categories found in products:', Array.from(categoriesFound));

    // Filter and render
    (window.products || []).filter(isProductAvailable).forEach(product => {
        const catKey = (product.category || '').toLowerCase().trim();
        if (map[catKey]) {
            map[catKey].innerHTML += createProductCard(product);
        } else {
            // Debug missing mapping
            if (product.category && product.category.toLowerCase().includes('combo')) {
                console.warn('[UI] Combo product not mapped:', product.name, 'Category:', product.category, 'Normalized:', catKey);
            }
        }
    });

    // Render other sections
    renderPromosSection();
    renderFavoritosSection();
    if (typeof window.renderRecentOrders === 'function') window.renderRecentOrders(); // might be in ui.js or distinct

    // Deep-link: Scroll smoothly to product if requested in URL
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetProdId = urlParams.get('product') || urlParams.get('p');
        if (targetProdId && !window._scrolledToSharedProduct) {
            window._scrolledToSharedProduct = true;
            setTimeout(() => {
                const card = document.getElementById(`fast-product-${targetProdId}`) ||
                             document.querySelector(`[data-product-id="${targetProdId}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('ring-4', 'ring-rose-500', 'transition-all', 'duration-500');
                    setTimeout(() => {
                        card.classList.remove('ring-4', 'ring-rose-500');
                    }, 3500);
                }
            }, 300);
        }
    } catch (e) {
        console.warn('[UI] Error scrolling to shared product:', e);
    }
}

// Render Filtered Products
// Render Filtered Products
function renderFilteredProducts(filter) {
    const categories = ['salgados', 'mini', 'kits', 'bolos', 'combo', 'combos', 'bebidas', 'adicionais'];
    const containers = {};
    categories.forEach(cat => {
        const el = document.getElementById(`${cat}Container`);
        if (el) containers[cat] = el;
    });
    // Manual mapping for aliases
    if (containers['combo']) {
        containers['combosalgado'] = containers['combo'];
        containers['combosalgados'] = containers['combo'];
    }

    // Toggle logic for sections usually handled by UI clicks, but here we enforce visibility
    document.querySelectorAll('.category-section').forEach(section => {
        if (section.id !== 'favoritos') {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    });

    Object.values(containers).forEach(c => c.innerHTML = '');

    const filtered = (window.products || []).filter(p => {
        if (!isProductAvailable(p)) return false;
        if (filter === 'promo') return (p.promo?.active === true) || (window.promotions || []).some(promo => promo.productId === p.id);
        if (filter === 'encomenda') return p.isEncomenda === true || p.category === 'kits';
        // If filter is a category name, maybe we should filter by it?
        // Current logic seems to be "Show All" if not promo/encomenda.
        // We will keep it as "Show All" but ensure mapping works.
        return true;
    });

    if (filtered.length === 0) {
        const first = Object.values(containers)[0];
        if (first) first.innerHTML = `<p class='text-gray-500 text-center py-8 col-span-2'>Nenhum produto encontrado para este filtro.</p>`;
        return;
    }

    filtered.forEach(product => {
        const catKey = (product.category || '').toLowerCase().trim();
        // Try catKey, then aliases
        let container = containers[catKey];
        if (!container && catKey === 'combos') container = containers['combo'];
        if (!container && catKey === 'combo') container = containers['combos'];

        if (container) {
            container.innerHTML += createProductCard(product);
        }
    });
}

function renderPromosSection() {
    const section = document.getElementById('promosSection');
    const container = document.getElementById('promosContainer');
    if (!section || !container) return;

    const promoProducts = (window.products || []).filter(p => {
        const hasGlobalPromo = (window.promotions || []).some(promo => promo.productId === p.id);
        return (hasGlobalPromo || p.promo?.active) && isProductAvailable(p);
    });

    if (promoProducts.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = promoProducts.map(p =>
        `<div class="promo-card-scroll snap-start">${createProductCard(p)}</div>`
    ).join('');
}

function renderFavoritosSection() {
    const container = document.getElementById('favoritosContainer');
    if (!container) return;

    if (typeof window.FavoritesService === 'undefined') return;
    const phone = window.currentClientPhone || localStorage.getItem('fastLastPhone');
    const favIds = window.FavoritesService.getFavorites(phone);
    const favProducts = (window.products || []).filter(p => favIds.includes(p.id) && isProductAvailable(p));

    if (favProducts.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8 col-span-2">Você ainda não marcou nenhum item como favorito. Toque no 🤍 para adicionar!</p>';
        return;
    }

    container.innerHTML = favProducts.map(createProductCard).join('');
}


// Toast Implementation
function showToast(message, type = 'success') {
    // Create toast container if not exists
    let container = document.getElementById('toastElement');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastElement';
        container.className = 'fixed top-4 right-4 z-[9999] transition-all duration-300 transform translate-x-full';
        document.body.appendChild(container);
    }

    // Style based on type
    let bgClass = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    if (type === 'warning') bgClass = 'bg-yellow-500';
    if (type === 'info') bgClass = 'bg-blue-500';

    container.className = `fixed top-4 right-4 z-[9999] px-6 py-3 rounded-lg shadow-xl text-white font-medium transform transition-all duration-300 flex items-center gap-2 ${bgClass}`;
    container.innerHTML = `<span>${message}</span>`;

    // Show
    requestAnimationFrame(() => {
        container.classList.remove('translate-x-full');
    });

    // Hide after 3s
    setTimeout(() => {
        container.classList.add('translate-x-full');
    }, 3000);
}

// Inline Message Implementation
function showInlineMessage(elementId, message, type = 'success') {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Check if it's an input wrapper or just a container
    // Try to find a specific message container or append
    let msgContainer = document.getElementById(`${elementId}-msg`);
    if (!msgContainer) {
        // If elementId is a container (like 'productsPanelFast'), maybe prepend or append?
        // Assuming elementId refers to a container where we want to SHOW the message.
        // It's safer to just set innerHTML if it's a dedicated message box.
        // If not, we might overwrite content. 
        // Best effort:
        el.innerHTML = `<div class="p-3 mb-4 rounded-lg ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${message}</div>`;
        return;
    }

    msgContainer.className = `p-3 rounded-lg ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    msgContainer.textContent = message;
    msgContainer.classList.remove('hidden');
}

// --- FASTSAVORY'S PRODUCT SHARE FUNCTIONALITY ---
let currentFastShareProduct = null;

function buildFastProductShareUrl(product) {
    if (!product) return 'https://fastsavorys.vercel.app/pages/fast.html';
    const origin = (window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1'))
        ? window.location.origin
        : 'https://fastsavorys.vercel.app';

    const promotion = (window.promotions || []).find(p => p.productId === product.id);
    let displayPrice = product.price;
    if (promotion) {
        displayPrice = promotion.type === 'percentage' 
            ? product.price * (1 - promotion.value / 100) 
            : product.price - promotion.value;
    } else if (product.promo && product.promo.active) {
        displayPrice = product.promo.type === 'percent' 
            ? product.price * (1 - product.promo.value / 100) 
            : product.price - product.promo.value;
    }
    const priceFormatted = `R$ ${displayPrice.toFixed(2).replace('.', ',')}`;

    let imgUrl = product.image || '';
    if (imgUrl.startsWith('../')) {
        imgUrl = `${origin}/${imgUrl.replace(/^(\.\.\/)+/, '')}`;
    } else if (imgUrl.startsWith('/')) {
        imgUrl = `${origin}${imgUrl}`;
    } else if (imgUrl && !imgUrl.startsWith('http')) {
        imgUrl = `${origin}/${imgUrl}`;
    }

    const params = new URLSearchParams();
    if (product.id) params.set('id', product.id);
    if (product.name) params.set('title', product.name);
    if (priceFormatted) params.set('price', priceFormatted);
    if (product.description) params.set('desc', product.description);
    if (imgUrl) params.set('img', imgUrl);

    return `${origin}/p?${params.toString()}`;
}

function buildFastProductShareText(product) {
    if (!product) return '';
    const promotion = (window.promotions || []).find(p => p.productId === product.id);
    let displayPrice = product.price;
    if (promotion) {
        displayPrice = promotion.type === 'percentage' 
            ? product.price * (1 - promotion.value / 100) 
            : product.price - promotion.value;
    } else if (product.promo && product.promo.active) {
        displayPrice = product.promo.type === 'percent' 
            ? product.price * (1 - product.promo.value / 100) 
            : product.price - product.promo.value;
    }

    const priceText = `R$ ${displayPrice.toFixed(2).replace('.', ',')}`;
    const origPriceText = (displayPrice < product.price) 
        ? `~R$ ${product.price.toFixed(2).replace('.', ',')}~ ➔ ` 
        : '';
    const descText = product.description ? `\n😋 *Detalhes:* ${product.description}\n` : '';
    const shareUrl = buildFastProductShareUrl(product);

    return `🥟 *FASTSAVORY'S • CARDÁPIO & ENCOMENDAS* ✨\n🔥 *${product.name}*\n${descText}\n💰 *Preço:* ${origPriceText}*${priceText}*\n\n👉 *FAÇA SEU PEDIDO ONLINE AQUI:*\n${shareUrl}\n\n✨ FastSavory's • Salgados, Mini-Salgados, Bolos & Kits Festa\n📍 Rua Palmeiras, 105, Novo Prado, Itamaraju-BA\n🛵 Entregamos quentinho até você!`;
}

window.openFastProductShareModal = function (id) {
    const product = (window.products || []).find(p => p.id == id || String(p.id) === String(id));
    if (!product) return;

    currentFastShareProduct = product;
    const modal = document.getElementById('fastProductShareModal');
    if (!modal) return;

    const imgEl = document.getElementById('fastShareModalProductImg');
    if (imgEl) {
        imgEl.src = product.image || '../assets/img/fast-logo.png';
        imgEl.onerror = () => { imgEl.src = '../assets/img/fast-logo.png'; };
    }

    const titleEl = document.getElementById('fastShareModalProductTitle');
    if (titleEl) titleEl.textContent = product.name || 'Produto';

    const promotion = (window.promotions || []).find(p => p.productId === product.id);
    let displayPrice = product.price;
    if (promotion) {
        displayPrice = promotion.type === 'percentage' ? product.price * (1 - promotion.value / 100) : product.price - promotion.value;
    } else if (product.promo && product.promo.active) {
        displayPrice = product.promo.type === 'percent' ? product.price * (1 - product.promo.value / 100) : product.price - product.promo.value;
    }

    const priceEl = document.getElementById('fastShareModalProductPrice');
    if (priceEl) priceEl.textContent = `R$ ${displayPrice.toFixed(2).replace('.', ',')}`;

    const catLabels = {
        salgados: '🥟 Salgados',
        mini: '🧁 Mini-Salgados',
        kits: '🎁 Kits Festa',
        bolos: '🎂 Bolos',
        combo: '🔥 Combos',
        combos: '🔥 Combos',
        bebidas: '🥤 Bebidas',
        adicionais: '➕ Extras'
    };
    const catEl = document.getElementById('fastShareModalProductCategory');
    if (catEl) catEl.textContent = catLabels[product.category] || product.category || 'FastSavory\'s';

    const shareMsg = buildFastProductShareText(product);
    const textPreview = document.getElementById('fastShareModalTextPreview');
    if (textPreview) textPreview.value = shareMsg;

    modal.classList.remove('hidden');
};

window.closeFastProductShareModal = function () {
    const modal = document.getElementById('fastProductShareModal');
    if (modal) modal.classList.add('hidden');
};

window.shareFastProductToWhatsApp = function () {
    if (!currentFastShareProduct) return;
    const msg = buildFastProductShareText(currentFastShareProduct);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.shareFastProductToTelegram = function () {
    if (!currentFastShareProduct) return;
    const msg = buildFastProductShareText(currentFastShareProduct);
    const shareUrl = buildFastProductShareUrl(currentFastShareProduct);
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.shareFastProductToFacebook = function () {
    if (!currentFastShareProduct) return;
    const shareUrl = buildFastProductShareUrl(currentFastShareProduct);
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank');
};

window.shareFastProductNative = async function () {
    if (!currentFastShareProduct) return;
    const msg = buildFastProductShareText(currentFastShareProduct);
    const shareUrl = buildFastProductShareUrl(currentFastShareProduct);

    if (navigator.share) {
        try {
            await navigator.share({
                title: currentFastShareProduct.name,
                text: msg,
                url: shareUrl
            });
        } catch (e) {
            // User cancelled
        }
    } else {
        window.copyFastProductShareText();
    }
};

window.copyFastProductShareText = function () {
    if (!currentFastShareProduct) return;
    const msg = buildFastProductShareText(currentFastShareProduct);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(() => {
            if (window.showToast) {
                window.showToast('✨ Mensagem copiada! Cole no Instagram, WhatsApp ou onde desejar.', 'success');
            } else {
                alert('✨ Mensagem copiada! Agora basta colar no Instagram, WhatsApp, Messenger ou onde desejar.');
            }
        });
    }
};

window.copyFastProductShareLink = function () {
    const shareUrl = currentFastShareProduct 
        ? buildFastProductShareUrl(currentFastShareProduct)
        : (window.location.origin || 'https://fastsavorys.vercel.app') + '/pages/fast.html';

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            if (window.showToast) {
                window.showToast('🔗 Link do produto copiado com foto!', 'success');
            } else {
                alert('🔗 Link do produto copiado!');
            }
        });
    }
};

// Exports
window.renderProducts = renderProducts;
window.renderFilteredProducts = renderFilteredProducts;
window.createProductCard = createProductCard; // Expose if needed elsewhere
window.showToast = showToast;
window.showInlineMessage = showInlineMessage;
window.loadProductsPublic = renderProducts; // Enforce UI module authority
window.isProductAvailable = isProductAvailable; // Used by cart.js
window.buildFastProductShareText = buildFastProductShareText;
window.buildFastProductShareUrl = buildFastProductShareUrl;
