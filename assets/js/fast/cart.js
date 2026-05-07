/**
 * Fast Savory's - Cart Module
 * Gerencia estado do carrinho e atualizações de UI
 */

// Atualiza totais e UI do carrinho
window.updateCart = function () {
    // Recalcula totais
    window.cartTotal = (window.cart || []).reduce((t, i) => t + i.price * i.quantity, 0);
    const count = (window.cart || []).reduce((t, i) => t + i.quantity, 0);

    // Atualiza badges
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) cartCountEl.textContent = count;

    // Desktop badge
    const desktopCount = document.getElementById('cartCountDesktop');
    if (desktopCount) desktopCount.textContent = count;

    // Formata total
    const totalFormatted = `R$ ${window.cartTotal.toFixed(2).replace('.', ',')}`;

    // Atualiza displays de total
    const cartTotalEl = document.getElementById('cartTotal');
    if (cartTotalEl) cartTotalEl.textContent = totalFormatted;

    const mobileCartTotalEl = document.getElementById('mobileCartTotal');
    if (mobileCartTotalEl) mobileCartTotalEl.textContent = totalFormatted;

    // Atualiza listas de itens (Mobile e Desktop)
    updateCartItems('cartItems');
    updateCartItems('mobileCartItems');

    // Habilita/desabilita checkout
    const hasItems = window.cart && window.cart.length > 0;
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.disabled = !hasItems;

    const mobileCheckoutBtn = document.getElementById('mobileCheckoutBtn');
    if (mobileCheckoutBtn) mobileCheckoutBtn.disabled = !hasItems;

    // Floating Application Button (FAB) logic
    const floatingBtn = document.getElementById('floatingCartButton');
    if (floatingBtn) {
        // Mostra apenas se tem itens e se a loja pública está visível (check simples)
        // Assumindo que se 'productsPanelFast' ou 'publicStore' não tem 'hidden'
        // Simplificação: apenas check hasItems
        if (hasItems) {
            floatingBtn.classList.remove('hidden');
            floatingBtn.style.display = 'flex';

            const countEl = document.getElementById('floatingCartCount');
            const totalEl = document.getElementById('floatingCartTotal');
            if (countEl) countEl.textContent = count;
            if (totalEl) totalEl.textContent = totalFormatted;
        } else {
            floatingBtn.classList.add('hidden');
            floatingBtn.style.display = 'none';
        }
    }

    // Persiste no localStorage
    try { localStorage.setItem('fastCart', JSON.stringify(window.cart)); } catch (e) { }

    // Atualiza sugestões de venda (Upsell)
    if (typeof window.renderUpsellSuggestions === 'function') {
        window.renderUpsellSuggestions();
    }

    // Atualiza regras de pedido (desabilita entrega para bolos, etc.)
    if (typeof window.updateOrderRulesUI === 'function') {
        window.updateOrderRulesUI();
    }
};

