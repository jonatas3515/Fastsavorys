/**
 * Fast Savory's - Cart Module
 * Gerencia o carrinho de compras, cálculos e interação com o usuário
 */

// ========================================
// CART MANAGEMENT
// ========================================

// Update cart totals and UI
window.updateCart = function () {
    // Recalcular totais
    window.cartTotal = window.cart.reduce((t, i) => t + i.price * i.quantity, 0);
    const count = window.cart.reduce((t, i) => t + i.quantity, 0);

    // Atualizar UI count e totals
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) cartCountEl.textContent = count;

    const desktopCount = document.getElementById('cartCountDesktop');
    if (desktopCount) desktopCount.textContent = count;

    const totalFormatted = `R$ ${window.cartTotal.toFixed(2).replace('.', ',')}`;

    const cartTotalEl = document.getElementById('cartTotal');
    if (cartTotalEl) cartTotalEl.textContent = totalFormatted;

    const mobileCartTotalEl = document.getElementById('mobileCartTotal');
    if (mobileCartTotalEl) mobileCartTotalEl.textContent = totalFormatted;

    // Atualizar listas de itens
    updateCartItems('cartItems');
    updateCartItems('mobileCartItems');

    // Habilitar/desabilitar checkout
    const hasItems = window.cart.length > 0;
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.disabled = !hasItems;

    const mobileCheckoutBtn = document.getElementById('mobileCheckoutBtn');
    if (mobileCheckoutBtn) mobileCheckoutBtn.disabled = !hasItems;

    // Update floating cart button (mobile) - only show on public store
    const floatingBtn = document.getElementById('floatingCartButton');
    if (floatingBtn) {
        const isPublicStoreVisible = document.getElementById('publicStore') && !document.getElementById('publicStore').classList.contains('hidden');

        if (hasItems && isPublicStoreVisible) {
            floatingBtn.classList.remove('hidden');
            floatingBtn.style.display = 'flex';
            // Ensure FAB is positioned correctly
            floatingBtn.style.position = 'fixed';
            floatingBtn.style.bottom = '1rem';
            floatingBtn.style.right = '1rem';
            floatingBtn.style.zIndex = '9999';

            const countEl = document.getElementById('floatingCartCount');
            const totalEl = document.getElementById('floatingCartTotal');

            if (countEl) countEl.textContent = count;
            if (totalEl) totalEl.textContent = totalFormatted;
        } else {
            floatingBtn.classList.add('hidden');
            floatingBtn.style.display = 'none';
        }
    }

    // Persist cart to localStorage
    try { localStorage.setItem('fastCart', JSON.stringify(window.cart)); } catch (e) { }

    // Update upsell suggestions
    renderUpsellSuggestions();
};

