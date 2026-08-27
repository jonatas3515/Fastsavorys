/**
 * Fast Savory's - Data Module
 * Data fetching and persistence
 */

// Helper to map snake_case do Supabase para camelCase local
// REMOVIDO: Agora usa window.mapProductData de utils.js

// ========================================
// DATA LOADING
// ========================================

async function loadStoreConfig() {
    // Delegado para o Service centralizado
    if (window.StoreConfigService) {
        await window.StoreConfigService.load();
    } else {
        console.error('StoreConfigService não encontrado!');
    }
}

window.blockedDates = [];
async function loadBlockedDates() {
    try {
        if (!window.supabaseClient) {
            window.blockedDates = [];
            return [];
        }
        const { data, error } = await window.supabaseClient
            .from('fast_blocked_dates')
            .select('*')
            .order('blocked_date', { ascending: true });

        if (error) throw error;
        window.blockedDates = data || [];
        localStorage.setItem('fastBlockedDates', JSON.stringify(window.blockedDates));
        return window.blockedDates;
    } catch (e) {
        console.warn('[BlockedDates] Usando fallback/cache:', e.message);
        const saved = localStorage.getItem('fastBlockedDates');
        if (saved) {
            try { window.blockedDates = JSON.parse(saved); } catch (err) { }
        }
        return window.blockedDates || [];
    }
}
window.loadBlockedDates = loadBlockedDates;

async function loadBusinessHours() {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_business_hours')
            .select('*')
            .order('day_of_week', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
            window.businessHours = data;
        } else {
            // Defaults
            window.businessHours = [
                { day_of_week: 0, day_name: 'Domingo', is_open: false, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 1, day_name: 'Segunda', is_open: true, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 2, day_name: 'Terça', is_open: true, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 3, day_name: 'Quarta', is_open: true, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 4, day_name: 'Quinta', is_open: true, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 5, day_name: 'Sexta', is_open: true, open_time: '14:00', close_time: '18:00' },
                { day_of_week: 6, day_name: 'Sábado', is_open: true, open_time: '14:00', close_time: '18:00' }
            ];
        }
    } catch (error) {
        console.log('Using default business hours:', error.message);
        window.businessHours = [
            { day_of_week: 0, day_name: 'Domingo', is_open: false, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 1, day_name: 'Segunda', is_open: true, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 2, day_name: 'Terça', is_open: true, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 3, day_name: 'Quarta', is_open: true, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 4, day_name: 'Quinta', is_open: true, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 5, day_name: 'Sexta', is_open: true, open_time: '14:00', close_time: '18:00' },
            { day_of_week: 6, day_name: 'Sábado', is_open: true, open_time: '14:00', close_time: '18:00' }
        ];
    }
}

async function loadPromotions() {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_promotions')
            .select('*')
            .eq('active', true);

        if (error) throw error;

        window.promotions = (data || []).map(p => ({
            id: p.id,
            productId: p.product_id,
            productName: p.product_name,
            type: p.discount_type,
            value: parseFloat(p.value),
            description: p.description
        }));
        console.log('Promoções carregadas do Supabase:', window.promotions.length);
    } catch (e) {
        console.warn('Erro ao carregar promoções do Supabase, usando localStorage:', e);
        const saved = localStorage.getItem('fastPromotions');
        if (saved) { window.promotions = JSON.parse(saved); }
        else { window.promotions = []; }
    }

    // Load client discounts from Supabase (sync across devices)
    try {
        const loadedDiscounts = await window.ClientDiscountsService.load();
        if (loadedDiscounts && Object.keys(loadedDiscounts).length > 0) {
            window.clientDiscounts = loadedDiscounts;
            // saveClientDiscounts(); // No longer needed as service handles persistence
        } else {
            // Fallback to localStorage handled by service
            window.clientDiscounts = window.ClientDiscountsService.get();
        }
    } catch (e) {
        console.warn('[ClientDiscounts] Erro ao carregar:', e);
    }
}

