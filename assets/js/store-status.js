// ========================================
// STORE STATUS MODULE
// Funções para atualização de status da loja
// Dependências: storeConfig, storeClosedToday, isFastOpen() (globais do fast.html)
// ========================================

window.storeClosedToday = false; // Cached flag

window.StoreStatusService = {
  /**
   * Check if store is closed today (from database)
   */
  isClosedToday: async function () {
    try {
      // Function to format date YYYY-MM-DD
      const formatYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      // Get Brasilia time if function exists, else local
      const brasilia = typeof getBrasiliaDate === 'function' ? getBrasiliaDate() : new Date();
      const todayStr = formatYYYYMMDD(brasilia);

      if (!window.supabaseClient) return false;

      const { data, error } = await window.supabaseClient
        .from('fast_store_status')
        .select('is_closed')
        .eq('date', todayStr)
        .maybeSingle();

      if (error) {
        console.warn('[StoreStatus] Error checking status:', error.message);
        return false;
      }

      window.storeClosedToday = data?.is_closed === true;
      return window.storeClosedToday;
    } catch (e) {
      console.error('[StoreStatus] Exception:', e);
      return false;
    }
  }
};

if (!window.checkBusinessHours) {
  // Basic fallback if not defined in util/data
  window.checkBusinessHours = function () { return true; };
}


// REDEFINE updateOpenNotice to include Time Estimates
function updateOpenNotice() {
  const notice = document.getElementById('openNotice');
  if (!notice) return;

  let text = '';
  let colorClass = '';
  const isOpen = isFastOpen();

  if (storeClosedToday) {
    text = '🔴 Loja Fechada Temporariamente';
    colorClass = 'bg-red-100 text-red-800 border-red-200 border';
  } else if (isOpen) {
    text = '🟢 Estamos Abertos! Faça seu pedido.';
    colorClass = 'bg-green-100 text-green-800 border-green-200 border';
  } else {
    text = '🔴 Fechado no momento. Confira nossos horários.';
    colorClass = 'bg-red-100 text-red-800 border-red-200 border';
  }

  // Append Time Estimates if configured and open
  if (isOpen && !storeClosedToday) {
    const prep = (storeConfig.prep_time_min && storeConfig.prep_time_max) ?
      `🕒 Preparo: ${storeConfig.prep_time_min}-${storeConfig.prep_time_max} min` : '';

    const del = (storeConfig.delivery_enabled && storeConfig.delivery_time_min && storeConfig.delivery_time_max) ?
      `🛵 Entrega: ${storeConfig.delivery_time_min}-${storeConfig.delivery_time_max} min` : '';

    if (prep || del) {
      text += ` • ${[prep, del].filter(Boolean).join(' • ')}`;
    }
  }

  notice.textContent = text;
  notice.className = `text-sm py-2 px-3 rounded-lg my-2 text-center font-medium ${colorClass}`;

  // Update delivery status banner
  updateDeliveryStatusBanner();
}

// Verificar se há alta demanda (muitos pedidos em preparo)
// Usa RPC para não expor dados de pedidos, com fallback para método antigo
async function checkHighDemand() {
  try {
    const maxConcurrent = storeConfig.max_concurrent_orders || 10;

    // Tentar RPC primeiro (mais seguro - não expõe dados de pedidos)
    const { data, error } = await window.supabaseClient
      .rpc('check_high_demand', { max_concurrent: maxConcurrent });

    if (!error && typeof data === 'boolean') {
      return data;
    }

    // Fallback: método antigo (caso RPC não exista ainda)
    console.warn('[HighDemand] RPC falhou, usando fallback:', error?.message);
    const fallback = await window.supabaseClient
      .from('fast_orders')
      .select('id')
      .in('status', ['pending', 'preparing', 'accepted', 'confirmed'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (fallback.error) throw fallback.error;

    const inProgressCount = (fallback.data || []).length;
    return inProgressCount >= maxConcurrent;
  } catch (e) {
    console.warn('[HighDemand] Erro ao verificar:', e);
    return false;
  }
}

// Delivery status banner for public store
async function updateDeliveryStatusBanner() {
  const banner = document.getElementById('deliveryStatusBanner');
  if (!banner) return;

  const isOpen = isFastOpen() && !storeClosedToday;

  // Only show delivery banner when store is open
  if (!isOpen) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');

  // Verificar alta demanda
  const isHighDemand = await checkHighDemand();
  const extraTime = isHighDemand ? (storeConfig.high_demand_extra_time || 15) : 0;

  if (storeConfig.delivery_enabled) {
    // Delivery available
    let deliveryText = '🛵 Entregas disponíveis';

    // Add time estimates if configured (com ajuste de alta demanda)
    if (storeConfig.delivery_time_min && storeConfig.delivery_time_max) {
      const minTime = parseInt(storeConfig.delivery_time_min) + extraTime;
      const maxTime = parseInt(storeConfig.delivery_time_max) + extraTime;
      deliveryText += ` • Tempo estimado: ${minTime}-${maxTime} min`;
    }
    if (storeConfig.prep_time_min && storeConfig.prep_time_max) {
      const minPrep = parseInt(storeConfig.prep_time_min) + extraTime;
      const maxPrep = parseInt(storeConfig.prep_time_max) + extraTime;
      deliveryText += ` • Preparo: ${minPrep}-${maxPrep} min`;
    }

    // Aviso de alta demanda
    if (isHighDemand) {
      deliveryText += ' • ⚠️ Alta demanda';
    }

    banner.innerHTML = deliveryText;
    const demandClass = isHighDemand ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200';
    banner.className = `text-sm py-2 px-3 rounded-lg mb-2 text-center font-medium ${demandClass} border`;
  } else {
    // Delivery disabled
    const reason = storeConfig.delivery_disabled_reason || 'No momento, apenas retirada na loja';
    banner.innerHTML = `🚫 Entregas suspensas: <span class="font-semibold">${reason}</span>`;
    banner.className = 'text-sm py-2 px-3 rounded-lg mb-2 text-center font-medium bg-orange-50 text-orange-700 border border-orange-200';
  }
}

// ========================================
// FAB AND MODAL POSITIONING FIX
// ========================================
(function () {
  // Move floating elements to body level to ensure position:fixed works correctly
  var fab = document.getElementById('floatingCartButton');
  var cartModal = document.getElementById('cartModal');
  if (fab && fab.parentNode !== document.body) {
    document.body.appendChild(fab);
  }
  if (cartModal && cartModal.parentNode !== document.body) {
    document.body.appendChild(cartModal);
  }
  // Ensure FAB has correct fixed positioning styles (in case CSS classes don't apply)
  if (fab) {
    fab.style.position = 'fixed';
    fab.style.bottom = '1rem';
    fab.style.right = '1rem';
    fab.style.zIndex = '9999';
  }
})();

// Initial update on load
updateOpenNotice();