// Render upsell suggestions based on cart contents
window.renderUpsellSuggestions = function () {
    const section = document.getElementById('upsellSection');
    const container = document.getElementById('upsellContainer');
    if (!section || !container) return;

    if (window.cart.length === 0) {
        section.classList.add('hidden');
        return;
    }

    // Get categories in cart
    const cartProductIds = window.cart.map(item => item.id);
    const cartProducts = window.products.filter(p => cartProductIds.includes(p.id));
    const cartCategories = [...new Set(cartProducts.map(p => p.category))];

    // Define complementary categories
    const complementMap = {
        'salgados': ['bebidas', 'adicionais'],
        'mini': ['bebidas', 'adicionais'],
        'kits': ['bebidas', 'adicionais'],
        'bolos': ['bebidas'],
        'bebidas': ['salgados', 'adicionais'],
        'adicionais': ['bebidas']
    };

    // Find complementary products not in cart
    let suggestCategories = [];
    cartCategories.forEach(cat => {
        if (complementMap[cat]) {
            suggestCategories.push(...complementMap[cat]);
        }
    });
    suggestCategories = [...new Set(suggestCategories)].filter(cat => !cartCategories.includes(cat));

    if (suggestCategories.length === 0) {
        section.classList.add('hidden');
        return;
    }

    // Get up to 2 suggestions from complementary categories
    const suggestions = window.products
        .filter(p =>
            suggestCategories.includes(p.category) &&
            !cartProductIds.includes(p.id) &&
            window.isProductAvailableToday(p) && // Uses utility from utils.js
            p.visible !== false
        )
        .slice(0, 2);

    if (suggestions.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = suggestions.map(product => {
        const priceDisplay = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
        return `
          <div class="flex-shrink-0 bg-white rounded-lg p-2 border shadow-sm min-w-[120px]">
            <div class="flex items-center gap-2 mb-1">
              ${product.image ? `<img src="${product.image}" class="w-8 h-8 object-cover rounded">` : `<span class="text-lg">${product.emoji}</span>`}
              <span class="text-xs font-medium text-gray-800 truncate flex-1">${product.name}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-rose-600 font-bold">${priceDisplay}</span>
              <button class="add-to-cart bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs" 
                data-id="${product.id}" data-name="${product.name}" data-description="${product.description || ''}" data-price="${product.price}" data-category="${product.category}">+</button>
            </div>
          </div>
        `;
    }).join('');
};

window.updateCartItems = function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (window.cart.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Carrinho vazio</p>';
        return;
    }

    container.innerHTML = window.cart.map(item => `
        <div class="cart-item p-3 bg-gray-50 rounded-lg mb-2">
          <div class="flex justify-between items-center">
            <div class="flex-1">
              <h4 class="font-medium text-gray-800">${item.name}</h4>
              <p class="text-sm text-gray-800">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
            </div>
            <div class="flex items-center space-x-2">
              <button onclick="changeQuantity(${item.id}, -1)" class="w-8 h-8 bg-gray-200 text-black rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">-</button>
              <span class="w-8 text-center font-bold text-gray-900">${item.quantity}</span>
              <button onclick="changeQuantity(${item.id}, 1)" class="w-8 h-8 bg-gray-200 text-black rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">+</button>
            </div>
          </div>
          <div class="mt-2">
            ${item.note ? `<p class="text-xs text-gray-600 italic mb-1">📝 ${item.note}</p>` : ''}
            <button onclick="toggleItemNote(${item.id})" class="text-xs text-rose-600 hover:text-rose-800">
              ${item.note ? '✏️ Editar obs' : '📝 Adicionar obs'}
            </button>
            <div id="noteInput_${item.id}_${containerId}" class="hidden mt-2">
              <input type="text" 
                placeholder="Ex.: sem cebola, bem passado..." 
                value="${item.note || ''}"
                onblur="saveItemNote(${item.id}, this.value)"
                onkeydown="if(event.key==='Enter'){saveItemNote(${item.id}, this.value);}"
                class="w-full px-2 py-1 text-sm border rounded">
            </div>
          </div>
        </div>
      `).join('');
};

window.toggleItemNote = function (itemId) {
    // Toggle both cart containers
    const containers = ['cartItems', 'mobileCartItems'];
    containers.forEach(containerId => {
        const input = document.getElementById(`noteInput_${itemId}_${containerId}`);
        if (input) {
            input.classList.toggle('hidden');
            if (!input.classList.contains('hidden')) {
                input.querySelector('input')?.focus();
            }
        }
    });
};

window.saveItemNote = function (itemId, note) {
    const item = window.cart.find(i => i.id === itemId);
    if (item) {
        item.note = note.trim();
        window.updateCart();
    }
};

window.changeQuantity = function (id, chg) {
    const it = window.cart.find(i => i.id === id);
    if (it) {
        it.quantity += chg;
        if (it.quantity <= 0) {
            window.cart = window.cart.filter(x => x.id !== id);
        }
        window.updateCart();
    }
};

// ========================================
// REORDER FUNCTIONS (Últimos Pedidos)
// ========================================

