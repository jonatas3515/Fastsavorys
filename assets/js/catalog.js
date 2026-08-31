
// ========================================
// CATALOG MODULE - Catálogo em formato revista
// Displays products in a magazine-style overlay
// ========================================

window.CatalogModule = {
    products: [],
    currentPage: 0,
    isMobile: false,
    previousOverflow: '',
    _initialized: false, // Flag para prevenir inicialização múltipla
    // Touch/swipe support properties
    touchStartX: 0,
    touchEndX: 0,

    init: function () {
        // Detectar mobile (lg breakpoint = 1024px)
        this.isMobile = window.innerWidth < 1024;

        // Registrar event listeners apenas UMA vez
        if (this._initialized) return;
        this._initialized = true;

        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth < 1024;
            // Re-render if breakpoint crossed while catalog is open
            if (wasMobile !== this.isMobile && !document.getElementById('catalogOverlay').classList.contains('hidden')) {
                this.render();
            }
        });

        // ESC to close catalog
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('catalogOverlay').classList.contains('hidden')) {
                this.close();
            }
        });

        // Initialize swipe support
        this.bindSwipeEvents();
    },

    // Swipe (touch) event handlers for iOS/Android
    bindSwipeEvents: function () {
        const book = document.getElementById('catalogBook');
        if (!book) return;

        book.addEventListener('touchstart', (e) => {
            if (!e.touches || !e.touches.length) return;
            this.touchStartX = e.touches[0].clientX;
            this.touchEndX = this.touchStartX;
        }, { passive: true });

        book.addEventListener('touchmove', (e) => {
            if (!e.touches || !e.touches.length) return;
            this.touchEndX = e.touches[0].clientX;
        }, { passive: true });

        book.addEventListener('touchend', () => {
            const deltaX = this.touchEndX - this.touchStartX;
            const threshold = 40; // minimum px to trigger swipe

            if (Math.abs(deltaX) > threshold) {
                if (deltaX < 0) {
                    this.navigate(1);  // swipe left -> next page
                } else {
                    this.navigate(-1); // swipe right -> previous page
                }
            }

            this.touchStartX = 0;
            this.touchEndX = 0;
        });
    },

    open: async function () {
        // If products haven't been loaded yet (e.g., opening from landing page), load them first
        // Note: products global variable must be available
        if ((!products || products.length === 0) && typeof fetchProductsFromSupabase === 'function') {
            await fetchProductsFromSupabase();
        }

        this.loadProducts();
        this.currentPage = 0;
        this.render();
        // Save previous overflow and prevent body scroll
        this.previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.getElementById('catalogOverlay').classList.remove('hidden');
    },

    close: function () {
        document.getElementById('catalogOverlay').classList.add('hidden');
        // Restore previous overflow
        document.body.style.overflow = this.previousOverflow || '';
    },

    loadProducts: function () {
        // Use global products array, filter for catalog_enabled (default true if field missing)
        // Sort by catalog_order (lower first)
        if (!products) {
            console.warn('[CatalogModule] products variable not defined');
            this.products = [];
            return;
        }
        this.products = products.filter(p =>
            p.visible !== false &&
            (p.catalog_enabled === undefined || p.catalog_enabled === true)
        ).sort((a, b) => (a.catalog_order || 0) - (b.catalog_order || 0));
    },

    render: function () {
        const leftPage = document.getElementById('catalogPageLeft');
        const rightPage = document.getElementById('catalogPageRight');
        const pageInfo = document.getElementById('catalogPageInfo');
        const prevBtn = document.getElementById('catalogPrevBtn');
        const nextBtn = document.getElementById('catalogNextBtn');

        if (!rightPage) return;

        // Calculate products per page and total pages
        const productsPerPage = this.isMobile ? 1 : 2;
        const totalPages = Math.ceil(this.products.length / productsPerPage);

        // Handle empty catalog
        if (this.products.length === 0) {
            rightPage.innerHTML = this.renderEmptyMessage();
            if (leftPage) leftPage.innerHTML = '';
            pageInfo.textContent = 'Catálogo vazio';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }

        // Calculate product indices for current page
        const startIdx = this.currentPage * productsPerPage;
        const product1 = this.products[startIdx];
        const product2 = this.isMobile ? null : this.products[startIdx + 1];

        // Render pages
        if (this.isMobile) {
            rightPage.innerHTML = product1 ? this.renderProductPage(product1) : this.renderEmptyPage();
            if (leftPage) leftPage.innerHTML = '';
        } else {
            leftPage.innerHTML = product1 ? this.renderProductPage(product1) : this.renderEmptyPage();
            rightPage.innerHTML = product2 ? this.renderProductPage(product2) : this.renderEmptyPage();
        }

        // Update page counter
        pageInfo.textContent = `Página ${this.currentPage + 1} de ${Math.max(1, totalPages)}`;

        // Update navigation buttons
        prevBtn.disabled = this.currentPage === 0;
        nextBtn.disabled = this.currentPage >= totalPages - 1;
    },

    renderProductPage: function (product) {
        const price = (product.price || 0).toFixed(2).replace('.', ',');
        const categoryLabels = {
            salgados: '🥟 Salgados',
            mini: '🧁 Mini-Salgados',
            kits: '🎁 Kits Festa',
            bolos: '🎂 Bolos',
            bebidas: '🥤 Bebidas',
            adicionais: '➕ Adicionais'
        };
        const categoryLabel = categoryLabels[product.category] || product.category || '';

        // Size options
        let sizeHtml = '';
        if (product.catalog_size_options) {
            try {
                const sizes = JSON.parse(product.catalog_size_options);
                if (Array.isArray(sizes) && sizes.length > 0) {
                    sizeHtml = `<p class="text-xs sm:text-sm text-gray-600">📏 Tamanhos: ${sizes.join(' / ')}</p>`;
                }
            } catch (e) {
                if (typeof product.catalog_size_options === 'string' && product.catalog_size_options.trim()) {
                    sizeHtml = `<p class="text-xs sm:text-sm text-gray-600">📏 ${product.catalog_size_options}</p>`;
                }
            }
        }

        // Vegan badge
        const veganBadge = product.catalog_vegan
            ? '<span class="inline-block bg-green-100 text-green-800 text-[11px] px-2 py-0.5 rounded-full font-medium ml-1">🌱 Vegano</span>'
            : '';

        // Catalog phrase
        const phraseHtml = product.catalog_phrase
            ? `<p class="text-xs sm:text-sm text-purple-700 italic mt-2">"${product.catalog_phrase}"</p>`
            : '';

        // Promo badge if applicable
        let promoHtml = '';
        if (product.promo && product.promo.active) {
            const promoText = product.promo.type === 'percentage'
                ? `-${product.promo.value}%`
                : `-R$ ${product.promo.value.toFixed(2).replace('.', ',')}`;
            promoHtml = `<span class="inline-block bg-yellow-100 text-yellow-800 text-[11px] px-2 py-0.5 rounded-full font-medium ml-1">🏷️ ${promoText}</span>`;
        }

        // Fixed-dimension image card - uses CSS class for guaranteed fixed size
        const imageCard = product.image
            ? `<div class="catalog-image-card">
           <img src="${product.image}" alt="${product.name}" class="catalog-image" />
         </div>`
            : `<div class="catalog-image-card" style="background: linear-gradient(to bottom right, #ffe4e6, #fed7aa);">
           <span class="text-6xl text-gray-400">${product.emoji || '🥟'}</span>
         </div>`;

        // Fixed-height text block for aligned prices between left/right pages
        const textBlock = `
      <div class="catalog-text-block mt-4">
        <div class="space-y-1 text-center">
          <div class="flex flex-wrap items-center justify-center gap-1">
            ${categoryLabel ? `<span class="text-[11px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">${categoryLabel}</span>` : ''}
            ${veganBadge}
            ${promoHtml}
          </div>
          ${product.name ? `<h3 class="text-lg sm:text-xl font-bold text-gray-900 truncate">${product.name}</h3>` : ''}
          ${product.description ? `<p class="text-xs sm:text-sm text-gray-600 line-clamp-2">${product.description}</p>` : ''}
          ${sizeHtml}
        </div>
        <div class="mt-2 text-center">
          ${price ? `<p class="text-xl sm:text-2xl font-bold text-rose-600">R$ ${price}</p>` : ''}
          ${phraseHtml}
        </div>
        <!-- Botão Adicionar ao Carrinho -->
        <div class="mt-3 flex justify-center">
          <button 
            onclick="event.stopPropagation(); CatalogModule.addToCartFromCatalog(${product.id})"
            class="flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            title="Adicionar ao carrinho"
          >
            <span class="text-xl">+</span>
            <span class="text-sm">Adicionar</span>
          </button>
        </div>
      </div>
    `;

        return `
      <div class="w-full h-full flex flex-col items-center justify-center">
        ${imageCard}
        ${textBlock}
      </div>
    `;

    },

    renderEmptyPage: function () {
        return `
      <div class="w-full h-full flex items-center justify-center text-gray-400">
        <p class="text-sm">Fim do catálogo</p>
      </div>
    `;
    },

    renderEmptyMessage: function () {
        return `
      <div class="w-full h-full flex flex-col items-center justify-center text-gray-500 p-4">
        <p class="text-4xl mb-4">📚</p>
        <p class="text-lg font-medium">Nenhum produto no catálogo</p>
        <p class="text-sm text-gray-400 mt-2">Os produtos serão exibidos aqui quando cadastrados.</p>
      </div>
    `;
    },

    navigate: function (direction) {
        const productsPerPage = this.isMobile ? 1 : 2;
        const totalPages = Math.ceil(this.products.length / productsPerPage);
        if (totalPages === 0) return;

        const leftPage = document.getElementById('catalogPageLeft');
        const rightPage = document.getElementById('catalogPageRight');
        const goingNext = direction > 0;

        // 3D page-flip exit animation
        const flipClass = goingNext ? 'catalog-page--flip-next' : 'catalog-page--flip-prev';
        if (leftPage) leftPage.classList.add(flipClass);
        if (rightPage) rightPage.classList.add(flipClass);

        // After animation, update page and render
        setTimeout(() => {
            this.currentPage += direction;
            if (this.currentPage < 0) this.currentPage = 0;
            if (this.currentPage >= totalPages) this.currentPage = Math.max(0, totalPages - 1);

            this.render();

            // Remove animation classes for clean entry
            if (leftPage) {
                leftPage.classList.remove('catalog-page--flip-next', 'catalog-page--flip-prev');
            }
            if (rightPage) {
                rightPage.classList.remove('catalog-page--flip-next', 'catalog-page--flip-prev');
            }
        }, 220);
    },

    // Adiciona produto ao carrinho diretamente do catálogo
    // Inclui verificação de modais de sabores e cálculo de promoção
    addToCartFromCatalog: function (productId) {
        const product = products.find(p => p.id === productId);
        if (!product) {
            console.error('[Catalog] Produto não encontrado:', productId);
            return;
        }

        // Fecha o catálogo primeiro
        this.close();

        // Para kits e bolos, abre modal de opções customizadas
        if (product.category === 'kits' || product.category === 'bolos') {
            console.log('[Catalog] Produto requer modal de opções:', product.name, product.category);
            // Chama o modal existente de opções customizadas
            if (typeof openCustomOptionsModal === 'function') {
                openCustomOptionsModal(product.id, product.name, product.description, product.price, product.category);
            } else {
                console.warn('[Catalog] openCustomOptionsModal não disponível');
                this.addProductDirectly(product);
            }
            return;
        }

        // Para mini salgados com seleção de sabores habilitada
        const isMini = (typeof window.isMiniSalgadoProduct === 'function')
            ? window.isMiniSalgadoProduct(product, product.category)
            : (product.category === 'mini' || (product.name && /mini\s*salgado/i.test(product.name)));

        if (isMini) {
            console.log('[Catalog] Produto mini com seleção de sabores:', product.name);
            if (typeof window.openMiniSalgadosModal === 'function') {
                window.openMiniSalgadosModal(product);
                return;
            } else if (typeof openMiniSalgadosModal === 'function') {
                openMiniSalgadosModal(product);
                return;
            } else {
                console.warn('[Catalog] openMiniSalgadosModal não disponível');
                this.addProductDirectly(product);
                return;
            }
        }

        // Para outros produtos, adiciona diretamente com cálculo de promoção
        this.addProductDirectly(product);
    },

    // Adiciona produto diretamente ao carrinho (sem modal)
    // Calcula preço promocional se aplicável
    addProductDirectly: function (product) {
        // Calcula preço final considerando promoção
        let finalPrice = product.price;
        let hasPromo = false;

        if (product.promo?.active && product.promo?.value > 0) {
            hasPromo = true;
            if (product.promo.type === 'percent' || product.promo.type === 'percentage') {
                finalPrice = product.price * (1 - product.promo.value / 100);
            } else {
                // Tipo fixo
                finalPrice = product.price - product.promo.value;
            }
            // Garante preço mínimo de 0
            finalPrice = Math.max(0, finalPrice);
            console.log('[Catalog] Promoção aplicada:', product.name, 'de R$', product.price, 'por R$', finalPrice);
        }

        // Verifica se produto já está no carrinho
        const existingItem = cart.find(item => item.id === product.id);

        if (existingItem) {
            // Incrementa quantidade (mantém o preço original do item)
            existingItem.quantity += 1;
            console.log('[Catalog] Quantidade incrementada:', product.name, existingItem.quantity);
        } else {
            // Adiciona novo item com preço promocional
            cart.push({
                id: product.id,
                name: product.name,
                description: product.description || '',
                price: finalPrice,
                originalPrice: hasPromo ? product.price : null,
                quantity: 1,
                image: product.image,
                emoji: product.emoji,
                note: ''
            });
            console.log('[Catalog] Produto adicionado:', product.name, 'preço:', finalPrice);
        }

        // Atualiza o carrinho
        if (typeof updateCart === 'function') updateCart();

        // Mostra a loja pública com o carrinho visível
        if (typeof showPublicStore === 'function') showPublicStore();

        // Scroll para o carrinho
        const cartSection = document.getElementById('cart');
        if (cartSection) {
            setTimeout(() => {
                cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }

        // Feedback visual
        const promoText = hasPromo ? ' (com desconto!)' : '';
        // Check if showInlineMessage is available? Should be from utils.js
        if (typeof showInlineMessage === 'function') {
            showInlineMessage('publicStore', `✅ ${product.name} adicionado ao carrinho${promoText}`, 'success');
        }
    }
};
