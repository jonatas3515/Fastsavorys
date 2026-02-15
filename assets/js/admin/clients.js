
// ========================================
// CLIENTS MANAGEMENT
// ========================================

async function renderClients() {
    const list = document.getElementById('clientsList');
    if (!list) return;

    // Ensure discounts are loaded first with safety check
    let clientDiscountMap = null;
    if (window.ClientDiscountsService) {
        try {
            if (typeof window.ClientDiscountsService.init === 'function' && !window.ClientDiscountsService.loaded) {
                await window.ClientDiscountsService.init();
            } else if (typeof window.ClientDiscountsService.load === 'function') {
                clientDiscountMap = await window.ClientDiscountsService.load();
            }
        } catch (e) {
            console.error('Failed to load discount service:', e);
        }
    }

    const normalizeName = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const getDiscountClasses = (pct) => {
        const p = Number(pct || 0);
        if (p === 5) return { text: 'text-green-600', bg: 'bg-green-50', badge: 'bg-green-100 text-green-800' };
        if (p === 10) return { text: 'text-green-700', bg: 'bg-green-50', badge: 'bg-green-100 text-green-900' };
        if (p === 15) return { text: 'text-emerald-700', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-900' };
        if (p === 20) return { text: 'text-emerald-800', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-900' };
        return { text: 'text-gray-700', bg: 'bg-white', badge: 'bg-gray-100 text-gray-700' };
    };

    list.innerHTML = '<tr><td colspan="6" class="p-4 text-center">Carregando clientes...</td></tr>';

    try {
        // Aggregate clients from orders directly to ensure fresh data
        const { data: orders, error } = await window.supabaseClient
            .from('fast_orders')
            .select('client_name, client_phone, total, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let dbClientDiscounts = new Map();
        let dbClientBirthdays = new Map();
        try {
            const now = Date.now();
            const cache = window._dbClientDiscountsCache;
            if (cache && cache.map instanceof Map && (now - (cache.ts || 0)) < 60000) {
                dbClientDiscounts = cache.map;
                dbClientBirthdays = cache.birthdays || new Map();
            } else {
                // Fetch ALL columns to find the birth date field dynamically
                const { data: dbClients, error: dbClientsError } = await window.supabaseClient
                    .from('fast_clients')
                    .select('*');

                if (!dbClientsError && dbClients) {
                    dbClients.forEach(c => {
                        const phoneDigits = String(c.phone || '').replace(/\D/g, '');
                        if (!phoneDigits) return;

                        // Discount
                        const pct = Number(c.discount_percentage || 0);
                        if (pct > 0) dbClientDiscounts.set(phoneDigits, pct);

                        // Birthday - Try multiple common field names
                        // Based on production screenshots: 03/04/1994 (DD/MM/YYYY)
                        const bday = c.birth_date || c.birthdate || c.birthDate || c.data_nascimento || c.nascimento || c.aniversario;
                        if (bday) dbClientBirthdays.set(phoneDigits, bday);
                    });
                    // Log details for debugging
                    console.log('[Clients] Detailed Load:', {
                        count: dbClients.length,
                        sample: dbClients[0],
                        foundBirthdays: dbClientBirthdays.size
                    });
                }
                window._dbClientDiscountsCache = { ts: now, map: dbClientDiscounts, birthdays: dbClientBirthdays };
            }
        } catch (e) {
            console.warn('[Clients] Failed loading fast_clients discounts:', e);
        }

        const clientsMap = new Map();

        orders.forEach(o => {
            if (!o.client_phone) return;
            const phone = o.client_phone.replace(/\D/g, '');
            if (!clientsMap.has(phone)) {
                clientsMap.set(phone, {
                    name: o.client_name || 'Cliente',
                    phone: o.client_phone,
                    orderCount: 0,
                    lastOrder: o.created_at,
                    rawLastOrder: new Date(o.created_at), // for sorting
                    discount: 0,
                    birthday: dbClientBirthdays.get(phone) || null
                });
            }
            const c = clientsMap.get(phone);
            c.orderCount++;
            // Check for fixed discount from service
            const serviceDiscount = window.ClientDiscountsService && typeof window.ClientDiscountsService.get === 'function'
                ? Number(window.ClientDiscountsService.get(phone) || 0)
                : (clientDiscountMap ? Number(clientDiscountMap[phone] || 0) : 0);
            const tableDiscount = Number(dbClientDiscounts.get(phone) || 0);
            c.discount = Math.max(serviceDiscount, tableDiscount);
        });

        const searchTerm = document.getElementById('clientSearchInput')?.value?.toLowerCase().trim() || '';
        const initialFilter = (document.getElementById('clientInitialFilter')?.value || '').toLowerCase();

        const sortedClients = Array.from(clientsMap.values())
            .filter(c => !searchTerm || normalizeName(c.name).includes(normalizeName(searchTerm)) || String(c.phone || '').includes(searchTerm))
            .filter(c => !initialFilter || normalizeName(c.name).startsWith(initialFilter))
            .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name))); // Alphabetical order

        if (sortedClients.length === 0) {
            list.innerHTML = '<tr><td colspan="7" class="p-4 text-center">Nenhum cliente encontrado.</td></tr>';
            return;
        }

        // Format birthday as DD/MM (without year for privacy)
        const formatBirthday = (dateStr) => {
            if (!dateStr) return '<span class="text-gray-400">-</span>';
            try {
                let day, month;
                // Handle DD/MM/YYYY format
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    day = parts[0];
                    month = parts[1];
                }
                // Handle YYYY-MM-DD format
                else if (dateStr.includes('-')) {
                    const parts = dateStr.split('-');
                    day = parts[2];
                    month = parts[1];
                }
                else {
                    return '<span class="text-gray-400">-</span>';
                }
                return `<span class="text-purple-600 font-medium">🎂 ${day}/${month}</span>`;
            } catch {
                return '<span class="text-gray-400">-</span>';
            }
        };

        list.innerHTML = sortedClients.map(c => {
            const classes = getDiscountClasses(c.discount);
            const selectBaseClass = `border rounded px-2 py-1 focus:ring-2 focus:ring-rose-500 outline-none text-sm ${classes.text} ${classes.bg}`;
            const badge = c.discount > 0
                ? `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes.badge}">-${c.discount}%</span>`
                : '';
            return `
        <tr class="hover:bg-gray-50 border-b last:border-0 hover:shadow-sm transition-all">
          <td class="p-4 font-medium text-gray-800 flex items-center">
            ${c.name}
            ${badge}
          </td>
          <td class="p-4 text-gray-600">${c.phone}</td>
          <td class="p-4 text-gray-600">${formatBirthday(c.birthday)}</td>
          <td class="p-4 text-gray-600">${c.orderCount} pedido(s)</td>
          <td class="p-4 text-gray-600">${new Date(c.lastOrder).toLocaleDateString('pt-BR')}</td>
          <td class="p-4">
             <select onchange="updateClientFixedDiscount('${c.phone}', this.value)" class="${selectBaseClass}">
               <option value="0" ${c.discount == 0 ? 'selected' : ''}>Sem Desconto</option>
               <option value="5" ${c.discount == 5 ? 'selected' : ''}>5%</option>
               <option value="10" ${c.discount == 10 ? 'selected' : ''}>10%</option>
               <option value="15" ${c.discount == 15 ? 'selected' : ''}>15%</option>
               <option value="20" ${c.discount == 20 ? 'selected' : ''}>20%</option>
             </select>
          </td>
          <td class="p-4 text-right">
             <button onclick="openWhatsAppForOrder('${c.phone}')" class="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors" title="Enviar WhatsApp">
               <i class="fab fa-whatsapp"></i> 🔄 
             </button>
          </td>
        </tr>
      `;
        }).join('');

    } catch (e) {
        console.error('[Clients] Erro ao carregar:', e);
        list.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500">Erro ao carregar clientes.</td></tr>';
    }
}

