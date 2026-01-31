/**
 * BACKUP DAS FUNÇÕES DE VALIDAÇÃO - 21/01/2026
 * Este arquivo contém o código original antes da implementação do Painel de Regras.
 * NÃO EXCLUIR até confirmar que o novo sistema está funcionando corretamente.
 */

// ========== canOrderTodayWithoutBolo (original) ==========
/**
 * Verifica se é possível fazer pedido para o mesmo dia sem bolo
 * Regras:
 * - Pedido mínimo: R$ 15,00
 * - Somente retirada
 * - Horário de retirada: 11h às 18h
 */
function canOrderTodayWithoutBolo(isRetirada, cartTotal, timeSlot) {
  // Se contém bolo, não pode pedir para hoje
  if (cartContainsBolo()) {
    return { allowed: false, reason: 'Pedidos com bolos exigem 1 dia de antecedência.' };
  }

  // Deve ser retirada
  if (!isRetirada) {
    return { allowed: false, reason: 'Pedidos para o mesmo dia são apenas para retirada na loja.' };
  }

  // Mínimo R$ 15,00
  if (cartTotal < 15) {
    return { allowed: false, reason: 'Pedido mínimo de R$ 15,00 para retirada no mesmo dia.' };
  }

  // Horário deve ser entre 11h e 18h
  if (timeSlot) {
    const normalizedTime = (timeSlot || '').replace(/:/g, '');
    const timeAsNumber = parseInt(normalizedTime, 10) || 0;
    if (timeAsNumber < 1100 || timeAsNumber > 1800) {
      return { allowed: false, reason: 'Para retirada no mesmo dia, o horário deve ser entre 11h e 18h.' };
    }
  }

  return { allowed: true, reason: '' };
}

// ========== isOrderAllowedAtTime (original) ==========
/**
 * Verifica se o pedido pode ser realizado no horário escolhido
 * Entre 07:00 e 14:00, só libera se:
 * - Houver pelo menos um bolo no carrinho, OU
 * - O total do pedido for >= R$ 30,00
 */
function isOrderAllowedAtTime(timeSlot, cartTotal, cartItems) {
  const normalizedTime = (timeSlot || '').replace(/:/g, '');
  const timeAsNumber = parseInt(normalizedTime, 10) || 0;

  // Fora do período restrito (antes das 07:00 ou após 14:00), sempre permite
  if (timeAsNumber < 700 || timeAsNumber >= 1400) {
    return { allowed: true, reason: '' };
  }

  // Está entre 07:00 e 14:00 - aplicar regras especiais
  const hasCake = cartItems.some(item => {
    const product = products.find(p => p.id === item.id);
    const productName = (item.name || '').toLowerCase();
    const productCategory = (product?.category || '').toLowerCase();
    return productCategory === 'bolos' || productName.includes('bolo');
  });

  const meetsMinimumValue = cartTotal >= 30.00;

  if (hasCake || meetsMinimumValue) {
    return { allowed: true, reason: '' };
  }

  return {
    allowed: false,
    reason: 'Entre 7h e 14h, só aceitamos pedidos de bolos ou pedidos acima de R$ 30,00.'
  };
}

// ========== loadStoreConfig (original) ==========
async function loadStoreConfig() {
  try {
    const { data, error } = await window.supabaseClient
      .from('fast_store_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    if (data) {
      storeConfig = {
        card_fee_1x: parseFloat(data.card_fee_1x) || 5,
        card_fee_2x: parseFloat(data.card_fee_2x) || 10,
        delivery_enabled: data.delivery_enabled !== false,
        delivery_disabled_reason: data.delivery_disabled_reason || '',
        prep_time_min: parseInt(data.prep_time_min) || 0,
        prep_time_max: parseInt(data.prep_time_max) || 0,
        delivery_time_min: parseInt(data.delivery_time_min) || 0,
        delivery_time_max: parseInt(data.delivery_time_max) || 0,
      };
      storeConfig.card_fee_2x = storeConfig.card_fee_1x;
      localStorage.setItem('fastStoreConfig', JSON.stringify(storeConfig));
      console.log('Configurações carregadas do Supabase');
    }
  } catch (error) {
    console.log('Carregando config do localStorage:', error.message);
    try {
      const saved = localStorage.getItem('fastStoreConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        storeConfig = { ...storeConfig, ...parsed };
        storeConfig.card_fee_2x = storeConfig.card_fee_1x;
      }
    } catch (e) {
      console.log('Using default store config');
    }
  }

  // Update UI elements...
}

// ========== saveStoreConfig (original) ==========
async function saveStoreConfig() {
  try {
    localStorage.setItem('fastStoreConfig', JSON.stringify(storeConfig));

    const { error } = await window.supabaseClient
      .from('fast_store_config')
      .upsert({
        id: 1,
        card_fee_1x: storeConfig.card_fee_1x,
        card_fee_2x: storeConfig.card_fee_2x,
        delivery_enabled: storeConfig.delivery_enabled,
        delivery_disabled_reason: storeConfig.delivery_disabled_reason,
        prep_time_min: storeConfig.prep_time_min || 0,
        prep_time_max: storeConfig.prep_time_max || 0,
        delivery_time_min: storeConfig.delivery_time_min || 0,
        delivery_time_max: storeConfig.delivery_time_max || 0,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
    console.log('Configurações salvas no Supabase');
    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações no Supabase (salvo localmente):', error);
    return true;
  }
}

// ========== VALORES HARDCODED ORIGINAIS ==========
/*
 * Regra da Manhã (07h-14h):
 *   - Horário início: 07:00
 *   - Horário fim: 14:00
 *   - Valor mínimo: R$ 30,00
 *
 * Pedidos para Hoje (sem bolo):
 *   - Horário início retirada: 11:00
 *   - Horário fim retirada: 18:00
 *   - Valor mínimo: R$ 15,00
 *
 * Pedido Mínimo Normal:
 *   - Entrega: (não definido explicitamente)
 *   - Retirada horário normal (14h-18h): R$ 8,00 (conforme usuário)
 *   - Retirada fora do horário: R$ 15,00
 */
