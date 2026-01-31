
// ===========================================
// PROMOTIONS MODULE (PATCHED for promo_value/promo_type)
// ===========================================

async function loadProductsForPromotions() {
    const tableBody = document.getElementById('productPromotionsList');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Carregando produtos...</td></tr>';

    try {
        const { data: products, error } = await window.supabaseClient
            .from('fast_products')
            .select('id, name, price, promo_value, promo_type, promo_active, available')
            .order('name', { ascending: true });

        if (error) throw error;

        _productsCacheForPromo = products || [];
        renderProductPromotions(_productsCacheForPromo);

    } catch (e) {
        console.error('Erro ao carregar produtos para promoção:', e);
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500">Erro ao carregar produtos.</td></tr>';
    }
}

function renderProductPromotions(products) {
    const tableBody = document.getElementById('productPromotionsList');
    if (!tableBody) return;

    if (products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum produto encontrado.</td></tr>';
        return;
    }

    tableBody.innerHTML = products.map(p => `
        <tr class="hover:bg-gray-50 border-b last:border-0 hover:shadow-sm transition-all">
            <td class="p-3 font-medium text-gray-800">${p.name}</td>
            <td class="p-3 text-gray-600">R$ ${p.price.toFixed(2).replace('.', ',')}</td>
            <td class="p-3">
                <select id="promo_type_${p.id}" 
                    class="w-24 px-2 py-1 border rounded text-sm outline-none focus:ring-2 focus:ring-rose-500 ${p.promo_active ? 'border-rose-300 bg-rose-50' : 'border-gray-300'}"
                    onchange="markProductDirty(${p.id})">
                    <option value="fixed" ${(!p.promo_type || p.promo_type === 'fixed') ? 'selected' : ''}>R$ Fixo</option>
                    <option value="percentage" ${p.promo_type === 'percentage' ? 'selected' : ''}>% Desc.</option>
                </select>
            </td>
            <td class="p-3">
                <input type="number" 
                    id="promo_value_${p.id}" 
                    value="${p.promo_value ? p.promo_value : ''}" 
                    placeholder="0.00" 
                    step="0.01" 
                    class="w-24 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-rose-500 outline-none transition-all ${p.promo_active ? 'border-rose-300 bg-rose-50' : 'border-gray-300'}"
                    onchange="markProductDirty(${p.id})">
            </td>
            <td class="p-3 text-center">
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="promo_active_${p.id}" class="sr-only peer" ${p.promo_active ? 'checked' : ''} onchange="togglePromoInput(${p.id})">
                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rose-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                </label>
            </td>
        </tr>
    `).join('');
}

window.togglePromoInput = function (id) {
    const checkbox = document.getElementById(`promo_active_${id}`);
    const input = document.getElementById(`promo_value_${id}`);
    const select = document.getElementById(`promo_type_${id}`);

    if (!checkbox || !input || !select) return;

    if (!checkbox.checked) {
        input.classList.remove('border-rose-300', 'bg-rose-50');
        input.classList.add('border-gray-300');
        select.classList.remove('border-rose-300', 'bg-rose-50');
        select.classList.add('border-gray-300');
    } else {
        input.focus();
        input.classList.add('border-rose-300', 'bg-rose-50');
        input.classList.remove('border-gray-300');
        select.classList.add('border-rose-300', 'bg-rose-50');
        select.classList.remove('border-gray-300');
    }
    markProductDirty(id);
};

window.markProductDirty = function (id) {
    _dirtyProducts.add(id);
    const btn = document.querySelector('button[onclick="saveProductPromotions()"]');
    if (btn) {
        btn.innerHTML = '<span>💾</span> Salvar Alterações *';
        btn.classList.add('animate-pulse');
    }
};

window.saveProductPromotions = async function () {
    if (_dirtyProducts.size === 0) {
        showToast('Nenhuma alteração para salvar.', 'info');
        return;
    }

    const updates = [];
    const btn = document.querySelector('button[onclick="saveProductPromotions()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Salvando...';
        btn.classList.remove('animate-pulse');
    }

    _dirtyProducts.forEach(id => {
        const input = document.getElementById(`promo_value_${id}`);
        const select = document.getElementById(`promo_type_${id}`);
        const checkbox = document.getElementById(`promo_active_${id}`);

        let val = input.value ? parseFloat(input.value) : 0;
        const type = select.value;
        const active = checkbox.checked;

        updates.push({
            id,
            promo_value: val,
            promo_type: type,
            promo_active: active
        });
    });

    try {
        let errorCount = 0;

        for (const up of updates) {
            const { error } = await window.supabaseClient
                .from('fast_products')
                .update({
                    promo_value: up.promo_value,
                    promo_type: up.promo_type,
                    promo_active: up.promo_active
                })
                .eq('id', up.id);

            if (error) {
                console.error(`Erro ao atualizar produto ${up.id}:`, error);
                errorCount++;
            }
        }

        if (errorCount === 0) {
            showToast('Promoções salvas com sucesso!', 'success');
            _dirtyProducts.clear();
            if (btn) btn.innerHTML = '<span>💾</span> Salvar Promoções';
        } else {
            showToast(`Salvo com ${errorCount} erros.`, 'warning');
            if (btn) btn.innerHTML = '<span>⚠️</span> Tentar Novamente';
        }

    } catch (e) {
        console.error('Erro geral ao salvar promoções:', e);
        showToast('Erro ao salvar promoções.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
};
