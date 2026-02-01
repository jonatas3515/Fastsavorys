/**
 * Fast Savory's - Data Module
 * Data fetching and persistence
 */

// Helper to map snake_case do Supabase para camelCase local
function mapProductData(p) {
    return {
        ...p,
        startDate: p.start_date,
        endDate: p.end_date,
        unavailableToday: p.unavailable_today,
        isEncomenda: p.is_encomenda,
        flavor_selection: p.flavor_selection,
        catalog_enabled: p.catalog_enabled !== undefined ? p.catalog_enabled : true,
        catalog_size_options: p.catalog_size_options || null,
        catalog_vegan: p.catalog_vegan || false,
        catalog_phrase: p.catalog_phrase || null,
        catalog_order: p.catalog_order || 0,
        blockMassa: p.block_massa || false,
        blockRecheio: p.block_recheio || false,
        requires_preorder: p.requires_preorder || false
    };
}

// ========================================
// DATA LOADING
// ========================================

async function loadStoreConfig() {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_store_config')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        if (data) {
            window.storeConfig = {
                card_fee_1x: parseFloat(data.card_fee_1x) || 5,
                card_fee_2x: parseFloat(data.card_fee_2x) || 10,
                delivery_enabled: data.delivery_enabled !== false,
                delivery_disabled_reason: data.delivery_disabled_reason || '',
                prep_time_min: parseInt(data.prep_time_min) || 0,
                prep_time_max: parseInt(data.prep_time_max) || 0,
                delivery_time_min: parseInt(data.delivery_time_min) || 0,
                delivery_time_max: parseInt(data.delivery_time_max) || 0,
                // Novas variáveis de regras
                min_order_delivery: parseFloat(data.min_order_delivery) || 15.00,
                min_order_pickup: parseFloat(data.min_order_pickup) || 8.00,
                min_order_pickup_offhours: parseFloat(data.min_order_pickup_offhours) || 15.00,
                same_day_orders_enabled: data.same_day_orders_enabled !== false,
                same_day_min_value: parseFloat(data.same_day_min_value) || 15.00,
                same_day_pickup_start: data.same_day_pickup_start || '11:00',
                same_day_pickup_end: data.same_day_pickup_end || '18:00',
                morning_rule_enabled: data.morning_rule_enabled !== false,
                morning_rule_end_time: data.morning_rule_end_time || '14:00',
                morning_rule_min_value: parseFloat(data.morning_rule_min_value) || 30.00,
                order_window_start: data.order_window_start || '07:00',
                order_window_end: data.order_window_end || '18:00',
            };
            window.storeConfig.card_fee_2x = window.storeConfig.card_fee_1x;
            localStorage.setItem('fastStoreConfig', JSON.stringify(window.storeConfig));
            console.log('Configurações carregadas do Supabase');
        }
    } catch (error) {
        console.log('Carregando config do localStorage:', error.message);
        try {
            const saved = localStorage.getItem('fastStoreConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                window.storeConfig = { ...window.storeConfig, ...parsed };
                window.storeConfig.card_fee_2x = window.storeConfig.card_fee_1x;
            }
        } catch (e) {
            console.log('Using default store config');
        }
    }
}

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
                { day_of_week: 5, day_name: 'Sexta', is_open: true, open_time: '14:00', close_time: '19:30' },
                { day_of_week: 6, day_name: 'Sábado', is_open: true, open_time: '14:00', close_time: '18:00' }
            ];
        }
    } catch (error) {
        console.log('Using default business hours:', error.message);
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

        localStorage.setItem('fastCoupons', JSON.stringify(window.coupons));
    } catch (error) {
        console.error('Erro ao carregar cupons do Supabase:', error);
        const saved = localStorage.getItem('fastCoupons');
        if (saved) { window.coupons = JSON.parse(saved); }
        else { window.coupons = []; }
    }
}

