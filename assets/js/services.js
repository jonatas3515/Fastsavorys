/**
 * Fast Savory's - Services Module
 * Serviços de cache, versionamento, histórico de pedidos, favoritos e endereços
 */

// ========================================
// DATA CACHE SERVICE (Smart Cache)
// ========================================
window.DataCache = {
  PREFIX: 'fast_cache_',

  // Lê dados do cache
  get: function (key) {
    try {
      const raw = localStorage.getItem(this.PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[DataCache] Erro ao ler:', key, e);
      return null;
    }
  },

  // Salva dados no cache com versão
  set: function (key, data, version) {
    try {
      const payload = {
        items: data,
        version: version || 0,
        savedAt: Date.now()
      };
      localStorage.setItem(this.PREFIX + key, JSON.stringify(payload));
      console.log('[DataCache] Salvo:', key, 'versão:', version);
      return true;
    } catch (e) {
      console.warn('[DataCache] Erro ao salvar:', key, e);
      return false;
    }
  },

  // Obtém versão local
  getLocalVersion: function (key) {
    const cached = this.get(key);
    return cached ? cached.version : null;
  },

  // Limpa cache específico
  clear: function (key) {
    try {
      localStorage.removeItem(this.PREFIX + key);
      console.log('[DataCache] Limpo:', key);
    } catch (e) {
      console.warn('[DataCache] Erro ao limpar:', key, e);
    }
  },

  // Limpa todo o cache
  clearAll: function () {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
      console.log('[DataCache] Cache completo limpo');
    } catch (e) {
      console.warn('[DataCache] Erro ao limpar tudo:', e);
    }
  },

  // Limpa todos os caches relacionados a produtos (legado + novo)
  clearProductCaches: function () {
    try {
      localStorage.removeItem(this.PREFIX + 'products');
      localStorage.removeItem('fastProducts');
      console.log('[DataCache] Caches de produtos limpos (smart + legado)');
    } catch (e) {
      console.warn('[DataCache] Erro ao limpar caches de produtos:', e);
    }
  },

  // CACHE HÍBRIDO: Mescla dados críticos do servidor com cache de imagens
  mergeWithCriticalData: function (serverProducts, cachedProducts) {
    if (!serverProducts || !Array.isArray(serverProducts)) return serverProducts;
    if (!cachedProducts || !Array.isArray(cachedProducts)) return serverProducts;

    const cachedMap = new Map();
    cachedProducts.forEach(p => cachedMap.set(p.id, p));

    return serverProducts.map(serverProduct => {
      const cached = cachedMap.get(serverProduct.id);

      // Se não tem imagem do servidor mas tem no cache, usa do cache
      if (!serverProduct.image && cached && cached.image) {
        console.log('[DataCache] Usando imagem do cache para:', serverProduct.name);
        return { ...serverProduct, image: cached.image };
      }

      // Sempre usa dados do servidor (preço, promo, visibilidade, etc.)
      return serverProduct;
    });
  }
};

// ========================================
// VERSION SERVICE (Data versioning)
// ========================================
window.VersionService = {
  // Debounce control
  _lastCheck: {},
  _minInterval: 30000, // 30 segundos entre checks

  // Busca versão do servidor (query leve)
  getServerVersion: async function (key) {
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_data_versions')
        .select('version')
        .eq('key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('[VersionService] Tabela fast_data_versions não encontrada');
          return null;
        }
        console.warn('[VersionService] Erro ao buscar versão:', key, error);
        return null;
      }

      return data ? data.version : null;
    } catch (e) {
      console.warn('[VersionService] Exceção ao buscar versão:', key, e);
      return null;
    }
  },

  // Incrementa versão (chamado pelo admin após salvar)
  incrementVersion: async function (key) {
    try {
      const { data, error } = await window.supabaseClient
        .rpc('increment_data_version', { p_key: key });

      if (error) {
        console.warn('[VersionService] Erro ao incrementar versão:', key, error);
        return null;
      }

      console.log('[VersionService] Versão incrementada:', key, '→', data);
      return data;
    } catch (e) {
      console.warn('[VersionService] Exceção ao incrementar:', key, e);
      return null;
    }
  },

  // Verifica se precisa atualizar (com debounce)
  shouldCheck: function (key) {
    const now = Date.now();
    const lastCheck = this._lastCheck[key] || 0;

    if (now - lastCheck < this._minInterval) {
      console.log('[VersionService] Debounce ativo para:', key);
      return false;
    }

    this._lastCheck[key] = now;
    return true;
  },

  // Verifica e atualiza se necessário
  checkAndRefresh: async function (key, localVersion, refreshFn) {
    if (!this.shouldCheck(key)) return false;

    const serverVersion = await this.getServerVersion(key);

    if (serverVersion === null) {
      console.log('[VersionService] Não foi possível verificar versão de:', key);
      return false;
    }

    if (serverVersion !== localVersion) {
      console.log('[VersionService] Versão mudou:', key, 'local:', localVersion, 'server:', serverVersion);
      if (typeof refreshFn === 'function') {
        await refreshFn();
      }
      return true;
    }

    console.log('[VersionService] Versão atual:', key, '=', serverVersion);
    return false;
  }
};

// ========================================
// ORDER HISTORY SERVICE (localStorage + Supabase)
// ========================================
window.OrderHistoryService = {
  getKey: (phone) => phone ? `fastOrders_${phone.replace(/\D/g, '')}` : 'fastOrders_anon',

  getOrders: function (phone) {
    try {
      const key = this.getKey(phone);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[OrderHistory] Erro ao ler:', e);
      return [];
    }
  },

  saveOrder: function (phone, order) {
    try {
      const key = this.getKey(phone);
      const orders = this.getOrders(phone);
      orders.unshift(order); // Adiciona no início
      // Mantém apenas últimos 2 pedidos
      localStorage.setItem(key, JSON.stringify(orders.slice(0, 2)));
    } catch (e) {
      console.error('[OrderHistory] Erro ao salvar:', e);
    }
  },

  migrateToPhone: function (phone) {
    try {
      const anonOrders = this.getOrders(null);
      if (anonOrders.length > 0) {
        const phoneOrders = this.getOrders(phone);
        const merged = [...anonOrders, ...phoneOrders].slice(0, 2);
        localStorage.setItem(this.getKey(phone), JSON.stringify(merged));
        localStorage.removeItem('fastOrders_anon');
      }
    } catch (e) { }
  }
};