async function updateClientFixedDiscount(phone, value) {
    if (window.ClientDiscountsService) {
        const success = await window.ClientDiscountsService.save(phone, parseInt(value));
        if (success) {
            try {
                const digits = String(phone || '').replace(/\D/g, '');
                await window.supabaseClient
                    .from('fast_clients')
                    .update({ discount_percentage: parseInt(value) || 0, updated_at: new Date().toISOString() })
                    .eq('phone', digits);

                if (window._dbClientDiscountsCache && window._dbClientDiscountsCache.map instanceof Map) {
                    const v = parseInt(value) || 0;
                    if (v > 0) window._dbClientDiscountsCache.map.set(digits, v);
                    else window._dbClientDiscountsCache.map.delete(digits);
                    window._dbClientDiscountsCache.ts = Date.now();
                }
            } catch (e) { }
            showToast('Desconto atualizado!', 'success');
            if (typeof renderClients === 'function') renderClients();
        } else {
            showToast('Erro ao salvar desconto.', 'error');
        }
    }
}

// Expose globals
window.renderClients = renderClients;
window.updateClientFixedDiscount = updateClientFixedDiscount;

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Client Search with debounce
    let searchTimeout = null;
    const searchInput = document.getElementById('clientSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderClients(), 300);
        });

        // Also handle Enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                renderClients();
            }
        });
    }
});