// Busca produtos do Supabase e atualiza cache (sem cache-first)
async function fetchProductsFromSupabase() {
    try {
        const result = await window.promiseWithTimeout(
            window.supabaseClient
                .from('fast_products')
                .select('*')
                .order('id', { ascending: true }),
            8000,
            { data: null, error: { message: 'Timeout' } }
        );

        const { data, error } = result || { data: null, error: null };

        if (error) throw error;

        if (data && data.length > 0) {
            window.products = data.map(mapProductData);
            console.log('[Products] ✅ Carregados do Supabase:', window.products.length);

            const serverVersion = await window.VersionService.getServerVersion('products');
            window.DataCache.set('products', window.products, serverVersion || 1);
            localStorage.setItem('fastProducts', JSON.stringify(window.products));

            const cacheNotice = document.getElementById('cacheNotice');
            if (cacheNotice) cacheNotice.classList.add('hidden');
        } else {
            console.error('[Products] ⚠️ Supabase retornou vazio - mantendo dados existentes');
            const cached = window.DataCache.get('products');
            if (cached && cached.items && cached.items.length > 0) {
                window.products = cached.items;
            } else {
                const saved = localStorage.getItem('fastProducts');
                if (saved) { window.products = JSON.parse(saved); }
            }
        }
    } catch (error) {
        console.error('[Products] Erro ao carregar do Supabase:', error);
        const saved = localStorage.getItem('fastProducts');
        if (saved) { window.products = JSON.parse(saved); }
        else {
            const cached = window.DataCache.get('products');
            if (cached && cached.items && cached.items.length > 0) {
                window.products = cached.items;
            } else {
                window.products = [];
            }
        }
    }
}

async function loadProducts() {
    const isAdmin = sessionStorage.getItem('fastAdmin') === '1';

    if (isAdmin) {
        await fetchProductsFromSupabase();
        return;
    }

    try {
        const cached = window.DataCache.get('products');
        const cachedItems = cached?.items || [];

        console.log('[Products] 💰 Buscando PREÇOS ATUALIZADOS do servidor...');

        const result = await window.promiseWithTimeout(
            window.supabaseClient
                .from('fast_products')
                .select('*')
                .order('id', { ascending: true }),
            6000,
            null
        );

        if (result && result.data && result.data.length > 0) {
            let serverProducts = result.data.map(mapProductData);

            if (cachedItems.length > 0) {
                serverProducts = window.DataCache.mergeWithCriticalData(serverProducts, cachedItems);
            }

            window.products = serverProducts;
            console.log('[Products] ✅ Carregados do servidor com preços atuais:', window.products.length);

            const serverVersion = await window.VersionService.getServerVersion('products');
            window.DataCache.set('products', window.products, serverVersion || Date.now());
            localStorage.setItem('fastProducts', JSON.stringify(window.products));

            // Start background sync? assuming global function exists or handled else where
            // window.startBackgroundVersionSync(); 
            // In modules, we might need to handle this differently. 
            // For now, removing startBackgroundVersionSync call as it's likely a loop we need to define in core or just define here if trivial. 

            return;
        }

        if (cachedItems.length > 0) {
            window.products = cachedItems;
            console.warn('[Products] ⚠️ Servidor indisponível, usando cache');
            setTimeout(() => {
                const notice = document.getElementById('cacheNotice');
                if (notice) notice.classList.remove('hidden');
            }, 1000);
            return;
        }

        await fetchProductsFromSupabase();

    } catch (error) {
        console.error('[Products] Erro no carregamento híbrido:', error);
        const cached = window.DataCache.get('products');
        if (cached?.items?.length > 0) {
            window.products = cached.items;
        } else {
            await fetchProductsFromSupabase();
        }
    }
}

// ========================================
// ORDER MANAGEMENT
// ========================================

async function getNextOrderSequence() {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_orders')
            .select('order_sequence')
            .not('order_sequence', 'is', null)
            .order('order_sequence', { ascending: false })
            .limit(1);

        if (error) throw error;
        const lastSeq = (data && data.length > 0 && data[0].order_sequence) ? data[0].order_sequence : 0;
        return lastSeq + 1;
    } catch (e) {
        console.warn('[OrderSequence] Erro ao buscar sequência:', e);
        try {
            const { count, error: countError } = await window.supabaseClient
                .from('fast_orders')
                .select('*', { count: 'exact', head: true });
            if (countError) throw countError;
            return (count || 0) + 1;
        } catch (e2) {
            return Math.floor(Date.now() / 1000) % 10000;
        }
    }
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
        const { error } = await window.supabaseClient
            .from('fast_orders')
            .insert([orderData]);

        if (error) throw error;
        console.log('Pedido salvo com sucesso:', orderData.id);

        // Notify ManyChat
        notifyManychatNewOrder(orderData);

    } catch (error) {
        console.error('Erro ao salvar pedido:', error);
        const localOrders = JSON.parse(localStorage.getItem('fastOrders') || '[]');
        localOrders.push(orderData);
        localStorage.setItem('fastOrders', JSON.stringify(localOrders));

        // Add to offline queue if available
        if (window.OfflineSyncService) {
            window.OfflineSyncService.addToQueue('order', orderData);
        }
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
window.findValidCouponByCode = findValidCouponByCode;

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
