
// ========================================
// PRODUCTS MANAGEMENT (ADMIN)
// ========================================

async function saveProduct(name, description, price, category, image) {
    const emojiMap = { salgados: '🍽️', mini: '👨‍🍳', kits: '🎁', bolos: '🎂', combo: '🔥', adicionais: '➕', bebidas: '🥤' };
    const emoji = emojiMap[category] || '🍽️';

    // Campos de disponibilidade
    const startDate = document.getElementById('productStartDate').value || null;
    const endDate = document.getElementById('productEndDate').value || null;
    const unavailableToday = document.getElementById('productUnavailableToday').checked;

    // Campos de promoção
    const promoActive = document.getElementById('productPromoActive').checked;
    const promo = {
        active: promoActive,
        type: document.getElementById('productPromoType').value || 'percent',
        value: parseFloat(document.getElementById('productPromoValue').value) || 0
    };

    // Encomenda
    const isEncomenda = document.getElementById('productIsEncomenda').checked;

    // Exige antecedência (não pode ser pedido para hoje)
    const requires_preorder = document.getElementById('productRequiresPreorder')?.checked || false;

    // Bloqueio de opções (Bolos/Kits)
    const blockMassa = document.getElementById('productBlockMassa')?.checked || false;
    const blockRecheio = document.getElementById('productBlockRecheio')?.checked || false;

    // Flavor Selection (Mini-Salgados)
    let flavorSelection = null;
    if (category === 'mini' && document.getElementById('flavorSelectionEnabled')?.checked) {
        const maxFlavors = parseInt(document.getElementById('flavorSelectionMax')?.value) || 3;
        const availableFlavors = Array.from(document.querySelectorAll('.flavor-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (availableFlavors.length > 0 && maxFlavors > 0) {
            flavorSelection = {
                enabled: true,
                maxFlavors: Math.min(maxFlavors, availableFlavors.length),
                availableFlavors: availableFlavors
            };
        }
    }

    // Catalog fields - Added for catalog feature
    const catalog_enabled = document.getElementById('productCatalogEnabled')?.checked !== false;
    const catalog_vegan = document.getElementById('catalogVegan')?.checked || false;
    const catalog_phrase = document.getElementById('catalogPhrase')?.value?.trim() || null;
    const catalog_order = parseInt(document.getElementById('catalogOrder')?.value) || 0;

    // Build size options array from checkboxes
    const sizeOptionsArr = [];
    if (document.getElementById('catalogSizeSmall')?.checked) sizeOptionsArr.push('Pequeno');
    if (document.getElementById('catalogSizeLarge')?.checked) sizeOptionsArr.push('Grande');
    const catalog_size_options = sizeOptionsArr.length > 0 ? JSON.stringify(sizeOptionsArr) : null;

    // Convert to DB format (snake_case)
    const productData = {
        name, description, price, category,
        image: image || (window.editingProductId ? window.products.find(p => p.id === window.editingProductId)?.image : null),
        emoji,
        start_date: startDate,
        end_date: endDate,
        unavailable_today: unavailableToday,
        is_encomenda: isEncomenda,
        requires_preorder: requires_preorder,
        block_massa: blockMassa,
        block_recheio: blockRecheio,
        flavor_selection: flavorSelection,
        visible: true, // Default
        // Catalog
        catalog_enabled,
        catalog_size_options,
        catalog_vegan,
        catalog_phrase,
        catalog_order,
        // Promo
        promo_active: promo.active,
        promo_type: promo.type,
        promo_value: promo.value
    };

    // Save to Supabase
    try {
        let error;

        if (window.editingProductId) {
            // UPDATE existing product
            productData.id = window.editingProductId;
            const result = await window.supabaseClient
                .from('fast_products')
                .update(productData)
                .eq('id', window.editingProductId);
            error = result.error;
        } else {
            // INSERT new product with Date.now() as ID
            productData.id = Date.now();
            const result = await window.supabaseClient
                .from('fast_products')
                .insert(productData);
            error = result.error;
        }

        if (error) throw error;

        showToast('✅ Produto salvo com sucesso!', 'success');

        // Refresh Lists
        window.editingProductId = null;
        document.getElementById('productForm').reset();

        // Use global load function
        if (typeof loadProductsAdmin === 'function') await loadProductsAdmin();
        if (typeof loadProductsPublic === 'function') loadProductsPublic();

    } catch (e) {
        console.error('Erro ao salvar produto:', e);
        showToast('Erro ao salvar produto: ' + e.message, 'error');
    }
}

async function toggleVisibility(id) {
    const i = window.products.findIndex(p => p.id === id);
    if (i !== -1) {
        window.products[i].visible = !window.products[i].visible;
        // Basic save locally if needed, but ideally we utilize the update
        try {
            await window.supabaseClient
                .from('fast_products')
                .update({ visible: window.products[i].visible })
                .eq('id', id);

            if (typeof loadProductsAdmin === 'function') loadProductsAdmin();
            if (typeof loadProductsPublic === 'function') loadProductsPublic();
        } catch (e) {
            console.error(e);
        }
    }
}

// ========================================
// RENDER & LOAD (ADMIN)
// ========================================

async function loadProductsAdmin() {
    console.log('[Products] Carregando produtos admin...');
    const tableBody = document.getElementById('productsList');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Carregando produtos...</td></tr>';

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');
        const { data: products, error } = await window.supabaseClient
            .from('fast_products')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        window.products = products || []; // Update global

        // Populate filters
        populateCategoryFilter(window.products);

        // Apply filters & Render
        filterAndRenderProducts();

    } catch (e) {
        console.error('Erro ao carregar produtos:', e);
        tableBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-red-500">Erro ao carregar produtos.</td></tr>';
    }
}

