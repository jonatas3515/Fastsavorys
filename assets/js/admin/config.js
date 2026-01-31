
// ========================================
// FEES & CONFIG (ADMIN)
// ========================================

// Store configuration state - use existing or create default
// Note: storeConfig may already exist from services.js
const adminConfigDefaults = {
    card_fee_1x: 5,
    card_fee_2x: 5,
    delivery_enabled: true,
    delivery_disabled_reason: '',
    prep_time_min: 30,
    prep_time_max: 60,
    delivery_time_min: 15,
    delivery_time_max: 45,
    pix_key: '',
    pix_merchant_name: '',
    pix_merchant_city: ''
};

// Load store config from Supabase and populate admin form
async function loadStoreConfig() {
    try {
        if (!window.supabaseClient) {
            loadStoreConfigFromLocalStorage();
            return;
        }

        const { data, error } = await window.supabaseClient
            .from('fast_store_config')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            window.storeConfig = {
                ...window.storeConfig,
                card_fee_1x: parseFloat(data.card_fee_1x) || 5,
                card_fee_2x: parseFloat(data.card_fee_2x) || 5,
                delivery_enabled: data.delivery_enabled !== false,
                delivery_disabled_reason: data.delivery_disabled_reason || '',
                prep_time_min: parseInt(data.prep_time_min) || 30,
                prep_time_max: parseInt(data.prep_time_max) || 60,
                delivery_time_min: parseInt(data.delivery_time_min) || 15,
                delivery_time_max: parseInt(data.delivery_time_max) || 45,
                pix_key: data.pix_key || '',
                pix_merchant_name: data.pix_merchant_name || '',
                pix_merchant_city: data.pix_merchant_city || ''
            };
            localStorage.setItem('fastStoreConfig', JSON.stringify(window.storeConfig));
        }
        populateConfigForm();
    } catch (e) {
        console.warn('[Admin Config] Error loading config:', e);
        loadStoreConfigFromLocalStorage();
    }
}