window.showLastOrders = function () {
    const phoneInput = document.getElementById('customerPhone');
    if (!phoneInput) return;

    const phone = phoneInput.value.trim();
    // Use OrderHistoryService from services.js
    const orders = window.OrderHistoryService ? window.OrderHistoryService.getOrders(phone || null) : [];

    const section = document.getElementById('lastOrdersSection');
    const list = document.getElementById('lastOrdersList');

    if (!section || !list) return;

    if (orders.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = orders.slice(0, 2).map((order, idx) => {
        const date = window.safeDate(order.createdAt).toLocaleDateString('pt-BR');
        const summary = order.items.slice(0, 2).map(i => `${i.quantity}x ${i.name}`).join(', ');
        const more = order.items.length > 2 ? ` +${order.items.length - 2}` : '';
        return `
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="flex-between items-start gap-2 max-w-full flex"> 
               <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-500">${date}</p>
                <p class="text-sm text-gray-800 truncate">${summary}${more}</p>
                <p class="text-sm font-semibold text-rose-600">R$ ${order.total.toFixed(2).replace('.', ',')}</p>
              </div>
              <button onclick="repeatOrder(${idx})" 
                class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0">
                🔄 Repetir
              </button>
            </div>
          </div>
        `;
    }).join('');
};

window.repeatOrder = function (orderIndex) {
    const phoneInput = document.getElementById('customerPhone');
    const phone = phoneInput ? phoneInput.value.trim() : null;

    const orders = window.OrderHistoryService ? window.OrderHistoryService.getOrders(phone || null) : [];
    const order = orders[orderIndex];
    if (!order) return;

    window.cart = []; // Limpa carrinho
    let unavailable = [];

    order.items.forEach(item => {
        const product = window.products.find(p => p.id === item.productId && p.visible !== false);
        if (product) {
            window.cart.push({
                id: product.id,
                name: product.name,
                description: product.description || '',
                price: product.price, // Usa preço atual!
                quantity: item.quantity
            });
        } else {
            unavailable.push(item.name);
        }
    });

    window.updateCart();

    const checkoutModal = document.getElementById('checkoutModal');
    if (checkoutModal) checkoutModal.classList.add('hidden');

    if (unavailable.length > 0) {
        alert(`⚠️ Alguns itens não estão mais disponíveis:\n${unavailable.join(', ')}`);
    }

    if (window.showInlineMessage) {
        window.showInlineMessage('publicStore', '✅ Pedido carregado no carrinho!', 'success');
    }
};

// ========================================
// GLOBAL EVENT LISTENER (Add to Cart)
// ========================================

// Delegated event listener for Add to Cart buttons
// We attach this to document to handle dynamically added buttons
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('add-to-cart')) {
        const id = parseInt(e.target.dataset.id);
        const name = e.target.dataset.name;
        const description = e.target.dataset.description;
        const price = parseFloat(e.target.dataset.price);
        const category = e.target.dataset.category;

        // For kits and bolos, open custom options modal
        // Assumes openCustomOptionsModal is global (defined in fast.html)
        if (category === 'kits' || category === 'bolos') {
            if (typeof window.openCustomOptionsModal === 'function') {
                window.openCustomOptionsModal(id, name, description, price, category);
            } else {
                console.error('openCustomOptionsModal not found');
            }
            return;
        }

        // For mini products with flavor selection, open mini-salgados modal
        const product = (window.products || []).find(p => p.id === id) || {
            id, name, description, price, category
        };
        const isMini = (typeof window.isMiniSalgadoProduct === 'function')
            ? window.isMiniSalgadoProduct(product, category)
            : (category === 'mini' || (product.name && /mini\s*salgado/i.test(product.name)));

        if (isMini) {
            if (typeof window.openMiniSalgadosModal === 'function') {
                window.openMiniSalgadosModal(product);
                return;
            }
        }

        // For other products, add directly to cart
        const existing = window.cart.find(i => i.id === id);
        if (existing) {
            existing.quantity += 1;
        } else {
            window.cart.push({ id, name, description, price, quantity: 1, note: '' });
        }
        window.updateCart();

        // Button feedback
        const originalText = e.target.textContent;
        e.target.textContent = 'Adicionado!';
        e.target.classList.add('bg-green-600');
        setTimeout(() => {
            e.target.textContent = e.target.dataset.textOriginal || 'Adicionar';
            if (e.target.textContent === 'Adicionado!') e.target.textContent = '+'; // Fallback for small buttons
            // Better: restore logic
            e.target.classList.remove('bg-green-600');
            e.target.classList.add('bg-rose-600');
            // Fix: reset text properly based on context. In fast.html it was hardcoded 'Adicionar' or '+'.
            // The original code:
            // e.target.textContent = 'Adicionar'; e.target.classList.remove('bg-green-600'); e.target.classList.add('bg-rose-600');
            // But upsell buttons have '+' text.
            // I'll try to guess based on length or just set to '+' if it was short.
            if (originalText.length < 3) e.target.textContent = '+';
            else e.target.textContent = 'Adicionar';

        }, 1000);
    }
});

