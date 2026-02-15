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

// Render a single product card HTML
function createProductCard(product) {
    const isAdditional = product.category === 'adicionais';
    // FavoritesService is global from services.js
    const isFav = (typeof window.FavoritesService !== 'undefined')
        ? window.FavoritesService.isFavorite(window.currentClientPhone || localStorage.getItem('fastLastPhone'), product.id)
        : false;
    const heartIcon = isFav ? '❤️' : '🤍';

    // Promotion Logic
    // Promotions global loaded in data.js
    const promotion = (window.promotions || []).find(p => p.productId === product.id);
    let displayPrice = product.price;
    let priceHtml = '';
    let promoBadge = '';
    let borderClass = ''; // Default border

    if (promotion) {
        if (promotion.type === 'percentage') {
            displayPrice = product.price * (1 - promotion.value / 100);
            promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-${promotion.value}%</span>`;
        } else {
            displayPrice = product.price - promotion.value;
            promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-R$${promotion.value}</span>`;
        }
        priceHtml = `<span class='line-through text-gray-400 text-sm mr-1'>R$ ${product.price.toFixed(2).replace('.', ',')}</span><span class='text-rose-600 font-bold'>R$ ${displayPrice.toFixed(2).replace('.', ',')}</span>`;
        borderClass = 'border-yellow-400 border-2';
    } else {
        priceHtml = `<span class='text-rose-600 ${isAdditional ? "text-sm" : "text-lg"} font-bold'>R$ ${product.price.toFixed(2).replace('.', ',')}</span>`;
        if (product.promo && product.promo.active) {
            // Legacy promo field in product object
            if (product.promo.type === 'percent') {
                displayPrice = product.price * (1 - product.promo.value / 100);
                promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-${product.promo.value}%</span>`;
            } else {
                displayPrice = product.price - product.promo.value;
                promoBadge = `<span class='absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow'>-R$${product.promo.value}</span>`;
            }
            priceHtml = `<span class='line-through text-gray-400 text-sm mr-1'>R$ ${product.price.toFixed(2).replace('.', ',')}</span><span class='text-rose-600 font-bold'>R$ ${displayPrice.toFixed(2).replace('.', ',')}</span>`;
            borderClass = 'border-yellow-400 border-2';
        }
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
    <div class='bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-3 border ${borderClass} relative'>
        ${promoBadge}
        ${topBadge}
        <div class='flex items-stretch gap-3'>
            ${imageHtml}
            <div class='flex-1 min-w-0 flex flex-col justify-between'>
                <div>
                    <div class='flex items-start justify-between gap-1'>
                        <h3 class='font-semibold text-gray-800 ${isAdditional ? 'text-sm' : 'text-sm'} leading-tight'>${product.name}</h3>
                        <button class='favorite-btn text-lg p-0.5 hover:scale-110 transition-transform flex-shrink-0' data-id='${product.id}' title='Favorito'>${heartIcon}</button>
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

// Exports
window.renderProducts = renderProducts;
window.renderFilteredProducts = renderFilteredProducts;
window.createProductCard = createProductCard; // Expose if needed elsewhere
window.showToast = showToast;
window.showInlineMessage = showInlineMessage;
window.loadProductsPublic = renderProducts; // Enforce UI module authority
window.isProductAvailable = isProductAvailable; // Used by cart.js