function loadStoreConfigFromLocalStorage() {
    try {
        const saved = localStorage.getItem('fastStoreConfig');
        if (saved) {
            window.storeConfig = { ...window.storeConfig, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('[Admin Config] Error loading local config:', e);
    }
    populateConfigForm();
}

function populateConfigForm() {
    const cfg = window.storeConfig || adminConfigDefaults;

    // Card Fee
    const cardFee = document.getElementById('cardFee1x');
    if (cardFee) cardFee.value = cfg.card_fee_1x || 5;

    // Delivery Settings
    const deliveryEnabled = document.getElementById('deliveryEnabled');
    const deliveryReason = document.getElementById('deliveryDisabledReason');
    const prepMin = document.getElementById('prepTimeMin');
    const prepMax = document.getElementById('prepTimeMax');
    const delivMin = document.getElementById('deliveryTimeMin');
    const delivMax = document.getElementById('deliveryTimeMax');

    if (deliveryEnabled) deliveryEnabled.checked = cfg.delivery_enabled !== false;
    if (deliveryReason) deliveryReason.value = cfg.delivery_disabled_reason || '';
    if (prepMin) prepMin.value = cfg.prep_time_min || 30;
    if (prepMax) prepMax.value = cfg.prep_time_max || 60;
    if (delivMin) delivMin.value = cfg.delivery_time_min || 15;
    if (delivMax) delivMax.value = cfg.delivery_time_max || 45;

    // PIX Settings
    const pixKey = document.getElementById('pixKey');
    const pixName = document.getElementById('pixMerchantName');
    const pixCity = document.getElementById('pixMerchantCity');

    if (pixKey) pixKey.value = cfg.pix_key || '';
    if (pixName) pixName.value = cfg.pix_merchant_name || '';
    if (pixCity) pixCity.value = cfg.pix_merchant_city || '';
}

async function saveStoreConfig() {
    const cfg = window.storeConfig || adminConfigDefaults;
    try {
        // Always save full config to localStorage (including PIX which may not exist in DB)
        localStorage.setItem('fastStoreConfig', JSON.stringify(cfg));

        if (!window.supabaseClient) {
            showToast('Salvo localmente (Supabase indisponível)', 'warning');
            return true;
        }

        // Only save columns that exist in the database
        // Note: pix_key, pix_merchant_name, pix_merchant_city may not exist in production DB
        const updateData = {
            id: 1,
            updated_at: new Date().toISOString()
        };

        // Add fields that are likely to exist in the database
        if (cfg.card_fee_1x !== undefined) updateData.card_fee_1x = cfg.card_fee_1x;
        if (cfg.card_fee_2x !== undefined) updateData.card_fee_2x = cfg.card_fee_2x;
        if (cfg.delivery_enabled !== undefined) updateData.delivery_enabled = cfg.delivery_enabled;
        if (cfg.delivery_disabled_reason !== undefined) updateData.delivery_disabled_reason = cfg.delivery_disabled_reason;
        if (cfg.prep_time_min !== undefined) updateData.prep_time_min = cfg.prep_time_min || 0;
        if (cfg.prep_time_max !== undefined) updateData.prep_time_max = cfg.prep_time_max || 0;
        if (cfg.delivery_time_min !== undefined) updateData.delivery_time_min = cfg.delivery_time_min || 0;
        if (cfg.delivery_time_max !== undefined) updateData.delivery_time_max = cfg.delivery_time_max || 0;

        const { error } = await window.supabaseClient
            .from('fast_store_config')
            .upsert(updateData);

        if (error) {
            // If specific column error, try minimal save and warn
            if (error.code === 'PGRST204') {
                console.warn('[Admin Config] Some columns missing, saving to localStorage only');
                showToast('Configurações salvas localmente (algumas colunas não existem no BD)', 'warning');
                return true;
            }
            throw error;
        }

        showToast('Configurações salvas!', 'success');
        return true;
    } catch (error) {
        console.error('[Admin Config] Save error:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
        return false;
    }
}

// Export functions
window.loadStoreConfig = loadStoreConfig;
window.saveStoreConfig = saveStoreConfig;

function readFastFees() {
    try {
        const d = localStorage.getItem('fastDeliveryFees');
        return d ? JSON.parse(d) : {};
    } catch (e) { return {}; }
}

function writeFastFees(data) {
    localStorage.setItem('fastDeliveryFees', JSON.stringify(data));
}

function handleAddFeePanel() {
    const b = document.getElementById('feeNeighborhoodFastPanel').value.trim();
    const v = parseFloat(document.getElementById('feeValueFastPanel').value.replace(',', '.'));
    const min = parseFloat(document.getElementById('feeMinValueFastPanel').value.replace(',', '.')) || 0;
    if (!b || isNaN(v)) { showToast('Preencha bairro e valor.', 'error'); return; }
    const m = readFastFees(); // Global or local
    m[window.norm(b)] = { fee: v, min: min };
    writeFastFees(m);
    renderFastFeesListPanel();
    document.getElementById('feeNeighborhoodFastPanel').value = '';
    document.getElementById('feeValueFastPanel').value = '';
}

async function handleSaveAllFeesPanel() {
    const fees = readFastFees();
    writeFastFees(fees); // Save locally

    if (window.supabaseClient) {
        showInlineMessage('feesListFastPanel', '⏳ Salvando no servidor...', 'info');
        await saveFeesToSupabase();
    } else {
        showInlineMessage('feesListFastPanel', '⚠️ Apenas salvo localmente (Supabase indisponível)', 'warning');
    }
}

// Persist fees to Supabase
async function saveFeesToSupabase() {
    try {
        const fees = readFastFees();
        const rows = Object.entries(fees).map(([neighborhood, entry]) => {
            let feeValue = entry;
            let minValue = 0;
            if (entry && typeof entry === 'object') {
                feeValue = entry.fee;
                minValue = entry.min || 0;
            }
            feeValue = parseFloat(String(feeValue).replace(',', '.'));
            minValue = parseFloat(String(minValue).replace(',', '.'));

            return {
                neighborhood,
                fee: isNaN(feeValue) ? 0 : feeValue,
                min_order_value: isNaN(minValue) ? 0 : minValue
            };
        });

        // Upsert data
        const { error } = await window.supabaseClient
            .from('fast_delivery_fees')
            .upsert(rows, { onConflict: 'neighborhood' });

        if (error) throw error;

        // Verify/Reload to ensure consistency
        await loadFeesFromSupabase();

        showInlineMessage('feesListFastPanel', '✅ Taxas sincronizadas com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar taxas:', error);
        showInlineMessage('feesListFastPanel', `❌ Erro ao sincronizar: ${error.message}`, 'error');
    }
}

// Load fees from Supabase (Admin implementation)
async function loadFeesFromSupabase() {
    try {
        if (!window.supabaseClient) return;
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
            writeFastFees(feesObj);
            renderFastFeesListPanel(); // Update UI
        }
    } catch (e) {
        console.warn('[Admin] Erro ao carregar taxas:', e);
    }
}

function renderFastFeesListPanel() {
    const list = document.getElementById('feesListFastPanel');
    if (!list) return;
    const m = readFastFees();
    const entries = Object.entries(m).sort((a, b) => {
        const feeA = typeof a[1] === 'object' ? a[1].fee : a[1];
        const feeB = typeof b[1] === 'object' ? b[1].fee : b[1];
        return feeA - feeB || a[0].localeCompare(b[0]);
    });
    list.innerHTML = entries.map(([k, v]) => {
        const fee = typeof v === 'object' ? v.fee : v;
        const min = typeof v === 'object' ? (v.min || 0) : 0;
        return `<div class='py-3 border-b flex justify-between items-center'>
       <div><span class='font-bold'>${k}</span></div>
       <div class="flex gap-2">
         <input data-k='${k}' data-type="fee" class='w-20 border rounded text-right' value='${fee}'>
         <input data-k='${k}' data-type="min" class='w-20 border rounded text-right' value='${min}'>
         <button data-del='${k}' class='bg-red-500 text-white px-2 rounded'>X</button>
       </div>
     </div>`;
    }).join('');
}

function handleFeeListClick(e) {
    if (e.target.dataset.del) {
        const m = readFastFees();
        delete m[e.target.dataset.del];
        writeFastFees(m);
        renderFastFeesListPanel();
    }
}

function handleFeeListChange(e) {
    if (e.target.dataset.k) {
        const m = readFastFees();
        const key = e.target.dataset.k;
        const type = e.target.dataset.type;
        const val = parseFloat(e.target.value.replace(',', '.'));
        if (!isNaN(val)) {
            if (typeof m[key] !== 'object') m[key] = { fee: m[key], min: 0 };
            if (type === 'fee') m[key].fee = val;
            if (type === 'min') m[key].min = val;
            writeFastFees(m);
        }
    }
}

async function handleBatchUpdateMin() {
    const minValStr = await showPrompt('Valor mínimo para TODOS:', '0', { title: 'Atualizar Taxas' });
    if (minValStr === null) return;
    const minVal = parseFloat(minValStr);

    if (isNaN(minVal)) return;
    const m = readFastFees();
    Object.keys(m).forEach(k => {
        if (typeof m[k] !== 'object') m[k] = { fee: m[k], min: 0 };
        m[k].min = minVal;
    });
    writeFastFees(m);
    renderFastFeesListPanel();
    showToast('Valores mínimos atualizados!', 'success');
}

// Config Handlers
async function handleSaveCardFees() {
    storeConfig.card_fee_1x = parseFloat(document.getElementById('cardFee1x').value) || 5;
    storeConfig.card_fee_2x = storeConfig.card_fee_1x;
    await saveStoreConfig();
    showInlineMessage('configPanelFast', '✅ Configurações Salvas!', 'success');
}

async function handleSaveBusinessHours() {
    await saveBusinessHours();
    showInlineMessage('configPanelFast', '✅ Horários Salvos!', 'success');
}

async function handleSaveDeliverySettings() {
    storeConfig.delivery_enabled = document.getElementById('deliveryEnabled').checked;
    storeConfig.delivery_disabled_reason = document.getElementById('deliveryDisabledReason').value;
    storeConfig.prep_time_min = parseInt(document.getElementById('prepTimeMin').value) || 0;
    storeConfig.prep_time_max = parseInt(document.getElementById('prepTimeMax').value) || 0;
    storeConfig.delivery_time_min = parseInt(document.getElementById('deliveryTimeMin').value) || 0;
    storeConfig.delivery_time_max = parseInt(document.getElementById('deliveryTimeMax').value) || 0;

    // Also save via Service if available for robustness
    if (window.StoreConfigService) {
        await window.StoreConfigService.save({
            delivery_enabled: storeConfig.delivery_enabled,
            delivery_disabled_reason: storeConfig.delivery_disabled_reason
        });
    }

    await saveStoreConfig();
    showInlineMessage('configPanelFast', '✅ Configurações de Entrega Salvas!', 'success');
}

async function handleSavePixConfig() {
    const key = document.getElementById('pixKey')?.value?.trim();
    const name = document.getElementById('pixMerchantName')?.value?.trim();
    const city = document.getElementById('pixMerchantCity')?.value?.trim();
    if (!key || !name) { showToast('Preencha os dados PIX', 'error'); return; }

    storeConfig.pix_key = key;
    if (window.PixPayloadService) {
        storeConfig.pix_merchant_name = window.PixPayloadService.removeAccents(name).substring(0, 25);
        storeConfig.pix_merchant_city = window.PixPayloadService.removeAccents(city || 'CIDADE').substring(0, 15);
    } else {
        storeConfig.pix_merchant_name = name;
        storeConfig.pix_merchant_city = city || '';
    }

    await saveStoreConfig();
    showInlineMessage('configPanelFast', '✅ PIX Salvo!', 'success');
}

async function handleSaveRules() {
    const maxOrders = parseInt(document.getElementById('maxConcurrentOrders').value) || 10;

    if (window.StoreConfigService) {
        const success = await window.StoreConfigService.save({
            max_concurrent_orders: maxOrders
        });
        if (success) showToast('Regras salvas!', 'success');
    }
}

// ========================================
// BANNER MANAGEMENT
// ========================================
window.BannerModule = {
    loaded: false,
    config: null,

    loadConfig: async function () {
        try {
            const { data, error } = await window.supabaseClient
                .from('fast_banner_config')
                .select('*')
                .eq('store_id', 1)
                .maybeSingle();

            if (error) throw error;
            this.config = data || { store_id: 1, enabled: true, alt_text: 'Anuncie aqui' };
            this.loaded = true;
            return this.config;
        } catch (e) {
            console.error('[Banner] Error loading config:', e);
            return null;
        }
    },

    loadAdminForm: async function () {
        if (!this.loaded) await this.loadConfig();
        const conf = this.config || {};

        const active = document.getElementById('bannerActive');
        const enabled = document.getElementById('bannerEnabled');
        if (active) active.checked = conf.enabled !== false;
        if (enabled) enabled.checked = conf.enabled !== false;

        const linkUrl = document.getElementById('bannerLinkUrl');
        const link = document.getElementById('bannerLink');
        if (linkUrl) linkUrl.value = conf.link_url || '';
        if (link) link.value = conf.link_url || '';

        const alt = document.getElementById('bannerAltText');
        if (alt) alt.value = conf.alt_text || '';

        // Fallback text when no image
        const fallbackText = document.getElementById('bannerFallbackText');
        if (fallbackText) fallbackText.value = conf.fallback_text || '';

        const imgLink = document.getElementById('bannerImageLink');
        const imgUrl = document.getElementById('bannerImageUrl');
        if (imgLink) imgLink.value = conf.image_url || '';
        if (imgUrl) imgUrl.value = conf.image_url || '';

        const preview = document.getElementById('currentBannerPreview');
        const realPreview = document.getElementById('bannerRealPreview');
        const simplePreviewWrapper = document.getElementById('bannerImagePreview');
        const simplePreviewImg = document.getElementById('bannerPreviewImg');

        const imgHtml = conf.image_url
            ? `<img src="${conf.image_url}" class="h-full w-full object-contain">`
            : '<span class="text-gray-500 text-sm">Sem imagem</span>';

        if (preview) preview.innerHTML = imgHtml;
        if (realPreview) realPreview.innerHTML = conf.image_url
            ? `<img src="${conf.image_url}" class="max-w-full rounded shadow-sm">`
            : '<div class="text-gray-400 p-4 border border-dashed text-center">Preview aparecerá aqui</div>';

        if (simplePreviewImg && conf.image_url) {
            simplePreviewImg.src = conf.image_url;
            if (simplePreviewWrapper) simplePreviewWrapper.classList.remove('hidden');
        }
    },

    save: async function () {
        const active = (document.getElementById('bannerActive')?.checked ?? document.getElementById('bannerEnabled')?.checked) ?? true;
        const link = (document.getElementById('bannerLinkUrl')?.value || document.getElementById('bannerLink')?.value || '').trim();
        const alt = (document.getElementById('bannerAltText')?.value || '').trim();
        const fallbackText = (document.getElementById('bannerFallbackText')?.value || '').trim();

        let imageUrl = this.config?.image_url;

        // Check if user pasted a link manually if no file uploaded
        const pastedLink = (document.getElementById('bannerImageLink')?.value || document.getElementById('bannerImageUrl')?.value || '').trim();
        if (pastedLink && pastedLink !== imageUrl) imageUrl = pastedLink;

        // Check for file upload (overrides link)
        const fileInput = document.getElementById('bannerImageFile') || document.getElementById('bannerImageUpload');
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileName = `banner_${Date.now()}_${file.name.replace(/\s+/g, '-')}`;

            showToast('Fazendo upload da imagem...', 'info');
            try {
                const { data, error } = await window.supabaseClient.storage
                    .from('fast_assets')
                    .upload('banners/' + fileName, file);

                if (error) throw error;

                const { data: publicData } = window.supabaseClient.storage
                    .from('fast_assets')
                    .getPublicUrl('banners/' + fileName);

                imageUrl = publicData.publicUrl;
            } catch (e) {
                console.error('Upload failed:', e);
                showToast('Erro no upload da imagem: ' + e.message, 'error');
                return;
            }
        }

        const updates = {
            store_id: 1,
            enabled: active,
            link_url: link,
            alt_text: alt,
            fallback_text: fallbackText,
            image_url: imageUrl,
            updated_at: new Date().toISOString()
        };

        try {
            // Upsert
            if (this.config?.id) updates.id = this.config.id;

            const { error } = await window.supabaseClient
                .from('fast_banner_config')
                .upsert(updates);

            if (error) throw error;

            showToast('Banner salvo com sucesso!', 'success');
            this.loadConfig().then(() => this.loadAdminForm()); // Reload UI
        } catch (e) {
            console.error('Save failed:', e);
            showToast('Erro ao salvar banner.', 'error');
        }
    }
};

// Global Listener for Banner Preview (File & URL)
// File Input (Change)
document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'bannerImageFile' || e.target.id === 'bannerImageUpload')) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (evt) {
                const preview = document.getElementById('currentBannerPreview');
                const realPreview = document.getElementById('bannerRealPreview');
                const simplePreviewWrapper = document.getElementById('bannerImagePreview');
                const simplePreviewImg = document.getElementById('bannerPreviewImg');
                const imgHtml = `<img src="${evt.target.result}" class="h-full w-full object-contain">`;
                const realImgHtml = `<img src="${evt.target.result}" class="max-w-full rounded shadow-sm">`;

                if (preview) preview.innerHTML = imgHtml;
                if (realPreview) realPreview.innerHTML = realImgHtml;

                if (simplePreviewImg) {
                    simplePreviewImg.src = evt.target.result;
                    if (simplePreviewWrapper) simplePreviewWrapper.classList.remove('hidden');
                }

                // Show filename in input (UX improvement)
                const linkInput = document.getElementById('bannerImageLink');
                if (linkInput) linkInput.value = `(Arquivo: ${file.name})`;

                const hiddenUrl = document.getElementById('bannerImageUrl');
                if (hiddenUrl) hiddenUrl.value = '';
            };
            reader.readAsDataURL(file);
        }
    }
});