// ========================================
// FAVORITES SERVICE (localStorage)
// ========================================
window.FavoritesService = {
  getKey: (phone) => phone ? `fastFavorites_${phone.replace(/\D/g, '')}` : 'fastFavorites_anon',

  getFavorites: function (phone) {
    try {
      const key = this.getKey(phone);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  isFavorite: function (phone, productId) {
    return this.getFavorites(phone).includes(productId);
  },

  toggle: function (phone, productId) {
    try {
      const key = this.getKey(phone);
      let favorites = this.getFavorites(phone);
      const index = favorites.indexOf(productId);
      if (index > -1) {
        favorites.splice(index, 1);
      } else {
        favorites.push(productId);
      }
      localStorage.setItem(key, JSON.stringify(favorites));
      return index === -1; // Returns true if now favorite
    } catch (e) {
      return false;
    }
  },

  migrateToPhone: function (phone) {
    try {
      const anonFavs = this.getFavorites(null);
      if (anonFavs.length > 0) {
        const phoneFavs = this.getFavorites(phone);
        const merged = [...new Set([...anonFavs, ...phoneFavs])];
        localStorage.setItem(this.getKey(phone), JSON.stringify(merged));
        localStorage.removeItem('fastFavorites_anon');
      }
    } catch (e) { }
  }
};

// ========================================
// ADDRESS SERVICE (múltiplos endereços por cliente)
// ========================================
window.AddressService = {
  getKey: (phone) => phone ? `fastAddresses_${phone.replace(/\D/g, '')}` : 'fastAddresses_anon',

  load: function (phone) {
    try {
      const key = this.getKey(phone);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[AddressService] Erro ao carregar:', e);
      return [];
    }
  },

  save: function (phone, address) {
    try {
      const key = this.getKey(phone);
      let addresses = this.load(phone);

      // Check if address already exists
      const exists = addresses.some(a =>
        a.street === address.street &&
        a.number === address.number &&
        a.neighborhood === address.neighborhood
      );

      if (!exists) {
        address.id = Date.now().toString();
        addresses.push(address);
        localStorage.setItem(key, JSON.stringify(addresses.slice(-5))); // max 5 addresses
      }
      return !exists;
    } catch (e) {
      console.error('[AddressService] Erro ao salvar:', e);
      return false;
    }
  },

  remove: function (phone, addressId) {
    try {
      const key = this.getKey(phone);
      let addresses = this.load(phone);
      addresses = addresses.filter(a => a.id !== addressId);
      localStorage.setItem(key, JSON.stringify(addresses));
    } catch (e) {
      console.error('[AddressService] Erro ao remover:', e);
    }
  }
};

// ========================================
// OFFLINE SYNC SERVICE
// ========================================
window.OfflineSyncService = {
  QUEUE_KEY: 'fastOfflineQueue',

  isOnline: function () {
    return navigator.onLine;
  },

  getQueue: function () {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  addToQueue: function (type, data) {
    try {
      const queue = this.getQueue();
      queue.push({
        id: Date.now(),
        type: type, // 'order', 'status_update', 'rating'
        data: data,
        created_at: new Date().toISOString(),
        retries: 0
      });
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
      console.log('[OfflineSync] Added to queue:', type);
      return true;
    } catch (e) {
      console.error('[OfflineSync] Error adding to queue:', e);
      return false;
    }
  },

  removeFromQueue: function (itemId) {
    try {
      const queue = this.getQueue().filter(item => item.id !== itemId);
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('[OfflineSync] Error removing from queue:', e);
    }
  },

  syncAll: async function () {
    if (!this.isOnline()) {
      console.log('[OfflineSync] Still offline, skipping sync');
      return;
    }

    const queue = this.getQueue();
    if (queue.length === 0) return;

    console.log(`[OfflineSync] Syncing ${queue.length} items...`);

    for (const item of queue) {
      try {
        let success = false;

        if (item.type === 'order') {
          const { error } = await window.supabaseClient
            .from('fast_orders')
            .insert(item.data);
          success = !error;
        } else if (item.type === 'status_update') {
          const { error } = await window.supabaseClient
            .from('fast_orders')
            .update({ status: item.data.status })
            .eq('id', item.data.order_id);
          success = !error;
        } else if (item.type === 'rating') {
          const { error } = await window.supabaseClient
            .from('fast_orders')
            .update({ rating: item.data.rating, rating_comment: item.data.comment })
            .eq('id', item.data.order_id);
          success = !error;
        }

        if (success) {
          this.removeFromQueue(item.id);
          console.log(`[OfflineSync] Synced item ${item.id}`);
        } else {
          item.retries++;
          if (item.retries >= 3) {
            this.removeFromQueue(item.id);
            console.warn(`[OfflineSync] Removed item ${item.id} after 3 retries`);
          }
        }
      } catch (e) {
        console.error(`[OfflineSync] Error syncing item ${item.id}:`, e);
      }
    }
  },

  getPendingCount: function () {
    return this.getQueue().length;
  },

  showPendingBadge: function () {
    const count = this.getPendingCount();
    const badge = document.getElementById('offlinePendingBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }
};

// ========================================
// RATINGS SERVICE (Public Display)
// ========================================
window.RatingsService = {
  getPublicRatings: async function () {
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_ratings')
        .select('id, client_name, rating, comment, created_at')
        .eq('approved', true)
        .neq('archived', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('[RatingsService] Erro ao buscar avaliações:', e);
      return [];
    }
  }
};

// Local aliases for compatibility
var DataCache = window.DataCache;
var VersionService = window.VersionService;
var OrderHistoryService = window.OrderHistoryService;
var FavoritesService = window.FavoritesService;
var AddressService = window.AddressService;
var OfflineSyncService = window.OfflineSyncService;
var ClientDiscountsService = window.ClientDiscountsService; // Already window scoped previously, but good to align
var SpecialDiscountService = window.SpecialDiscountService;
var BirthdayDiscountService = window.BirthdayDiscountService;
var RatingsService = window.RatingsService;

console.log('[Services] Módulo carregado com sucesso');

window.ClientDiscountsService = {
  cache: new Map(),
  loaded: false,

  init: async function () {
    if (this.loaded) return;
    try {
      const { data } = await window.supabaseClient.from('fast_client_discounts').select('*');
      if (data) {
        data.forEach(d => this.cache.set(d.phone, d.discount_percentage));
      }
      this.loaded = true;
      console.log('[ClientDiscounts] Loaded', this.cache.size, 'discounts');
    } catch (e) { console.error('Error loading discounts', e); }
  },

  get: function (phone) {
    if (!phone) return 0;
    const p = phone.replace(/\D/g, '');
    return this.cache.get(p) || 0;
  },

  save: async function (phone, discount) {
    if (!phone) return false;
    const p = phone.replace(/\D/g, '');
    const d = parseFloat(discount) || 0;
    try {
      // Handle 0 discount by maybe removing? Or setting to 0. 
      // Upsert handles insert/update.
      const { error } = await window.supabaseClient.from('fast_client_discounts')
        .upsert({ phone: p, discount_percentage: d }, { onConflict: 'phone' });
      if (error) throw error;
      this.cache.set(p, d);
      return true;
    } catch (e) {
      console.error('Error saving discount', e);
      return false;
    }
  }
};

window.SpecialDiscountService = {
  config: null,

  getConfig: async function () {
    if (this.config) return this.config;
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_special_discounts')
        .select('*')
        .eq('store_id', 1)
        .maybeSingle();

      if (data) {
        this.config = data;
      } else {
        // Default config if none in DB
        this.config = {
          min_orders: 10,
          discount_type: 'percentage',
          discount_value: 10,
          min_order_value: 0,
          active: true
        };
      }
      return this.config;
    } catch (e) {
      console.error('[SpecialDiscount] Erro ao carregar config:', e);
      // Return default on error
      return {
        min_orders: 10,
        discount_type: 'percentage',
        discount_value: 10,
        min_order_value: 0,
        active: false // disable if error
      };
    }
  },

  saveConfig: async function (config) {
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_special_discounts')
        .upsert({
          store_id: 1,
          ...config,
          updated_at: new Date().toISOString()
        }, { onConflict: 'store_id' })
        .select();

      if (error) throw error;
      this.config = data[0];
      return true;
    } catch (e) {
      console.error('[SpecialDiscount] Erro ao salvar config:', e);
      return false;
    }
  },

  getValidOrderCount: async function (phone) {
    if (!phone) return 0;
    const phoneDigits = phone.replace(/\D/g, '');
    try {
      const { count, error } = await window.supabaseClient
        .from('fast_orders')
        .select('*', { count: 'exact', head: true })
        .eq('client_phone', phoneDigits)
        .eq('status', 'delivered');

      if (error) throw error;
      return count || 0;
    } catch (e) {
      console.error('[SpecialDiscount] Erro ao contar pedidos:', e);
      return 0;
    }
  }
};

// ========================================
// COUPON USAGE SERVICE (versão principal está mais abaixo)
// ========================================
// REMOVIDO: Definição duplicada que causava conflito

// ========================================
// BIRTHDAY DISCOUNT SERVICE
// ========================================
window.BirthdayDiscountService = {
  config: null,

  getConfig: async function () {
    if (this.config) return this.config;
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_birthday_discount')
        .select('*')
        .maybeSingle();

      if (data) {
        this.config = data;
      } else {
        this.config = { discount_type: 'percentage', discount_value: 10, active: true };
      }
      return this.config;
    } catch (e) {
      console.error('[BirthdayDiscount] Erro ao carregar config:', e);
      return { discount_type: 'percentage', discount_value: 10, active: false };
    }
  },

  saveConfig: async function (config) {
    try {
      // Delete existing and insert new
      await window.supabaseClient.from('fast_birthday_discount').delete().neq('id', 0);
      const { data, error } = await window.supabaseClient
        .from('fast_birthday_discount')
        .insert(config)
        .select()
        .single();

      if (error) throw error;
      this.config = data;
      return true;
    } catch (e) {
      console.error('[BirthdayDiscount] Erro ao salvar config:', e);
      return false;
    }
  },

  hasUsedThisYear: async function (phone) {
    if (!phone) return false;
    const phoneDigits = phone.replace(/\D/g, '');
    const currentYear = new Date().getFullYear();
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_birthday_discount_usage')
        .select('id')
        .eq('client_phone', phoneDigits)
        .eq('usage_year', currentYear)
        .maybeSingle();

      return !!data;
    } catch (e) {
      console.error('[BirthdayDiscount] Erro ao verificar uso:', e);
      return false;
    }
  },

  markUsed: async function (phone, orderId, discountAmount = 0) {
    if (!phone) return false;
    const phoneDigits = phone.replace(/\D/g, '');
    const currentYear = new Date().getFullYear();
    try {
      const { error } = await window.supabaseClient
        .from('fast_birthday_discount_usage')
        .insert({
          client_phone: phoneDigits,
          usage_year: currentYear,
          order_id: orderId,
          discount_applied: discountAmount
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[BirthdayDiscount] Erro ao marcar uso:', e);
      return false;
    }
  }
};

// ========================================
// CLIENT DISCOUNTS SERVICE (Supabase sync)
// ========================================
window.ClientDiscountsService = {
  cache: null,

  load: async function () {
    if (this.cache) return this.cache;
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_client_discounts')
        .select('*');

      if (error) throw error;

      this.cache = {};
      (data || []).forEach(d => {
        this.cache[d.phone] = d.discount_percentage;
      });
      console.log('Descontos por cliente carregados:', Object.keys(this.cache).length);
      return this.cache;
    } catch (e) {
      console.error('[ClientDiscounts] Erro ao carregar:', e);
      // Fallback to localStorage
      const saved = localStorage.getItem('fastClientDiscounts');
      this.cache = saved ? JSON.parse(saved) : {};
      return this.cache;
    }
  },

  save: async function (phone, discountPercentage) {
    if (!phone) return false;
    const phoneDigits = phone.replace(/\D/g, '');
    try {
      if (discountPercentage > 0) {
        const { error } = await window.supabaseClient
          .from('fast_client_discounts')
          .upsert({
            phone: phoneDigits,
            discount_percentage: discountPercentage,
            updated_at: new Date().toISOString()
          }, { onConflict: 'phone' });

        if (error) throw error;
        if (this.cache) this.cache[phoneDigits] = discountPercentage;
      } else {
        // Delete if 0
        await window.supabaseClient
          .from('fast_client_discounts')
          .delete()
          .eq('phone', phoneDigits);

        if (this.cache) delete this.cache[phoneDigits];
      }
      // Also update localStorage for fallback
      localStorage.setItem('fastClientDiscounts', JSON.stringify(this.cache || {}));
      return true;
    } catch (e) {
      console.error('[ClientDiscounts] Erro ao salvar:', e);
      return false;
    }
  },

  get: function (phone) {
    if (!phone) return 0;
    const phoneDigits = phone.replace(/\D/g, '');
    return this.cache?.[phoneDigits] || 0;
  }
};

// ========================================
// STORE CONFIG SERVICE
// ========================================
// ========================================
// STORE CONFIG SERVICE
// ========================================
window.StoreConfigService = {
  load: async function () {
    return this.loadHelper();
  },

  loadHelper: async function () {
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_store_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;
      if (data) {
        // Merge with defaults
        window.storeConfig = {
          ...window.storeConfig,
          // Fees & Basic
          card_fee_1x: parseFloat(data.card_fee_1x) || 5,
          card_fee_2x: parseFloat(data.card_fee_2x) || 10,
          delivery_enabled: data.delivery_enabled !== false,
          delivery_disabled_reason: data.delivery_disabled_reason || '',

          // Times
          prep_time_min: parseInt(data.prep_time_min) || 0,
          prep_time_max: parseInt(data.prep_time_max) || 0,
          delivery_time_min: parseInt(data.delivery_time_min) || 0,
          delivery_time_max: parseInt(data.delivery_time_max) || 0,
          max_concurrent_orders: parseInt(data.max_concurrent_orders) || 10,
          high_demand_extra_time: parseInt(data.high_demand_extra_time) || 15,

          // Rules & Limits (Migrated from data.js)
          min_order_delivery: parseFloat(data.min_order_delivery) || 15.00,
          min_order_pickup: parseFloat(data.min_order_pickup) || 8.00,
          min_order_pickup_offhours: parseFloat(data.min_order_pickup_offhours) || 15.00,

          // Same Day
          same_day_orders_enabled: data.same_day_orders_enabled !== false,
          same_day_min_value: parseFloat(data.same_day_min_value) || 15.00,
          same_day_pickup_start: data.same_day_pickup_start || '11:00',
          same_day_pickup_end: data.same_day_pickup_end || '18:00',

          // Morning Rule
          morning_rule_enabled: data.morning_rule_enabled !== false,
          morning_rule_end_time: data.morning_rule_end_time || '14:00',
          morning_rule_min_value: parseFloat(data.morning_rule_min_value) || 30.00,

          // Window
          order_window_start: data.order_window_start || '07:00',
          order_window_end: data.order_window_end || '18:00',

          // PIX (Admin)
          pix_key: data.pix_key || '',
          pix_merchant_name: data.pix_merchant_name || '',
          pix_merchant_city: data.pix_merchant_city || '',

          // Message Buffer (Bot)
          message_buffer_enabled: data.message_buffer_enabled === true,
          message_buffer_delay_seconds: parseInt(data.message_buffer_delay_seconds) || 5,

          // AI Config (Bot)
          ai_model_primary: data.ai_model_primary || 'gemini-2.5-flash-lite',
          ai_model_multimodal: data.ai_model_multimodal || 'gemini-2.5-flash',
          ai_temperature: parseFloat(data.ai_temperature) || 0.7,
          ai_max_output_tokens: parseInt(data.ai_max_output_tokens) || 2048,
          media_processing_enabled: data.media_processing_enabled !== false
        };
        // Ensure consistency
        window.storeConfig.card_fee_2x = window.storeConfig.card_fee_1x;
        localStorage.setItem('fastStoreConfig', JSON.stringify(window.storeConfig));
        console.log('[StoreConfig] Carregado do Supabase (Consolidado)');

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('fastStoreConfigLoaded'));
        return window.storeConfig;
      }
    } catch (e) {
      console.warn('[StoreConfig] Usando fallback/cache:', e.message);
      const saved = localStorage.getItem('fastStoreConfig');
      if (saved) {
        try { window.storeConfig = { ...window.storeConfig, ...JSON.parse(saved) }; } catch (err) { }
      }
      return window.storeConfig;
    }
  },

  save: async function (newConfig) {
    try {
      window.storeConfig = { ...window.storeConfig, ...newConfig };
      localStorage.setItem('fastStoreConfig', JSON.stringify(window.storeConfig));

      // Filter only DB columns for update (prevent error with local-only fields)
      // This is a simplified approach, ideally we filter precisely.
      // For now, we rely on the object passed being correct or upsert ignoring extras if configured (Supabase doesn't ignore by default).
      // We will construct the update object safely.

      const updatePayload = {
        id: 1,
        updated_at: new Date().toISOString()
      };

      // Merge safe known fields
      const safeFields = [
        'card_fee_1x', 'card_fee_2x', 'delivery_enabled', 'delivery_disabled_reason',
        'prep_time_min', 'prep_time_max', 'delivery_time_min', 'delivery_time_max',
        'max_concurrent_orders', 'high_demand_extra_time',
        'min_order_delivery', 'min_order_pickup', 'min_order_pickup_offhours',
        'same_day_orders_enabled', 'same_day_min_value', 'same_day_pickup_start', 'same_day_pickup_end',
        'morning_rule_enabled', 'morning_rule_end_time', 'morning_rule_min_value',
        'order_window_start', 'order_window_end', 'pix_key', 'pix_merchant_name', 'pix_merchant_city',
        'message_buffer_enabled', 'message_buffer_delay_seconds',
        'ai_model_primary', 'ai_model_multimodal', 'ai_temperature', 'ai_max_output_tokens',
        'media_processing_enabled'
      ];

      safeFields.forEach(field => {
        if (window.storeConfig[field] !== undefined) {
          updatePayload[field] = window.storeConfig[field];
        }
      });

      const { error } = await window.supabaseClient
        .from('fast_store_config')
        .upsert(updatePayload);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[StoreConfig] Erro ao salvar:', e);
      return false;
    }
  }
};

