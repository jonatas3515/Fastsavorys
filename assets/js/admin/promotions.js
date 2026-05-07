
// ========================================
// PROMOTIONS & COUPONS IMPLEMENTATION
// ========================================

// PROMOTIONS
async function renderPromotions() {
    const container = document.getElementById('promotionsListFast');
    if (!container) return;

    container.innerHTML = '<div class="text-gray-500 text-center py-4">Carregando promoções...</div>';

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');
        const { data: promos, error } = await window.supabaseClient
            .from('fast_promotions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!promos || promos.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-center py-4">Nenhuma promoção ativa.</div>';
            return;
        }

        // Need products to show names
        const { data: products } = await window.supabaseClient.from('fast_products').select('id, name');
        const productMap = {};
        (products || []).forEach(p => productMap[p.id] = p.name);

        container.innerHTML = promos.map(p => {
            const productId = p.product_id ?? p.productId;
            const discountType = p.discount_type ?? p.type;
            const productName = p.product_name || productMap[productId] || `Produto ${productId}`;
            const valueDisplay = discountType === 'percentage' ? `${p.value}%` : `R$ ${Number(p.value || 0).toFixed(2).replace('.', ',')}`;

            return `
            <div class="flex items-center justify-between p-3 border rounded bg-white shadow-sm mb-2">
                <div class="flex-1 min-w-0 pr-2">
                    <h5 class="font-bold text-gray-800 truncate">${productName}</h5>
                    <p class="text-sm text-green-600 font-medium">Desconto: ${valueDisplay}</p>
                    <p class="text-xs text-gray-400">${p.active ? 'Ativo' : 'Inativo'}</p>
                </div>
                <button onclick="handleDeletePromotion(${p.id})" class="text-red-500 hover:text-red-700 p-2 flex-shrink-0">🔄 🗑️</button>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar promoções:', e);
        container.innerHTML = '<div class="text-red-500 text-center py-4">Erro ao carregar promoções.</div>';
    }
}

async function handleSavePromotion(event) {
    if (event) event.preventDefault(); // If called from form submit

    // Support two UI versions: Modal or Inline Panel. Assuming Panel for new Admin.
    // Check Panel inputs first
    let probId = document.getElementById('promoProductSelect')?.value;
    let type = document.getElementById('promoType')?.value;
    let val = parseFloat(document.getElementById('promoValue')?.value);

    // Validation
    if (!probId || isNaN(val)) {
        showToast('Preencha o produto e o valor corretamente.', 'error');
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');
        const normalizedType = (type === 'percent' || type === 'percentage') ? 'percentage' : 'fixed';

        const { data: productRow } = await window.supabaseClient
            .from('fast_products')
            .select('id, name')
            .eq('id', probId)
            .maybeSingle();

        const productName = productRow?.name || '';

        // Deactivate existing promo for this product first (business rule: 1 promo per product)
        await window.supabaseClient
            .from('fast_promotions')
            .delete()
            .eq('product_id', probId);

        const { error } = await window.supabaseClient
            .from('fast_promotions')
            .insert({
                product_id: probId,
                product_name: productName,
                discount_type: normalizedType,
                value: val,
                active: true
            });

        if (error) throw error;

        // Sync fast_products columns to keep both tables consistent
        await window.supabaseClient
            .from('fast_products')
            .update({
                promo_value: val,
                promo_type: normalizedType,
                promo_active: true
            })
            .eq('id', probId);

        showToast('Promoção salva!', 'success');

        // Force public cache update
        if (window.VersionService) {
            await window.VersionService.incrementVersion('products');
        }

        // Clear form
        if (document.getElementById('promoValue')) document.getElementById('promoValue').value = '';

        renderPromotions();
    } catch (e) {
        console.error('Erro ao salvar promoção:', e);
        showToast('Erro ao salvar promoção.', 'error');
    }
}

async function handleDeletePromotion(id) {
    if (!confirm('Excluir esta promoção?')) return;
    try {
        // Get product_id before deleting so we can sync fast_products
        const { data: promoRow } = await window.supabaseClient
            .from('fast_promotions')
            .select('product_id')
            .eq('id', id)
            .maybeSingle();

        const { error } = await window.supabaseClient
            .from('fast_promotions')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Sync fast_products columns
        if (promoRow?.product_id) {
            await window.supabaseClient
                .from('fast_products')
                .update({ promo_value: 0, promo_active: false })
                .eq('id', promoRow.product_id);
        }

        showToast('Promoção excluída!', 'success');

        // Force public cache update
        if (window.VersionService) {
            await window.VersionService.incrementVersion('products');
        }

        renderPromotions();
    } catch (e) {
        console.error('Erro ao excluir:', e);
        showToast('Erro ao excluir.', 'error');
    }
}

async function updatePromotionProductSelect() {
    const select = document.getElementById('promoProductSelect');
    if (!select) return;

    try {
        if (!window.supabaseClient) return;
        const { data: products } = await window.supabaseClient
            .from('fast_products')
            .select('id, name')
            .order('name');

        if (products) {
            select.innerHTML = '<option value="">Selecione um produto...</option>' +
                products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        }
    } catch (e) { console.error('Erro ao carregar produtos para select:', e); }
}


// COUPONS
// Editing State
let _editingCouponId = null;

async function renderCoupons() {
    const tableBody = document.getElementById('couponsList');
    const cardsContainer = document.getElementById('couponsListFast');
    const container = tableBody || cardsContainer;
    if (!container) return;

    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Carregando cupons...</td></tr>';
    } else {
        cardsContainer.innerHTML = '<div class="text-gray-500 text-center py-4">Carregando cupons...</div>';
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');

        let usageCountMap = {};
        try {
            // Buscar pedidos ENTREGUES que usaram cupom (contagem real)
            const { data: ordersWithCoupon } = await window.supabaseClient
                .from('fast_orders')
                .select('coupon_code, status')
                .not('coupon_code', 'is', null)
                .neq('coupon_code', '')
                .eq('status', 'delivered');

            if (ordersWithCoupon) {
                ordersWithCoupon.forEach(o => {
                    const code = String(o.coupon_code || '').toUpperCase().trim();
                    if (code) {
                        usageCountMap[code] = (usageCountMap[code] || 0) + 1;
                    }
                });
            }
            console.log('[Coupons] Contagem de usos (pedidos entregues):', usageCountMap);
        } catch (e) {
            console.warn('[Coupons] Erro ao contar usos:', e);
        }

        const { data: coupons, error } = await window.supabaseClient
            .from('fast_coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!coupons || coupons.length === 0) {
            const emptyMsg = '<div class="text-gray-500 text-center py-4">Nenhum cupom criado.</div>';
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum cupom criado.</td></tr>`;
            else cardsContainer.innerHTML = emptyMsg;
            return;
        }

        const renderRow = (c) => {
            const type = c.discount_type ?? c.type;
            const valueNum = Number(c.value || 0);
            const valueDisplay = type === 'percentage' ? `${valueNum}%` : `R$ ${valueNum.toFixed(2).replace('.', ',')}`;
            const minOrderNum = Number(c.min_order || 0);
            const code = String(c.code || '').toUpperCase().trim();
            const realUsageCount = usageCountMap[code] || 0;
            // SEMPRE usar contagem real da tabela fast_coupon_usage
            const uses = `${realUsageCount}/${c.max_usage_count ?? '∞'}`;
            const expiry = c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('pt-BR') : 'Sem validade';

            const activeClass = c.active !== false ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-400 bg-gray-50 border-gray-200';
            const statusIcon = c.active !== false ? '✅' : '⚪';

            const actions = `
                <div class="flex items-center justify-end gap-2">
                    <button onclick="handleEditCoupon(${c.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Editar">✏️</button>
                    <button onclick="handleToggleCoupon(${c.id}, ${c.active !== false})" class="p-1.5 ${c.active !== false ? 'text-orange-500 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'} rounded" title="${c.active !== false ? 'Desativar' : 'Ativar'}">🔄</button>
                    <button onclick="handleDeleteCoupon(${c.id})" class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Excluir">🗑️</button>
                </div>
            `;

            if (tableBody) {
                return `
                <tr class="hover:bg-gray-50 transition-colors ${c.active === false ? 'opacity-60 bg-gray-50' : ''}">
                    <td class="p-4 border-b">
                        <span class="font-bold tracking-wider px-2 py-1 rounded border ${activeClass}">${c.code}</span>
                    </td>
                    <td class="p-4 border-b">
                        <div class="font-medium">${valueDisplay}</div>
                        <div class="text-xs text-gray-500">${c.active === false ? 'Inativo' : 'Ativo'}</div>
                    </td>
                    <td class="p-4 border-b text-sm">
                        Min: R$ ${minOrderNum.toFixed(2).replace('.', ',')}<br>
                        Val: ${expiry}
                    </td>
                    <td class="p-4 border-b text-sm">${uses}</td>
                    <td class="p-4 border-b text-right">${actions}</td>
                </tr>`;
            } else {
                return `
                <div class="flex items-center justify-between p-3 border rounded bg-white shadow-sm mb-2 ${c.active === false ? 'opacity-70' : ''}">
                    <div>
                        <div class="flex items-center gap-2">
                            <h5 class="font-bold text-gray-800 tracking-wider">${c.code}</h5>
                            <span class="text-xs px-1.5 py-0.5 rounded border ${activeClass}">${statusIcon}</span>
                        </div>
                        <p class="text-sm text-purple-600 font-medium">${valueDisplay} OFF</p>
                        <p class="text-xs text-gray-500">Usos: ${uses} • Val: ${expiry}</p>
                    </div>
                    ${actions}
                </div>`;
            }
        };

        const html = coupons.map(renderRow).join('');
        if (tableBody) tableBody.innerHTML = html;
        else cardsContainer.innerHTML = html;

        // Render Mobile List
        const mobileList = document.getElementById('couponsListMobile');
        if (mobileList) {
            if (coupons.length === 0) {
                mobileList.innerHTML = '<div class="text-gray-500 text-center py-4">Nenhum cupom criado.</div>';
            } else {
                mobileList.innerHTML = coupons.map(c => {
                    const type = c.discount_type ?? c.type;
                    const valueNum = Number(c.value || 0);
                    const valueDisplay = type === 'percentage' ? `${valueNum}%` : `R$ ${valueNum.toFixed(2).replace('.', ',')}`;
                    const minOrderNum = Number(c.min_order || 0);
                    const code = String(c.code || '').toUpperCase().trim();
                    const realUsageCount = usageCountMap[code] || 0;
                    const uses = `${realUsageCount}/${c.max_usage_count ?? '∞'}`;
                    const expiry = c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('pt-BR') : 'Sem validade';
                    const activeClass = c.active !== false ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-400 bg-gray-50 border-gray-200';
                    const isActive = c.active !== false;

                    return `
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3 ${!isActive ? 'opacity-75' : ''}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-lg tracking-wider text-gray-800">${code}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                                    ${isActive ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                            <div class="text-xl font-bold text-rose-600">${valueDisplay} OFF</div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                            <div>Min: <span class="font-medium text-gray-800">R$ ${minOrderNum.toFixed(2).replace('.', ',')}</span></div>
                            <div>Usos: <span class="font-medium text-gray-800">${uses}</span></div>
                            <div class="col-span-2">Validade: <span class="font-medium text-gray-800">${expiry}</span></div>
                        </div>

                        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
                            <button onclick="handleEditCoupon(${c.id})" class="flex items-center gap-1 text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                ✏️ Editar
                            </button>
                             <button onclick="handleToggleCoupon(${c.id}, ${isActive})" class="flex items-center gap-1 ${isActive ? 'text-orange-600 bg-orange-50 hover:bg-orange-100' : 'text-green-600 bg-green-50 hover:bg-green-100'} px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                ${isActive ? '⏸️ Pausar' : '▶️ Ativar'}
                            </button>
                            <button onclick="handleDeleteCoupon(${c.id})" class="flex items-center gap-1 text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                🗑️ Excluir
                            </button>
                        </div>
                    </div>`;
                }).join('');
            }
        }

    } catch (e) {
        console.error('Erro ao carregar cupons:', e);
        const err = '<div class="text-red-500 text-center py-4">Erro ao carregar cupons.</div>';
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5">${err}</td></tr>`;
        else cardsContainer.innerHTML = err;
    }
}

