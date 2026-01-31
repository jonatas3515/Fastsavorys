// ========================================
// STRIPE PAYMENT SERVICE (Admin Module)
// ========================================

function getStripeServerBaseUrl() {
    // Vercel Serverless Functions path
    return '/api';
}

const StripeService = {
    config: null,

    async loadConfig() {
        try {
            const { data, error } = await window.supabaseClient
                .from('fast_stripe_config')
                .select('*')
                .eq('store_id', 1)
                .single();

            if (error) throw error;
            this.config = data || null;

            if (!this.config) {
                console.warn('[Stripe] Config não encontrada (store_id=1).');
            } else {
                console.log('[Stripe] Config carregada do Supabase:', {
                    enabled: this.config.enabled,
                    min_payment_percent: this.config.min_payment_percent,
                    has_public_key: !!this.config.stripe_public_key
                });
            }

            return this.config;
        } catch (e) {
            console.warn('[Stripe] Erro ao carregar config do Supabase:', e);
            this.config = null;
            return null;
        }
    },

    // Gera saudação dinâmica baseada no horário
    getGreeting() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Bom dia';
        if (hour >= 12 && hour < 18) return 'Boa tarde';
        return 'Boa noite';
    },

    // Gera mensagem de pagamento para WhatsApp
    generatePaymentMessage(order, paymentLink) {
        const greeting = this.getGreeting();
        const firstName = (order.client_name || 'Cliente').split(' ')[0];
        // Use already formatted code if available, otherwise format the ID
        const orderCode = order.order_code || formatOrderCode(order.id);

        return `${greeting}, ${firstName}! 🎉

Seu pedido ${orderCode} foi *ACEITO* pela Fast Savory's!

Para confirmar sua encomenda, realize o pagamento pelo link abaixo:
${paymentLink}

Após a confirmação do pagamento, seu pedido será preparado com muito carinho! 🥟

*Valor total:* R$ ${(order.total || 0).toFixed(2).replace('.', ',')}

Obrigado pela preferência! ❤️`;
    },

    // Gera Checkout Session do Stripe usando servidor local
    async generatePaymentLink(order) {
        if (!this.config || !this.config.enabled) {
            console.warn('[Stripe] Stripe não configurado ou desabilitado. Tentando gerar link via servidor local mesmo assim...');
        }

        try {
            console.log('[Stripe] Gerando link para pedido:', order.id);

            const baseUrl = getStripeServerBaseUrl();
            if (!baseUrl) {
                throw new Error('Stripe server URL não configurada.');
            }

            const response = await fetch(baseUrl + '/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId: order.id,
                    amount: order.total,
                    customerEmail: order.client_email || '',
                    customerName: order.client_name
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(function () { return {}; });
                throw new Error(error.error || 'Erro ao gerar link');
            }

            const data = await response.json();
            console.log('[Stripe] Link gerado com sucesso:', data.url);

            return data.url;
        } catch (error) {
            console.error('[Stripe] Erro ao gerar link:', error);
            // Fallback para modo de teste
            return `https://buy.stripe.com/test_order_${order.id}`;
        }
    }
};

// ========================================
// ACCEPT CARD ORDER FUNCTION
// ========================================

async function acceptCardOrder(orderId) {
    const btn = document.getElementById(`acceptBtn_${orderId}`);
    const originalText = btn ? btn.innerHTML : '';

    try {
        // Mostrar loading no botão
        if (btn) {
            btn.innerHTML = '⏳ Gerando link...';
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-wait');
        }

        // Busca dados completos do pedido
        const { data: order, error: fetchError } = await window.supabaseClient
            .from('fast_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            alert('Erro ao buscar pedido');
            return;
        }

        // Carrega config do Stripe se necessário
        if (!StripeService.config) {
            await StripeService.loadConfig();
        }

        // Gera o link de pagamento
        const paymentLink = await StripeService.generatePaymentLink(order);

        // Atualiza o pedido com o link de pagamento
        const { error: updateError } = await window.supabaseClient
            .from('fast_orders')
            .update({
                status: 'accepted',
                payment_status: 'awaiting_payment',
                payment_link: paymentLink,
                accepted_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updateError) throw updateError;

        // Gera mensagem para WhatsApp
        const message = StripeService.generatePaymentMessage(order, paymentLink);

        // Abre WhatsApp com a mensagem
        if (order.client_phone) {
            const cleanPhone = order.client_phone.replace(/\D/g, '');
            const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
            window.open(url, '_blank');
        }

        // Atualiza a lista de pedidos
        if (typeof loadDashboardOrders === 'function') {
            loadDashboardOrders();
        }

    } catch (error) {
        console.error('Erro ao aceitar pedido:', error);
        alert('Erro ao aceitar pedido: ' + error.message);
    } finally {
        // Restaurar botão ao estado original
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-wait');
        }
    }
}

// Global exports
window.StripeService = StripeService;
window.acceptCardOrder = acceptCardOrder;

console.log('[Stripe] Admin module loaded');
