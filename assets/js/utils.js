/**
 * Fast Savory's - Utility Functions
 * Funções utilitárias compartilhadas entre a loja e o admin
 */

// ========================================
// ERROR HANDLERS (Debug iOS)
// ========================================
window._debugErrors = [];

window.addEventListener('error', function (e) {
    var msg = '[GLOBAL ERROR] ' + e.message + ' at ' + e.filename + ':' + e.lineno;
    console.error(msg);
    window._debugErrors.push(msg);
    // Mostra erro visualmente em iOS para debug
    if (window._debugErrors.length <= 3) {
        var div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:99999;font-size:12px;';
        div.textContent = msg;
        document.body && document.body.appendChild(div);
    }
});

window.addEventListener('unhandledrejection', function (e) {
    var msg = '[PROMISE ERROR] ' + (e.reason ? (e.reason.message || e.reason) : 'unknown');
    console.error(msg);
    window._debugErrors.push(msg);
});

// ========================================
// DATE UTILITIES
// ========================================

/**
 * Helper para compatibilidade iOS com Datas
 * Corrige formato de data para ISO 8601
 */
window.safeDate = function (value) {
    if (value === undefined || value === null) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        // Corrige formato "YYYY-MM-DD HH:mm" para "YYYY-MM-DDTHH:mm" (ISO 8601)
        if (value.includes(' ') && value.includes(':') && !value.includes('T')) {
            value = value.replace(' ', 'T');
        }
    }
    return new Date(value);
};

/**
 * Retorna a data/hora atual no fuso horário de Brasília (UTC-3)
 * Compatível com iOS Safari
 */
window.getBrasiliaDate = function () {
    const now = new Date();
    // Brasília is UTC-3 (no daylight saving since 2019)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brasiliaOffset = -3 * 60 * 60000; // UTC-3 in milliseconds
    const brasiliaDate = new Date(utc + brasiliaOffset);
    return brasiliaDate;
};

/**
 * Formata uma data no formato YYYY-MM-DD
 * @param {Date} d - Data a formatar
 * @returns {string} Data formatada
 */
window.formatYYYYMMDD = function (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/**
 * Gera código de pedido no formato FAST-0001
 * @param {string|number} orderIdOrSeq - ID do pedido (timestamp) ou número sequencial
 * @returns {string} Código formatado (ex: "FAST-0001")
 */
window.formatOrderCode = function (orderIdOrSeq) {
    if (!orderIdOrSeq) return 'FAST-0000';

    // Se já é um código FAST-XXXX, retorna como está
    if (String(orderIdOrSeq).startsWith('FAST-')) return orderIdOrSeq;

    // Se é um número sequencial pequeno (< 100000), usa diretamente
    const num = parseInt(orderIdOrSeq, 10);
    if (!isNaN(num) && num < 100000) {
        return `FAST-${String(num).padStart(4, '0')}`;
    }

    // Fallback: pega os últimos 4 dígitos do ID (timestamp)
    const numericId = String(orderIdOrSeq).slice(-4);
    const paddedId = numericId.padStart(4, '0');
    return `FAST-${paddedId}`;
};

// ========================================
// SERVICE WORKER CLEANUP (Local Dev)
// ========================================
// ... (existing code)

// ========================================
// DATA MAPPING HELPERS
// ========================================

/**
 * Helper to map snake_case from Supabase to camelCase
 * Consolidated from products.js and data.js
 */
window.mapProductData = function (p) {
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
};

(function () {
    try {
        var hostname = location.hostname;
        var isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        var isPrivateIP = hostname.indexOf('192.168.') === 0 || hostname.indexOf('10.') === 0 ||
            (hostname.indexOf('172.') === 0 && parseInt(hostname.split('.')[1]) >= 16 && parseInt(hostname.split('.')[1]) <= 31);
        if ((isLocal || isPrivateIP) && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function (regs) {
                regs.forEach(function (reg) {
                    reg.unregister();
                    console.log('[SW] Desregistrado automaticamente em ambiente local');
                });
            }).catch(function (e) { console.log('[SW] Erro ao desregistrar:', e); });
            // Limpar caches antigos
            if ('caches' in window) {
                caches.keys().then(function (names) {
                    names.forEach(function (name) { caches.delete(name); });
                    if (names.length) console.log('[CACHE] Limpo automaticamente em ambiente local');
                }).catch(function (e) { console.log('[CACHE] Erro ao limpar:', e); });
            }
        }
    } catch (e) {
        console.log('[SW/CACHE] Erro geral:', e);
    }
})();

// ========================================
// UI HELPERS
// ========================================

/**
 * Exibe mensagem inline temporária em um container
 * @param {string} containerId - ID do elemento container
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'success' (verde) ou 'error' (vermelho)
 */
window.showInlineMessage = function (containerId, message, type = 'success') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `p-3 rounded-lg text-sm font-medium mb-3 ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
    msgDiv.textContent = message;
    container.insertBefore(msgDiv, container.firstChild);

    // Auto-remove after 4 seconds
    setTimeout(() => msgDiv.remove(), 4000);
};

// ========================================
// PRODUCT UTILITIES
// ========================================

/**
 * Verifica se um produto está disponível hoje (considerando flag manual e datas)
 * @param {Object} product - Objeto do produto
 * @returns {boolean} True se disponível
 */
window.isProductAvailableToday = function (product) {
    if (!product) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Indisponível hoje (flag manual)
    if (product.unavailableToday) return false;

    // Sazonalidade (período definido)
    if (product.startDate && product.endDate) {
        const start = window.safeDate(product.startDate);
        const end = window.safeDate(product.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (today < start || today > end) return false;
    }

    // Visibilidade normal
    if (product.visible === false) return false;

    return true;
};


// ========================================
// NAVIGATION HELPERS
// ========================================

/**
 * Mostra a loja pública e esconde o painel administrativo
 */
window.showPublicStore = function () {
    const publicStore = document.getElementById('publicStore');
    const adminPanel = document.getElementById('adminPanelFast');

    if (publicStore) publicStore.classList.remove('hidden');
    if (adminPanel) adminPanel.classList.add('hidden');

    // Reset scroll
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

/**
 * Mostra o painel administrativo e esconde a loja pública
 */
window.showAdminPanel = function () {
    const publicStore = document.getElementById('publicStore');
    const adminPanel = document.getElementById('adminPanelFast');

    if (publicStore) publicStore.classList.add('hidden');
    if (adminPanel) adminPanel.classList.remove('hidden');

    // Reset scroll
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.isValidImageUrl = function (url) {
    if (!url) return false;
    const s = String(url).trim();
    if (!s) return false;
    const lower = s.toLowerCase();
    if (lower === 'null' || lower === 'undefined') return false;
    if (lower.endsWith('/')) return false;
    if (lower.includes('/storage/v1/object/public/') && (lower.endsWith('/products') || lower.endsWith('/products/') || lower.endsWith('/banners') || lower.endsWith('/banners/'))) return false;
    return true;
};

/**
 * Abre o WhatsApp com o número do cliente
 * @param {string} phone - Telefone do cliente
 */
window.openWhatsAppForOrder = function (phone) {
    const p = (phone || '').replace(/\D/g, '');
    if (p) {
        // Assume BR code 55 if length is 10 or 11, or if missing
        let target = p;
        if (!target.startsWith('55') && target.length >= 10) target = '55' + target;
        window.open(`https://wa.me/${target}`, '_blank');
    } else {
        if (window.showToast) window.showToast('Telefone inválido', 'error');
        else alert('Telefone inválido');
    }
};

console.log('[Utils] Módulo carregado com sucesso');