function filterAndRenderProducts() {
    const list = document.getElementById('productsList');
    const mobileGrid = document.getElementById('productsGridMobile');
    const searchTerm = document.getElementById('adminSearchInput')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('adminCategoryFilter')?.value || 'all';
    const statusFilter = document.getElementById('adminProductStatusFilter')?.value || 'all';

    if (!list) return;

    const filtered = (window.products || []).filter(p => {
        // Search
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return false;

        // Category
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;

        // Status
        if (statusFilter === 'active' && (!p.visible || p.unavailable_today)) return false;
        if (statusFilter === 'unavailable' && !p.unavailable_today) return false; // Rough logic
        if (statusFilter === 'hidden' && p.visible) return false;

        return true;
    });

    if (filtered.length === 0) {
        const emptyHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Nenhum produto encontrado.</td></tr>';
        list.innerHTML = emptyHTML;
        if (mobileGrid) mobileGrid.innerHTML = '<div class="text-center p-8 text-gray-500">Nenhum produto.</div>';
        return;
    }

    // Render Table (Desktop)
    list.innerHTML = filtered.map(p => {
        const price = parseFloat(p.price || 0).toFixed(2).replace('.', ',');
        const isUnavailable = p.unavailable_today || !p.visible || (p.end_date && new Date(p.end_date) < new Date());

        return `
        <tr class="hover:bg-gray-50 border-b last:border-0 transition-colors group">
            <td class="p-4 align-middle">
                <input type="checkbox" class="product-select rounded text-rose-600 focus:ring-rose-500" value="${p.id}">
            </td>
            <td class="p-4 align-middle text-center">
                <span class="inline-flex items-center justify-center w-8 h-8 rounded-full ${p.catalog_order ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-400'} text-sm font-bold" title="Posição no catálogo">
                    ${p.catalog_order || '-'}
                </span>
            </td>
            <td class="p-4 align-middle">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${p.emoji || '📦'}</span>
                    <div>
                        <div class="font-medium text-gray-900">${p.name}</div>
                        <div class="text-xs text-gray-500 line-clamp-1">${p.description || ''}</div>
                    </div>
                </div>
            </td>
            <td class="p-4 align-middle">
                <span class="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium uppercase min-w-[80px] text-center">
                    ${p.category}
                </span>
            </td>
            <td class="p-4 align-middle font-medium text-gray-900">
                R$ ${price}
            </td>
            <td class="p-4 align-middle text-center">
                <button onclick="toggleVisibility(${p.id})" 
                    class="relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 ${p.visible ? 'bg-green-500' : 'bg-gray-200'}">
                    <span class="sr-only">Toggle visibility</span>
                    <span class="inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${p.visible ? 'translate-x-6' : 'translate-x-1'}"></span>
                </button>
                <div class="mt-1 text-[10px] text-gray-500">
                    ${p.unavailable_today ? '(Indisp. Hoje)' : ''}
                </div>
            </td>
            <td class="p-4 align-middle text-right">
                <button onclick="editProduct(${p.id})" class="text-blue-600 hover:text-blue-800 font-medium text-sm px-2 py-1 hover:bg-blue-50 rounded transition-colors">
                    ✏️ Editar
                </button>
            </td>
        </tr>
    `;
    }).join('');

    // Render Grid (Mobile) - Enhanced
    if (mobileGrid) {
        mobileGrid.innerHTML = filtered.map(p => {
            const price = parseFloat(p.price || 0).toFixed(2).replace('.', ',');
            return `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col gap-3">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-3">
                         <span class="inline-flex items-center justify-center w-8 h-8 rounded-full ${p.catalog_order ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-400'} text-xs font-bold" title="Pos.">${p.catalog_order || '-'}</span>
                         <span class="text-3xl">${p.emoji || '📦'}</span>
                         <div>
                            <h4 class="font-medium text-gray-900 leading-tight">${p.name}</h4>
                            <span class="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium uppercase">
                                ${p.category}
                            </span>
                         </div>
                    </div>
                     <div class="text-right">
                        <div class="font-bold text-gray-900">R$ ${price}</div>
                        <div class="text-[10px] ${p.visible ? 'text-green-600' : 'text-gray-400'} mt-1">
                            ${p.visible ? 'Visível' : 'Oculto'}
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center justify-between pt-3 border-t border-gray-50 mt-1">
                    <button onclick="toggleVisibility(${p.id})" 
                        class="flex items-center gap-2 text-xs font-medium ${p.visible ? 'text-green-700' : 'text-gray-500'} px-2 py-1.5 rounded hover:bg-gray-50 transition-colors">
                        <span class="w-2 h-2 rounded-full ${p.visible ? 'bg-green-500' : 'bg-gray-300'}"></span>
                        ${p.visible ? 'Ativo' : 'Inativo'}
                    </button>
                    
                    <button onclick="editProduct(${p.id})" class="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors text-sm font-medium">
                        ✏️ Editar
                    </button>
                </div>
            </div>
        `}).join('');
    }
}