// ========================================
// PRODUCT SERVICE (Consolidated Fetching)
// ========================================
window.ProductService = {
  fetchAll: async function () {
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
        // Use global mapper (now in utils.js)
        let serverProducts = data.map(window.mapProductData || (p => p));

        // Smart Cache Merge (preserve cached images/info if offline-ish or to save bandwidth)
        // But specifically, data.js usage was to keep cached images while updating prices.
        const cached = window.DataCache.get('products');
        if (cached && cached.items && cached.items.length > 0) {
          serverProducts = window.DataCache.mergeWithCriticalData(serverProducts, cached.items);
        }

        console.log('[ProductService] ✅ Carregados:', serverProducts.length);

        const serverVersion = await window.VersionService.getServerVersion('products');
        window.DataCache.set('products', serverProducts, serverVersion || 1);
        localStorage.setItem('fastProducts', JSON.stringify(serverProducts));

        // Hide cache notice if visible
        const cacheNotice = document.getElementById('cacheNotice');
        if (cacheNotice) cacheNotice.classList.add('hidden');

        return serverProducts;
      } else {
        console.error('[ProductService] ⚠️ Supabase retornou vazio - mantendo dados existentes');
        // Fallback to cache/local
        return this.loadFromCache();
      }
    } catch (error) {
      console.error('[ProductService] Erro ao carregar:', error);
      return this.loadFromCache();
    }
  },

  loadFromCache: function () {
    const cached = window.DataCache.get('products');
    if (cached && cached.items && cached.items.length > 0) {
      console.log('[ProductService] Usando cache DataCache');
      return cached.items;
    }
    const saved = localStorage.getItem('fastProducts');
    if (saved) {
      console.log('[ProductService] Usando localStorage legado');
      return JSON.parse(saved);
    }
    return [];
  }
};