console.log('[Cart] Módulo carregado com sucesso');
// ========================================
// VALIDATION RULES (Restored from Backup)
// ========================================

window.cartContainsBolo = function () {
    return window.cart.some(item => {
        const product = window.products.find(p => p.id === item.id);
        const name = (item.name || '').toLowerCase();
        const cat = (product?.category || '').toLowerCase();
        // Vulcão Mini e Bolo no Pote são exceções (podem ser entregues, não exigem antecedência)
        if (name.includes('vulcão mini') || name.includes('vulcao mini') || name.includes('pote')) return false;
        return cat === 'bolos' || name.includes('bolo');
    });
};

window.canOrderTodayWithoutBolo = function (isRetirada, cartTotal, timeSlot) {
    // Se contém bolo, não pode pedir para hoje (exceto se for pronta entrega, mas regra geral é 1 dia)
    if (window.cartContainsBolo()) {
        return { allowed: false, reason: 'Pedidos com bolos exigem antecedência (encomenda).' };
    }

    // Deve ser retirada
    if (!isRetirada) {
        return { allowed: false, reason: 'Pedidos para o mesmo dia são apenas para retirada na loja.' };
    }

    // Mínimo R$ 15,00
    if (cartTotal < 15) {
        return { allowed: false, reason: 'Pedido mínimo de R$ 15,00 para retirada no mesmo dia.' };
    }

    // Horário deve ser entre 11h e 18h
    if (timeSlot) {
        const normalizedTime = (timeSlot || '').replace(/:/g, '');
        const timeAsNumber = parseInt(normalizedTime, 10) || 0;
        if (timeAsNumber < 1100 || timeAsNumber > 1800) {
            return { allowed: false, reason: 'Para retirada no mesmo dia, o horário deve ser entre 11h e 18h.' };
        }
    }

    return { allowed: true, reason: '' };
};

window.isOrderAllowedAtTime = function (timeSlot, cartTotal, cartItems) {
    const normalizedTime = (timeSlot || '').replace(/:/g, '');
    const timeAsNumber = parseInt(normalizedTime, 10) || 0;

    // Entre 07:00 e 14:00 (Regra da Manhã)
    if (timeAsNumber >= 700 && timeAsNumber < 1400) {
        const hasCake = cartItems.some(item => {
            const product = window.products.find(p => p.id === item.id);
            const name = (item.name || '').toLowerCase();
            const cat = (product?.category || '').toLowerCase();
            return cat === 'bolos' || name.includes('bolo');
        });

        const meetsMinimumValue = cartTotal >= 30.00;

        if (hasCake || meetsMinimumValue) {
            return { allowed: true, reason: '' };
        }

        return {
            allowed: false,
            reason: 'Entre 7h e 14h, só aceitamos pedidos de bolos ou pedidos acima de R$ 30,00.'
        };
    }

    return { allowed: true, reason: '' };
};

console.log('[Cart] Módulo carregado com sucesso (regras restauradas)');