function populateCategoryFilter(products) {
    const select = document.getElementById('adminCategoryFilter');
    if (!select || select.options.length > 6) return; // Prevent duplicate population
    // Already hardcoded options in HTML, normally fine.
}

window.editProduct = function (id) {
    const p = window.products.find(x => x.id === id);
    if (!p) return;

    window.editingProductId = id;
    document.getElementById('formTitle').textContent = 'Editar Produto';
    document.getElementById('productName').value = p.name;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productCategory').value = p.category;
    document.getElementById('productStartDate').value = p.start_date || '';
    document.getElementById('productEndDate').value = p.end_date || '';
    document.getElementById('productUnavailableToday').checked = p.unavailable_today;
    document.getElementById('productIsEncomenda').checked = p.is_encomenda;
    document.getElementById('productRequiresPreorder').checked = p.requires_preorder;

    if (document.getElementById('productBlockMassa')) document.getElementById('productBlockMassa').checked = p.block_massa;
    if (document.getElementById('productBlockRecheio')) document.getElementById('productBlockRecheio').checked = p.block_recheio;

    // Promo
    document.getElementById('productPromoActive').checked = p.promo_active;
    document.getElementById('productPromoValue').value = p.promo_value || 0;
    document.getElementById('productPromoType').value = p.promo_type || 'percent';

    // Catalog fields
    if (document.getElementById('productCatalogEnabled')) document.getElementById('productCatalogEnabled').checked = p.catalog_enabled;
    if (document.getElementById('catalogVegan')) document.getElementById('catalogVegan').checked = p.catalog_vegan;
    if (document.getElementById('catalogPhrase')) document.getElementById('catalogPhrase').value = p.catalog_phrase || '';
    if (document.getElementById('catalogOrder')) document.getElementById('catalogOrder').value = p.catalog_order || 0;

    const sizes = p.catalog_size_options ? (typeof p.catalog_size_options === 'string' ? JSON.parse(p.catalog_size_options) : p.catalog_size_options) : [];
    if (document.getElementById('catalogSizeSmall')) document.getElementById('catalogSizeSmall').checked = sizes.includes('Pequeno');
    if (document.getElementById('catalogSizeLarge')) document.getElementById('catalogSizeLarge').checked = sizes.includes('Grande');

    document.getElementById('productFormModal').classList.remove('hidden');
    // Also toggle fields visibility based on input
    // (Optional enhancement: trigger change events)
};