// Renderiza itens do carrinho em um container específico
window.updateCartItems = function (containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!window.cart || window.cart.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Seu carrinho está vazio 🛒</p>';
        return;
    }

    container.innerHTML = window.cart.map(item => `
        <div class="cart-item p-3 bg-gray-50 rounded-lg mb-2 border border-gray-100 shadow-sm">
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-800 text-sm">${item.name}</h4>
                    <p class="text-xs text-gray-600">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                    ${item.description ? `<p class="text-xs text-gray-400 truncate max-w-[150px]">${item.description}</p>` : ''}
                </div>
                <div class="flex items-center space-x-2 bg-white rounded-full border px-1 py-0.5">
                    <button onclick="changeQuantity(${item.id}, -1)" class="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-200">-</button>
                    <span class="w-6 text-center font-bold text-sm text-gray-800">${item.quantity}</span>
                    <button onclick="changeQuantity(${item.id}, 1)" class="w-6 h-6 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center hover:bg-rose-200">+</button>
                </div>
            </div>
            <div class="mt-2 pt-2 border-t border-gray-100">
                ${item.note ? `<p class="text-xs text-gray-600 italic mb-1 bg-yellow-50 p-1 rounded">📝 ${item.note}</p>` : ''}
                <button onclick="toggleItemNote(${item.id})" class="text-xs text-rose-500 hover:text-rose-700 font-medium flex items-center gap-1">
                    ${item.note ? '✏️ Editar observação' : '📝 Adicionar observação'}
                </button>
                <div id="noteInput_${item.id}_${containerId}" class="hidden mt-2">
                    <div class="flex gap-2">
                        <input type="text" 
                            placeholder="Ex: Sem cebola, bem passado..." 
                            value="${item.note || ''}"
                            onblur="saveItemNote(${item.id}, this.value)"
                            onkeydown="if(event.key==='Enter'){saveItemNote(${item.id}, this.value);}"
                            class="flex-1 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-rose-500 outline-none">
                        <button onclick="document.getElementById('noteInput_${item.id}_${containerId}').classList.add('hidden')" class="text-xs text-gray-400">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
};

window.toggleItemNote = function (itemId) {
    // Tenta abrir em ambos os containers (mobile/desktop) se existirem
    ['cartItems', 'mobileCartItems'].forEach(cid => {
        const el = document.getElementById(`noteInput_${itemId}_${cid}`);
        if (el) {
            el.classList.toggle('hidden');
            if (!el.classList.contains('hidden')) {
                const input = el.querySelector('input');
                if (input) setTimeout(() => input.focus(), 100);
            }
        }
    });
};

window.saveItemNote = function (itemId, note) {
    const item = window.cart.find(i => i.id === itemId);
    if (item) {
        item.note = note.trim();
        window.updateCart(); // Re-render para mostrar a nota atualizada
    }
};

window.changeQuantity = function (id, delta) {
    const item = window.cart.find(i => i.id === id);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            // Remove
            window.cart = window.cart.filter(i => i.id !== id);
        }
        window.updateCart();
    }
};

// Renderiza sugestões complementares (Upsell)
window.renderUpsellSuggestions = function () {
    const section = document.getElementById('upsellSection');
    const container = document.getElementById('upsellContainer');
    if (!section || !container) return;

    if (!window.cart || window.cart.length === 0) {
        section.classList.add('hidden');
        return;
    }

    // Categorias no carrinho
    const cartProductIds = window.cart.map(i => i.id);
    const cartItemsData = (window.products || []).filter(p => cartProductIds.includes(p.id));
    const cartCategories = [...new Set(cartItemsData.map(p => p.category))];

    // Mapa de complementos
    const complementMap = {
        'salgados': ['bebidas', 'adicionais'],
        'mini': ['bebidas', 'adicionais'],
        'kits': ['bebidas', 'adicionais'],
        'bolos': ['bebidas'],
        'bebidas': ['salgados', 'adicionais'],
        'adicionais': ['bebidas']
    };

    let suggestCategories = [];
    cartCategories.forEach(cat => {
        if (complementMap[cat]) suggestCategories.push(...complementMap[cat]);
    });
    // Remove duplicatas e categorias já presentes
    suggestCategories = [...new Set(suggestCategories)].filter(cat => !cartCategories.includes(cat));

    if (suggestCategories.length === 0) {
        // Se j tem mix completo, sugere 'mini' (sobremesa/doce) se não tiver
        if (!cartCategories.includes('mini')) suggestCategories.push('mini');
        else {
            section.classList.add('hidden');
            return;
        }
    }

    // Busca produtos para sugerir
    const suggestions = (window.products || [])
        .filter(p =>
            suggestCategories.includes(p.category) &&
            !cartProductIds.includes(p.id) &&
            window.isProductAvailable(p) // Função global do ui.js/fast.html
        )
        // Randomize ou pega os primeiros
        .sort(() => 0.5 - Math.random())
        .slice(0, 2);

    if (suggestions.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = suggestions.map(product => {
        const price = product.price.toFixed(2).replace('.', ',');
        return `
            <div class="flex-shrink-0 bg-white rounded-lg p-2 border border-rose-100 shadow-sm min-w-[130px] w-[130px]">
                <div class="flex items-center gap-2 mb-2">
                    ${product.image ? `<img src="${product.image}" class="w-8 h-8 object-cover rounded">` : `<span class="text-xl">${product.emoji}</span>`}
                    <span class="text-xs font-medium text-gray-800 truncate block flex-1" title="${product.name}">${product.name}</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-xs text-rose-600 font-bold">R$ ${price}</span>
                    <button class="add-to-cart bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-xs font-bold transition-colors"
                        data-id="${product.id}" 
                        data-name="${product.name}" 
                        data-description="${product.description || ''}" 
                        data-price="${product.price}" 
                        data-category="${product.category}">
                        +
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.showLastOrders = function () {
    const phoneInput = document.getElementById('customerPhone');
    if (!phoneInput) return;
    const phone = phoneInput.value.trim();

    // OrderHistoryService deve vir de services.js
    if (typeof window.OrderHistoryService === 'undefined') return;

    const orders = window.OrderHistoryService.getOrders(phone || null);
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
        const total = typeof order.total === 'number' ? order.total.toFixed(2).replace('.', ',') : '0,00';

        return `
          <div class="bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
            <div class="flex justify-between items-start gap-2"> 
               <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">${date}</span>
                    <span class="text-xs font-bold text-rose-600">R$ ${total}</span>
                </div>
                <p class="text-xs text-gray-600 line-clamp-2" title="${summary}${more}">${summary}${more}</p>
              </div>
              <button onclick="repeatOrder(${idx})" 
                class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1.5 rounded text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors shadow-sm">
                🔄 Repetir
              </button>
            </div>
          </div>
        `;
    }).join('');
};

