
// ========================================
// AUTHENTICATION (Supabase Auth)
// ========================================

async function showLoginModal() {
    if (typeof hideAllAdminPanels === 'function') hideAllAdminPanels();
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.remove('hidden');

    document.getElementById('publicStore')?.classList.add('hidden'); // Check existence

    // Hide admin wrapper if exists
    const adminWrapper = document.getElementById('adminWrapper');
    if (adminWrapper) adminWrapper.classList.add('hidden');

    // Hide public elements
    document.getElementById('cartBtn')?.classList.add('hidden');
    document.getElementById('cartBtnDesktop')?.classList.add('hidden');
    const floatingBtn = document.getElementById('floatingCartButton');
    if (floatingBtn) floatingBtn.style.display = 'none';

    // Reset form
    const f = document.getElementById('loginForm'); if (f) { f.reset(); }
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.classList.add('hidden');

    // Auto-fill remembered email
    const rememberedEmail = localStorage.getItem('fastRememberedEmail');
    if (rememberedEmail) {
        document.getElementById('adminEmail').value = rememberedEmail;
        document.getElementById('rememberMe').checked = true;
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPass').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const loginError = document.getElementById('loginError');

    if (loginError) loginError.classList.add('hidden');

    if (!email || !password) {
        if (loginError) {
            loginError.textContent = 'Preencha e-mail e senha.';
            loginError.classList.remove('hidden');
        }
        return;
    }

    try {
        console.log('[Auth] Attempting login with Supabase...', email);
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        console.log('[Auth] Login successful:', data.user.id);

        if (rememberMe) localStorage.setItem('fastRememberedEmail', email);
        else localStorage.removeItem('fastRememberedEmail');

        // Set legacy flags for compatibility with core.js
        window.isAdmin = true;
        sessionStorage.setItem('fastAdmin', '1');
        sessionStorage.setItem('fastRole', 'admin'); // Default to admin for now

        // Start inactivity timer
        initInactivityTimer();

        // Show Panel & Load Data
        if (typeof window.loadInitialAdminData === 'function') {
            await window.loadInitialAdminData();
        } else if (typeof showAdminPanel === 'function') {
            showAdminPanel(); // Fallback
        }

    } catch (error) {
        console.warn('[Auth] Login failed:', error.message);
        if (loginError) {
            loginError.textContent = 'Login falhou: ' + (error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : error.message);
            loginError.classList.remove('hidden');
        }
    }
}

async function handleLogout() {
    try {
        await window.supabaseClient.auth.signOut();
        console.log('[Auth] Signed out from Supabase');
    } catch (e) {
        console.warn('[Auth] Error signing out:', e);
    }

    window.isAdmin = false;
    sessionStorage.removeItem('fastAdmin');
    sessionStorage.removeItem('fastRole');
    showLoginModal();
    window.location.reload();
}

// ========================================
// USER MANAGEMENT (Legacy / Deprecated)
// ========================================
// User management should now be done via Supabase Dashboard or protected Edge Functions.
// These are placeholders to prevent crashes if other modules call them.

function loadUsers() { console.log('[Auth] User management moved to Supabase Auth.'); }
function saveUsers() { }
function renderUsers() {
    const ul = document.getElementById('usersList');
    if (ul) ul.innerHTML = '<li class="p-4 text-gray-500 text-center text-sm">Gerenciamento de usuários deve ser feito via Painel Supabase.</li>';
}
async function deleteUser(index) { alert('Use o painel do Supabase para gerenciar usuários.'); }
function handleUserSubmit(e) { e.preventDefault(); alert('Use o painel do Supabase para criar usuários.'); }

// ========================================
// INACTIVITY TIMER
// ========================================
let inactivityTimer;
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 minutes

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (sessionStorage.getItem('fastAdmin') === '1') {
        inactivityTimer = setTimeout(() => {
            console.log('[Auth] Inactivity timeout - logging out');
            handleLogout();
        }, INACTIVITY_LIMIT);
    }
}

function initInactivityTimer() {
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('touchstart', resetInactivityTimer);
    resetInactivityTimer();
}

// Initialize if logged in
if (sessionStorage.getItem('fastAdmin') === '1') {
    initInactivityTimer();
    // Verify real session validity
    if (window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                console.warn('[Auth] fastAdmin flag is true but Supabase session missing. Logout.');
                handleLogout(); // Force logout if tokens inconsistent
            }
        });
    }
}

// Expose globals
window.showLoginModal = showLoginModal;
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.loadUsers = loadUsers;
window.saveUsers = saveUsers;
window.renderUsers = renderUsers;
window.deleteUser = deleteUser;
window.handleUserSubmit = handleUserSubmit;
window.initInactivityTimer = initInactivityTimer;
