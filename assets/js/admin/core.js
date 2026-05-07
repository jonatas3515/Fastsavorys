
// ========================================
// CORE ADMIN INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async function () {
    console.log('[Admin] Inicializando Painel Admin...');

    // 1. Verify Auth
    const isAdmin = sessionStorage.getItem('fastAdmin') === '1';

    // 2. Setup Global Event Listeners
    setupGlobalListeners();

    if (!isAdmin) {
        if (typeof showLoginModal === 'function') showLoginModal();
        return;
    }

    // 3. Initialize UI & Data if already logged in
    await loadInitialAdminData();
});

// Global Data Loader (Called on init or after login)
window.loadInitialAdminData = async function () {
    console.log('[Admin] Carregando dados iniciais...');

    // Initialize UI
    if (typeof showAdminPanel === 'function') showAdminPanel();
    setupTabNavigation();

    // Data Load
    try {
        if (window.supabaseClient) {
            // Parallel loading for speed
            await Promise.allSettled([
                typeof loadDashboardOrders === 'function' && loadDashboardOrders(),
                typeof loadFeesFromSupabase === 'function' && loadFeesFromSupabase(),
                typeof loadUsers === 'function' && loadUsers(),
                typeof loadProducts === 'function' && loadProducts(),
                typeof BannerModule !== 'undefined' && BannerModule.loadAdminForm()
            ]);
        } else {
            console.warn('[Admin] Supabase client missing!');
        }
    } catch (e) {
        console.error('[Admin] Erro na inicializacao de dados:', e);
    }
};

function showAdminPanel() {
    document.getElementById('loginModal')?.classList.add('hidden');
    document.getElementById('publicStore')?.classList.add('hidden');

    // Show Admin Wrapper
    const adminWrapper = document.getElementById('adminWrapper');
    if (adminWrapper) {
        adminWrapper.classList.remove('hidden');
        adminWrapper.style.display = 'block';
    }

    // Default to Dashboard
    switchAdminTab('ordersPanelFast');

    // Hide Public Elements
    document.getElementById('cartBtn')?.classList.add('hidden');
    document.getElementById('cartBtnDesktop')?.classList.add('hidden');
    const floatingBtn = document.getElementById('floatingCartButton');
    if (floatingBtn) floatingBtn.style.display = 'none';
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.admin-tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            switchAdminTab(targetId, btn);
        });
    });
}

function switchAdminTab(targetId, btnElement) {
    // Hide all panels
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));

    // Show target panel
    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');

    // Update buttons
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
        b.classList.remove('bg-rose-600', 'text-white');
        b.classList.add('text-gray-600', 'hover:bg-gray-100');
    });
    if (btnElement) {
        btnElement.classList.remove('text-gray-600', 'hover:bg-gray-100');
        btnElement.classList.add('bg-rose-600', 'text-white');
    }

    // Trigger Loaders
    if (targetId === 'productsPanelFast' && typeof loadProductsAdmin === 'function') loadProductsAdmin();
    if (targetId === 'clientsPanelFast' && typeof renderClients === 'function') renderClients();
    if (targetId === 'reportsPanelFast' && typeof renderReportsData === 'function') renderReportsData();
    if (targetId === 'promotionPanelFast') {
        if (typeof renderPromotions === 'function') renderPromotions();
        if (typeof renderCoupons === 'function') renderCoupons();
        if (typeof updatePromotionProductSelect === 'function') updatePromotionProductSelect();
    }
    if (targetId === 'ratingsPanelFast' && window.RatingsModule) {
        RatingsModule.initAdminPanel();
    }
    if (targetId === 'configPanelFast') {
        // Load config data into form
        if (typeof loadFeesFromSupabase === 'function') loadFeesFromSupabase();
        if (typeof renderFastFeesListPanel === 'function') renderFastFeesListPanel();
        // Load store config for PIX and delivery settings
        if (typeof loadStoreConfig === 'function') loadStoreConfig();
        // Load store closure status for today
        if (typeof loadStoreClosureStatus === 'function') loadStoreClosureStatus();
    }
    if (targetId === 'rulesPanelFast' && window.RulesModule) {
        RulesModule.init();
    }
}

function setupGlobalListeners() {
    // Search listener for Orders
    const searchInput = document.getElementById('searchOrderInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const orders = window.orders || [];
            const filtered = orders.filter(o =>
                (o.client_name || '').toLowerCase().includes(term) ||
                (o.client_phone || '').includes(term) ||
                String(o.id).includes(term) ||
                (o.order_code || '').toLowerCase().includes(term)
            );
            if (typeof renderDashboardOrders === 'function') renderDashboardOrders(filtered);
        });
    }

    // Sidebar Toggles
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    // Escape Config Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('feesModalFast')?.classList.add('hidden');
            // Add other modals here
        }
    });

    // Logout Handler
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        showLogoutModal();
    });
}

// Show Logout Modal (Dynamic Check)
function showLogoutModal() {
    let modal = document.getElementById('logoutConfirmModal');

    // Se o modal não existe no DOM (ex: admin.html sem o HTML inserido), cria dinamicamente
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'logoutConfirmModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[9999] hidden flex items-center justify-center animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 transform transition-all scale-100 border border-gray-100">
              <div class="text-center">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span class="text-3xl">🚪</span>
                </div>
                <h3 class="text-xl font-bold text-gray-800 mb-2">Sair do Sistema?</h3>
                <p class="text-gray-600 mb-6">Você será desconectado da área administrativa.</p>
                <div class="flex gap-3 justify-center">
                  <button id="cancelLogoutBtnDynamic" class="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors">
                    Cancelar
                  </button>
                  <button id="confirmLogoutBtnDynamic" class="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all">
                    Sim, Sair
                  </button>
                </div>
              </div>
            </div>`;
        document.body.appendChild(modal);

        // Bind events for dynamic modal
        document.getElementById('cancelLogoutBtnDynamic').onclick = () => {
            modal.classList.add('hidden');
        };
        document.getElementById('confirmLogoutBtnDynamic').onclick = () => {
            sessionStorage.removeItem('fastAdmin');
            window.location.reload();
        };
    }

    // Show modal
    modal.classList.remove('hidden');
}

// Global Helper Functions
window.showToast = function (msg, type = 'info') {
    // Simple toast implementation or use existing
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded shadow-lg text-white z-[9999] ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

window.showConfirm = function (msg, options = {}) {
    return new Promise(resolve => {
        const confirmed = confirm(msg); // Fallback to native confirm for now
        resolve(confirmed);
    });
};

window.showInlineMessage = function (elementId, msg, type) {
    // Find a message container near elementId or inside it
    const el = document.getElementById(elementId);
    if (!el) return;

    let msgBox = el.querySelector('.inline-msg');
    if (!msgBox) {
        msgBox = document.createElement('div');
        msgBox.className = 'inline-msg p-2 mb-2 rounded text-sm font-medium';
        el.insertBefore(msgBox, el.firstChild);
    }

    msgBox.className = `inline-msg p-2 mb-2 rounded text-sm font-medium ${type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
    msgBox.textContent = msg;
    msgBox.style.display = 'block';

    setTimeout(() => {
        msgBox.style.display = 'none';
    }, 3000);
};

// Utils
window.norm = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
window.safeDate = (d) => d ? new Date(d) : new Date(0);

// Backward Compatibility Alias
window.showPanel = function (panelId) {
    switchAdminTab(panelId);
};

// ========================================
// MOBILE SIDEBAR FUNCTIONS
// ========================================

function openMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
}

// Make globally available
window.openMobileSidebar = openMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