async function loadCoupons() {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        window.coupons = (data || []).map(c => ({
            id: c.id,
            code: c.code,
            type: c.discount_type,
            value: parseFloat(c.value),
            minOrder: parseFloat(c.min_order) || 0,
            maxValue: c.max_discount_value ? parseFloat(c.max_discount_value) : null,
            maxUsage: c.max_usage_count,
            currentUsage: c.current_usage_count || 0,
            currentTotal: parseFloat(c.current_discount_total) || 0,
            expiry: c.expiry_date,
            active: c.active !== false
        }));

        // Sync to localStorage
        localStorage.setItem('fastCoupons', JSON.stringify(window.coupons));
    } catch (error) {
        console.error('Erro ao carregar cupons do Supabase:', error);
        // Fallback to localStorage
        const saved = localStorage.getItem('fastCoupons');
        if (saved) { window.coupons = JSON.parse(saved); }
        else { window.coupons = []; }
    }
}

// Busca produtos do Supabase e atualiza cache (Delegado ao ProductService)
async function fetchProductsFromSupabase() {
    if (window.ProductService) {
        window.products = await window.ProductService.fetchAll();
    } else {
        console.error('ProductService não disponível');
    }
}


async function loadProducts() {
    const isAdmin = sessionStorage.getItem('fastAdmin') === '1';

    // Se isAdmin, ProductService já lida corretamente (sempre fetch)
    // Para público, ProductService implementa a lógica robusta
    if (window.ProductService) {
        window.products = await window.ProductService.fetchAll();
    } else {
        console.error('ProductService indisponível');
    }
}

// ========================================
// ORDER MANAGEMENT
// ========================================

async function getNextOrderSequence() {
    // 1. Tentar ler do localStorage para fallback de emergência
    let maxLocal = 0;
    try {
        const localOrders = JSON.parse(localStorage.getItem('fastOrders') || '[]');
        localOrders.forEach(o => {
            if (o.order_sequence && o.order_sequence > maxLocal) maxLocal = o.order_sequence;
            if (o.order_code) {
                const match = o.order_code.match(/FAST-(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxLocal) maxLocal = num;
                }
            }
        });
    } catch (e) {
        console.warn('[OrderSequence] Erro ao ler localStorage:', e);
    }

    // 2. Tentar via RPC (Método Principal e Mais Seguro)
    try {
        if (!window.supabaseClient) throw new Error("Supabase client not initialized");

        const { data, error } = await window.supabaseClient.rpc('get_next_order_sequence');

        if (error) {
            console.error('[OrderSequence] RPC Error:', error);
            throw error;
        }

        if (data && data > 0) {
            // Se o RPC retornou um valor, confiamos nele.
            // Mas por segurança, se o local for maior (ex: offline recent), usamos o maior.
            const nextSeq = Math.max(data, maxLocal + 1);
            console.log('[OrderSequence] Sequência gerada:', nextSeq, `(RPC: ${data}, LocalMax: ${maxLocal})`);
            return nextSeq;
        }
    } catch (e) {
        console.warn('[OrderSequence] RPC falhou ou indisponível:', e.message);

        // Se temos um maxLocal confiável (> 0), usamos ele + 1 como fallback temporário
        if (maxLocal > 0) {
            console.warn('[OrderSequence] Usando fallback local:', maxLocal + 1);
            return maxLocal + 1;
        }

        // SE TUDO FALHAR: Não retornar 1 se já existem pedidos na loja.
        // Melhor lançar erro e pedir para tentar novamente do que gerar FAST-0001
        // Mas se for o PRIMEIRO pedido da loja? (deploy novo)
        // Assumimos que a loja já roda. 
        // Vamos tentar uma query direta de "count" na tabela orders pública (se RLS permitir count?)
        // RLS padrão bloqueia count.

        // Último recurso: Timestamp (para evitar colisão visual, trigger arruma depois)
        // Gera um número aleatório alto temporário para não confundir com FAST-0001
        // Ex: 90000 + segundos
        const tempSeq = Math.floor(Date.now() / 1000) % 10000 + 90000;
        console.warn('[OrderSequence] FALHA CRÍTICA. Usando sequência temporária alta:', tempSeq);
        return tempSeq;
    }

    return 1; // Se realmente nada funcionar e não houver histórico nenhum.
}

