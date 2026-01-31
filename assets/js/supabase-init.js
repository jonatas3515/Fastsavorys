/**
 * Fast Savory's - Supabase Initialization & Global State
 * Inicialização do cliente Supabase e variáveis globais compartilhadas
 */

// ========================================
// SUPABASE CONFIGURATION
// ========================================
const supabaseUrl = 'https://vqjyjdllapqbqpylshkw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxanlqZGxsYXBxYnFweWxzaGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzgyNDUsImV4cCI6MjA4MjAxNDI0NX0.tfTR9YnM5l0do7FJfxML6i05KTSrMInQMqFrWXx6aAU';

// Inicializar Supabase apenas uma vez
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// ========================================
// UTILITY: Promise with Timeout
// ========================================
/**
 * Envolve uma Promise com timeout para evitar travamento
 * @param {Promise} promise - Promise a executar
 * @param {number} timeoutMs - Timeout em milissegundos (default: 10000)
 * @param {*} fallbackValue - Valor de fallback se timeout (default: null)
 * @returns {Promise} Promise com timeout
 */
window.promiseWithTimeout = function promiseWithTimeout(promise, timeoutMs = 10000, fallbackValue = null) {
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            console.warn('[Timeout] Promise excedeu ' + timeoutMs + 'ms, usando fallback');
            resolve(fallbackValue);
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        // Limpar timeout quando qualquer promise resolver
        if (timeoutId) clearTimeout(timeoutId);
    });
};

// Alias local para compatibilidade
var promiseWithTimeout = window.promiseWithTimeout;

// ========================================
// GLOBAL STATE VARIABLES
// ========================================
// Products & Cart
window.products = [];
window.cart = [];
window.cartTotal = 0;

// Admin state
window.isAdmin = false;
window.editingProductId = null;
window.editingClientId = undefined;
window.users = [];
window.currentUserRole = null;

// Clients & Coupons
window.clients = [];
window.couriers = []; // Entregadores
window.promotions = [];
window.clientDiscounts = {};
window.currentSpecialDiscount = null;
window.currentSelectedClient = null;
window.coupons = [];
window.appliedCoupon = null;

// Store configuration
window.storeConfig = {
    card_fee_1x: 5,
    card_fee_2x: 5,
    delivery_enabled: true,
    delivery_disabled_reason: '',
    max_concurrent_orders: 10,
    high_demand_extra_time: 15
};
window.businessHours = [];

// Local aliases for compatibility with existing code
var products = window.products;
var cart = window.cart;
var cartTotal = window.cartTotal;
var isAdmin = window.isAdmin;
var editingProductId = window.editingProductId;
var editingClientId = window.editingClientId;
var users = window.users;
var currentUserRole = window.currentUserRole;
var clients = window.clients;
var couriers = window.couriers;
var promotions = window.promotions;
var clientDiscounts = window.clientDiscounts;
var currentSpecialDiscount = window.currentSpecialDiscount;
var currentSelectedClient = window.currentSelectedClient;
var coupons = window.coupons;
var appliedCoupon = window.appliedCoupon;
var storeConfig = window.storeConfig;
var businessHours = window.businessHours;

console.log('[Supabase] Cliente inicializado com sucesso');
