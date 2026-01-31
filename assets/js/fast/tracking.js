/**
 * Fast Savory's - Tracking Module
 * Gerencia o rastreamento de pedidos e visualização de status
 */

window.TrackingModule = {

    // Status Mapping
    statusMap: {
        'pending': 0, 'recebido': 0,
        'accepted': 1, 'aceito': 1, 'preparing': 1, 'em_preparo': 1,
        'confirmed': 2, 'pronto': 2,
        'out_for_delivery': 3, 'saiu_entrega': 3,
        'delivered': 4, 'entregue': 4,
        'cancelled': -1, 'cancelado': -1
    },

    statusLabels: {
        'pending': '🆕 Recebido',
        'recebido': '🆕 Recebido',
        'accepted': '✅ Aceito',
        'aceito': '✅ Aceito',
        'preparing': '🍳 Em Preparo',
        'em_preparo': '🍳 Em Preparo',
        'confirmed': '✅ Pronto',
        'pronto': '✅ Pronto',
        'out_for_delivery': '🚚 Saiu para entrega',
        'saiu_entrega': '🚚 Saiu para entrega',
        'delivered': '✔️ Entregue',
        'entregue': '✔️ Entregue',
        'cancelled': '❌ Cancelado',
        'cancelado': '❌ Cancelado'
    },

    // ========================================
    // ANALYTICS / HELPERS
    // ========================================

    getStepIndex: function (status) {
        const s = (status || '').toLowerCase();
        return this.statusMap[s] !== undefined ? this.statusMap[s] : 0;
    },

    getStatusLabel: function (status) {
        const s = (status || '').toLowerCase();
        return this.statusLabels[s] || status;
    },

    buildTrackingLink: function (orderCode, phone) {
        const code = (orderCode || '').toUpperCase();
        const p = (phone || '').replace(/\D/g, '');
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        return `${baseUrl}?track=${encodeURIComponent(code)}&phone=${encodeURIComponent(p)}`;
    },

    // ========================================
    // DATA FETCHING
    // ========================================

    normalizePhone: function (phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
        return digits;
    },

    fetchOrder: async function (orderCode, phone) {
        const code = (orderCode || '').toUpperCase().trim();
        const p = this.normalizePhone(phone);

        if (!code || !p) return null;

        try {
            // Tenta buscar no Supabase se cliente estiver disponível
            if (window.supabaseClient) {

                // 1. Tentar procedure segura (RPC) que bypassa RLS para item específico
                const { data: rpcData, error: rpcError } = await window.supabaseClient
                    .rpc('get_order_for_tracking', {
                        p_order_code: code,
                        p_phone: p
                    });

                if (!rpcError && rpcData && rpcData.length > 0) {
                    console.log('[Tracking] Pedido encontrado via RPC seguro');
                    return rpcData[0];
                }

                // Se RPC falhar, log e continua para fallback local (não tenta SELECT direto por segurança)
                if (rpcError) {
                    console.log('[Tracking] RPC falhou:', rpcError.message);
                    // Não faz SELECT direto em fast_orders para manter segurança RLS
                }
            }
        } catch (e) {
            console.warn('[Tracking] Erro ao buscar pedido:', e);
        }

        // Fallback: Tenta localStorage Orders (se o cliente tiver salvo localmente)
        // Isso é frágil pois requer que o browser seja o mesmo, mas serve de fallback
        try {
            const localOrders = JSON.parse(localStorage.getItem('fastOrders') || '[]');
            const foundLocal = localOrders.find(o =>
                (o.order_code === code) ||
                (window.formatOrderCode && window.formatOrderCode(o.order_sequence || o.id) === code)
            );
            if (foundLocal) return foundLocal;
        } catch (e) { }

        return null;
    },

    // ========================================
    // UI HANDLERS
    // ========================================

    openModal: function () {
        document.getElementById('trackingModal')?.classList.remove('hidden');
        document.getElementById('trackingResult')?.classList.add('hidden');
        document.getElementById('trackingMessage')?.classList.add('hidden');

        // Pre-fill phone if available
        const savedPhone = localStorage.getItem('fastLastPhone');
        if (savedPhone) {
            const input = document.getElementById('trackingPhone');
            if (input && !input.value) input.value = savedPhone;
        }
    },

    closeModal: function () {
        document.getElementById('trackingModal')?.classList.add('hidden');
    },

    setMessage: function (msg, type) {
        const box = document.getElementById('trackingMessage');
        if (box) {
            box.textContent = msg;
            box.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-gray-600');
            if (type === 'success') box.classList.add('text-green-600');
            else if (type === 'error') box.classList.add('text-red-600');
            else box.classList.add('text-gray-600');
        }
    },

    renderTimeline: function (order) {
        const container = document.getElementById('trackingTimeline');
        if (!container) return;

        const idx = this.getStepIndex(order.status);
        const steps = [
            { label: 'Recebido', icon: '📝' },
            { label: 'Em Preparo', icon: '🍳' },
            { label: 'Pronto', icon: '✅' },
            { label: 'Saiu para Entrega', icon: '🛵' },
            { label: 'Entregue', icon: '🏠' }
        ];

        if (idx === -1) {
            container.innerHTML = `
                <div class="p-4 bg-red-50 text-red-700 rounded-lg text-center border border-red-200">
                    <p class="font-bold text-lg">❌ Pedido Cancelado</p>
                    <p class="text-sm mt-1">Entre em contato com o estabelecimento.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = steps.map((step, i) => {
            let colorClass = 'text-gray-400 border-gray-200 bg-gray-50';
            let icon = '⚪';

            if (i < idx) { // Completed
                colorClass = 'text-green-700 border-green-200 bg-green-50';
                icon = '✅';
            } else if (i === idx) { // Current
                colorClass = 'text-blue-700 border-blue-200 bg-blue-50 ring-2 ring-blue-100';
                icon = '🔵'; // step.icon
            }

            return `
                <div class="flex items-center gap-3 p-3 rounded-lg border ${colorClass} mb-2 last:mb-0 transition-all">
                    <div class="text-2xl">${i === idx ? step.icon : icon}</div>
                    <div class="flex-1">
                        <p class="font-semibold">${step.label}</p>
                        ${i === idx && order.updated_at ? `<p class="text-xs opacity-75">Atualizado às ${new Date(order.updated_at).toLocaleTimeString().slice(0, 5)}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    getEstimate: function (order) {
        const config = window.storeConfig || {};
        const prepMin = config.prep_time_min || config.prepTimeMin || 20;
        const prepMax = config.prep_time_max || config.prepTimeMax || 40;
        const delMin = config.delivery_time_min || config.deliveryTimeMin || 0;
        const delMax = config.delivery_time_max || config.deliveryTimeMax || 0;
        const isDelivery = (order?.delivery_type || '') === 'entrega';

        if (!isDelivery) return `${prepMin}-${prepMax} min`;
        if (!delMin && !delMax) return `${prepMin}-${prepMax} min`;
        return `Preparo: ${prepMin}-${prepMax} min | Entrega: ${delMin}-${delMax} min`;
    },

    handleTrackSubmit: async function () {
        const codeInput = document.getElementById('trackingOrderCode');
        const phoneInput = document.getElementById('trackingPhone');

        const code = codeInput?.value.trim();
        const phone = phoneInput?.value.replace(/\D/g, '');

        if (!code) {
            this.setMessage('Informe o código do pedido.', 'error');
            return;
        }

        if (!phone || phone.length < 10) {
            this.setMessage('Informe um telefone válido (DDD + 9 dígitos).', 'error');
            return;
        }

        const btn = document.getElementById('trackOrderBtn');
        const originalText = btn ? btn.textContent : 'Buscar pedido';
        if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }

        try {
            const order = await this.fetchOrder(code, phone);

            if (order) {
                this.setMessage('', 'neutral');
                document.getElementById('trackingResult')?.classList.remove('hidden');

                // Update Order Details (using IDs from fast.html)
                if (document.getElementById('trackingCodeLabel'))
                    document.getElementById('trackingCodeLabel').textContent = order.order_code || (window.formatOrderCode ? window.formatOrderCode(order.order_sequence || order.id) : order.id);

                if (document.getElementById('trackingStatusLabel'))
                    document.getElementById('trackingStatusLabel').textContent = this.getStatusLabel(order.status);

                if (document.getElementById('trackingEstimateLabel'))
                    document.getElementById('trackingEstimateLabel').textContent = this.getEstimate(order);

                // Optional: If Elements exist for total/items (from original tracking.js)
                if (document.getElementById('trackResTotal'))
                    document.getElementById('trackResTotal').textContent = `R$ ${parseFloat(order.total).toFixed(2).replace('.', ',')}`;

                this.renderTimeline(order);
            } else {
                this.setMessage('Pedido não encontrado. Verifique os dados.', 'error');
                document.getElementById('trackingResult')?.classList.add('hidden');
            }
        } catch (e) {
            console.error(e);
            this.setMessage('Erro ao buscar pedido.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalText; }
        }
    },

    // Check URL params for auto-tracking
    checkUrlParams: function () {
        const params = new URLSearchParams(window.location.search);
        const trackCode = params.get('track');
        const phone = params.get('phone');

        if (trackCode && phone) {
            this.openModal();
            const codeInput = document.getElementById('trackingOrderCode');
            const phoneInput = document.getElementById('trackingPhone');
            if (codeInput) codeInput.value = trackCode;
            if (phoneInput) phoneInput.value = phone;

            // Auto-submit after inputs populated
            setTimeout(() => this.handleTrackSubmit(), 500);
        }
    }
};

// Global Expose
window.openTrackingModal = () => window.TrackingModule.openModal();
window.closeTrackingModal = () => window.TrackingModule.closeModal();
window.handleTrackOrder = () => window.TrackingModule.handleTrackSubmit();

// Init listener
document.addEventListener('DOMContentLoaded', () => {
    // Check URL automatically
    // setTimeout to ensure other scripts loaded if needed
    setTimeout(() => window.TrackingModule.checkUrlParams(), 1000);

    // Bind buttons if they exist
    document.getElementById('trackOrderBtn')?.addEventListener('click', window.handleTrackOrder);
    document.getElementById('openTrackingModalBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.TrackingModule.openModal();
    });
});