async function generateOrderCode() {
    const sequence = await getNextOrderSequence();
    const code = window.formatOrderCode(sequence);
    return { sequence, code };
}

async function notifyManychatNewOrder(order) {
    try {
        const response = await fetch('/api/notify-manychat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });
        const data = await response.json();
        if (data.success) {
            console.log('[ManyChat] ✅ Order notification sent:', order.order_code || order.id);
        } else {
            console.warn('[ManyChat] ⚠️ Notification skipped/failed:', data.error);
        }
    } catch (err) {
        console.warn('[ManyChat] ❌ Request failed:', err.message);
    }
}

async function saveOrderToSupabase(orderData) {
    try {
        console.log('[SaveOrder] Iniciando salvamento...', { orderCode: orderData.order_code, clientName: orderData.client_name });

        if (!window.supabaseClient) {
            throw new Error('supabaseClient não está disponível');
        }

        // Construir objeto apenas com colunas que existem na tabela fast_orders
        const cleanData = {
            id: orderData.id,
            order_sequence: orderData.order_sequence || 0,
            order_code: orderData.order_code || null,
            client_name: orderData.client_name || '',
            client_phone: orderData.client_phone || '',
            items: orderData.items || [],
            total: orderData.total || 0,
            delivery_fee: orderData.delivery_fee || 0,
            card_fee: orderData.card_fee || 0,
            discount: orderData.discount || 0,
            coupon_code: orderData.coupon_code || null,
            coupon_discount: orderData.coupon_discount || 0,
            birthday_discount: orderData.birthday_discount || 0,
            payment_method: orderData.payment_method || 'dinheiro',
            delivery_type: orderData.delivery_type || 'retirada',
            status: orderData.status || 'pending',
            payment_status: orderData.payment_status || 'pending'
        };

        // scheduled_date: converter DD/MM/YYYY para YYYY-MM-DD (formato PostgreSQL DATE)
        if (orderData.scheduled_date) {
            const parts = orderData.scheduled_date.split('/');
            if (parts.length === 3) {
                cleanData.scheduled_date = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                cleanData.scheduled_date = orderData.scheduled_date;
            }
        }

        if (orderData.scheduled_time) {
            cleanData.scheduled_time = orderData.scheduled_time;
        }

        // address: salvar como JSONB
        if (orderData.address && typeof orderData.address === 'object') {
            cleanData.address = orderData.address;
        }

        if (orderData.subtotal) {
            cleanData.subtotal = orderData.subtotal;
        }

        console.log('[SaveOrder] Dados para inserção:', JSON.stringify(cleanData, null, 2));

        const { data, error } = await window.supabaseClient
            .from('fast_orders')
            .insert([cleanData])
            .select()
            .single();

        if (error) {
            console.error('[SaveOrder] ERRO Supabase:', error.message, error.details, error.hint, error.code);
            throw error;
        }

        console.log('[SaveOrder] Pedido salvo com sucesso! ID:', data.id, 'Código:', data.order_code);
        return data;

    } catch (error) {
        console.error('[SaveOrder] ERRO CRÍTICO:', error.message || error);

        // Fallback: save locally
        const localOrders = JSON.parse(localStorage.getItem('fastOrders') || '[]');
        localOrders.push(orderData);
        localStorage.setItem('fastOrders', JSON.stringify(localOrders));
        console.log('[SaveOrder] Pedido salvo localmente como fallback');

        if (window.OfflineSyncService) {
            window.OfflineSyncService.addToQueue('order', orderData);
        }

        throw error;
    }
}

// ========================================
// BIRTHDAY DISCOUNT DATA
// ========================================

async function checkBirthdayDiscountUsed(phone) {
    if (!phone) return true;
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    const currentYear = new Date().getFullYear();

    try {
        const { data, error } = await window.supabaseClient
            .from('fast_birthday_discount_usage')
            .select('id')
            .eq('client_phone', phoneDigits)
            .eq('usage_year', currentYear)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return !!data;
    } catch (error) {
        console.error('Erro ao verificar uso de desconto de aniversário:', error);
        const usageKey = `birthdayDiscount_${phoneDigits}_${currentYear}`;
        return localStorage.getItem(usageKey) === 'used';
    }
}

async function recordBirthdayDiscountUsage(phone, discountAmount, orderId) {
    if (!phone) return;
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    const currentYear = new Date().getFullYear();

    try {
        await window.supabaseClient
            .from('fast_birthday_discount_usage')
            .insert([{
                client_phone: phoneDigits,
                usage_year: currentYear,
                discount_applied: discountAmount,
                order_id: orderId
            }]);
    } catch (error) {
        console.error('Erro ao registrar uso de desconto de aniversário:', error);
        const usageKey = `birthdayDiscount_${phoneDigits}_${currentYear}`;
        localStorage.setItem(usageKey, 'used');
    }
}

// Expose functions globally for now
window.loadStoreConfig = loadStoreConfig;
window.loadBusinessHours = loadBusinessHours;
window.loadPromotions = loadPromotions;
window.loadCoupons = loadCoupons;
window.loadProducts = loadProducts;
window.saveOrderToSupabase = saveOrderToSupabase;
window.generateOrderCode = generateOrderCode;
window.checkBirthdayDiscountUsed = checkBirthdayDiscountUsed;
// ========================================
// COUPON UTILS
// ========================================

window.findValidCouponByCode = function (code) {
    if (!code || !window.coupons) return null;
    const normalizedCode = (code || '').trim().toUpperCase();
    const coupon = window.coupons.find(c => c.code.toUpperCase() === normalizedCode && c.active);

    if (!coupon) return null;

    // Strict Date Check
    // "Valid until 30/01" usually means "inclusive".
    // We compare Today (00:00) with Expiry (00:00).
    // If Today <= ExpiryData, it is valid.
    if (coupon.expiry) {
        // Parse expiry (assuming YYYY-MM-DD from Supabase)
        // Note: New Date('2026-01-30') is UTC.
        // We really want to compare LOCAL PROPERTY dates.

        const now = window.getBrasiliaDate ? window.getBrasiliaDate() : new Date();
        const todayStr = window.formatYYYYMMDD ? window.formatYYYYMMDD(now) : now.toISOString().split('T')[0];
        const expiryStr = coupon.expiry.split('T')[0]; // "2026-01-30"

        console.log(`[CouponDebug] Code: ${coupon.code}`, `Expiry: ${expiryStr}`, `Today: ${todayStr}`, `Valid: ${todayStr <= expiryStr}`);

        if (todayStr >= expiryStr) {
            console.warn('[Coupon] Cupom expirado (Strict Check):', coupon.code, expiryStr, 'Current:', todayStr);
            return null;
        }
    }

    // Usage Limits
    if (coupon.maxUsage && coupon.currentUsage >= coupon.maxUsage) {
        return null;
    }

    return coupon;
};

window.recordBirthdayDiscountUsage = recordBirthdayDiscountUsage;
// findValidCouponByCode já está exposta na linha 439

// ========================================
// DELIVERY FEES - Load from Supabase
// ========================================
async function loadDeliveryFees() {
    try {
        if (!window.supabaseClient) {
            console.warn('[Data] Supabase indisponível para carregar taxas');
            return;
        }

        const { data, error } = await window.supabaseClient
            .from('fast_delivery_fees')
            .select('*');

        if (error) throw error;

        if (data && data.length > 0) {
            const feesObj = {};
            data.forEach(row => {
                feesObj[row.neighborhood] = {
                    fee: row.fee,
                    min: row.min_order_value || 0
                };
            });
            localStorage.setItem('fastDeliveryFees', JSON.stringify(feesObj));
            console.log('[Data] Taxas de entrega carregadas do Supabase:', Object.keys(feesObj).length, 'bairros');
        }
    } catch (e) {
        console.warn('[Data] Erro ao carregar taxas de entrega:', e.message);
    }
}

window.loadDeliveryFees = loadDeliveryFees;