// ========================================
// COUPON USAGE SERVICE (single use per phone)
// ========================================
window.CouponUsageService = {
  hasUsed: async function (phone, couponCode) {
    if (!phone || !couponCode) return false;
    const phoneDigits = phone.replace(/\D/g, '');
    const couponUpper = couponCode.toUpperCase();

    try {
      // 1. Verificar na tabela de uso de cupons (fast_coupon_usage)
      const { data: usageData } = await window.supabaseClient
        .from('fast_coupon_usage')
        .select('id')
        .eq('client_phone', phoneDigits)
        .eq('coupon_code', couponUpper)
        .maybeSingle();

      if (usageData) {
        console.log('[CouponUsage] Cupom já usado (tabela usage):', couponUpper);
        return true;
      }

      // 2. Verificar nos pedidos existentes (fallback histórico)
      const { data: ordersData, error: ordersError } = await window.supabaseClient
        .from('fast_orders')
        .select('id, coupon_code, client_phone')
        .not('coupon_code', 'is', null)
        .neq('coupon_code', '');

      if (ordersError) {
        console.error('[CouponUsage] Erro na query de pedidos:', ordersError);
      }

      if (ordersData && ordersData.length > 0) {
        const usedInOrder = ordersData.some(order => {
          const orderCoupon = (order.coupon_code || '').toUpperCase().trim();
          if (orderCoupon !== couponUpper) return false;

          const orderPhone = (order.client_phone || '').replace(/\D/g, '');
          return orderPhone === phoneDigits ||
            (orderPhone.length >= 8 && phoneDigits.includes(orderPhone.slice(-8)));
        });

        if (usedInOrder) {
          console.log('[CouponUsage] Cupom já usado em pedido anterior (histórico):', couponUpper, 'telefone:', phoneDigits);
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error('[CouponUsage] Erro ao verificar:', e);
      return false;
    }
  },

  markUsed: async function (phone, couponCode, orderId, discountValue) {
    if (!phone || !couponCode) return false;
    const phoneDigits = phone.replace(/\D/g, '');
    const couponUpper = couponCode.toUpperCase();
    try {
      // 1. Registrar uso na tabela fast_coupon_usage
      const { error } = await window.supabaseClient
        .from('fast_coupon_usage')
        .insert({
          client_phone: phoneDigits,
          coupon_code: couponUpper,
          order_id: orderId,
          discount_applied: discountValue || 0
        });

      if (error) {
        console.error('[CouponUsage] Erro SQL ao marcar:', error);
        throw error;
      }

      // 2. Incrementar usage_count no cupom (fast_coupons)
      try {
        const { data: coupon, error: fetchError } = await window.supabaseClient
          .from('fast_coupons')
          .select('id, usage_count')
          .eq('code', couponUpper)
          .single();

        if (!fetchError && coupon) {
          await window.supabaseClient
            .from('fast_coupons')
            .update({ usage_count: (coupon.usage_count || 0) + 1 })
            .eq('id', coupon.id);
          console.log('[CouponUsage] usage_count incrementado para:', couponUpper);
        }
      } catch (e2) {
        console.warn('[CouponUsage] Erro ao incrementar usage_count:', e2);
      }

      return true;
    } catch (e) {
      console.error('[CouponUsage] Erro geral ao marcar:', e);
      return false;
    }
  }
};



window.RatingsModule = {
  // State
  cache: null,
  adminData: [],
  adminFilter: 'all', // 'all', 'pending', 'published', 'archived'
  adminStarFilter: 0, // 0 = all, 1-5 = specific star

  // ========================================
  // DATABASE OPERATIONS
  // ========================================

  // Check if rating already exists for order_code + phone
  checkExists: async function (orderCode, phone) {
    try {
      const phoneDigits = (phone || '').replace(/\D/g, '');
      const { data, error } = await window.supabaseClient
        .from('fast_ratings')
        .select('id, rating, comment')
        .eq('order_code', orderCode)
        .eq('phone', phoneDigits)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (e) {
      console.warn('[Ratings] Erro ao verificar existência:', e);
      return null;
    }
  },

  // Submit a new rating (from customer)
  submit: async function (data) {
    try {
      const phoneDigits = (data.phone || '').replace(/\D/g, '');

      // Check for duplicate
      const existing = await this.checkExists(data.orderCode, phoneDigits);
      if (existing) {
        console.log('[Ratings] Avaliação já existe para este pedido');
        return { success: false, duplicate: true, existing };
      }

      // Get user agent for tracking
      const userAgent = navigator.userAgent || 'unknown';

      const { error } = await window.supabaseClient
        .from('fast_ratings')
        .insert({
          order_code: data.orderCode,
          phone: phoneDigits,
          client_name: data.clientName,
          rating: data.rating,
          comment: data.comment,
          status: 'pending',
          user_agent: userAgent
          // approved defaults to false usually
        });

      if (error) throw error;
      console.log('[Ratings] Avaliação salva com sucesso');
      return { success: true };
    } catch (e) {
      console.error('[Ratings] Erro ao salvar:', e);
      return { success: false, error: e };
    }
  },

  // Load all ratings for admin
  loadAll: async function () {
    try {
      const { data, error } = await window.supabaseClient
        .from('fast_ratings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Normalize data (handle legacy approved boolean vs status string)
      this.adminData = (data || []).map(r => {
        // If status is present, use it. If not, infer from approved.
        // If neither, default to pending.
        let normalizedStatus = r.status;
        if (!normalizedStatus) {
          if (r.approved === true) normalizedStatus = 'published';
          else if (r.approved === false) normalizedStatus = 'pending'; // or archived?
          else normalizedStatus = 'pending';
        }
        return { ...r, status: normalizedStatus };
      });

      console.log('[Ratings] Carregados:', this.adminData.length, 'Normalizados:', this.adminData.map(d => d.status));
      return this.adminData;
    } catch (e) {
      console.error('[Ratings] Erro ao carregar:', e);
      this.adminData = [];
      return [];
    }
  },

  // Load only published ratings (for landing page)
  loadPublished: async function () {
    // Always try to fetch fresh data first
    try {
      console.log('[Ratings] Buscando avaliações publicadas (fresh)...');
      // Query both status='published' OR approved=true for compatibility
      const { data, error } = await window.supabaseClient
        .from('fast_ratings')
        .select('*')
        .or('status.eq.published,approved.eq.true')
        .order('created_at', { ascending: false }) // Use created_at if published_at missing
        .limit(6);

      if (error) throw error;
      this.cache = data || [];
      // Update cache only after successful fetch
      localStorage.setItem('fastPublishedRatings', JSON.stringify(this.cache));
      console.log('[Ratings] Dados frescos carregados:', this.cache.length);
      return this.cache;
    } catch (e) {
      console.warn('[Ratings] Erro ao carregar publicados, usando cache:', e);
      const cached = localStorage.getItem('fastPublishedRatings');
      return cached ? JSON.parse(cached) : [];
    }
  },

  // ========================================
  // ADMIN ACTIONS
  // ========================================

  publish: async function (id) {
    try {
      console.log('[Ratings] Publicando avaliação ID:', id);
      const { data, error } = await window.supabaseClient
        .from('fast_ratings')
        .update({
          status: 'published',
          approved: true, // Legacy compatibility
          published_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('[Ratings] Erro Supabase ao publicar:', error);
        throw error;
      }
      console.log('[Ratings] Resultado da publicação:', data);
      // Update local data
      const item = this.adminData.find(r => r.id === id);
      if (item) {
        item.status = 'published';
        item.approved = true;
        item.published_at = new Date().toISOString();
      }
      return true;
    } catch (e) {
      console.error('[Ratings] Erro ao publicar:', e);
      return false;
    }
  },

  archive: async function (id) {
    try {
      const { error } = await window.supabaseClient
        .from('fast_ratings')
        .update({ status: 'archived', approved: false }) // Unapprove too
        .eq('id', id);

      if (error) throw error;
      // Update local data
      const item = this.adminData.find(r => r.id === id);
      if (item) {
        item.status = 'archived';
        item.approved = false;
      }
      return true;
    } catch (e) {
      console.error('[Ratings] Erro ao arquivar:', e);
      return false;
    }
  },

  reply: async function (id, replyText) {
    try {
      const { error } = await window.supabaseClient
        .from('fast_ratings')
        .update({ admin_reply: replyText })
        .eq('id', id);

      if (error) throw error;
      // Update local data
      const item = this.adminData.find(r => r.id === id);
      if (item) item.admin_reply = replyText;
      return true;
    } catch (e) {
      console.error('[Ratings] Erro ao responder:', e);
      return false;
    }
  },

  // ========================================
  // UI HELPERS
  // ========================================

  formatDate: function (dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return dateStr; }
  },

  formatStars: function (rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  },

  // ========================================
  // PUBLIC LANDING RENDERING
  // ========================================

  renderPublicRatings: function (ratings, container) {
    if (!container) return;

    if (!ratings || ratings.length === 0) {
      container.innerHTML = `
        <div class="text-white/60 text-sm italic text-center py-4">
          <p>Seja o primeiro a avaliar!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = ratings.map(r => {
      const stars = this.formatStars(r.rating);
      const truncatedComment = r.comment && r.comment.length > 80
        ? r.comment.substring(0, 80) + '...'
        : (r.comment || '');

      return `
        <div class="bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-white/20">
          <div class="flex items-center justify-between mb-1">
            <p class="font-semibold text-gray-800 text-xs truncate max-w-[100px]">${r.client_name || 'Cliente'}</p>
            <p class="text-yellow-500 text-xs">${stars}</p>
          </div>
          <p class="text-gray-600 text-xs leading-relaxed line-clamp-2">"${truncatedComment}"</p>
          ${r.admin_reply ? `
            <div class="mt-1 pt-1 border-t border-gray-200">
              <p class="text-xs text-rose-600 italic truncate">💬 ${r.admin_reply}</p>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  // ========================================
  // ADMIN PANEL RENDERING
  // ========================================

  renderAdminRatings: function () {
    const list = document.getElementById('ratingsList');
    if (!list) {
      console.warn('[Ratings] ratingsList container não encontrado');
      return;
    }

    let filtered = this.adminData || [];

    // Status filter
    if (this.adminFilter !== 'all') {
      filtered = filtered.filter(r => r.status === this.adminFilter);
    }

    // Star filter
    if (this.adminStarFilter > 0) {
      filtered = filtered.filter(r => r.rating >= this.adminStarFilter);
    }

    console.log('[Ratings] Render filter:', this.adminFilter, 'Total:', this.adminData.length, 'Shown:', filtered.length);

    if (filtered.length === 0) {
      const msg = this.adminFilter === 'all'
        ? 'Nenhuma avaliação recebida.'
        : `Nenhuma avaliação encontrada em "${this.getFilterLabel(this.adminFilter)}".`;

      list.innerHTML = `
        <div class="text-center py-12 text-gray-500 w-full col-span-3">
          <p class="text-4xl mb-2">⭐</p>
          <p>${msg}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(r => {
      const stars = this.formatStars(r.rating);
      const statusBadge = r.status === 'published'
        ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full border border-green-200">✓ Publicado</span>'
        : r.status === 'archived'
          ? '<span class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full border border-gray-300">Arquivado</span>'
          : '<span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full border border-yellow-200">⏳ Pendente</span>';

      const dateFormatted = this.formatDate(r.created_at);
      const ratingBadge = `<span class="px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded-full font-medium whitespace-nowrap border border-yellow-100">${r.rating} ⭐</span>`;

      return `
        <tr class="hover:bg-gray-50 transition-colors border-b last:border-0" data-rating-id="${r.id}">
            <td class="p-4 align-top w-1/4">
                <div class="flex flex-col gap-1">
                    <p class="font-semibold text-gray-800">${r.client_name || 'Anônimo'}</p>
                    <div class="flex items-center gap-2">
                        ${ratingBadge}
                    </div>
                    <p class="text-yellow-500 text-lg tracking-wide">${stars}</p>
                    ${r.order_code ? `<p class="text-xs text-gray-500">📦 ${r.order_code}</p>` : ''}
                    <p class="text-xs text-gray-400 mt-1">${dateFormatted}</p>
                </div>
            </td>
            <td class="p-4 align-top">
                <p class="text-gray-700 text-sm mb-3 whitespace-pre-wrap">${r.comment || '<span class="text-gray-400 italic">Sem comentário</span>'}</p>
                ${r.admin_reply ? `
                    <div class="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-2 border border-blue-100">
                    💬 <strong>Sua resposta:</strong> ${r.admin_reply}
                    </div>
                ` : ''}
                
                <!-- Inline Reply Input -->
                <div id="replyInput_${r.id}" class="hidden mt-3 flex gap-2 items-start">
                    <textarea id="replyText_${r.id}" placeholder="Digite sua resposta..." class="flex-1 px-3 py-2 border rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none" rows="2"></textarea>
                    <div class="flex flex-col gap-2">
                        <button onclick="RatingsModule.sendReply(${r.id})" class="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg whitespace-nowrap">Enviar</button>
                        <button onclick="RatingsModule.toggleReplyInput(${r.id})" class="px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs rounded-lg whitespace-nowrap">Cancelar</button>
                    </div>
                </div>
            </td>
            <td class="p-4 align-top text-right w-48">
                <div class="flex flex-col items-end gap-2">
                    ${statusBadge}
                    <div class="flex flex-wrap justify-end gap-2 mt-2">
                        ${r.status === 'pending' ? `
                        <button onclick="RatingsModule.handlePublish(${r.id})" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition shadow-sm w-full">✓ Publicar</button>
                        <button onclick="RatingsModule.handleArchive(${r.id})" class="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded-lg transition shadow-sm w-full">Arquivar</button>
                        ` : ''}
                        ${r.status === 'published' ? `
                        <button onclick="RatingsModule.handleArchive(${r.id})" class="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded-lg transition shadow-sm w-full">Arquivar</button>
                        ` : ''}
                        ${r.status === 'archived' ? `
                        <button onclick="RatingsModule.handlePublish(${r.id})" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition shadow-sm w-full">Republicar</button>
                        ` : ''}
                        
                        <button onclick="RatingsModule.toggleReplyInput(${r.id})" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition shadow-sm w-full">💬 Responder</button>
                    </div>
                </div>
            </td>
        </tr>
      `;
    }).join('');
  },

  getFilterLabel: function (filter) {
    const labels = {
      'all': 'Todas',
      'pending': 'Pendentes',
      'published': 'Publicadas',
      'archived': 'Arquivadas'
    };
    return labels[filter] || filter;
  },

  // ========================================
  // ADMIN EVENT HANDLERS
  // ========================================

  handlePublish: async function (id) {
    const success = await this.publish(id);
    if (success) {
      this.showMessage('✅ Avaliação publicada!', 'success');
      this.renderAdminRatings();
    } else {
      this.showMessage('❌ Erro ao publicar.', 'error');
    }
  },

  handleArchive: async function (id) {
    const success = await this.archive(id);
    if (success) {
      this.showMessage('✅ Avaliação arquivada.', 'success');
      this.renderAdminRatings();
    } else {
      this.showMessage('❌ Erro ao arquivar.', 'error');
    }
  },

  handleReply: function (id) {
    this.toggleReplyInput(id);
  },

  toggleReplyInput: function (id) {
    const container = document.getElementById(`replyInput_${id}`);
    if (container) {
      container.classList.toggle('hidden');
      if (!container.classList.contains('hidden')) {
        const input = document.getElementById(`replyText_${id}`);
        if (input) input.focus();
      }
    }
  },

  sendReply: async function (id) {
    const input = document.getElementById(`replyText_${id}`);
    if (!input) return;

    const replyText = input.value.trim();
    if (!replyText) {
      this.showMessage('Digite uma resposta.', 'error');
      return;
    }

    const success = await this.reply(id, replyText);
    if (success) {
      this.showMessage('✅ Resposta enviada!', 'success');
      this.renderAdminRatings(); // Updates UI
    } else {
      this.showMessage('❌ Erro ao responder.', 'error');
    }
  },

  setStatusFilter: function (filter) {
    this.adminFilter = filter;
    // Update button styles (Legacy)
    document.querySelectorAll('.rating-filter-btn').forEach(btn => {
      btn.classList.toggle('bg-rose-600', btn.dataset.filter === filter);
      btn.classList.toggle('text-white', btn.dataset.filter === filter);
      btn.classList.toggle('bg-gray-200', btn.dataset.filter !== filter);
      btn.classList.toggle('text-gray-700', btn.dataset.filter !== filter);
    });

    // Update button styles (New IDs)
    const btns = {
      all: document.getElementById('ratingsFilterAll'),
      pending: document.getElementById('ratingsFilterPending'),
      published: document.getElementById('ratingsFilterPublished'),
      archived: document.getElementById('ratingsFilterArchived')
    };

    Object.entries(btns).forEach(([k, btn]) => {
      if (!btn) return;
      const isActive = k === filter;
      if (isActive) {
        btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200', 'hover:bg-gray-50');
        btn.classList.add('bg-rose-600', 'text-white', 'border-rose-600');
      } else {
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-200', 'hover:bg-gray-50');
        btn.classList.remove('bg-rose-600', 'text-white', 'border-rose-600');
      }
    });

    this.renderAdminRatings();
  },

  // Alias for compatibility
  setFilter: function (filter) {
    this.setStatusFilter(filter);
  },

  setStarFilter: function (stars) {
    this.adminStarFilter = stars;
    document.querySelectorAll('.star-filter-btn').forEach(btn => {
      const btnStars = parseInt(btn.dataset.stars, 10);
      btn.classList.toggle('ring-2', btnStars === stars);
      btn.classList.toggle('ring-rose-500', btnStars === stars);
    });
    this.renderAdminRatings();
  },

  showMessage: function (text, type) {
    const msg = document.getElementById('ratingsMessage');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'mb-4 p-3 rounded-lg text-sm text-center font-medium';
    if (type === 'success') msg.classList.add('bg-green-100', 'text-green-700', 'border', 'border-green-200');
    else if (type === 'error') msg.classList.add('bg-red-100', 'text-red-700', 'border', 'border-red-200');
    else msg.classList.add('bg-blue-100', 'text-blue-700', 'border', 'border-blue-200');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
  },

  // ========================================
  // INITIALIZATION
  // ========================================

  initPublicRatings: async function () {
    const container = document.getElementById('testimonialsContainer');
    if (!container) return;

    try {
      console.log('[Ratings] Carregando avaliações publicadas...');
      const ratings = await this.loadPublished();
      this.renderPublicRatings(ratings, container);
    } catch (e) {
      console.error('[Ratings] Erro ao inicializar públicas:', e);
    }
  },

  initAdminPanel: async function () {
    const panel = document.getElementById('ratingsPanelFast');
    const list = document.getElementById('ratingsList');

    if (!panel || !list) {
      console.warn('[Ratings] Painel admin não encontrado');
      return;
    }

    try {
      console.log('[Ratings] Carregando avaliações para admin...');
      await this.loadAll();
      this.renderAdminRatings();
    } catch (e) {
      console.error('[Ratings] Erro ao carregar admin:', e);
      list.innerHTML = `
        <div class="text-center py-12 text-red-500 w-full col-span-3">
          <p class="text-4xl mb-2">⚠️</p>
          <p>Erro ao carregar avaliações.</p>
        </div>
      `;
    }
  }
};

// Global function aliases for onclick handlers (Admin only)
if (typeof RatingsModule !== 'undefined') {
  window.loadPublicRatings = function () { return RatingsModule.initPublicRatings(); };
  window.loadRatings = function () { return RatingsModule.initAdminPanel(); };
  window.renderRatings = function () { return RatingsModule.renderAdminRatings(); };
  window.publishRating = function (id) { return RatingsModule.handlePublish(id); };
  window.archiveRating = function (id) { return RatingsModule.handleArchive(id); };
  window.promptReplyRating = function (id) { return RatingsModule.handleReply(id); };
  window.showRatingsMessage = function (text, type) { return RatingsModule.showMessage(text, type); };
}

// ========================================

// Global window bindings for all extracted services
window.SpecialDiscountService = typeof SpecialDiscountService !== 'undefined' ? SpecialDiscountService : null;
window.BirthdayDiscountService = typeof BirthdayDiscountService !== 'undefined' ? BirthdayDiscountService : null;
window.ClientDiscountsService = typeof ClientDiscountsService !== 'undefined' ? ClientDiscountsService : null;
window.CouponUsageService = typeof CouponUsageService !== 'undefined' ? CouponUsageService : null;
window.StoreConfigService = typeof StoreConfigService !== 'undefined' ? StoreConfigService : null;
window.RatingsModule = typeof RatingsModule !== 'undefined' ? RatingsModule : null;
window.RatingsService = typeof RatingsService !== 'undefined' ? RatingsService : null;
window.ProductOptionsModule = typeof ProductOptionsModule !== 'undefined' ? ProductOptionsModule : null;

console.log('[Services] Extended services exposed globally');

// Auto-load store config on page load (after all services defined)
if (window.StoreConfigService) {
  window.StoreConfigService.loadHelper();
}

// ========================================
// ADMIN NAVIGATION HELPER
// ========================================
/**
 * Navigate back to admin panel preserving the session.
 * Uses URL hash #bypass to signal admin.js to skip login.
 */
window.goBackToAdmin = function () {
  // The session is preserved in sessionStorage (fastAdmin, fastRole)
  // Navigate to admin.html with bypass hash
  window.location.href = 'admin.html#bypass';
};


// ========================================
// BACKGROUND SYNC SERVICE
// ========================================
var _backgroundSyncInterval;

window.startBackgroundVersionSync = function () {
  // Só roda na loja pública, não no admin
  if (sessionStorage.getItem('fastAdmin') === '1') {
    console.log('[BackgroundSync] Admin detectado, sync desativado');
    return;
  }

  // Evita múltiplos intervalos
  if (_backgroundSyncInterval) return;

  // Check a cada 2 minutos (reduzido para dados críticos como preços)
  _backgroundSyncInterval = setInterval(async () => {
    // Verifica se OfflineSyncService está disponível e online
    if (typeof OfflineSyncService !== 'undefined' && typeof OfflineSyncService.isOnline === 'function' && !OfflineSyncService.isOnline()) return;

    console.log('[BackgroundSync] 🔄 Verificando atualizações de preços...');

    // Verifica produtos - se versão mudou, recarrega com preços atuais
    if (typeof DataCache !== 'undefined' && typeof VersionService !== 'undefined') {
      const cachedProducts = DataCache.get('products');
      if (cachedProducts) {
        const serverVersion = await VersionService.getServerVersion('products');
        if (serverVersion !== null && serverVersion !== cachedProducts.version) {
          console.log('[BackgroundSync] 💰 Versão mudou! Atualizando preços...');
          // Limpa caches antigos
          if (typeof DataCache.clearProductCaches === 'function') {
            DataCache.clearProductCaches();
          }
          // Recarrega produtos do zero
          if (typeof fetchProductsFromSupabase === 'function') {
            await fetchProductsFromSupabase();
          } else if (typeof window.loadProductsPublic === 'function') {
            await window.loadProductsPublic();
          }
        }
      }
    }
  }, 120000); // 2 minutos

  console.log('[BackgroundSync] Serviço iniciado');
};

// ========================================
// PUBLIC PROMOTIONS SERVICE
// ========================================
window.PublicPromotionsService = {
  /**
   * Load active promotions from fast_promotions table for public display
   * This sets window.promotions which is used by products.js to show discount badges
   */
  loadPromotions: async function () {
    try {
      if (!window.supabaseClient) {
        console.warn('[PublicPromotions] Supabase não disponível');
        return;
      }

      const { data, error } = await window.supabaseClient
        .from('fast_promotions')
        .select('*')
        .eq('active', true);

      if (error) {
        console.warn('[PublicPromotions] Erro ao carregar:', error);
        return;
      }

      if (data && data.length > 0) {
        // Map to the format expected by products.js
        // Ensure productId is parsed as integer for correct comparison with product.id
        window.promotions = data.map(p => ({
          id: p.id,
          productId: parseInt(p.product_id, 10) || p.product_id,
          type: p.discount_type || 'percentage',
          value: Number(p.value) || 0,
          active: p.active
        }));
        console.log('[PublicPromotions] Carregadas:', window.promotions.length, 'promoções ativas');
        console.log('[PublicPromotions] Dados:', window.promotions);
      } else {
        window.promotions = [];
        console.log('[PublicPromotions] Nenhuma promoção ativa');
      }

      // Re-render products to apply new promotions
      if (typeof loadProductsPublic === 'function') {
        loadProductsPublic();
      }

    } catch (e) {
      console.error('[PublicPromotions] Erro:', e);
    }
  },

  /**
   * Initialize - call on page load for public store
   */
  init: async function () {
    await this.loadPromotions();
  }
};

// Auto-init for public store (not admin)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Only init for public store, not admin
    if (sessionStorage.getItem('fastAdmin') !== '1') {
      console.log('[PublicPromotions] Iniciando carregamento de promoções...');
      window.PublicPromotionsService.init();
    }
  });
}

