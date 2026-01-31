// ========================================
// RULES & SECURITY MODULE (ADMIN)
// ========================================

window.RulesModule = {
    config: null,
    blockedDates: [],

    /**
     * Load rules configuration from Supabase
     */
    loadConfig: async function () {
        try {
            if (!window.supabaseClient) {
                console.warn('[Rules] Supabase not available');
                return this.loadFromLocalStorage();
            }

            const { data, error } = await window.supabaseClient
                .from('fast_store_config')
                .select('*')
                .eq('id', 1)
                .maybeSingle();

            if (error) throw error;

            this.config = data || this.getDefaults();
            localStorage.setItem('fastRulesConfig', JSON.stringify(this.config));
            return this.config;
        } catch (e) {
            console.error('[Rules] Error loading config:', e);
            return this.loadFromLocalStorage();
        }
    },

    loadFromLocalStorage: function () {
        try {
            const saved = localStorage.getItem('fastRulesConfig');
            this.config = saved ? JSON.parse(saved) : this.getDefaults();
        } catch (e) {
            this.config = this.getDefaults();
        }
        return this.config;
    },

    getDefaults: function () {
        return {
            min_order_delivery: 15.00,
            min_order_pickup: 8.00,
            min_order_pickup_offhours: 15.00,
            same_day_orders_enabled: true,
            same_day_min_value: 15.00,
            same_day_pickup_start: '12:00',
            same_day_pickup_end: '18:00',
            order_window_start: '07:00',
            order_window_end: '18:00',
            morning_rule_enabled: true,
            morning_rule_end_time: '12:00',
            morning_rule_min_value: 25.00,
            max_concurrent_orders: 10
        };
    },

    /**
     * Load blocked dates from Supabase
     */
    loadBlockedDates: async function () {
        try {
            if (!window.supabaseClient) return [];

            const { data, error } = await window.supabaseClient
                .from('fast_blocked_dates')
                .select('*')
                .order('blocked_date', { ascending: true });

            if (error) {
                // Table may not exist yet - that's ok
                console.warn('[Rules] Blocked dates table not available:', error.message);
                return [];
            }

            this.blockedDates = data || [];
            return this.blockedDates;
        } catch (e) {
            console.warn('[Rules] Error loading blocked dates:', e);
            return [];
        }
    },

    /**
     * Save rules configuration to Supabase
     */
    saveConfig: async function () {
        const updates = {
            id: 1,
            min_order_delivery: parseFloat(document.getElementById('ruleMinDelivery')?.value) || 15,
            min_order_pickup: parseFloat(document.getElementById('ruleMinPickup')?.value) || 8,
            min_order_pickup_offhours: parseFloat(document.getElementById('ruleMinPickupOffhours')?.value) || 15,
            same_day_orders_enabled: document.getElementById('ruleSameDayEnabled')?.checked ?? true,
            same_day_min_value: parseFloat(document.getElementById('ruleSameDayMinValue')?.value) || 15,
            same_day_pickup_start: document.getElementById('ruleSameDayStart')?.value || '12:00',
            same_day_pickup_end: document.getElementById('ruleSameDayEnd')?.value || '18:00',
            order_window_start: document.getElementById('ruleOrderWindowStart')?.value || '07:00',
            order_window_end: document.getElementById('ruleOrderWindowEnd')?.value || '18:00',
            morning_rule_enabled: document.getElementById('ruleMorningEnabled')?.checked ?? true,
            morning_rule_end_time: document.getElementById('ruleMorningEndTime')?.value || '12:00',
            morning_rule_min_value: parseFloat(document.getElementById('ruleMorningMinValue')?.value) || 25,
            max_concurrent_orders: parseInt(document.getElementById('ruleMaxConcurrentOrders')?.value) || 10,
            updated_at: new Date().toISOString()
        };

        // Save locally first
        localStorage.setItem('fastRulesConfig', JSON.stringify(updates));
        this.config = updates;

        if (!window.supabaseClient) {
            showToast('Regras salvas localmente (Supabase indisponível)', 'warning');
            return true;
        }

        try {
            const { error } = await window.supabaseClient
                .from('fast_store_config')
                .upsert(updates);

            if (error) throw error;

            showToast('Regras salvas com sucesso!', 'success');
            return true;
        } catch (e) {
            console.error('[Rules] Error saving config:', e);
            showToast('Erro ao salvar regras: ' + e.message, 'error');
            return false;
        }
    },

    /**
     * Add a blocked date
     */
    addBlockedDate: async function () {
        const dateInput = document.getElementById('ruleBlockedDateInput');
        const reasonInput = document.getElementById('ruleBlockedDateReason');

        if (!dateInput?.value) {
            showToast('Selecione uma data para bloquear', 'error');
            return;
        }

        const blockedDate = dateInput.value;
        const reason = reasonInput?.value?.trim() || 'Bloqueado pelo administrador';

        if (!window.supabaseClient) {
            showToast('Supabase não disponível', 'error');
            return;
        }

        try {
            const { error } = await window.supabaseClient
                .from('fast_blocked_dates')
                .upsert({
                    blocked_date: blockedDate,
                    reason: reason,
                    created_at: new Date().toISOString()
                }, { onConflict: 'blocked_date' });

            if (error) throw error;

            showToast('Data bloqueada com sucesso!', 'success');
            dateInput.value = '';
            reasonInput.value = '';
            await this.loadBlockedDates();
            this.renderBlockedDates();
        } catch (e) {
            console.error('[Rules] Error adding blocked date:', e);
            showToast('Erro ao bloquear data: ' + e.message, 'error');
        }
    },

    /**
     * Remove a blocked date
     */
    removeBlockedDate: async function (dateStr) {
        if (!window.supabaseClient) {
            showToast('Supabase não disponível', 'error');
            return;
        }

        const confirmed = await showConfirm('Deseja desbloquear esta data?');
        if (!confirmed) return;

        try {
            const { error } = await window.supabaseClient
                .from('fast_blocked_dates')
                .delete()
                .eq('blocked_date', dateStr);

            if (error) throw error;

            showToast('Data desbloqueada!', 'success');
            await this.loadBlockedDates();
            this.renderBlockedDates();
        } catch (e) {
            console.error('[Rules] Error removing blocked date:', e);
            showToast('Erro ao desbloquear: ' + e.message, 'error');
        }
    },

    /**
     * Render admin form with current values
     */
    renderAdminForm: function () {
        const c = this.config || this.getDefaults();

        // Minimum order values
        const minDelivery = document.getElementById('ruleMinDelivery');
        const minPickup = document.getElementById('ruleMinPickup');
        const minPickupOffhours = document.getElementById('ruleMinPickupOffhours');
        if (minDelivery) minDelivery.value = c.min_order_delivery || 15;
        if (minPickup) minPickup.value = c.min_order_pickup || 8;
        if (minPickupOffhours) minPickupOffhours.value = c.min_order_pickup_offhours || 15;

        // Same day orders
        const sameDayEnabled = document.getElementById('ruleSameDayEnabled');
        const sameDayMinValue = document.getElementById('ruleSameDayMinValue');
        const sameDayStart = document.getElementById('ruleSameDayStart');
        const sameDayEnd = document.getElementById('ruleSameDayEnd');
        if (sameDayEnabled) sameDayEnabled.checked = c.same_day_orders_enabled !== false;
        if (sameDayMinValue) sameDayMinValue.value = c.same_day_min_value || 15;
        if (sameDayStart) sameDayStart.value = c.same_day_pickup_start || '12:00';
        if (sameDayEnd) sameDayEnd.value = c.same_day_pickup_end || '18:00';

        // Order window
        const windowStart = document.getElementById('ruleOrderWindowStart');
        const windowEnd = document.getElementById('ruleOrderWindowEnd');
        if (windowStart) windowStart.value = c.order_window_start || '07:00';
        if (windowEnd) windowEnd.value = c.order_window_end || '18:00';

        // Morning rule
        const morningEnabled = document.getElementById('ruleMorningEnabled');
        const morningEndTime = document.getElementById('ruleMorningEndTime');
        const morningMinValue = document.getElementById('ruleMorningMinValue');
        if (morningEnabled) morningEnabled.checked = c.morning_rule_enabled !== false;
        if (morningEndTime) morningEndTime.value = c.morning_rule_end_time || '12:00';
        if (morningMinValue) morningMinValue.value = c.morning_rule_min_value || 25;

        // Max concurrent orders
        const maxOrders = document.getElementById('ruleMaxConcurrentOrders');
        if (maxOrders) maxOrders.value = c.max_concurrent_orders || 10;
    },

    /**
     * Render blocked dates list
     */
    renderBlockedDates: function () {
        const container = document.getElementById('blockedDatesList');
        if (!container) return;

        if (!this.blockedDates || this.blockedDates.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500 py-4 text-center">Nenhuma data bloqueada.</p>';
            return;
        }

        const formatDate = (dateStr) => {
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        };

        container.innerHTML = this.blockedDates.map(item => `
            <div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg mb-2">
                <div>
                    <span class="font-medium text-gray-800">${formatDate(item.blocked_date)}</span>
                    <span class="text-xs text-gray-500 ml-2">${item.reason || ''}</span>
                </div>
                <button onclick="RulesModule.removeBlockedDate('${item.blocked_date}')"
                    class="text-red-500 hover:text-red-700 text-sm font-medium">Remover</button>
            </div>
        `).join('');
    },

    /**
     * Initialize the Rules panel
     */
    init: async function () {
        await this.loadConfig();
        await this.loadBlockedDates();
        this.renderAdminForm();
        this.renderBlockedDates();
        console.log('[Rules] Module initialized');
    }
};

// Auto-init when panel is shown
document.addEventListener('DOMContentLoaded', function () {
    // Will be called by showPanel when rulesPanelFast is shown
});

// Global exports
window.handleSaveRules = function () {
    RulesModule.saveConfig();
};

window.handleAddBlockedDate = function () {
    RulesModule.addBlockedDate();
};