window.repeatOrder = function (idx) {
    if (typeof window.OrderHistoryService === 'undefined') return;
    const phone = document.getElementById('customerPhone')?.value.trim() || null;
    const orders = window.OrderHistoryService.getOrders(phone);
    const order = orders[idx];

    if (!order) return;

    window.cart = [];
    let unavailable = [];

    order.items.forEach(item => {
        const product = (window.products || []).find(p => p.id === item.productId && p.visible !== false);
        if (product) {
            // Check availability
            if (window.isProductAvailable(product)) {
                window.cart.push({
                    id: product.id,
                    name: product.name,
                    description: product.description || '',
                    price: product.price, // Preço atual
                    quantity: item.quantity,
                    note: ''
                });
            } else {
                unavailable.push(item.name);
            }
        } else {
            // Tenta buscar pelo nome se ID mudou (fallback)
            const productByName = (window.products || []).find(p => p.name === item.name && p.visible !== false);
            if (productByName && window.isProductAvailable(productByName)) {
                window.cart.push({
                    id: productByName.id,
                    name: productByName.name,
                    description: productByName.description || '',
                    price: productByName.price,
                    quantity: item.quantity,
                    note: ''
                });
            } else {
                unavailable.push(item.name);
            }
        }
    });

    window.updateCart();

    // Feedback
    if (unavailable.length > 0) {
        if (window.showToast) window.showToast(`Alguns itens não estão mais disponíveis: ${unavailable.join(', ')}`, 'warning');
        else alert(`Alguns itens não estão mais disponíveis: ${unavailable.join(', ')}`);
    } else {
        if (window.showToast) window.showToast('✅ Pedido adicionado ao carrinho!', 'success');
    }

    // Fecha modal de checkout se estiver aberto para permitir revisão
    const modal = document.getElementById('checkoutModal');
    // if (modal) modal.classList.add('hidden'); // Opcional, talvez o usuário queira já finalizar
};

// Event Listener Global para botões "Adicionar" (delegado)
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('add-to-cart')) {
        const btn = e.target;
        const id = parseInt(btn.dataset.id);

        // Verifica se é Kit ou Bolo (fluxo especial)
        const category = btn.dataset.category;
        if (category === 'kits' || category === 'bolos') {
            if (window.openCustomOptionsModal) {
                window.openCustomOptionsModal(id, btn.dataset.name, btn.dataset.description, parseFloat(btn.dataset.price), category);
            } else {
                console.error('Modal de opções não encontrado (openCustomOptionsModal)');
            }
            return;
        }

        // Verifica flavor selection (Mini Salgados)
        const product = (window.products || []).find(p => p.id === id);
        if (product && product.category === 'mini' && product.flavor_selection?.enabled) {
            if (window.openMiniSalgadosModal) {
                window.openMiniSalgadosModal(product);
            }
            return;
        }

        // Verifica Combo (permite escolher salgados)
        // Regra atualizada: Se categoria 'combos' OU nome contém 'combo', deve abrir modal
        if (product && (product.category === 'combos' || (product.name && product.name.toLowerCase().includes('combo')))) {
            if (window.openComboSalgadosModal) {
                window.openComboSalgadosModal(product);
            } else {
                console.error('Modal de combos não encontrado (openComboSalgadosModal)');
            }
            return;
        }

        // Adição padrão
        const existing = window.cart.find(i => i.id === id);
        if (existing) {
            existing.quantity++;
        } else {
            window.cart.push({
                id: id,
                name: btn.dataset.name,
                description: btn.dataset.description || '',
                price: parseFloat(btn.dataset.price),
                quantity: 1,
                note: ''
            });
        }

        window.updateCart();

        // Feedback visual no botão
        const originalText = btn.textContent;
        const originalWidth = btn.offsetWidth;

        btn.textContent = 'Adicionado!';
        btn.classList.add('bg-green-600', 'border-green-600', 'text-white');
        btn.classList.remove('bg-rose-600', 'bg-rose-50', 'text-rose-700');

        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('bg-green-600', 'border-green-600', 'text-white');
            // Restaura classes originais (heurística simples)
            if (btn.classList.contains('border')) { // Upsell button style
                btn.classList.add('bg-rose-50', 'text-rose-700');
            } else { // Product card style
                btn.classList.add('bg-rose-600', 'text-white');
            }
        }, 800);

        if (window.showToast) window.showToast(`${btn.dataset.name} adicionado!`, 'success');
    }
});
