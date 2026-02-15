
// ==========================================
// PRODUCTS MODULE
// ==========================================
// Handles all product-related logic: loading, saving, rendering (Admin/Public),
// filtering, and options/variations.

// products is already declared globally in supabase-init.js
// editingProductId is global
let _topProductsLoading = false;
let _loadProductsPublicTimeout = null;
let _loadProductsPublicLastRun = 0;

// Global client phone for favorites (may be set by checkout form)
// Use window assignment to avoid redeclaration errors
if (typeof window.currentClientPhone === 'undefined') {
    window.currentClientPhone = '';
}

// Helper to map snake_case from Supabase to camelCase
function mapProductData(p) {
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
}

// Fetch products from Supabase (without cache strategy logic)
async function fetchProductsFromSupabase() {
    try {
        // Timeout de 8 segundos para evitar travamento
        const result = await promiseWithTimeout(
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
            products = data.map(mapProductData);
            console.log('[Products] ✅ Carregados do Supabase:', products.length);

            // Salva no cache com versão atual
            const serverVersion = await VersionService.getServerVersion('products');
            DataCache.set('products', products, serverVersion || 1);

            // Backup local legado
            localStorage.setItem('fastProducts', JSON.stringify(products));

            // Esconde aviso de cache (dados atualizados do servidor)
            const cacheNotice = document.getElementById('cacheNotice');
            if (cacheNotice) cacheNotice.classList.add('hidden');
        } else {
            // ⚠️ CORREÇÃO CRÍTICA: NÃO sobrescrever dados!
            console.error('[Products] ⚠️ Supabase retornou vazio - mantendo dados existentes');
            console.error('[Products] Verifique a conexão com o Supabase e as políticas RLS');

            // Tenta usar dados do cache local se disponíveis
            const cached = DataCache.get('products');
            if (cached && cached.items && cached.items.length > 0) {
                products = cached.items;
                console.log('[Products] Usando dados do cache local:', products.length);
            } else {
                const saved = localStorage.getItem('fastProducts');
                if (saved) {
                    products = JSON.parse(saved);
                    console.log('[Products] Usando localStorage legado:', products.length);
                }
            }
        }
    } catch (error) {
        console.error('[Products] Erro ao carregar do Supabase:', error);
        // Fallback para localStorage legado
        const saved = localStorage.getItem('fastProducts');
        if (saved) {
            products = JSON.parse(saved);
            console.log('[Products] Carregados do localStorage (fallback)');
        } else {
            // Tenta cache novo
            const cached = DataCache.get('products');
            if (cached && cached.items && cached.items.length > 0) {
                products = cached.items;
                console.log('[Products] Usando cache após erro:', products.length);
            } else {
                console.error('[Products] ❌ Nenhum dado disponível - NÃO resetando banco!');
                products = [];
            }
        }
    }
}

// Main load function with Hybrid Strategy (Cache + Network)
async function loadProducts() {
    const isAdmin = sessionStorage.getItem('fastAdmin') === '1';

    // ADMIN: sempre busca do Supabase (sem cache)
    if (isAdmin) {
        console.log('[Products] Admin detectado, carregando do Supabase...');
        await fetchProductsFromSupabase();
        return;
    }

    // PÚBLICO: Estratégia híbrida - SEMPRE busca preços do servidor
    try {
        // Guarda cache atual para usar imagens como fallback
        const cached = DataCache.get('products');
        const cachedItems = cached?.items || [];

        console.log('[Products] 💰 Buscando PREÇOS ATUALIZADOS do servidor...');

        // Timeout menor para não travar a UI
        const result = await promiseWithTimeout(
            window.supabaseClient
                .from('fast_products')
                .select('*')
                .order('id', { ascending: true }),
            6000, // 6 segundos
            null
        );

        if (result && result.data && result.data.length > 0) {
            // Mapeia produtos do servidor
            let serverProducts = result.data.map(mapProductData);

            // CACHE HÍBRIDO: Mescla com cache para imagens (servidor sempre tem prioridade nos preços)
            if (cachedItems.length > 0) {
                serverProducts = DataCache.mergeWithCriticalData(serverProducts, cachedItems);
            }

            products = serverProducts;
            console.log('[Products] ✅ Carregados do servidor com preços atuais:', products.length);

            // Atualiza cache com dados novos
            const serverVersion = await VersionService.getServerVersion('products');
            DataCache.set('products', products, serverVersion || Date.now());
            localStorage.setItem('fastProducts', JSON.stringify(products));

            // Inicia background sync para verificar atualizações futuras
            startBackgroundVersionSync();
            return;
        }

        // Se servidor falhou mas tem cache, usa cache COM AVISO
        if (cachedItems.length > 0) {
            products = cachedItems;
            console.warn('[Products] ⚠️ Servidor indisponível, usando cache (preços podem estar desatualizados)');

            // Mostra aviso sutil ao usuário
            setTimeout(() => {
                const notice = document.getElementById('cacheNotice');
                if (notice) notice.classList.remove('hidden');
            }, 1000);

            startBackgroundVersionSync();
            return;
        }

        // Sem servidor E sem cache → fallback completo
        console.log('[Products] Cache não encontrado, buscando fallback...');
        await fetchProductsFromSupabase();
        startBackgroundVersionSync();

    } catch (error) {
        console.error('[Products] Erro no carregamento híbrido:', error);

        // Tenta cache local como último recurso
        const cached = DataCache.get('products');
        if (cached?.items?.length > 0) {
            products = cached.items;
            console.warn('[Products] ⚠️ Usando cache após erro (preços podem estar desatualizados)');
        } else {
            await fetchProductsFromSupabase();
        }
    }
}