async function handleSaveCoupon() {
    const newCodeEl = document.getElementById('newCouponCode');
    const legacyCodeEl = document.getElementById('couponCode');

    // Get fields based on available UI
    const codeEl = newCodeEl || legacyCodeEl;
    const valueEl = newCodeEl ? document.getElementById('newCouponValue') : document.getElementById('couponValue');
    const minEl = newCodeEl ? document.getElementById('newCouponMin') : (document.getElementById('couponMinOrder') || document.getElementById('couponMin'));
    const typeEl = newCodeEl ? document.getElementById('newCouponType') : document.getElementById('couponType');

    const maxDiscountEl = newCodeEl ? document.getElementById('newCouponMaxDiscount') : document.getElementById('couponMaxDiscount');
    const maxUsesEl = newCodeEl ? document.getElementById('newCouponMaxUses') : document.getElementById('couponMaxUses');
    const expiryEl = newCodeEl ? document.getElementById('newCouponExpiration') : document.getElementById('couponExpiration');

    if (!codeEl || !valueEl) return;

    const codeRaw = codeEl.value.toUpperCase().trim();
    const valueRaw = parseFloat(valueEl.value);
    const minOrder = parseFloat(minEl?.value) || 0;

    const typeVal = typeEl?.value;
    const discountType = (typeVal === 'percent' || typeVal === 'percentage') ? 'percentage' : 'fixed';

    const maxDiscountValue = maxDiscountEl && maxDiscountEl.value ? parseFloat(maxDiscountEl.value) : null;
    const maxUsageCount = maxUsesEl && maxUsesEl.value ? parseInt(maxUsesEl.value) : null;
    const expiryDate = expiryEl && expiryEl.value ? expiryEl.value : null;

    if (!codeRaw || isNaN(valueRaw)) {
        showToast('Preencha Código e Valor.', 'error');
        return;
    }

    const btn = document.getElementById('addCouponBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Salvando...';
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');

        const payload = {
            code: codeRaw,
            discount_type: discountType,
            value: valueRaw,
            min_order: minOrder,
            max_discount_value: maxDiscountValue,
            max_usage_count: maxUsageCount,
            expiry_date: expiryDate,
            active: true // Reactivate on save? Or keep existing? For new it's true.
        };

        let result;
        if (_editingCouponId) {
            // Update
            const { error } = await window.supabaseClient
                .from('fast_coupons')
                .update(payload)
                .eq('id', _editingCouponId);
            result = { error };
            if (!error) showToast('Cupom atualizado!', 'success');
        } else {
            // Create
            const { error } = await window.supabaseClient
                .from('fast_coupons')
                .insert(payload);
            result = { error };
            if (!error) showToast('Cupom criado!', 'success');
        }

        if (result.error) throw result.error;

        // Reset Form
        _editingCouponId = null;
        codeEl.value = '';
        valueEl.value = '';
        if (minEl) minEl.value = '';
        if (maxDiscountEl) maxDiscountEl.value = '';
        if (maxUsesEl) maxUsesEl.value = '';
        if (expiryEl) expiryEl.value = '';

        if (btn) btn.innerText = 'Criar Cupom';

        // Reset code field to be editable
        if (codeEl) codeEl.disabled = false;

        // Remove cancel button if exists
        const formDiv = codeEl?.closest('.grid')?.parentElement || codeEl?.parentElement;
        const cancelBtn = document.getElementById('cancelEditCouponBtn');
        if (cancelBtn) cancelBtn.remove();

        renderCoupons();

    } catch (e) {
        console.error('Erro ao salvar:', e);
        showToast('Erro ao salvar cupom. Código já existe?', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            if (_editingCouponId) btn.innerText = 'Salvar Alterações';
            else btn.innerText = 'Criar Cupom';
        }
    }
}