// Manual URL Input (Real-time Input)
document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'bannerImageLink') {
        const url = e.target.value.trim();
        // Ignore placeholder text
        if (url.startsWith('(Arquivo:')) return;

        if (url && (url.startsWith('http') || url.startsWith('data:'))) {
            const preview = document.getElementById('currentBannerPreview');
            const realPreview = document.getElementById('bannerRealPreview');
            const imgHtml = `<img src="${url}" class="h-full w-full object-contain" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML='<span class=\\'text-red-500 text-sm\\'>Erro ao carregar imagem</span>'">`;
            const realImgHtml = `<img src="${url}" class="max-w-full rounded shadow-sm" onerror="this.style.display='none'">`;

            if (preview) preview.innerHTML = imgHtml;
            if (realPreview) realPreview.innerHTML = realImgHtml;

            // Clear file input if user manually types a URL
            const fileInput = document.getElementById('bannerImageFile');
            if (fileInput) fileInput.value = '';
        }
    }
});

// Global exports
window.readFastFees = readFastFees;
window.writeFastFees = writeFastFees;
window.handleAddFeePanel = handleAddFeePanel;
window.handleSaveAllFeesPanel = handleSaveAllFeesPanel;
window.saveFeesToSupabase = saveFeesToSupabase;
window.loadFeesFromSupabase = loadFeesFromSupabase;
window.renderFastFeesListPanel = renderFastFeesListPanel;
window.handleFeeListClick = handleFeeListClick;
window.handleFeeListChange = handleFeeListChange;
window.handleBatchUpdateMin = handleBatchUpdateMin;
window.handleSaveCardFees = handleSaveCardFees;
window.handleSaveBusinessHours = handleSaveBusinessHours;
window.handleSaveDeliverySettings = handleSaveDeliverySettings;
window.handleSavePixConfig = handleSavePixConfig;
window.handleSaveRules = handleSaveRules;
window.renderFastFeesList = renderFastFeesListPanel; // Alias for compatibility
window.closeFeesFastModal = function () { document.getElementById('feesModalFast')?.classList.add('hidden'); };