async function saveProducts() {
    // Salvar localmente primeiro (rápido)
    localStorage.setItem('fastProducts', JSON.stringify(products));
    // Depois sincronizar com Supabase (assíncrono)
    await saveProductsToSupabase();
}

async function saveProductsToSupabase() {
    try {
        // Upsert todos os produtos
        for (const product of products) {
            const { error } = await window.supabaseClient
                .from('fast_products')
                .upsert({
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    category: product.category,
                    image: product.image,
                    emoji: product.emoji,
                    visible: product.visible,
                    start_date: product.startDate || null,
                    end_date: product.endDate || null,
                    unavailable_today: product.unavailableToday || false,
                    promo: product.promo || null,
                    is_encomenda: product.isEncomenda || false,
                    flavor_selection: product.flavor_selection || null,
                    block_massa: product.blockMassa || false,
                    block_recheio: product.blockRecheio || false,
                    requires_preorder: product.requires_preorder || false,
                    // Catalog fields
                    catalog_enabled: product.catalog_enabled !== undefined ? product.catalog_enabled : true,
                    catalog_size_options: product.catalog_size_options || null,
                    catalog_vegan: product.catalog_vegan || false,
                    catalog_phrase: product.catalog_phrase || null,
                    catalog_order: product.catalog_order || 0
                }, { onConflict: 'id' });

            if (error) {
                console.error('Erro ao salvar produto:', product.name, error);
            }
        }
        console.log('[Products] Sincronizados com Supabase');

        // SMART CACHE: Incrementa versão para invalidar cache dos clientes
        await VersionService.incrementVersion('products');

    } catch (error) {
        console.error('[Products] Erro ao sincronizar com Supabase:', error);
    }
}