// Inline Logic for Delete
window.handleDeleteCoupon = function (id) {
    // Check if confirmModal method exists (assuming core.js or verifying presence)
    const modal = document.getElementById('confirmModal');
    if (modal) {
        // Use custom inline modal logic
        const title = document.getElementById('confirmTitle');
        const msg = document.getElementById('confirmMessage');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        if (title) title.innerText = 'Excluir Cupom';
        if (msg) msg.innerText = 'Tem certeza que deseja excluir este cupom permanentemente?';

        // Show modal
        modal.classList.add('flex'); // Assuming flex class for display
        modal.style.display = 'flex'; // Enforce display

        // Cleanup function
        const close = () => {
            modal.style.display = 'none';
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = close;
        okBtn.onclick = async () => {
            close();
            try {
                const { error } = await window.supabaseClient.from('fast_coupons').delete().eq('id', id);
                if (error) throw error;
                showToast('Cupom excluído!', 'success');
                renderCoupons();
            } catch (e) { showToast('Erro ao excluir.', 'error'); }
        };
    } else {
        // Fallback if modal missing (should not happen based on admin.html)
        if (confirm('Excluir cupom?')) {
            window.supabaseClient.from('fast_coupons').delete().eq('id', id)
                .then(({ error }) => {
                    if (!error) { showToast('Excluído!', 'success'); renderCoupons(); }
                });
        }
    }
};

window.handleToggleCoupon = async function (id, currentStatus) {
    try {
        const { error } = await window.supabaseClient
            .from('fast_coupons')
            .update({ active: !currentStatus })
            .eq('id', id);

        if (error) throw error;
        showToast(currentStatus ? 'Cupom pausado.' : 'Cupom ativado!', 'success');
        renderCoupons();
    } catch (e) {
        showToast('Erro ao alterar status.', 'error');
    }
};

window.handleEditCoupon = async function (id) {
    try {
        const { data, error } = await window.supabaseClient
            .from('fast_coupons')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) throw error;

        _editingCouponId = id;

        // Populate form
        const newCodeEl = document.getElementById('newCouponCode');
        const legacyCodeEl = document.getElementById('couponCode');
        const codeEl = newCodeEl || legacyCodeEl;

        if (!codeEl) { showToast('Formulário não encontrado.', 'error'); return; }

        codeEl.value = data.code;

        const valueEl = newCodeEl ? document.getElementById('newCouponValue') : document.getElementById('couponValue');
        if (valueEl) valueEl.value = data.value;

        const minEl = newCodeEl ? document.getElementById('newCouponMin') : (document.getElementById('couponMinOrder') || document.getElementById('couponMin'));
        if (minEl) minEl.value = data.min_order;

        const typeEl = newCodeEl ? document.getElementById('newCouponType') : document.getElementById('couponType');
        if (typeEl) typeEl.value = (data.discount_type === 'percentage') ? 'percentage' : 'fixed';

        const maxDiscountEl = newCodeEl ? document.getElementById('newCouponMaxDiscount') : document.getElementById('couponMaxDiscount');
        if (maxDiscountEl) maxDiscountEl.value = data.max_discount_value || '';

        const maxUsesEl = newCodeEl ? document.getElementById('newCouponMaxUses') : document.getElementById('couponMaxUses');
        if (maxUsesEl) maxUsesEl.value = data.max_usage_count || '';

        const expiryEl = newCodeEl ? document.getElementById('newCouponExpiration') : document.getElementById('couponExpiration');
        if (expiryEl) expiryEl.value = data.expiry_date || '';

        // Update Button Text
        const btn = document.getElementById('addCouponBtn');
        if (btn) {
            btn.innerText = 'Salvar Alterações';

            // Add Cancel Button if not exists
            const formContainer = btn.parentElement;
            if (formContainer && !document.getElementById('cancelEditCouponBtn')) {
                const cancel = document.createElement('button');
                cancel.id = 'cancelEditCouponBtn';
                cancel.className = 'bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg ml-2';
                cancel.innerText = 'Cancelar Edição';
                cancel.onclick = () => window.cancelEditCoupon();
                formContainer.insertBefore(cancel, btn.nextSibling);
            }
        }

        // Scroll to form
        codeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Editando cupom: ' + data.code, 'info');

    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar cupom para edição.', 'error');
    }
};

