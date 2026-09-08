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


// SINGLE UNIFIED OPEN NOTICE BANNER
async function updateOpenNotice() {
  const notice = document.getElementById('openNotice');
  const deliveryBanner = document.getElementById('deliveryStatusBanner');
  if (deliveryBanner) deliveryBanner.classList.add('hidden'); // Garante que a 2ª linha fique sempre oculta

  if (!notice) return;

  let text = '';
  let colorClass = '';
  const isOpen = isFastOpen();

  if (storeClosedToday) {
    text = '🔴 Loja Fechada Temporariamente';
    colorClass = 'bg-red-100 text-red-800 border-red-200 border';
  } else if (!isOpen) {
    text = '🔴 Fechado no momento. Confira nossos horários.';
    colorClass = 'bg-red-100 text-red-800 border-red-200 border';
  } else {
    // Loja Aberta
    const isHighDemand = await checkHighDemand();
    const extraTime = isHighDemand ? (storeConfig.high_demand_extra_time || 15) : 0;

    if (storeConfig.delivery_enabled) {
      text = '🟢 Estamos Abertos! Faça seu pedido.';
      colorClass = isHighDemand ? 'bg-yellow-50 text-yellow-800 border-yellow-300 border' : 'bg-green-100 text-green-800 border-green-200 border';

      const prep = (storeConfig.prep_time_min && storeConfig.prep_time_max) ?
        `🕒 Preparo: ${parseInt(storeConfig.prep_time_min) + extraTime}-${parseInt(storeConfig.prep_time_max) + extraTime} min` : '';

      const del = (storeConfig.delivery_time_min && storeConfig.delivery_time_max) ?
        `🛵 Entrega: ${parseInt(storeConfig.delivery_time_min) + extraTime}-${parseInt(storeConfig.delivery_time_max) + extraTime} min` : '';

      const items = [prep, del].filter(Boolean);
      if (isHighDemand) items.push('⚠️ Alta demanda');
      if (items.length > 0) {
        text += ` • ${items.join(' • ')}`;
      }
    } else {
      const reason = storeConfig.delivery_disabled_reason || 'Apenas retirada na loja';
      text = `🟢 Estamos Abertos! (🚫 Entregas suspensas: ${reason})`;
      colorClass = 'bg-orange-50 text-orange-800 border-orange-200 border';

      if (storeConfig.prep_time_min && storeConfig.prep_time_max) {
        text += ` • 🕒 Preparo: ${storeConfig.prep_time_min}-${storeConfig.prep_time_max} min`;
      }
    }
  }

  notice.textContent = text;
  notice.className = `text-sm py-2 px-3 rounded-lg my-2 text-center font-medium ${colorClass}`;
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

// Manter compatibilidade com chamadas legadas
async function updateDeliveryStatusBanner() {
  // Unificado no updateOpenNotice()
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
