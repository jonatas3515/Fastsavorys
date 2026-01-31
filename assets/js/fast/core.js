/**
 * Fast Savory's - Core Module
 * Defines global state and initialization
 */

// Global State
window.storeConfig = {};
window.cart = [];
window.products = [];
window.clients = [];
window.promotions = [];
window.coupons = [];
window.currentUserRole = 'consumer'; // Default role
window.currentClientPhone = null;
window.currentSelectedClient = null;
window.appliedCoupon = null;
window.cartTotal = 0;
window.clientDiscounts = {}; // Manual discounts per client
window.currentSpecialDiscount = null; // Automated loyalty discount

// Product specific globals
window.pendingMiniProduct = null;
window.pendingCustomProduct = null;
window.miniMaxFlavors = 10;
window.MAX_FlAVORS_BOLO = 2;

// Business Hours & Status
window.businessHours = [];
window.storeClosedToday = false;

// Supabase client is initialized in supabase-init.js (loaded before this file)
// window.supabaseClient is available globally

// Global error handler for promises
window.promiseWithTimeout = function (promise, ms = 12000) {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout de ${ms}ms excedido`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// Core Module Definition
window.CoreModule = {
    init: async function () {
        console.log('[Core] Initializing...');

        // 1. Load Data
        console.log('[Core] Loading data...');
        if (window.loadStoreConfig) await window.loadStoreConfig();
        if (window.loadBusinessHours) await window.loadBusinessHours();
        if (window.loadPromotions) await window.loadPromotions();
        if (window.loadCoupons) await window.loadCoupons();
        if (window.loadProducts) await window.loadProducts();

        // 2. Initialize UI
        console.log('[Core] Rendering UI...');
        if (window.renderProducts) window.renderProducts();
        if (window.updateCart) window.updateCart();

        // 3. Initialize Sub-modules
        if (window.BannerModule && window.BannerModule.init) window.BannerModule.init();
        if (window.CatalogModule && window.CatalogModule.init) window.CatalogModule.init();

        // 4. Check URL Params (Tracking/Rating)
        if (window.TrackingModule && window.TrackingModule.checkUrlParams) window.TrackingModule.checkUrlParams();

        console.log('[Core] Ready!');
    }
};