window.cancelEditCoupon = function () {
    _editingCouponId = null;
    const btn = document.getElementById('addCouponBtn');
    if (btn) btn.innerText = 'Criar Cupom';

    // Clear inputs
    const newCodeEl = document.getElementById('newCouponCode');
    if (newCodeEl) newCodeEl.value = '';
    const val = document.getElementById('newCouponValue');
    if (val) val.value = '';

    // Clear other fields if they exist
    ['newCouponMin', 'newCouponMaxDiscount', 'newCouponMaxUses', 'newCouponExpiration'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const cancelBtn = document.getElementById('cancelEditCouponBtn');
    if (cancelBtn) cancelBtn.remove();
};

// ========================================
// PRODUCTS PROMOTIONS (Ported from Backup)
// ========================================

let _productsCacheForPromo = [];
let _dirtyProducts = new Set();

async function loadProductsForPromotions() {
    const tableBody = document.getElementById('productPromotionsList');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Carregando produtos...</td></tr>';

    try {
        // Load products and active promotions in parallel
        const [productsRes, promosRes] = await Promise.all([
            window.supabaseClient
                .from('fast_products')
                .select('id, name, price, promo_value, promo_type, promo_active, category')
                .order('name', { ascending: true }),
            window.supabaseClient
                .from('fast_promotions')
                .select('product_id, discount_type, value, active')
        ]);

        if (productsRes.error) throw productsRes.error;

        const products = productsRes.data || [];
        const promos = promosRes.data || [];

        // Build a map of fast_promotions by product_id (source of truth for public store)
        const promoMap = {};
        promos.forEach(p => {
            if (p.active) {
                promoMap[p.product_id] = p;
            }
        });

        // Merge: override fast_products promo fields with fast_promotions data
        products.forEach(prod => {
            const fp = promoMap[prod.id];
            if (fp) {
                prod.promo_type = fp.discount_type || 'fixed';
                prod.promo_value = Number(fp.value) || 0;
                prod.promo_active = true;
            } else if (!prod.promo_active) {
                // No active promo in either table - keep as-is (inactive)
            } else {
                // Product says active but fast_promotions has no record - mark inactive
                prod.promo_active = false;
                prod.promo_value = 0;
            }
        });

        _productsCacheForPromo = products;
        // Expose globally for inline events
        window._productsCacheForPromo = _productsCacheForPromo;

        renderProductPromotions(_productsCacheForPromo);

    } catch (e) {
        console.error('Erro ao carregar produtos para promoção:', e);
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500">Erro ao carregar produtos.</td></tr>';
    }
}

// Expose render function globally
window.renderProductPromotions = function (products) {
    const tableBody = document.getElementById('productPromotionsList');
    if (!tableBody) return;

    const allProducts = products || _productsCacheForPromo || [];

    // Apply Filters
    const searchTerm = document.getElementById('promoProductSearch')?.value?.toLowerCase().trim() || '';
    const categoryFilter = document.getElementById('promoProductCategory')?.value || '';

    const filtered = allProducts.filter(p => {
        const matchName = !searchTerm || (p.name || '').toLowerCase().includes(searchTerm);
        const matchCat = !categoryFilter || (p.category || '') === categoryFilter;
        return matchName && matchCat;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum produto encontrado.</td></tr>';
        return;
    }

    // Expose functions globally for inline events
    window.togglePromoInput = togglePromoInput;
    window.markProductDirty = markProductDirty;

    tableBody.innerHTML = filtered.map(p => `
            <tr class="hover:bg-gray-50 border-b last:border-0 hover:shadow-sm transition-all">
                <td class="p-3 font-medium text-gray-800">
                    <div>${p.name}</div>
                    <div class="text-[10px] text-gray-400 capitalize">${p.category || 'Geral'}</div>
                </td>
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

    // Render Mobile List
    const mobileList = document.getElementById('productPromotionsListMobile');
    if (mobileList) {
        mobileList.innerHTML = filtered.map(p => `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-3">
                <div class="flex items-start justify-between">
                    <div>
                        <h4 class="font-medium text-gray-900 leading-tight">${p.name}</h4>
                        <span class="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                            ${p.category || 'Geral'}
                        </span>
                    </div>
                    <div class="text-right">
                        <div class="text-gray-500 text-xs decoration-line-through">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
                        <div class="font-bold text-rose-600 text-lg">
                            ${p.promo_active && p.promo_value ?
                (p.promo_type === 'percentage' ?
                    `R$ ${(p.price * (1 - p.promo_value / 100)).toFixed(2).replace('.', ',')}` :
                    `R$ ${(Math.max(0, p.price - p.promo_value)).toFixed(2).replace('.', ',')}`
                ) : '---'}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3 items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Tipo de Desconto</label>
                        <select id="promo_type_mobile_${p.id}" 
                            class="w-full px-2 py-1.5 border rounded text-sm bg-white outline-none focus:ring-2 focus:ring-rose-500 ${p.promo_active ? 'border-rose-300 text-rose-700' : 'border-gray-200'}"
                            onchange="syncMobilePromoInput(${p.id}, 'type')">
                            <option value="fixed" ${(!p.promo_type || p.promo_type === 'fixed') ? 'selected' : ''}>R$ Fixo</option>
                            <option value="percentage" ${p.promo_type === 'percentage' ? 'selected' : ''}>% Porcentagem</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[10px] text-gray-500 uppercase font-bold mb-1">Valor do Desconto</label>
                         <input type="number" 
                            id="promo_value_mobile_${p.id}" 
                            value="${p.promo_value ? p.promo_value : ''}" 
                            placeholder="0.00" 
                            step="0.01" 
                            class="w-full px-2 py-1.5 border rounded text-sm bg-white outline-none focus:ring-2 focus:ring-rose-500 ${p.promo_active ? 'border-rose-300 text-rose-700 font-bold' : 'border-gray-200'}"
                            onchange="syncMobilePromoInput(${p.id}, 'value')">
                    </div>
                </div>

                <div class="flex items-center justify-between pt-2">
                     <span class="text-xs text-gray-500">Status da Promoção</span>
                     <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="promo_active_mobile_${p.id}" class="sr-only peer" ${p.promo_active ? 'checked' : ''} onchange="syncMobilePromoInput(${p.id}, 'active')">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-rose-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                        <span class="ml-2 text-sm font-medium text-gray-700 peer-checked:text-rose-600">${p.promo_active ? 'Ativa' : 'Inativa'}</span>
                    </label>
                </div>
            </div>
         `).join('');
    }

    // Helper to sync mobile inputs with desktop inputs (which are the source of truth for saving)
    window.syncMobilePromoInput = function (id, field) {
        // Sync to Desktop Elements
        const desktopType = document.getElementById(`promo_type_${id}`);
        const desktopValue = document.getElementById(`promo_value_${id}`);
        const desktopActive = document.getElementById(`promo_active_${id}`);

        const mobileType = document.getElementById(`promo_type_mobile_${id}`);
        const mobileValue = document.getElementById(`promo_value_mobile_${id}`);
        const mobileActive = document.getElementById(`promo_active_mobile_${id}`);

        if (field === 'type' && desktopType && mobileType) desktopType.value = mobileType.value;
        if (field === 'value' && desktopValue && mobileValue) desktopValue.value = mobileValue.value;
        if (field === 'active' && desktopActive && mobileActive) {
            desktopActive.checked = mobileActive.checked;
            // Trigger visual toggle logic
            togglePromoInput(id);
        } else {
            // For value/type changes, just mark dirty
            markProductDirty(id);
        }
    };
};

function togglePromoInput(id) {
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
}

function markProductDirty(id) {
    _dirtyProducts.add(id);
    const btn = document.getElementById('savePromotionsBtn');
    if (btn) {
        btn.classList.add('animate-pulse', 'ring-2', 'ring-rose-400');
    }
}

window.saveProductPromotions = async function () {
    if (_dirtyProducts.size === 0) {
        showToast('Nenhuma alteração para salvar.', 'info');
        return;
    }

    const btn = document.getElementById('savePromotionsBtn');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Salvando...';
        btn.classList.remove('animate-pulse');
    }

    const updates = [];
    _dirtyProducts.forEach(id => {
        const input = document.getElementById(`promo_value_${id}`);
        const select = document.getElementById(`promo_type_${id}`);
        // Note: checkbox for active state - if value > 0, consider it active

        let val = input?.value ? parseFloat(input.value.replace(',', '.')) : 0;
        const typeSelect = select?.value || 'percent';

        // Normalize type to match fast_promotions table format
        const normalizedType = (typeSelect === 'percent' || typeSelect === 'percentage') ? 'percentage' : 'fixed';

        // Active if value > 0
        const active = val > 0;

        updates.push({
            id: parseInt(id, 10),
            promo_value: val,
            promo_type: normalizedType,
            promo_active: active
        });
    });

    try {
        let errorCount = 0;

        for (const up of updates) {
            // Get product name for the record
            const { data: product } = await window.supabaseClient
                .from('fast_products')
                .select('name')
                .eq('id', up.id)
                .maybeSingle();

            const productName = product?.name || '';

            if (up.promo_active && up.promo_value > 0) {
                // UPSERT to fast_promotions: delete existing then insert new
                await window.supabaseClient
                    .from('fast_promotions')
                    .delete()
                    .eq('product_id', up.id);

                const { error } = await window.supabaseClient
                    .from('fast_promotions')
                    .insert({
                        product_id: up.id,
                        product_name: productName,
                        discount_type: up.promo_type,
                        value: up.promo_value,
                        active: true
                    });

                if (error) {
                    console.error(`Erro ao salvar promoção para produto ${up.id}:`, error);
                    errorCount++;
                }
            } else {
                // Remove promotion if value is 0 or inactive
                const { error } = await window.supabaseClient
                    .from('fast_promotions')
                    .delete()
                    .eq('product_id', up.id);

                if (error) {
                    console.error(`Erro ao remover promoção para produto ${up.id}:`, error);
                    // Don't count as error - might not exist
                }
            }

            // Sync fast_products columns to keep both tables consistent
            await window.supabaseClient
                .from('fast_products')
                .update({
                    promo_value: up.promo_value,
                    promo_type: up.promo_type,
                    promo_active: up.promo_active
                })
                .eq('id', up.id);
        }

        if (errorCount === 0) {
            showToast('Promoções salvas com sucesso!', 'success');
            _dirtyProducts.clear();
            if (btn) {
                btn.innerHTML = '<span>💾</span> Salvar Promoções';
                btn.classList.remove('ring-2', 'ring-rose-400');
            }

            // Increment data version to invalidate public cache
            if (window.VersionService) {
                await window.VersionService.incrementVersion('products');
            }
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

window.switchPromoTab = function (tab) {
    const tabs = {
        coupons: document.getElementById('promoTabCoupons'),
        automatic: document.getElementById('promoTabAutomatic'),
        loyalty: document.getElementById('promoTabLoyalty'),
        products: document.getElementById('promoTabProducts') // Added products tab
    };

    Object.entries(tabs).forEach(([k, el]) => {
        if (!el) return;
        el.classList.toggle('hidden', k !== tab);
    });

    const btns = {
        coupons: document.getElementById('promoTabBtnCoupons'),
        automatic: document.getElementById('promoTabBtnAutomatic'),
        loyalty: document.getElementById('promoTabBtnLoyalty'),
        products: document.getElementById('promoTabBtnProducts') // Added products btn
    };

    Object.entries(btns).forEach(([k, btn]) => {
        if (!btn) return;
        const isActive = k === tab;
        // Reset classes
        btn.classList.remove('text-rose-600', 'border-rose-600', 'border-b-2', 'font-medium', 'text-gray-500');

        if (isActive) {
            btn.classList.add('text-rose-600', 'border-rose-600', 'border-b-2', 'font-medium');
        } else {
            btn.classList.add('text-gray-500');
        }
    });

    // Lazy Load
    if (tab === 'automatic') loadSpecialDiscountConfig();
    if (tab === 'loyalty') loadBirthdayDiscountConfig();
    if (tab === 'products') loadProductsForPromotions();
    if (tab === 'coupons') renderCoupons(); // Ensure coupons load
};

// ========================================
// CONFIGURATION LOADERS (Restored)
// ========================================

async function loadSpecialDiscountConfig() {
    // Navigate to Admin > Services > SpecialDiscountService
    if (!window.SpecialDiscountService) {
        console.warn('SpecialDiscountService not found');
        return;
    }

    const container = document.getElementById('specialDiscountStatus');
    if (container) container.innerHTML = 'Carregando...';

    try {
        const config = await window.SpecialDiscountService.getConfig();
        if (!config) {
            if (container) container.innerHTML = '<span class="text-gray-500">Sem configuração</span>';
            return;
        }

        if (document.getElementById('specialDiscountActive')) document.getElementById('specialDiscountActive').checked = config.active !== false;
        if (document.getElementById('specialDiscountType')) document.getElementById('specialDiscountType').value = config.discount_type || 'percentage';
        if (document.getElementById('specialDiscountValue')) document.getElementById('specialDiscountValue').value = config.discount_value || 0;
        if (document.getElementById('specialDiscountMinVal')) document.getElementById('specialDiscountMinVal').value = config.min_order_value || 0;
        if (document.getElementById('specialDiscountMinOrders')) document.getElementById('specialDiscountMinOrders').value = config.min_orders || 10;

        if (container) {
            if ((config.active !== false) && Number(config.discount_value || 0) > 0) {
                const typeText = config.discount_type === 'percentage'
                    ? `${config.discount_value}%`
                    : `R$ ${Number(config.discount_value || 0).toFixed(2).replace('.', ',')}`;
                container.className = 'mb-4 p-3 rounded-lg bg-green-50 border-l-4 border-green-500';
                container.innerHTML = `
                  <p class="text-sm font-bold text-green-800">✅ Desconto Ativo</p>
                  <p class="text-xs text-green-700 mt-1">A cada <strong>${config.min_orders}</strong> pedidos pagos, cliente ganha <strong>${typeText}</strong> de desconto</p>
                  ${Number(config.min_order_value || 0) > 0 ? `<p class="text-xs text-green-600 mt-1">Pedido mínimo: R$ ${Number(config.min_order_value || 0).toFixed(2).replace('.', ',')}</p>` : ''}
                `;
            } else {
                container.className = 'mb-4 p-3 rounded-lg bg-gray-100 border-l-4 border-gray-400';
                container.innerHTML = '<p class="text-sm text-gray-600 font-medium">⚪ Nenhum desconto configurado</p>';
            }
        }
    } catch (e) {
        console.error('Error loading special discount:', e);
        if (container) container.innerHTML = '<span class="text-red-500">Erro ao carregar</span>';
    }
}

async function loadBirthdayDiscountConfig() {
    if (!window.BirthdayDiscountService) {
        console.warn('BirthdayDiscountService not found');
        return;
    }
    const container = document.getElementById('birthdayDiscountStatus');
    if (container) container.innerHTML = 'Carregando...';

    try {
        const config = await window.BirthdayDiscountService.getConfig();
        if (!config) {
            if (container) container.innerHTML = '<span class="text-gray-500">Sem configuração</span>';
            return;
        }

        if (document.getElementById('birthdayDiscountActive')) document.getElementById('birthdayDiscountActive').checked = config.active !== false;
        if (document.getElementById('birthdayDiscountType')) document.getElementById('birthdayDiscountType').value = config.discount_type || 'percentage';
        if (document.getElementById('birthdayDiscountValue')) document.getElementById('birthdayDiscountValue').value = config.discount_value || 0;
        if (document.getElementById('birthdayDiscountValidDays')) document.getElementById('birthdayDiscountValidDays').value = config.valid_days ?? 6;

        if (container) {
            if ((config.active !== false) && Number(config.discount_value || 0) > 0) {
                const typeText = config.discount_type === 'percentage'
                    ? `${config.discount_value}%`
                    : `R$ ${Number(config.discount_value || 0).toFixed(2).replace('.', ',')}`;
                container.className = 'mb-4 p-3 rounded-lg bg-pink-50 border-l-4 border-pink-500';
                container.innerHTML = `
                  <p class="text-sm font-bold text-pink-800">🎂  Desconto Ativo</p>
                  <p class="text-xs text-pink-700 mt-1">Cliente aniversariante ganha <strong>${typeText}</strong> de desconto (uso único por ano)</p>
                `;
            } else {
                container.className = 'mb-4 p-3 rounded-lg bg-gray-100 border-l-4 border-gray-400';
                container.innerHTML = '<p class="text-sm text-gray-600 font-medium">⚪ Nenhum desconto configurado</p>';
            }
        }
    } catch (e) {
        console.error('Error loading birthday discount:', e);
        if (container) container.innerHTML = '<span class="text-red-500">Erro ao carregar</span>';
    }
}

// Bind save buttons
window.saveSpecialDiscountConfig = async function () {
    if (!window.SpecialDiscountService) return;
    const active = document.getElementById('specialDiscountActive').checked;
    const type = document.getElementById('specialDiscountType').value;
    const val = parseFloat(document.getElementById('specialDiscountValue').value) || 0;
    const minVal = parseFloat(document.getElementById('specialDiscountMinVal').value) || 0;
    const minOrders = parseInt(document.getElementById('specialDiscountMinOrders').value) || 10;

    const config = {
        active,
        discount_type: type,
        discount_value: val,
        min_order_value: minVal,
        min_orders: minOrders
    };

    const success = await window.SpecialDiscountService.saveConfig(config);
    if (success) {
        showToast('Configuração salva!', 'success');
        loadSpecialDiscountConfig();
    } else {
        showToast('Erro ao salvar.', 'error');
    }
};

window.saveBirthdayDiscountConfig = async function () {
    if (!window.BirthdayDiscountService) return;
    const active = document.getElementById('birthdayDiscountActive').checked;
    const type = document.getElementById('birthdayDiscountType').value;
    const val = parseFloat(document.getElementById('birthdayDiscountValue').value) || 0;
    const validDays = parseInt(document.getElementById('birthdayDiscountValidDays')?.value) || 6;

    const config = {
        active,
        discount_type: type,
        discount_value: val,
        valid_days: validDays
    };

    const success = await window.BirthdayDiscountService.saveConfig(config);
    if (success) {
        showToast('Configuração salva!', 'success');
        loadBirthdayDiscountConfig();
    } else {
        showToast('Erro ao salvar.', 'error');
    }
};

// Bind clicks if needed, but safe to expose globally and let HTML onclick handle it if present, 
// or let core.js listeners handle it if setup. 
// Looking at admin.html, buttons have ID 'saveSpecialDiscountConfig' but NO onclick.
// So we must add listeners.
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('saveSpecialDiscountConfig')?.addEventListener('click', window.saveSpecialDiscountConfig);
    document.getElementById('saveBirthdayDiscountConfig')?.addEventListener('click', window.saveBirthdayDiscountConfig);

    // Conectar botão de criar/salvar cupom
    document.getElementById('addCouponBtn')?.addEventListener('click', window.handleSaveCoupon);
});

window.renderPromotions = renderPromotions;
window.handleSavePromotion = handleSavePromotion;
window.handleDeletePromotion = handleDeletePromotion;
window.updatePromotionProductSelect = updatePromotionProductSelect;
window.renderCoupons = renderCoupons;
window.handleSaveCoupon = handleSaveCoupon;
window.handleDeleteCoupon = handleDeleteCoupon;
// switchPromoTab is already attached to window above