// ========================================
// IMAGE COMPRESSION SERVICE
// ========================================
async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // Se não for imagem, retornar o arquivo original
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Calcular novas dimensões mantendo aspect ratio
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }

                // Criar canvas para redimensionar
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Converter para blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });

                            const originalSize = (file.size / 1024).toFixed(1);
                            const newSize = (compressedFile.size / 1024).toFixed(1);
                            console.log(`[ImageCompress] ${originalSize}KB -> ${newSize}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% redução)`);

                            resolve(compressedFile);
                        } else {
                            resolve(file); // Fallback para original
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

// Upload de imagem para Supabase Storage (com compressão)
async function uploadImageToStorage(file) {
    try {
        // Comprimir imagem antes do upload
        const compressedFile = await compressImage(file, 800, 800, 0.8);

        const fileExt = 'jpg'; // Sempre JPEG após compressão
        const fileName = `product_${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { data, error } = await window.supabaseClient.storage
            .from('fast-images')
            .upload(filePath, compressedFile, {
                cacheControl: '3600',
                upsert: false,
                contentType: 'image/jpeg'
            });

        if (error) throw error;

        // Retornar URL pública da imagem
        const { data: urlData } = window.supabaseClient.storage
            .from('fast-images')
            .getPublicUrl(filePath);

        console.log('Imagem enviada:', urlData.publicUrl);
        return urlData.publicUrl;
    } catch (error) {
        console.error('Erro ao enviar imagem:', error);
        // Fallback: retornar base64 se o upload falhar
        return null;
    }
}


async function saveProduct(name, description, price, category, image) {
    const emojiMap = { salgados: '🥟', mini: '🧁', kits: '🎁', bolos: '🎂', combo: '🔥', adicionais: '➕', bebidas: '🥤' };
    const emoji = emojiMap[category] || '🥟';

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

    if (editingProductId) {
        const i = products.findIndex(p => p.id === editingProductId);
        if (i !== -1) {
            products[i] = {
                ...products[i],
                name, description, price, category,
                image: image || products[i].image,
                emoji, startDate, endDate, unavailableToday,
                promo, isEncomenda, flavor_selection: flavorSelection,
                blockMassa, blockRecheio, requires_preorder,
                // Catalog fields
                catalog_enabled, catalog_size_options, catalog_vegan, catalog_phrase, catalog_order
            };
        }
        editingProductId = null;
    } else {
        products.push({
            id: Date.now(), name, description, price, category,
            image, emoji, visible: true, startDate, endDate, unavailableToday,
            promo, isEncomenda, flavor_selection: flavorSelection,
            blockMassa, blockRecheio, requires_preorder,
            // Catalog fields
            catalog_enabled, catalog_size_options, catalog_vegan, catalog_phrase, catalog_order
        });
    }

    await saveProducts();
    loadProductsAdmin();
    loadProductsPublic();
    document.getElementById('productForm').reset();
    showInlineMessage('productsPanelFast', '✅ Produto salvo com sucesso!', 'success');
}

// Admin Display Logic
window.adminFilter = window.adminFilter || 'all';

// Wrapper seguro para chamar a implementação principal do admin.js
function loadProductsAdmin() {
    if (window.loadProductsAdmin && window.loadProductsAdmin !== loadProductsAdmin) {
        window.loadProductsAdmin();
    }
}

function toggleVisibility(id) { const i = products.findIndex(p => p.id === id); if (i !== -1) { products[i].visible = !products[i].visible; saveProducts(); loadProductsAdmin(); loadProductsPublic(); } }

function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (p) {
        document.getElementById('productName').value = p.name;
        document.getElementById('productDescription').value = p.description;
        document.getElementById('productPrice').value = p.price;
        document.getElementById('productCategory').value = p.category;
        // Campos de disponibilidade
        document.getElementById('productStartDate').value = p.startDate || '';
        document.getElementById('productEndDate').value = p.endDate || '';
        document.getElementById('productUnavailableToday').checked = !!p.unavailableToday;
        // Campos de promoção
        const promoActive = p.promo?.active || false;
        document.getElementById('productPromoActive').checked = promoActive;
        document.getElementById('productPromoType').value = p.promo?.type || 'percent';
        document.getElementById('productPromoValue').value = p.promo?.value || '';
        document.getElementById('promoDetailsFields').classList.toggle('hidden', !promoActive);
        // Encomenda
        document.getElementById('productIsEncomenda').checked = !!p.isEncomenda;

        // Exige antecedência (não pode ser pedido para hoje)
        const preorderCheckbox = document.getElementById('productRequiresPreorder');
        if (preorderCheckbox) preorderCheckbox.checked = !!p.requires_preorder;

        // Bloqueio de opções (Bolos/Kits)
        const blockSection = document.getElementById('blockOptionsSection');
        if (p.category === 'bolos' || p.category === 'kits') {
            blockSection?.classList.remove('hidden');
            document.getElementById('productBlockMassa').checked = !!p.blockMassa;
            document.getElementById('productBlockRecheio').checked = !!p.blockRecheio;
        } else {
            blockSection?.classList.add('hidden');
            document.getElementById('productBlockMassa').checked = false;
            document.getElementById('productBlockRecheio').checked = false;
        }

        // Catalog fields - Added for catalog feature
        document.getElementById('productCatalogEnabled').checked = p.catalog_enabled !== false;
        document.getElementById('catalogVegan').checked = !!p.catalog_vegan;
        document.getElementById('catalogPhrase').value = p.catalog_phrase || '';
        document.getElementById('catalogOrder').value = p.catalog_order || 0;
        // Parse size options
        const sizeOpts = p.catalog_size_options ? (typeof p.catalog_size_options === 'string' ? JSON.parse(p.catalog_size_options) : p.catalog_size_options) : [];
        document.getElementById('catalogSizeSmall').checked = Array.isArray(sizeOpts) && sizeOpts.includes('Pequeno');
        document.getElementById('catalogSizeLarge').checked = Array.isArray(sizeOpts) && sizeOpts.includes('Grande');

        editingProductId = id;
        // Scroll to form
        document.getElementById('productForm').scrollIntoView({ behavior: 'smooth' });
    }
}

// ========================================
// PRODUCT DELETE
// ========================================
let pendingDeleteProductId = null;

function deleteProduct(id) {
    const product = products.find(p => p.id === id);
    pendingDeleteProductId = id;
    document.getElementById('deleteProductName').textContent = product?.name || 'este produto';
    document.getElementById('deleteProductModal').classList.remove('hidden');
}

function cancelDeleteProduct() {
    pendingDeleteProductId = null;
    document.getElementById('deleteProductModal').classList.add('hidden');
}

async function confirmDeleteProduct() {
    if (pendingDeleteProductId) {
        // Delete from Supabase first
        try {
            const { error } = await window.supabaseClient
                .from('fast_products')
                .delete()
                .eq('id', pendingDeleteProductId);

            if (error) {
                console.error('Erro ao excluir produto do Supabase:', error);
            } else {
                console.log('Produto excluído do Supabase:', pendingDeleteProductId);
            }
        } catch (e) {
            console.error('Erro ao excluir produto:', e);
        }

        // Remove from local array
        products = products.filter(p => p.id !== pendingDeleteProductId);

        // Update localStorage
        localStorage.setItem('fastProducts', JSON.stringify(products));

        // Reload UI
        loadProductsAdmin();
        loadProductsPublic();
    }
    pendingDeleteProductId = null;
    document.getElementById('deleteProductModal').classList.add('hidden');
}


// ========================================
// PRODUCT AVAILABILITY CHECK
// ========================================
function isProductAvailableToday(product) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Indisponível hoje (flag manual)
    if (product.unavailableToday) return false;

    // Sazonalidade (período definido)
    if (product.startDate && product.endDate) {
        const start = safeDate(product.startDate);
        const end = safeDate(product.endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        if (today < start || today > end) return false;
    }

    // Visibilidade normal
    if (product.visible === false) return false;

    return true;
}

// ========================================
// PUBLIC RENDER LOGIC
// ========================================
// ========================================
// PUBLIC RENDER LOGIC
// ========================================
// Moved to ui.js


async function renderTopProductsSection() {
    // Hide the dedicated card section — top products are now shown as badges on individual cards
    const section = document.getElementById('topProductsSection');
    if (section) section.classList.add('hidden');

    if (_topProductsLoading) return;
    _topProductsLoading = true;

    try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();

        const { data: orders, error } = await window.supabaseClient
            .from('fast_orders')
            .select('items')
            .gte('created_at', startDate)
            .neq('status', 'cancelled');

        if (error) throw error;

        const productCounts = {};
        (orders || []).forEach(order => {
            (order.items || []).forEach(item => {
                const productId = item.id;
                if (productId) {
                    productCounts[productId] = (productCounts[productId] || 0) + (item.quantity || 1);
                }
            });
        });

        const topProductIds = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id]) => parseInt(id, 10) || id);

        // Store globally so product card renderers can add badges
        window._topProductIds = topProductIds;
        window._topProductMedals = { 0: '🥇', 1: '🥈', 2: '🥉' };

        console.log('[TopProducts] Top 3 IDs:', topProductIds);
    } catch (e) {
        console.warn('[TopProducts] Erro ao carregar:', e);
        window._topProductIds = [];
    } finally {
        _topProductsLoading = false;
    }
}

function renderUpsellSuggestions() {
    const section = document.getElementById('upsellSection');
    const container = document.getElementById('upsellContainer');
    if (!section || !container) return;

    if (cart.length === 0) {
        section.classList.add('hidden');
        return;
    }

    const cartProductIds = cart.map(item => item.id);
    const cartProducts = products.filter(p => cartProductIds.includes(p.id));
    const cartCategories = [...new Set(cartProducts.map(p => p.category))];

    const complementMap = {
        'salgados': ['bebidas', 'adicionais'],
        'mini': ['bebidas', 'adicionais'],
        'kits': ['bebidas', 'adicionais'],
        'bolos': ['bebidas'],
        'bebidas': ['salgados', 'adicionais'],
        'adicionais': ['bebidas']
    };

    let suggestCategories = [];
    cartCategories.forEach(cat => {
        if (complementMap[cat]) {
            suggestCategories.push(...complementMap[cat]);
        }
    });
    suggestCategories = [...new Set(suggestCategories)].filter(cat => !cartCategories.includes(cat));

    if (suggestCategories.length === 0) {
        section.classList.add('hidden');
        return;
    }

    const suggestions = products
        .filter(p =>
            suggestCategories.includes(p.category) &&
            !cartProductIds.includes(p.id) &&
            isProductAvailableToday(p) &&
            p.visible !== false
        )
        .slice(0, 2);

    if (suggestions.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = suggestions.map(product => {
        const priceDisplay = `R$ ${product.price.toFixed(2).replace('.', ',')} `;
        return `
    <div class="flex-shrink-0 bg-white rounded-lg p-2 border shadow-sm min-w-[120px]">
        <div class="flex items-center gap-2 mb-1">
          ${(window.isValidImageUrl ? window.isValidImageUrl(product.image) : !!product.image) ? `<img src="${product.image}" class="w-8 h-8 object-cover rounded">` : `<span class="text-lg">${product.emoji}</span>`}
          <span class="text-xs font-medium text-gray-800 truncate flex-1">${product.name}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-rose-600 font-bold">${priceDisplay}</span>
          <button class="add-to-cart bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs" 
            data-id="${product.id}" data-name="${product.name}" data-description="${product.description || ''}" data-price="${product.price}">+</button>
        </div>
      </div>
    `;
    }).join('');
}

// ========================================
// MINI-SALGADOS MODAL & CUSTOM UI
// ========================================
let pendingMiniProduct = null;
let miniMaxFlavors = 3;

function openMiniSalgadosModal(product) {
    pendingMiniProduct = product;
    const fs = product.flavor_selection;
    miniMaxFlavors = fs?.maxFlavors || 3;

    const promotion = (typeof promotions !== 'undefined') ? promotions.find(p => p.productId === product.id) : null;
    let displayPrice = product.price;
    if (promotion) {
        if (promotion.type === 'percentage') {
            displayPrice = product.price * (1 - promotion.value / 100);
        } else {
            displayPrice = product.price - promotion.value;
        }
    }
    pendingMiniProduct.displayPrice = displayPrice;

    document.getElementById('miniProductName').textContent = product.name;
    document.getElementById('miniProductPrice').textContent = `R$ ${displayPrice.toFixed(2).replace('.', ',')} `;
    document.getElementById('miniFlavorLimit').textContent = `(até ${miniMaxFlavors})`;
    document.getElementById('miniFlavorCounter').textContent = `Selecionados: 0 / ${miniMaxFlavors} `;

    const container = document.getElementById('miniFlavorsContainer');
    const allFlavors = ProductOptionsModule.getVisible('miniSalgadosFlavors');
    const availableIds = fs?.availableFlavors || allFlavors.map(f => f.id);

    const flavors = allFlavors.filter(f => availableIds.includes(f.id));

    if (flavors.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Nenhum sabor disponível para este produto.</p>';
    } else {
        container.innerHTML = flavors.map(f => `
            <label class="flex items-center p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" name="miniFlavor" value="${f.name}" class="mr-3 text-rose-600 mini-flavor-checkbox">
                <span>${f.name}</span>
            </label>
        `).join('');
    }

    document.getElementById('miniSalgadosError').classList.add('hidden');
    document.getElementById('miniSalgadosModal').classList.remove('hidden');
}

function closeMiniSalgadosModal() {
    pendingMiniProduct = null;
    document.getElementById('miniSalgadosModal').classList.add('hidden');
}

function updateMiniFlavorCounter() {
    const checked = document.querySelectorAll('.mini-flavor-checkbox:checked').length;
    const counter = document.getElementById('miniFlavorCounter');
    if (counter) {
        counter.textContent = `Selecionados: ${checked}/${miniMaxFlavors}`;
        counter.classList.toggle('text-red-600', checked > miniMaxFlavors);
        counter.classList.toggle('text-rose-600', checked <= miniMaxFlavors);
    }
}

document.addEventListener('change', function (e) {
    if (e.target.classList.contains('mini-flavor-checkbox')) {
        const checked = document.querySelectorAll('.mini-flavor-checkbox:checked').length;
        if (checked > miniMaxFlavors) {
            e.target.checked = false;
            const errorEl = document.getElementById('miniSalgadosError');
            if (errorEl) {
                errorEl.textContent = `Você pode escolher no máximo ${miniMaxFlavors} sabores.`;
                errorEl.classList.remove('hidden');
                setTimeout(() => errorEl.classList.add('hidden'), 3000);
            }
        }
        updateMiniFlavorCounter();
    }
});

function confirmMiniSalgados() {
    if (!pendingMiniProduct) return;

    const selectedFlavors = Array.from(document.querySelectorAll('.mini-flavor-checkbox:checked'))
        .map(cb => cb.value);

    const errorEl = document.getElementById('miniSalgadosError');

    if (selectedFlavors.length === 0) {
        errorEl.textContent = 'Selecione pelo menos um sabor.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (selectedFlavors.length > miniMaxFlavors) {
        errorEl.textContent = `Selecione no máximo ${miniMaxFlavors} sabores.`;
        errorEl.classList.remove('hidden');
        return;
    }

    const note = `Sabores: ${selectedFlavors.join(', ')}`;

    const existingIndex = cart.findIndex(item =>
        item.id === pendingMiniProduct.id && item.note === note
    );

    if (existingIndex !== -1) {
        cart[existingIndex].quantity++;
    } else {
        cart.push({
            id: pendingMiniProduct.id,
            name: pendingMiniProduct.name,
            description: pendingMiniProduct.description || '',
            price: pendingMiniProduct.displayPrice || pendingMiniProduct.price,
            quantity: 1,
            note: note,
            customOptions: { flavors: selectedFlavors }
        });
    }

    updateCart();
    closeMiniSalgadosModal();
}

// ========================================
// CUSTOM PRODUCT OPTIONS MODAL (Kits/Bolos)
// ========================================
let pendingCustomProduct = null;

function openCustomOptionsModal(id, name, description, price, category) {
    const product = products.find(p => p.id === id);
    const blockMassa = product?.blockMassa || false;
    const blockRecheio = product?.blockRecheio || false;

    pendingCustomProduct = { id, name, description, price, category, blockMassa, blockRecheio };

    document.getElementById('customOptionsProductName').textContent = name;
    document.getElementById('customOptionsProductPrice').textContent = `R$ ${price.toFixed(2).replace('.', ',')}`;

    if (category === 'kits') {
        document.getElementById('customOptionsTitle').textContent = '🎉 Personalizar Kit Festa';
        document.getElementById('salgadosSection').classList.remove('hidden');
    } else {
        document.getElementById('customOptionsTitle').textContent = '🎂 Personalizar Bolo';
        document.getElementById('salgadosSection').classList.add('hidden');
    }

    renderDynamicCakeMassOptions();
    renderDynamicFillingOptions();
    renderDynamicSalgadosOptions(category === 'kits' ? 'miniSalgadosFlavors' : 'salgados');

    const cakeMassSection = document.getElementById('cakeMassSection');
    const fillingSection = document.getElementById('fillingSection');

    if (cakeMassSection) {
        if (blockMassa) {
            cakeMassSection.classList.add('hidden');
        } else {
            cakeMassSection.classList.remove('hidden');
        }
    }

    if (fillingSection) {
        if (blockRecheio) {
            fillingSection.classList.add('hidden');
        } else {
            fillingSection.classList.remove('hidden');
        }
    }

    document.getElementById('customOptionsError').classList.add('hidden');
    updateSalgadosCounter();

    document.getElementById('customOptionsModal').classList.remove('hidden');
}

function renderDynamicCakeMassOptions() {
    const container = document.querySelector('#cakeMassSection .space-y-2');
    if (!container) return;

    const options = ProductOptionsModule.getVisible('cakeMass');
    if (options.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma opção disponível</p>';
        return;
    }

    container.innerHTML = options.map(opt => `
    <label class="flex items-center p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="radio" name="cakeMass" value="${opt.name}" class="mr-3 text-rose-600">
      <span>${opt.name}</span>
    </label>
  `).join('');
}

function renderDynamicFillingOptions() {
    const container = document.querySelector('#fillingSection .space-y-2');
    if (!container) return;

    const options = ProductOptionsModule.getVisible('filling');
    if (options.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma opção disponível</p>';
        return;
    }

    container.innerHTML = options.map(opt => `
    <label class="flex items-center p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="radio" name="filling" value="${opt.name}" class="mr-3 text-rose-600">
      <span>${opt.name}</span>
    </label>
  `).join('');
}

function renderDynamicSalgadosOptions(type = 'salgados') {
    const container = document.querySelector('#salgadosSection .space-y-2');
    if (!container) return;

    const options = ProductOptionsModule.getVisible(type);
    if (options.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma opção disponível</p>';
        return;
    }

    container.innerHTML = options.map(opt => `
    <label class="flex items-center p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="checkbox" name="salgados" value="${opt.name}" class="mr-3 text-rose-600 salgado-checkbox">
      <span>${opt.name}</span>
    </label>
  `).join('');
}

function closeCustomOptionsModal() {
    pendingCustomProduct = null;
    document.getElementById('customOptionsModal').classList.add('hidden');
}

function updateSalgadosCounter() {
    const checked = document.querySelectorAll('.salgado-checkbox:checked').length;
    const counter = document.getElementById('salgadosCounter');
    if (counter) {
        counter.textContent = `Selecionados: ${checked}/4`;
        counter.classList.toggle('text-red-600', checked > 4);
        counter.classList.toggle('text-rose-600', checked <= 4);
    }
}

document.addEventListener('change', function (e) {
    if (e.target.classList.contains('salgado-checkbox')) {
        const checked = document.querySelectorAll('.salgado-checkbox:checked').length;
        if (checked > 4) {
            e.target.checked = false;
            const errorEl = document.getElementById('customOptionsError');
            if (errorEl) {
                errorEl.textContent = 'Você pode escolher no máximo 4 sabores de salgados.';
                errorEl.classList.remove('hidden');
                setTimeout(() => errorEl.classList.add('hidden'), 3000);
            }
        }
        updateSalgadosCounter();
    }
});

function confirmCustomOptions() {
    if (!pendingCustomProduct) return;

    const { id, name, description, price, category, blockMassa, blockRecheio } = pendingCustomProduct;
    const errorEl = document.getElementById('customOptionsError');

    const cakeMass = document.querySelector('input[name="cakeMass"]:checked')?.value;
    const filling = document.querySelector('input[name="filling"]:checked')?.value;

    if (!blockMassa && !cakeMass) {
        errorEl.textContent = 'Selecione a massa do bolo.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (!blockRecheio && !filling) {
        errorEl.textContent = 'Selecione o sabor do recheio.';
        errorEl.classList.remove('hidden');
        return;
    }

    let salgados = [];
    if (category === 'kits') {
        salgados = Array.from(document.querySelectorAll('.salgado-checkbox:checked')).map(c => c.value);
        if (salgados.length === 0) {
            errorEl.textContent = 'Selecione pelo menos 1 sabor de salgado.';
            errorEl.classList.remove('hidden');
            return;
        }
    }

    let customNoteParts = [];
    if (!blockMassa && cakeMass) customNoteParts.push(`Massa: ${cakeMass}`);
    if (!blockRecheio && filling) customNoteParts.push(`Recheio: ${filling}`);
    if (salgados.length > 0) customNoteParts.push(`Salgados: ${salgados.join(', ')}`);

    let customNote = customNoteParts.join(' | ');

    const cartItem = {
        id,
        name,
        description,
        price,
        quantity: 1,
        note: customNote || null,
        customOptions: {
            cakeMass: blockMassa ? null : cakeMass,
            filling: blockRecheio ? null : filling,
            salgados
        }
    };

    const existing = cart.find(i => i.id === id && i.note === customNote);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push(cartItem);
    }

    updateCart();
    closeCustomOptionsModal();
}

// ========================================
// PRODUCT OPTIONS MODULE
// ========================================
const ProductOptionsModule = {
    options: {
        cakeMass: [],
        filling: [],
        salgados: [],
        miniSalgadosFlavors: []
    },
    loaded: false,
    defaults: {
        cakeMass: [
            { name: 'Massa Branca', visible: true, sort_order: 1 },
            { name: 'Massa de Chocolate', visible: true, sort_order: 2 }
        ],
        filling: [
            { name: 'Ninho', visible: true, sort_order: 1 },
            { name: 'Beijinho', visible: true, sort_order: 2 },
            { name: 'Chocolate', visible: true, sort_order: 3 },
            { name: 'Chocolate com Côco', visible: true, sort_order: 4 },
            { name: 'Ninho com Côco', visible: true, sort_order: 5 },
            { name: 'Ninho com Chocolate', visible: true, sort_order: 6 }
        ],
        salgados: [
            { name: 'Coxinha', visible: true, sort_order: 1 },
            { name: 'Bolinha de Carne', visible: true, sort_order: 2 },
            { name: 'Cazulo de Presunto e Queijo', visible: true, sort_order: 3 },
            { name: 'Quibe', visible: true, sort_order: 4 },
            { name: 'Bolinha de Queijo', visible: true, sort_order: 5 },
            { name: 'Enroladinho de Salsicha', visible: true, sort_order: 6 }
        ],
        miniSalgadosFlavors: [
            { name: 'Coxinha', visible: true, sort_order: 1 },
            { name: 'Enroladinho', visible: true, sort_order: 2 },
            { name: 'Quibe', visible: true, sort_order: 3 },
            { name: 'Bolinha de Carne', visible: true, sort_order: 4 },
            { name: 'Bolinha de Queijo', visible: true, sort_order: 5 },
            { name: 'Risole de Carne', visible: true, sort_order: 6 },
            { name: 'Risole de Queijo', visible: true, sort_order: 7 }
        ]
    },

    load: async function () {
        try {
            console.log('[ProductOptions] Carregando opções do Supabase...');
            const { data, error } = await window.supabaseClient
                .from('fast_product_options')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                this.options = { cakeMass: [], filling: [], salgados: [], miniSalgadosFlavors: [] };
                data.forEach(opt => {
                    if (this.options[opt.type]) {
                        this.options[opt.type].push(opt);
                    }
                });
                console.log('[ProductOptions] Opções carregadas:', Object.keys(this.options).map(k => `${k}: ${this.options[k].length}`).join(', '));
            } else {
                console.log('[ProductOptions] Tabela vazia, populando com padrões...');
                await this.seedDefaults();
            }
            localStorage.setItem('fastProductOptions', JSON.stringify(this.options));
            this.loaded = true;
            return this.options;
        } catch (e) {
            console.warn('[ProductOptions] Erro ao carregar do Supabase, usando cache local:', e);
            const cached = localStorage.getItem('fastProductOptions');
            if (cached) {
                this.options = JSON.parse(cached);
            } else {
                this.options = JSON.parse(JSON.stringify(this.defaults));
                this.options.cakeMass.forEach((o, i) => o.id = -(i + 1));
                this.options.filling.forEach((o, i) => o.id = -(i + 100));
                this.options.salgados.forEach((o, i) => o.id = -(i + 200));
                this.options.miniSalgadosFlavors.forEach((o, i) => o.id = -(i + 300));
            }
            this.loaded = true;
            return this.options;
        }
    },

    seedDefaults: async function () {
        try {
            const inserts = [];
            Object.keys(this.defaults).forEach(type => {
                this.defaults[type].forEach(opt => {
                    inserts.push({ type, name: opt.name, visible: opt.visible, sort_order: opt.sort_order });
                });
            });
            const { data, error } = await window.supabaseClient
                .from('fast_product_options')
                .insert(inserts)
                .select();
            if (error) throw error;
            return await this.load();
        } catch (e) {
            console.error('[ProductOptions] Erro ao popular padrões:', e);
        }
    },

    getVisible: function (type) {
        return (this.options[type] || []).filter(o => o.visible);
    },

    getAll: function (type) {
        return this.options[type] || [];
    },

    add: async function (type, name) {
        try {
            const maxOrder = Math.max(0, ...this.options[type].map(o => o.sort_order || 0));
            const { data, error } = await window.supabaseClient
                .from('fast_product_options')
                .insert({ type, name, visible: true, sort_order: maxOrder + 1 })
                .select()
                .single();
            if (error) throw error;
            this.options[type].push(data);
            localStorage.setItem('fastProductOptions', JSON.stringify(this.options));
            return { success: true, data };
        } catch (e) {
            console.error('[ProductOptions] Erro ao adicionar:', e);
            return { success: false, error: e.message };
        }
    },

    update: async function (id, updates) {
        try {
            const { data, error } = await window.supabaseClient
                .from('fast_product_options')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            Object.keys(this.options).forEach(type => {
                const idx = this.options[type].findIndex(o => o.id === id);
                if (idx !== -1) {
                    this.options[type][idx] = { ...this.options[type][idx], ...data };
                }
            });
            localStorage.setItem('fastProductOptions', JSON.stringify(this.options));
            return { success: true, data };
        } catch (e) {
            console.error('[ProductOptions] Erro ao atualizar:', e);
            return { success: false, error: e.message };
        }
    },

    toggleVisibility: async function (id) {
        let opt = null;
        Object.keys(this.options).forEach(type => {
            const found = this.options[type].find(o => o.id === id);
            if (found) opt = found;
        });
        if (!opt) return { success: false, error: 'Opção não encontrada' };
        return await this.update(id, { visible: !opt.visible });
    },

    delete: async function (id) {
        try {
            const { error } = await window.supabaseClient
                .from('fast_product_options')
                .delete()
                .eq('id', id);
            if (error) throw error;
            Object.keys(this.options).forEach(type => {
                this.options[type] = this.options[type].filter(o => o.id !== id);
            });
            localStorage.setItem('fastProductOptions', JSON.stringify(this.options));
            await this.cleanupProductReferences(id);
            return { success: true };
        } catch (e) {
            console.error('[ProductOptions] Erro ao excluir:', e);
            return { success: false, error: e.message };
        }
    },

    cleanupProductReferences: async function (deletedOptionId) {
        try {
            const { data: prods } = await window.supabaseClient
                .from('fast_products')
                .select('id, flavor_selection')
                .not('flavor_selection', 'is', null);
            if (!prods || prods.length === 0) return;
            for (const p of prods) {
                if (p.flavor_selection && Array.isArray(p.flavor_selection.availableFlavors)) {
                    const newFlavors = p.flavor_selection.availableFlavors.filter(fid => fid !== deletedOptionId);
                    if (newFlavors.length !== p.flavor_selection.availableFlavors.length) {
                        await window.supabaseClient
                            .from('fast_products')
                            .update({ flavor_selection: { ...p.flavor_selection, availableFlavors: newFlavors } })
                            .eq('id', p.id);
                    }
                }
            }
        } catch (e) {
            console.warn('[ProductOptions] Erro ao limpar referências:', e);
        }
    },

    reorder: async function (type, orderedIds) {
        try {
            for (let i = 0; i < orderedIds.length; i++) {
                await window.supabaseClient
                    .from('fast_product_options')
                    .update({ sort_order: i + 1 })
                    .eq('id', orderedIds[i]);
            }
            await this.load();
            return { success: true };
        } catch (e) {
            console.error('[ProductOptions] Erro ao reordenar:', e);
            return { success: false, error: e.message };
        }
    }
};