// Event Listeners for Filters
document.getElementById('adminSearchInput')?.addEventListener('input', filterAndRenderProducts);
document.getElementById('adminCategoryFilter')?.addEventListener('change', filterAndRenderProducts);
document.getElementById('adminProductStatusFilter')?.addEventListener('change', filterAndRenderProducts);

// ========================================
// PRODUCT OPTIONS (Personalization)
// ========================================
let currentOptionsType = 'cakeMass';

function initOptionsTabs() {
    document.querySelectorAll('.options-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.options-tab').forEach(b => {
                b.classList.remove('bg-rose-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.remove('bg-gray-200', 'text-gray-700');
            e.target.classList.add('bg-rose-600', 'text-white');
            currentOptionsType = e.target.getAttribute('data-type');
            renderOptionsList();
        });
    });

    document.getElementById('addNewOptionBtn')?.addEventListener('click', handleSaveOption);

    // Initial Load
    renderOptionsList();
}

async function renderOptionsList() {
    const container = document.getElementById('optionsListContainer');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-500 text-sm">Carregando opções...</p>';

    try {
        if (!window.supabaseClient) throw new Error('Supabase indisponível');
        const { data: options, error } = await window.supabaseClient
            .from('fast_product_options')
            .select('*')
            .eq('type', currentOptionsType)
            .order('name');

        if (error) throw error;

        if (!options || options.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm italic">Nenhuma opção cadastrada para esta categoria.</p>';
            return;
        }

        container.innerHTML = options.map(opt => {
            const isVisible = opt.visible !== false;
            const visibilityIcon = isVisible ? '👁️' : '🚫';
            const visibilityTitle = isVisible ? 'Ocultar' : 'Mostrar';
            const bgClass = isVisible ? 'bg-gray-50' : 'bg-red-50 opacity-60';
            return `
            <div class="flex items-center justify-between p-2 ${bgClass} rounded border border-gray-100">
                <span class="text-sm font-medium text-gray-700 ${!isVisible ? 'line-through' : ''}">${opt.name}</span>
                <div class="flex gap-1">
                    <button onclick="handleEditOption(${opt.id}, '${opt.name.replace(/'/g, "\\'")}')" class="text-blue-500 hover:text-blue-700 p-1" title="Editar">
                        ✏️
                    </button>
                    <button onclick="handleToggleOptionVisibility(${opt.id}, ${isVisible})" class="text-yellow-600 hover:text-yellow-800 p-1" title="${visibilityTitle}">
                        ${visibilityIcon}
                    </button>
                    <button onclick="handleDeleteOption(${opt.id})" class="text-red-500 hover:text-red-700 p-1" title="Excluir">
                        🗑️
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar opções:', e);
        container.innerHTML = '<p class="text-red-500 text-sm">Erro ao carregar.</p>';
    }
}

async function handleSaveOption() {
    const input = document.getElementById('newOptionName');
    const name = input?.value?.trim();
    if (!name) {
        showToast('Digite o nome da opção.', 'error');
        return;
    }

    try {
        const { error } = await window.supabaseClient
            .from('fast_product_options')
            .insert({
                type: currentOptionsType,
                name: name
            });

        if (error) throw error;

        showToast('Opção adicionada!', 'success');
        input.value = '';
        renderOptionsList();
    } catch (e) {
        console.error('Erro ao salvar opção:', e);
        showToast('Erro ao salvar opção.', 'error');
    }
}

async function handleDeleteOption(id) {
    if (!confirm('Excluir esta opção?')) return;
    try {
        const { error } = await window.supabaseClient
            .from('fast_product_options')
            .delete()
            .eq('id', id);

        if (error) throw error;
        showToast('Opção excluída!', 'success');
        renderOptionsList();
    } catch (e) {
        console.error('Erro ao excluir opção:', e);
        showToast('Erro ao excluir.', 'error');
    }
}

async function handleEditOption(id, currentName) {
    const newName = prompt('Novo nome para a opção:', currentName);
    if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

    try {
        const { error } = await window.supabaseClient
            .from('fast_product_options')
            .update({ name: newName.trim() })
            .eq('id', id);

        if (error) throw error;
        showToast('Opção atualizada!', 'success');
        renderOptionsList();
    } catch (e) {
        console.error('Erro ao editar opção:', e);
        showToast('Erro ao editar.', 'error');
    }
}

async function handleToggleOptionVisibility(id, currentVisible) {
    try {
        const { error } = await window.supabaseClient
            .from('fast_product_options')
            .update({ visible: !currentVisible })
            .eq('id', id);

        if (error) throw error;
        showToast(currentVisible ? 'Opção ocultada!' : 'Opção visível!', 'success');
        renderOptionsList();
    } catch (e) {
        console.error('Erro ao alterar visibilidade:', e);
        showToast('Erro ao alterar visibilidade.', 'error');
    }
}

// Expose and Init
window.handleDeleteOption = handleDeleteOption;
window.handleEditOption = handleEditOption;
window.handleToggleOptionVisibility = handleToggleOptionVisibility;
// Init tabs if element exists
if (document.querySelector('.options-tab')) {
    initOptionsTabs();
}

// ========================================
// FORM SUBMIT HANDLER
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const name = document.getElementById('productName').value.trim();
            const description = document.getElementById('productDescription').value.trim();
            const price = parseFloat(document.getElementById('productPrice').value) || 0;
            const category = document.getElementById('productCategory').value;

            if (!name || !price || !category) {
                showToast('Preencha nome, preço e categoria!', 'error');
                return;
            }

            // Handle image upload if present
            let imageUrl = null;
            const imageInput = document.getElementById('productImage');
            if (imageInput && imageInput.files && imageInput.files[0]) {
                try {
                    showToast('📤 Enviando imagem...', 'info');
                    const file = imageInput.files[0];
                    const fileExt = file.name.split('.').pop();
                    const fileName = `product_${Date.now()}.${fileExt}`;
                    const filePath = `products/${fileName}`;

                    const { data, error } = await window.supabaseClient.storage
                        .from('fast-images')
                        .upload(filePath, file, { cacheControl: '3600', upsert: true });

                    if (error) {
                        console.error('Erro no upload:', error);
                        showToast('⚠️ Erro no upload da imagem, salvando sem imagem...', 'warning');
                    } else {
                        const { data: urlData } = window.supabaseClient.storage
                            .from('fast-images')
                            .getPublicUrl(filePath);
                        imageUrl = urlData?.publicUrl || null;
                    }
                } catch (uploadErr) {
                    console.error('Erro ao enviar imagem:', uploadErr);
                }
            }

            await saveProduct(name, description, price, category, imageUrl);

            // Close modal after save
            document.getElementById('productFormModal').classList.add('hidden');
        });
    }

    // Refresh button handler
    document.getElementById('refreshProductsBtn')?.addEventListener('click', loadProductsAdmin);
});

// Expose globals
window.saveProduct = saveProduct;
window.toggleVisibility = toggleVisibility;
window.loadProductsAdmin = loadProductsAdmin;
