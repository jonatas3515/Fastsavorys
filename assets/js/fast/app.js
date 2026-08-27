/**
 * Fast Savory's - App Main Entry Point
 * Handles application bootstrapping, initialization, and global event listeners.
 */

document.addEventListener('DOMContentLoaded', async function () {
    console.log('[INIT] DOMContentLoaded iniciado');
    try {
        // Show "Back to Admin" button if coming from admin panel
        if (sessionStorage.getItem('fastAdmin') === '1') {
            const backBtn = document.getElementById('backToAdminBtn');
            const backBtnMobile = document.getElementById('backToAdminBtnMobile');
            if (backBtn) backBtn.classList.remove('hidden');
            if (backBtnMobile) backBtnMobile.classList.remove('hidden');
        }

        // Verificar se Supabase está disponível
        if (!window.supabaseClient) {
            console.error('[INIT] Supabase client não disponível - usando dados locais');
        }

        // Load all data in parallel for faster page load
        // Timeout global de 12s para evitar travamento se Supabase estiver lento
        if (typeof window.promiseWithTimeout === 'function') {
            await window.promiseWithTimeout(
                Promise.all([
                    seedDefaultUsers().catch(function (e) { console.error('[INIT] seedDefaultUsers erro:', e); }),
                    loadProducts().catch(function (e) { console.error('[INIT] loadProducts erro:', e); }),
                    // loadClients agora é lazy ou movido para CustomerModule, mas se ainda existir globalmente por compatibilidade:
                    (typeof loadClients === 'function' ? loadClients() : Promise.resolve()).catch(function (e) { console.error('[INIT] loadClients erro:', e); }),
                    Promise.resolve().then(function () { if (typeof loadPromotions === 'function') loadPromotions(); }).catch(function (e) { console.error('[INIT] loadPromotions erro:', e); }),
                    (typeof loadCoupons === 'function' ? loadCoupons() : Promise.resolve()).catch(function (e) { console.error('[INIT] loadCoupons erro:', e); }),
                    // Usar StoreConfigService se disponível, senão fallback para loadStoreConfig global
                    (window.StoreConfigService ? window.StoreConfigService.load() : (typeof loadStoreConfig === 'function' ? loadStoreConfig() : Promise.resolve())).catch(function (e) { console.error('[INIT] loadStoreConfig erro:', e); }),
                    (typeof loadBusinessHours === 'function' ? loadBusinessHours() : Promise.resolve()).catch(function (e) { console.error('[INIT] loadBusinessHours erro:', e); }),
                    (typeof loadBlockedDates === 'function' ? loadBlockedDates() : Promise.resolve()).catch(function (e) { console.error('[INIT] loadBlockedDates erro:', e); }),
                    // loadDeliveryFees removido ou movido? Check if exists.
                    (typeof loadDeliveryFees === 'function' ? loadDeliveryFees() : Promise.resolve()).catch(function (e) { console.error('[INIT] loadDeliveryFees erro:', e); }),
                    (window.ProductOptionsModule ? window.ProductOptionsModule.load() : Promise.resolve()).catch(function (e) { console.error('[INIT] ProductOptionsModule erro:', e); }),

                    // StoreStatusService optimization:
                    (window.StoreStatusService ? window.StoreStatusService.isClosedToday() : Promise.resolve()).catch(function (e) { console.error('[INIT] StoreStatusService erro:', e); })
                ]),
                12000, // 12 segundos máximo
                null
            );
        } else {
            // Fallback minimal initialization if utils not loaded
            console.warn('[INIT] promiseWithTimeout not found, running basic init');
            if (window.loadProducts) await loadProducts();
        }


        console.log('[INIT] Dados carregados, mostrando painel');

        // Initialize Public Store
        // initializePublicStore function is likely in fast.html, we need to extract that too or call it if global
        if (typeof initializePublicStore === 'function') {
            initializePublicStore();
        } else {
            // Inline initialization logic if we move initializePublicStore here
            // ... (We will move initializePublicStore to core.js or keep here)
            // Mostrar carrinho na loja pública
            document.getElementById('cartBtn')?.classList.remove('hidden');
            document.getElementById('cartBtnDesktop')?.classList.remove('hidden');
            if (typeof updateCart === 'function') updateCart();

            if (window.AdBannerModule) window.AdBannerModule.init();

            const floatingBtn = document.getElementById('floatingCartButton');
            if (floatingBtn && window.cart && window.cart.length > 0) {
                floatingBtn.classList.remove('hidden');
                floatingBtn.style.display = 'flex';
            }

            // Update Open Notice
            // Requires updateOpenNotice (store-status.js ?)
            if (typeof updateOpenNotice === 'function') updateOpenNotice();
            // Requires loadProductsPublic (ui.js / products.js)
            if (typeof loadProductsPublic === 'function') loadProductsPublic();

            // Welcome Screen Buttons
            document.getElementById('enterStoreBtn')?.addEventListener('click', () => {
                document.getElementById('welcomeScreen').classList.add('hidden');
            });
            document.getElementById('enterStoreBtnMobile')?.addEventListener('click', () => {
                document.getElementById('welcomeScreen').classList.add('hidden');
            });
        }

        // Stripe Checkout Handling
        try {
            const params = new URLSearchParams(window.location.search);
            const checkout = params.get('checkout');
            const sessionId = params.get('session_id');
            if (checkout === 'success' && sessionId) {
                console.log('[Stripe] Retorno do Checkout detectado. Sincronizando pagamento...', sessionId);
                const baseUrl = (typeof getStripeServerBaseUrl === 'function') ? getStripeServerBaseUrl() : '';
                let syncedOrderId = null;
                if (!baseUrl) {
                    console.warn('[Stripe] Stripe server URL não configurada para sync (ok em produção se webhook estiver ativo).');
                } else {
                    const resp = await fetch(baseUrl + '/sync-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: sessionId })
                    });
                    const data = await resp.json().catch(function () { return {}; });
                    if (!resp.ok) {
                        console.warn('[Stripe] Falha ao sincronizar Checkout:', data);
                    } else {
                        console.log('[Stripe] Sincronização concluída:', data);
                        syncedOrderId = data.orderId;
                        try { if (typeof loadDashboardOrders === 'function') loadDashboardOrders(); } catch (e) { }
                    }
                }

                // Redirecionar para WhatsApp após pagamento bem-sucedido
                if (syncedOrderId) {
                    const waMessage = `Olá! Acabei de realizar o pagamento do pedido #${syncedOrderId} pelo cartão. Aguardo confirmação!`;
                    const waUrl = `https://wa.me/5573999366554?text=${encodeURIComponent(waMessage)}`;

                    // Limpar URL params e redirecionar para WhatsApp
                    window.history.replaceState({}, document.title, window.location.pathname);

                    // Mostrar confirmação e abrir WhatsApp
                    alert('✅ Pagamento confirmado!\n\nVocê será redirecionado para o WhatsApp para confirmar seu pedido.');
                    window.open(waUrl, '_blank');
                }
            }
        } catch (e) {
            console.warn('[Stripe] Erro ao sincronizar pagamento no retorno do Checkout:', e);
        }
        console.log('[INIT] Painel exibido com sucesso');

        // Deep-link: auto-open tracking modal
        try {
            const params = new URLSearchParams(window.location.search);
            const trackCode = params.get('track');
            const trackPhone = params.get('phone');
            if (trackCode && trackPhone) {
                if (typeof openTrackingModal === 'function') openTrackingModal();
                const codeEl = document.getElementById('trackingOrderCode');
                const phoneEl = document.getElementById('trackingPhone');
                if (codeEl) codeEl.value = String(trackCode).toUpperCase();
                if (phoneEl && typeof normalizePhoneDigits === 'function') phoneEl.value = normalizePhoneDigits(trackPhone);
                if (typeof handleTrackOrder === 'function') setTimeout(() => handleTrackOrder(), 300);
            }
        } catch (e) { console.warn('[Tracking] Deep-link error:', e); }

        // Deep-link: auto-open rating modal
        try {
            const params = new URLSearchParams(window.location.search);
            const rateCode = params.get('rate');
            const ratePhone = params.get('phone');

            // Check for hash #rating or rate params to force modal open immediately
            if (window.location.hash === '#rating' || (rateCode && ratePhone)) {
                // Hide landing page content immediately to show only rating modal
                const landingContent = document.getElementById('landing');
                if (landingContent) {
                    landingContent.style.display = 'none';
                }

                // Open rating modal with minimal delay
                setTimeout(() => {
                    if (rateCode && ratePhone) {
                        if (typeof initRatingModal === 'function') initRatingModal(rateCode, ratePhone);
                    } else {
                        console.log('[Rating] Hash #rating detectado, mas sem parâmetros');
                        if (typeof openRatingModal === 'function') openRatingModal();
                    }
                }, 100);
            }
        } catch (e) { console.warn('[Rating] Deep-link error:', e); }

        // Load public testimonials for landing page
        try { if (typeof loadPublicRatings === 'function') loadPublicRatings(); } catch (e) { console.warn('[Ratings] Failed to load:', e); }

        // Initialize Catalog Module
        try { if (window.CatalogModule) CatalogModule.init(); } catch (e) { console.warn('[Catalog] Failed to init:', e); }

        // Logout Handler
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            const modal = document.getElementById('logoutConfirmModal');
            if (modal) {
                modal.classList.remove('hidden');
            } else if (confirm('Tem certeza que deseja sair do painel?')) {
                sessionStorage.removeItem('fastAdmin');
                window.location.reload();
            }
        });

    } catch (e) {
        console.error('[INIT] Erro crítico na inicialização:', e);
        try { showPublicStore(); } catch (e2) { console.error('[INIT] Falha ao mostrar loja:', e2); }
    }
});


