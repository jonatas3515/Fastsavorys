/**
 * Fast Savory's - History Module
 * Gerencia histórico de pedidos e repetição de compras
 */

// ========================================
// GLOBAL HISTORY FUNCTIONS
// ========================================

const HistoryModule = {
    // Salvar pedido no histórico
    save: function (phone, orderSummary) {
        console.log('[History] Tentando salvar pedido:', { phone, itemsCount: orderSummary?.items?.length });
        if (!phone || !orderSummary || !Array.isArray(orderSummary.items)) {
            console.warn('[History] Dados inválidos para salvar:', { phone: !!phone, orderSummary: !!orderSummary, items: Array.isArray(orderSummary?.items) });
            return;
        }
        try {
            const key = `fastOrders_${phone.replace(/\D/g, '')}`;
            const existing = localStorage.getItem(key);
            const list = existing ? JSON.parse(existing) : [];
            const entry = {
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                items: orderSummary.items.map(i => ({
                    productId: i.productId || i.id || null,
                    name: i.name,
                    price: Number(i.price) || 0,
                    quantity: Number(i.quantity) || 1,
                    category: i.category || null
                })),
                total: Number(orderSummary.total) || 0,
                isEncomenda: !!orderSummary.isEncomenda,
                deliveryType: orderSummary.deliveryType || 'retirada',
                neighborhood: orderSummary.neighborhood || '',
                encomendaDate: orderSummary.encomendaDate || null,
                encomendaSlot: orderSummary.encomendaSlot || null
            };
            list.unshift(entry);
            localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
            localStorage.setItem('fastLastPhone', phone);
            // Update global if exists
            if (typeof currentClientPhone !== 'undefined') {
                currentClientPhone = phone;
            }
            console.log('[History] Pedido salvo com sucesso! Key:', key, 'Total de pedidos:', list.length);
        } catch (e) {
            console.error('[History] Falha ao salvar:', e);
        }
    },

    // Carregar histórico pelo telefone
    load: function (phone) {
        if (!phone) return [];
        try {
            const key = `fastOrders_${phone.replace(/\D/g, '')}`;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('[History] Falha ao carregar:', e);
            return [];
        }
    },

    // Renderizar "Últimos Pedidos" na loja pública
    renderRecent: function () {
        const phone = localStorage.getItem('fastLastPhone');
        const container = document.getElementById('recentOrdersSection');
        const repeatSection = document.getElementById('repeatLastOrderSection');
        if (!container) return;

        if (!phone) {
            container.classList.add('hidden');
            repeatSection?.classList.add('hidden');
            return;
        }

        const history = this.load(phone);
        if (!history.length) {
            container.classList.add('hidden');
            repeatSection?.classList.add('hidden');
            return;
        }

        // Mostrar botão "Pedir de novo" se tiver histórico
        repeatSection?.classList.remove('hidden');

        container.classList.remove('hidden');

        // Build order cards
        const orderCards = history.slice(0, 2).map((order, idx) => {
            const resumo = order.items.slice(0, 2).map(i => `${i.quantity}x ${i.name}`).join(', ');
            const more = order.items.length > 2 ? ` +${order.items.length - 2}` : '';
            const data = (window.safeDate ? safeDate(order.createdAt) : new Date(order.createdAt)).toLocaleDateString('pt-BR');
            const total = (order.total || 0).toFixed(2).replace('.', ',');
            return `
          <div class="w-full sm:flex-1 p-3 rounded-lg bg-white border border-rose-200 shadow-sm">
            <div class="flex flex-col h-full">
              <div class="flex-1 min-w-0 mb-2">
                <p class="text-xs text-gray-500 mb-1">${data}</p>
                <p class="text-sm text-gray-800 line-clamp-2">${resumo}${more}</p>
              </div>
              <div class="flex items-center justify-between gap-2">
                <p class="text-base font-bold text-rose-600">R$ ${total}</p>
                <button onclick="repeatOrderFromHistory(${idx})" 
                  class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1 shadow-sm">
                  🔄 Repetir
                </button>
              </div>
            </div>
          </div>
        `;
        }).join('');

        container.innerHTML = `
        <div class="bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl p-4 border border-rose-100 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-bold text-gray-800 flex items-center">
              <span class="mr-2">🔄</span> Peça novamente
            </h2>
            <span class="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">Olá de volta! 👋</span>
          </div>
          <!-- Mobile: Vertical stack -->
          <div class="sm:hidden flex flex-col gap-3 pb-2">
            ${orderCards}
          </div>
          <!-- Desktop: Vertical stack -->
          <div class="hidden sm:flex sm:flex-col gap-2">
            ${orderCards}
          </div>
        </div>
      `;
    },

    // Repetir pedido do histórico (versão para loja pública via índice)
    repeatFromHistory: function (orderIndex) {
        const phone = localStorage.getItem('fastLastPhone');
        const history = this.load(phone);
        const order = history[orderIndex];
        if (!order) return;

        this._processRepeat(order);
    },

    // Repetir pedido (versão modal de detalhes)
    repeat: function (orderIndex) {
        const phoneInput = document.getElementById('customerPhone');
        const phone = phoneInput ? phoneInput.value.trim() : null;
        const orders = this.load(phone || null);
        const order = orders[orderIndex];
        if (!order) return;

        this._processRepeat(order, true);
    },

    // Internal helper to process repeat logic
    _processRepeat: function (order, closeCheckoutModal = false) {
        window.cart = [];
        let unavailable = [];

        order.items.forEach(item => {
            const product = (window.products || []).find(p => p.id === item.productId && p.visible !== false) ||
                (window.products || []).find(p => p.name === item.name && p.visible !== false); // Fallback by name

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

        if (window.updateCart) window.updateCart();

        if (closeCheckoutModal) {
            const modal = document.getElementById('checkoutModal');
            if (modal) modal.classList.add('hidden');
        }

        if (unavailable.length > 0) {
            alert(`⚠️ Alguns itens não estão mais disponíveis:\n${unavailable.join(', ')}`);
        }

        if (window.showToast) {
            window.showToast('✅ Itens carregados no carrinho!', 'success');
        } else {
            console.log('Itens carregados no carrinho!');
        }
    },

    // Compatibility aliases with services.js
    getOrders: function (phone) { return this.load(phone); },
    saveOrder: function (phone, order) { return this.save(phone, order); },
    getKey: function (phone) { return `fastOrders_${(phone || '').replace(/\D/g, '')}`; }
};

// Global Exports (Compatibility)
window.OrderHistoryService = HistoryModule;
window.saveOrderToHistory = HistoryModule.save;
window.loadOrderHistory = HistoryModule.load;
window.renderRecentOrders = HistoryModule.renderRecent.bind(HistoryModule);
window.repeatOrderFromHistory = HistoryModule.repeatFromHistory.bind(HistoryModule);
window.repeatOrder = HistoryModule.repeat.bind(HistoryModule);

console.log('[History] Module Loaded');
