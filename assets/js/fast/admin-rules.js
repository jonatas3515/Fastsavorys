/**
 * Fast Savory's - Admin Rules Module
 * Handles the rules panel logic (blocked dates, panic button, etc) in fast.html
 */

window.blockedDates = [];

window.loadBlockedDates = async function () {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_blocked_dates')
            .select('*')
            .order('blocked_date', { ascending: true });

        if (error) throw error;
        window.blockedDates = data || [];
        if (typeof renderBlockedDates === 'function') renderBlockedDates();
    } catch (e) {
        console.log('[Rules] Erro ao carregar datas bloqueadas:', e.message);
        window.blockedDates = [];
        if (typeof renderBlockedDates === 'function') renderBlockedDates();
    }
};

window.renderBlockedDates = function () {
    const container = document.getElementById('blockedDatesList');
    if (!container) return;

    if (window.blockedDates.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Nenhuma data bloqueada</p>';
        return;
    }

    container.innerHTML = window.blockedDates.map(d => {
        const dateObj = new Date(d.blocked_date + 'T12:00:00');
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        return `
      <div class="flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
        <div>
          <span class="font-medium text-gray-800">${dateStr}</span>
          ${d.reason ? `<span class="text-xs text-gray-500 ml-2">(${d.reason})</span>` : ''}
        </div>
        <button onclick="window.removeBlockedDate(${d.id})" class="text-red-600 hover:text-red-800 text-sm">✕</button>
      </div>
    `;
    }).join('');
};

window.showRulesMessage = function (message, type = 'success') {
    const container = document.getElementById('rulesInlineMessage');
    if (!container) return;
    container.textContent = message;
    container.className = `mb-4 p-4 rounded-lg text-center font-medium ${type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' : type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-yellow-100 text-yellow-800 border border-yellow-300'}`;
    container.classList.remove('hidden');
    setTimeout(() => container.classList.add('hidden'), 4000);
};

window.addBlockedDate = async function () {
    const dateInput = document.getElementById('rulesBlockedDate');
    const reasonInput = document.getElementById('rulesBlockedReason');
    const dateValue = dateInput?.value;
    const reason = reasonInput?.value?.trim() || '';

    if (!dateValue) {
        window.showRulesMessage('⚠️ Selecione uma data para bloquear.', 'warning');
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('fast_blocked_dates')
            .insert({ blocked_date: dateValue, reason: reason || null });

        if (error) throw error;

        dateInput.value = '';
        reasonInput.value = '';
        await window.loadBlockedDates();
        window.showRulesMessage('✅ Data bloqueada com sucesso!', 'success');
    } catch (e) {
        console.error('[Rules] Erro ao bloquear data:', e);
        window.showRulesMessage('❌ Erro ao bloquear data. Verifique se a tabela existe no Supabase.', 'error');
    }
};

window.removeBlockedDate = async function (id) {
    try {
        const { error } = await window.supabaseClient
            .from('fast_blocked_dates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await window.loadBlockedDates();
        window.showRulesMessage('✅ Data removida com sucesso!', 'success');
    } catch (e) {
        console.error('[Rules] Erro ao remover data:', e);
        window.showRulesMessage('❌ Erro ao remover data bloqueada.', 'error');
    }
};

window.saveAllRules = async function () {
    if (!window.storeConfig) return;

    // Coletar valores dos campos
    window.storeConfig.delivery_enabled = document.getElementById('rulesDeliveryEnabled')?.checked !== false;
    window.storeConfig.delivery_disabled_reason = document.getElementById('rulesDeliveryReason')?.value || '';
    window.storeConfig.min_order_delivery = parseFloat(document.getElementById('rulesMinDelivery')?.value) || 15;
    window.storeConfig.min_order_pickup = parseFloat(document.getElementById('rulesMinPickup')?.value) || 8;
    window.storeConfig.min_order_pickup_offhours = parseFloat(document.getElementById('rulesMinPickupOffHours')?.value) || 15;
    window.storeConfig.morning_rule_min_value = parseFloat(document.getElementById('rulesMinMorning')?.value) || 25;
    window.storeConfig.same_day_orders_enabled = document.getElementById('rulesSameDayEnabled')?.checked !== false;
    window.storeConfig.same_day_pickup_start = document.getElementById('rulesSameDayStart')?.value || '12:00';
    window.storeConfig.same_day_pickup_end = document.getElementById('rulesSameDayEnd')?.value || '18:00';
    window.storeConfig.same_day_min_value = parseFloat(document.getElementById('rulesSameDayMinValue')?.value) || 15;
    window.storeConfig.morning_rule_enabled = document.getElementById('rulesMorningEnabled')?.checked !== false;
    window.storeConfig.morning_rule_end_time = document.getElementById('rulesMorningEndTime')?.value || '12:00';

    // Salvar
    if (window.StoreConfigService && window.StoreConfigService.save) {
        try {
            await window.StoreConfigService.save(); // Assuming this saves current storeConfig
            window.showRulesMessage('✅ Regras salvas com sucesso!', 'success');
        } catch (e) {
            window.showRulesMessage('⚠️ Erro ao salvar regras.', 'error');
        }
    } else if (typeof saveStoreConfig === 'function') {
        const success = await saveStoreConfig();
        if (success) {
            window.showRulesMessage('✅ Regras salvas com sucesso!', 'success');
        } else {
            window.showRulesMessage('⚠️ Erro ao salvar regras.', 'error');
        }
    } else {
        console.warn('No saveStoreConfig function found');
    }
};

window.updatePanicButtonUI = function (isClosed) {
    const btn = document.getElementById('panicCloseStore');
    const label = btn?.previousElementSibling?.querySelector('span');
    const desc = btn?.previousElementSibling?.querySelector('p');

    if (btn) {
        if (isClosed) {
            btn.textContent = '🟢 Abrir Loja';
            btn.className = 'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-colors';
            if (label) label.textContent = 'Loja Fechada';
            if (desc) desc.textContent = 'Para reabrir hoje, clique no botão.';
            btn.parentElement?.classList.remove('bg-red-50', 'border-red-200');
            btn.parentElement?.classList.add('bg-red-100', 'border-red-300');
        } else {
            btn.textContent = '🚨 Fechar';
            btn.className = 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-colors';
            if (label) label.textContent = 'Fechar Loja Agora';
            if (desc) desc.textContent = 'Encerra o dia imediatamente.';
            btn.parentElement?.classList.add('bg-red-50', 'border-red-200');
            btn.parentElement?.classList.remove('bg-red-100', 'border-red-300');
        }
    }
};

// Initialize listeners when DOM loads (if this script is deferred)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rulesDeliveryEnabled')?.addEventListener('change', function () {
        const reasonBox = document.getElementById('rulesDeliveryReasonBox');
        if (reasonBox) reasonBox.classList.toggle('hidden', this.checked);
    });
});
