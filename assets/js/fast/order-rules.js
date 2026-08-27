/**
 * Fast Savory's - Order Rules Module
 * Sistema completo de regras de pedidos
 * 
 * CATEGORIAS DE PRODUTOS:
 * - BOLO_GRANDE: Bolo G, Bolo P, Bolo Vulcão (não mini), Kit Festa
 * - BOLO_MINI: Bolo Vulcão Mini, Bolo no Pote
 * - COMBO: Combos (se contém Vulcão Mini → permite entrega)
 * - SALGADOS: Salgados, Mini-Salgados
 * - BEBIDAS: Refrigerantes, Sucos
 * - ADICIONAIS: Molhos, Maionese, etc.
 */

// ============================================
// CLASSIFICAÇÃO DE PRODUTOS
// ============================================

/**
 * Classifica um produto em sua categoria de regras
 * @param {Object} product - Produto do carrinho
 * @returns {string} Categoria: 'bolo_grande', 'bolo_mini', 'salgados', 'bebidas', 'adicionais'
 */
window.classifyProduct = function (product) {
    if (!product) return 'adicionais';

    const name = (product.name || '').toLowerCase();
    const category = (product.category || '').toLowerCase();

    // Kit Festa → sempre bolo_grande (apenas retirada)
    if (category === 'kits' || name.includes('kit festa') || name.includes('kit ')) {
        return 'bolo_grande';
    }

    // Combos → verificar se contém Vulcão Mini
    if (category === 'combo' || category === 'combos' || name.includes('combo')) {
        // Combo com Vulcão Mini → permite entrega (classificado como combo_vulcao)
        if (name.includes('vulcão') || name.includes('vulcao') || name.includes('explosão') || name.includes('explosao')) {
            return 'combo_vulcao';
        }
        // Outros combos → tratados como salgados (permite entrega)
        return 'combo';
    }

    // Bolos
    if (category === 'bolos' || name.includes('bolo')) {
        // Vulcão Mini → pode entrega
        if (name.includes('vulcão mini') || name.includes('vulcao mini') ||
            name.includes('mini vulcão') || name.includes('mini vulcao')) {
            return 'bolo_mini';
        }
        // Bolo no Pote → pode entrega (mesmo tratamento do Vulcão Mini)
        if (name.includes('pote') || name.includes('no pote') || name.includes('de pote')) {
            return 'bolo_mini';
        }
        // Qualquer outro bolo (G, P, Vulcão normal) → apenas retirada
        return 'bolo_grande';
    }

    // Vulcão sem "bolo" no nome
    if (name.includes('vulcão') || name.includes('vulcao')) {
        if (name.includes('mini')) return 'bolo_mini';
        return 'bolo_grande';
    }

    // Salgados
    if (category === 'salgados' || category === 'mini-salgados' || category === 'mini salgados' ||
        name.includes('salgado') || name.includes('coxinha') || name.includes('risole') ||
        name.includes('empada') || name.includes('esfiha') || name.includes('enroladinho') ||
        name.includes('bolinha') || name.includes('kibe') || name.includes('pastel')) {
        return 'salgados';
    }

    // Bebidas
    if (category === 'bebidas' || name.includes('refrigerante') || name.includes('coca') ||
        name.includes('guaraná') || name.includes('suco') || name.includes('água') ||
        name.includes('fanta') || name.includes('sprite')) {
        return 'bebidas';
    }

    // Adicionais
    if (category === 'adicionais' || name.includes('maionese') || name.includes('molho') ||
        name.includes('catchup') || name.includes('ketchup') || name.includes('mostarda')) {
        return 'adicionais';
    }

    // Default: salgados (para não bloquear produtos não classificados)
    return 'salgados';
};

/**
 * Analisa o carrinho e retorna informações sobre os tipos de produtos
 * @param {Array} cartItems - Itens do carrinho
 * @returns {Object} Análise do carrinho
 */
window.analyzeCart = function (cartItems = window.cart) {
    const analysis = {
        hasBoloGrande: false,      // Kit Festa, Bolo G/P, Vulcão
        hasBoloMini: false,        // Vulcão Mini
        hasCombo: false,           // Combos
        hasComboVulcao: false,     // Combos com Vulcão Mini
        hasSalgados: false,        // Salgados e Mini-Salgados
        hasBebidas: false,         // Refrigerantes
        hasAdicionais: false,      // Molhos, etc.
        onlyBebidaAdicionais: true, // Só tem bebidas/adicionais?
        categories: [],
        products: []
    };

    if (!cartItems || cartItems.length === 0) {
        analysis.onlyBebidaAdicionais = false;
        return analysis;
    }

    cartItems.forEach(item => {
        const product = (window.products || []).find(p => p.id === item.id) || item;
        const category = window.classifyProduct(product);

        analysis.products.push({ ...item, ruleCategory: category });

        if (!analysis.categories.includes(category)) {
            analysis.categories.push(category);
        }

        switch (category) {
            case 'bolo_grande':
                analysis.hasBoloGrande = true;
                analysis.onlyBebidaAdicionais = false;
                break;
            case 'bolo_mini':
                analysis.hasBoloMini = true;
                analysis.onlyBebidaAdicionais = false;
                break;
            case 'combo_vulcao':
                analysis.hasComboVulcao = true;
                analysis.hasCombo = true;
                analysis.onlyBebidaAdicionais = false;
                break;
            case 'combo':
                analysis.hasCombo = true;
                analysis.onlyBebidaAdicionais = false;
                break;
            case 'salgados':
                analysis.hasSalgados = true;
                analysis.onlyBebidaAdicionais = false;
                break;
            case 'bebidas':
                analysis.hasBebidas = true;
                break;
            case 'adicionais':
                analysis.hasAdicionais = true;
                break;
        }
    });

    return analysis;
};

// ============================================
// VALIDAÇÃO DE MODALIDADE (ENTREGA vs RETIRADA)
// ============================================

/**
 * Verifica se entrega é permitida para o carrinho atual
 * @param {Array} cartItems - Itens do carrinho
 * @param {number} cartTotal - Total do carrinho
 * @param {string} neighborhood - Bairro selecionado
 * @returns {Object} { allowed: boolean, reason: string, minValue: number }
 */
window.canUseDelivery = function (cartItems = window.cart, cartTotal = window.cartTotal, neighborhood = null) {
    const analysis = window.analyzeCart(cartItems);

    // Regra 1: Kit Festa, Bolo G/P, Vulcão → APENAS RETIRADA (exceto Vulcão Mini e Bolo no Pote)
    if (analysis.hasBoloGrande) {
        const boloGrandeItems = analysis.products
            .filter(p => p.ruleCategory === 'bolo_grande')
            .map(p => p.name)
            .join(', ');
        return {
            allowed: false,
            reason: `🚫 Os produtos "${boloGrandeItems}" estão disponíveis apenas para RETIRADA NA LOJA. Não oferecemos entrega para bolos grandes, kits festa ou vulcão. (Vulcão Mini e Bolo no Pote podem ser entregues!)`,
            minValue: 0
        };
    }

    // Regra 2: Apenas bebidas/adicionais → BLOQUEADO
    if (analysis.onlyBebidaAdicionais) {
        return {
            allowed: false,
            reason: '🚫 Para entrega, o pedido precisa incluir salgados ou bolos. Não entregamos apenas bebidas e adicionais.',
            minValue: 0
        };
    }

    // Regra 3: Bolo Mini e Salgados → permitido, mas verifica valor mínimo por bairro
    // O mínimo GLOBAL para entrega vem de storeConfig.min_order_delivery (padrão R$ 15,00)
    const globalMinDelivery = (window.storeConfig && typeof window.storeConfig.min_order_delivery === 'number')
        ? window.storeConfig.min_order_delivery
        : 15;

    if (neighborhood) {
        const neighborhoodMin = window.getMinDeliveryValue(neighborhood) || 0;
        const minValue = Math.max(globalMinDelivery, neighborhoodMin);
        if (cartTotal < minValue) {
            const faltando = (minValue - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `🚚 Faltam apenas R$ ${faltando} para liberarmos a entrega para o seu bairro! Valor mínimo: R$ ${minValue.toFixed(2).replace('.', ',')}`,
                minValue: minValue
            };
        }
    } else if (cartTotal < globalMinDelivery) {
        const faltando = (globalMinDelivery - cartTotal).toFixed(2).replace('.', ',');
        return {
            allowed: false,
            reason: `🚚 O valor mínimo para entrega é de R$ ${globalMinDelivery.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando}.`,
            minValue: globalMinDelivery
        };
    }

    return { allowed: true, reason: '', minValue: 0 };
};

/**
 * Obtém o valor mínimo de entrega para um bairro
 * @param {string} neighborhood - Nome do bairro
 * @returns {number} Valor mínimo
 */
window.getMinDeliveryValue = function (neighborhood) {
    if (!neighborhood) return 0;

    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const normalizedNeighborhood = norm(neighborhood);

    // Buscar das taxas de entrega armazenadas
    let fees = {};
    try {
        fees = JSON.parse(localStorage.getItem('fastDeliveryFees') || '{}');
    } catch (e) {
        fees = {};
    }

    for (const [bairro, config] of Object.entries(fees)) {
        if (norm(bairro) === normalizedNeighborhood) {
            return config.minOrder || config.min_order || config.min || 0;
        }
    }

    return 0;
};

// ============================================
// VALIDAÇÃO DE DATA E ANTECEDÊNCIA
// ============================================

/**
 * Verifica se uma data específica está na lista de datas bloqueadas
 * @param {string} dateStr - Data no formato YYYY-MM-DD
 * @returns {Object|null} Objeto da data bloqueada ou null
 */
window.isDateBlocked = function (dateStr) {
    if (!dateStr || !window.blockedDates || !window.blockedDates.length) return null;
    const found = window.blockedDates.find(d => d.blocked_date === dateStr);
    return found || null;
};

/**
 * Calcula a data mínima permitida para o pedido
 * @param {Array} cartItems - Itens do carrinho
 * @returns {Object} { minDate: string (YYYY-MM-DD), reason: string }
 */
window.getMinOrderDate = function (cartItems = window.cart) {
    const brasilia = window.getBrasiliaDate();
    const analysis = window.analyzeCart(cartItems);
    const horaAtual = brasilia.getHours();
    const minutoAtual = brasilia.getMinutes();
    const tempoAtual = horaAtual * 60 + minutoAtual;

    const today = window.formatYYYYMMDD(brasilia);
    const tomorrow = window.formatYYYYMMDD(new Date(brasilia.getTime() + 24 * 60 * 60 * 1000));

    // Regra 0: Pedidos do mesmo dia desabilitados pelo administrador
    if (window.storeConfig && window.storeConfig.same_day_orders_enabled === false) {
        return {
            minDate: tomorrow,
            reason: '📅 Pedidos para o mesmo dia estão desativados no momento. Agende a partir de amanhã.',
            canOrderToday: false
        };
    }

    // Regra 1: Kit Festa, Bolo G/P, Vulcão → sempre D+1 (mínimo amanhã)
    if (analysis.hasBoloGrande) {
        return {
            minDate: tomorrow,
            reason: '🎂 Bolos e Kits Festa exigem 1 dia de antecedência para preparo.',
            canOrderToday: false
        };
    }

    // Regra 2: Vulcão Mini → até 10h pode pedir para hoje, após 10h só amanhã
    if (analysis.hasBoloMini) {
        const cutoffMini = 10 * 60; // 10:00
        if (tempoAtual > cutoffMini) {
            return {
                minDate: tomorrow,
                reason: '🌋 Bolo Vulcão Mini: após as 10h, pedidos apenas para o dia seguinte.',
                canOrderToday: false
            };
        }
        return {
            minDate: today,
            reason: '🌋 Bolo Vulcão Mini: pedido até 10h para o mesmo dia.',
            canOrderToday: true
        };
    }

    // Regra 3: Salgados → até 8h pode pedir para hoje
    if (analysis.hasSalgados) {
        const cutoffSalgados = 8 * 60; // 08:00
        if (tempoAtual > cutoffSalgados) {
            const sameDayStart = (window.storeConfig && window.storeConfig.same_day_pickup_start) || '11:00';
            return {
                minDate: today, // Ainda pode pedir para hoje, mas com restrições de horário
                reason: `🥟 Salgados: após as 8h, pedidos para entrega/retirada para hoje somente a partir das ${sameDayStart}.`,
                canOrderToday: true,
                sameDayRestricted: true
            };
        }
        return {
            minDate: today,
            reason: '🥟 Salgados: pedido até 8h para o mesmo dia.',
            canOrderToday: true
        };
    }

    // Default: pode pedir para hoje
    return { minDate: today, reason: '', canOrderToday: true };
};

// ============================================
// VALIDAÇÃO DE HORÁRIO
// ============================================

/**
 * Valida o horário selecionado para o pedido
 * @param {string} timeSlot - Horário selecionado (HH:MM)
 * @param {string} orderDate - Data do pedido (YYYY-MM-DD)
 * @param {Array} cartItems - Itens do carrinho
 * @param {number} cartTotal - Total do carrinho
 * @param {boolean} isDelivery - true se é entrega
 * @returns {Object} { allowed: boolean, reason: string }
 */
window.validateOrderTime = function (timeSlot, orderDate, cartItems = window.cart, cartTotal = window.cartTotal, isDelivery = false) {
    if (!timeSlot) {
        return { allowed: false, reason: 'Selecione um horário para o pedido.' };
    }

    const analysis = window.analyzeCart(cartItems);
    const brasilia = window.getBrasiliaDate();
    const today = window.formatYYYYMMDD(brasilia);
    const isToday = orderDate === today;

    // Normalizar horário
    const normalizeTime = (t) => (t || '').replace(/:/g, '').substring(0, 4).padStart(4, '0');
    const timeNum = parseInt(normalizeTime(timeSlot), 10);

    // Janela geral de funcionamento (do Admin ou padrão 07:00 às 18:00)
    const windowStart = (window.storeConfig && window.storeConfig.order_window_start) || '07:00';
    const windowEnd = (window.storeConfig && window.storeConfig.order_window_end) || '18:00';
    const minTimeNum = parseInt(normalizeTime(windowStart), 10);
    const maxTimeNum = parseInt(normalizeTime(windowEnd), 10);

    // Validação geral da janela de pedidos
    if (timeNum < minTimeNum || timeNum > maxTimeNum) {
        return {
            allowed: false,
            reason: `⏰ O horário selecionado deve estar dentro da janela de funcionamento: das ${windowStart} às ${windowEnd}.`
        };
    }

    // Regra 1: Kit Festa, Bolo G/P, Vulcão → dentro da janela geral (D+1 já validado em getMinOrderDate)
    if (analysis.hasBoloGrande) {
        if (timeNum < minTimeNum || timeNum > maxTimeNum) {
            return {
                allowed: false,
                reason: `⏰ Para bolos e kits festa, a retirada deve ser entre ${windowStart} e ${windowEnd}.`
            };
        }
        return { allowed: true, reason: '' };
    }

    // Regra 2: Vulcão Mini → dentro da janela geral
    if (analysis.hasBoloMini) {
        if (timeNum < minTimeNum || timeNum > maxTimeNum) {
            return {
                allowed: false,
                reason: `⏰ Para Bolo Vulcão Mini, o horário deve ser entre ${windowStart} e ${windowEnd}.`
            };
        }
        return { allowed: true, reason: '' };
    }

    // Regra 3: Pedidos no Mesmo Dia
    if (isToday) {
        if (window.storeConfig && window.storeConfig.same_day_orders_enabled === false) {
            return {
                allowed: false,
                reason: '📅 Pedidos para o mesmo dia estão desativados no momento. Selecione uma data futura.'
            };
        }

        const sameDayStart = (window.storeConfig && window.storeConfig.same_day_pickup_start) || '11:00';
        const sameDayEnd = (window.storeConfig && window.storeConfig.same_day_pickup_end) || windowEnd;
        const sameDayStartNum = parseInt(normalizeTime(sameDayStart), 10);
        const sameDayEndNum = parseInt(normalizeTime(sameDayEnd), 10);

        if (timeNum < sameDayStartNum || timeNum > sameDayEndNum) {
            return {
                allowed: false,
                reason: `⏰ Para pedidos no mesmo dia, o horário permitido é das ${sameDayStart} às ${sameDayEnd}.`
            };
        }

        const sameDayMinValue = (window.storeConfig && typeof window.storeConfig.same_day_min_value === 'number')
            ? window.storeConfig.same_day_min_value
            : 15;
        if (cartTotal < sameDayMinValue) {
            const faltando = (sameDayMinValue - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `💰 Para pedidos no mesmo dia, o pedido mínimo é de R$ ${sameDayMinValue.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando}.`
            };
        }
    }

    // Regra 4: REGRA DA MANHÃ (Configurável no Admin - ex: antes das 13h, mín. R$ 40,00)
    // Aplica para entrega e retirada, agendado ou mesmo dia
    const morningEnabled = window.storeConfig ? window.storeConfig.morning_rule_enabled !== false : true;
    const morningEndTime = (window.storeConfig && window.storeConfig.morning_rule_end_time) || '13:00';
    const morningMinValue = (window.storeConfig && typeof window.storeConfig.morning_rule_min_value === 'number')
        ? window.storeConfig.morning_rule_min_value
        : 40.00;
    const morningEndNum = parseInt(normalizeTime(morningEndTime), 10);

    if (morningEnabled && timeNum >= minTimeNum && timeNum < morningEndNum) {
        if (cartTotal < morningMinValue) {
            const faltando = (morningMinValue - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `🌅 Para pedidos entre ${windowStart} e ${morningEndTime} (${isDelivery ? 'entrega' : 'retirada'}), o pedido mínimo é de R$ ${morningMinValue.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando}.`
            };
        }
    }

    // Regra 5: Mínimo Retirada Fora-Horário (ex: entre 12h e 14h se configurado diferente do mínimo padrão)
    if (!isDelivery && timeNum >= 1200 && timeNum < 1400) {
        const minOffhours = (window.storeConfig && typeof window.storeConfig.min_order_pickup_offhours === 'number')
            ? window.storeConfig.min_order_pickup_offhours
            : 15;
        if (cartTotal < minOffhours) {
            const faltando = (minOffhours - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `💰 Para retirada entre 12:00 e 14:00, o pedido mínimo é de R$ ${minOffhours.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando}.`
            };
        }
    }

    return { allowed: true, reason: '' };
};

// ============================================
// REGRA DE DOMINGO
// ============================================

/**
 * Verifica se o pedido é válido considerando regra de domingo
 * REGRAS:
 * 1. Se a DATA DE ENTREGA/RETIRADA é domingo:
 *    - Entrega: BLOQUEIA (não entregamos aos domingos)
 *    - Retirada: PERMITE, mas com valor mínimo de R$39 (sem contar taxa de entrega)
 * 2. Se HOJE é domingo e pedido para hoje (domingo): BLOQUEIA (loja fechada)
 * 3. Se HOJE é domingo e pedido para outro dia: PERMITE sem restrição de valor
 * 
 * @param {string} orderDate - Data de entrega (YYYY-MM-DD)
 * @param {number} cartTotal - Total do carrinho (sem taxa de entrega)
 * @param {boolean} isDelivery - Se é entrega (true) ou retirada (false)
 * @returns {Object} { allowed: boolean, reason: string }
 */
window.validateSundayRule = function (orderDate, cartTotal = window.cartTotal, isDelivery = false) {
    const brasilia = window.getBrasiliaDate();
    const today = window.formatYYYYMMDD(brasilia);
    const todayIsSunday = brasilia.getDay() === 0;
    const SUNDAY_MIN_VALUE = 39;

    if (!orderDate) return { allowed: true, reason: '' };

    const orderDateObj = new Date(orderDate + 'T12:00:00');
    const orderDayOfWeek = orderDateObj.getDay();

    // 1. Se HOJE é domingo e pedido para HOJE: bloqueia (loja fechada)
    if (todayIsSunday && orderDate === today) {
        return {
            allowed: false,
            reason: '🌴 Hoje estamos descansando! Mas para não ficar sem nossos salgados, faça uma encomenda para segunda-feira em diante.'
        };
    }

    // 2. Se a DATA DE ENTREGA/RETIRADA é domingo
    if (orderDayOfWeek === 0) {
        // Entrega no domingo: PERMITE apenas acima de R$39
        if (isDelivery) {
            if (cartTotal < SUNDAY_MIN_VALUE) {
                const faltando = (SUNDAY_MIN_VALUE - cartTotal).toFixed(2).replace('.', ',');
                return {
                    allowed: false,
                    reason: `🌴 Para entregas aos domingos, o pedido mínimo é de R$ ${SUNDAY_MIN_VALUE.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando} para liberar seu pedido!`
                };
            }
        }

        // Retirada no domingo: PERMITE apenas acima de R$39
        if (cartTotal < SUNDAY_MIN_VALUE) {
            const faltando = (SUNDAY_MIN_VALUE - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `🌴 Aos domingos, aceitamos apenas encomendas acima de R$ ${SUNDAY_MIN_VALUE.toFixed(2).replace('.', ',')} (sem contar taxa de entrega). Faltam R$ ${faltando} para liberar seu pedido!`
            };
        }
    }

    // 3. Se HOJE é domingo e pedido para outro dia → PERMITE sem restrição de valor
    return { allowed: true, reason: '' };
};

// ============================================
// VALIDAÇÃO DE CARRINHO
// ============================================

/**
 * Verifica se o carrinho tem itens válidos (não apenas bebidas/adicionais)
 * @param {Array} cartItems - Itens do carrinho
 * @returns {Object} { valid: boolean, reason: string }
 */
window.validateCartContent = function (cartItems = window.cart) {
    if (!cartItems || cartItems.length === 0) {
        return {
            valid: false,
            reason: '🛒 Seu carrinho está vazio. Adicione produtos antes de finalizar.'
        };
    }

    const analysis = window.analyzeCart(cartItems);

    if (analysis.onlyBebidaAdicionais) {
        return {
            valid: false,
            reason: '🚫 Ops! Para entrega, precisamos que o pedido inclua nossos salgados ou bolos. Não aceitamos pedidos apenas com bebidas e adicionais.'
        };
    }

    return { valid: true, reason: '' };
};

// ============================================
// VALIDAÇÃO COMPLETA DO PEDIDO
// ============================================

/**
 * Executa todas as validações do pedido
 * @param {Object} params - Parâmetros do pedido
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
window.validateOrder = function (params = {}) {
    const {
        cartItems = window.cart,
        cartTotal = window.cartTotal,
        orderDate,
        timeSlot,
        isDelivery = false,
        neighborhood = null
    } = params;

    const errors = [];
    const warnings = [];

    // 1. Validar conteúdo do carrinho
    const cartValidation = window.validateCartContent(cartItems);
    if (!cartValidation.valid) {
        errors.push(cartValidation.reason);
    }

    // 2. Validar modalidade (entrega vs retirada)
    if (isDelivery) {
        const deliveryValidation = window.canUseDelivery(cartItems, cartTotal, neighborhood);
        if (!deliveryValidation.allowed) {
            errors.push(deliveryValidation.reason);
        }
    }

    // 2.5. Validar valor mínimo global para retirada
    if (!isDelivery) {
        const minPickup = (window.storeConfig && window.storeConfig.min_order_pickup) || 8;
        if (cartTotal < minPickup) {
            const faltando = (minPickup - cartTotal).toFixed(2).replace('.', ',');
            errors.push(`💰 Pedido mínimo para retirada é de R$ ${minPickup.toFixed(2).replace('.', ',')}. Faltam R$ ${faltando}.`);
        }
    }

    // 3. Validar regra de domingo
    if (orderDate) {
        const sundayValidation = window.validateSundayRule(orderDate, cartTotal, isDelivery);
        if (!sundayValidation.allowed) {
            errors.push(sundayValidation.reason);
        }
    }

    // 3.5. Validar datas bloqueadas (feriados/folgas)
    if (orderDate) {
        const blocked = window.isDateBlocked ? window.isDateBlocked(orderDate) : null;
        if (blocked) {
            const [y, m, d] = orderDate.split('-');
            const formattedDate = `${d}/${m}/${y}`;
            errors.push(`🚫 A data selecionada (${formattedDate}) está bloqueada para pedidos. Motivo: ${blocked.reason || 'Loja fechada nesta data'}.`);
        }
    }

    // 4. Validar data mínima
    const minDateInfo = window.getMinOrderDate(cartItems);
    if (orderDate && orderDate < minDateInfo.minDate) {
        errors.push(minDateInfo.reason);
    }

    // 5. Validar horário
    if (timeSlot && orderDate) {
        const timeValidation = window.validateOrderTime(timeSlot, orderDate, cartItems, cartTotal, isDelivery);
        if (!timeValidation.allowed) {
            errors.push(timeValidation.reason);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        analysis: window.analyzeCart(cartItems)
    };
};

// ============================================
// HELPERS PARA UI
// ============================================

/**
 * Atualiza a UI com base nas regras de pedido
 * Chamado quando o carrinho muda ou a modalidade é alterada
 */
window.updateOrderRulesUI = function () {
    const analysis = window.analyzeCart(window.cart);
    const deliveryRadio = document.getElementById('deliveryOptionRadio');
    const retiradaRadio = document.querySelector('input[name="delivery"][value="retirada"]');
    const deliveryWarning = document.getElementById('deliveryModeWarning');
    const deliveryLabel = document.getElementById('deliveryOptionLabel');

    // Se tem bolo grande (Kit Festa, Bolo G/P, Vulcão), desabilita entrega e mostra aviso
    if (analysis.hasBoloGrande) {
        if (deliveryRadio) {
            deliveryRadio.disabled = true;
            deliveryRadio.parentElement?.classList.add('opacity-50', 'cursor-not-allowed');
        }

        // Se entrega estava selecionada, muda para retirada
        if (deliveryRadio && deliveryRadio.checked && retiradaRadio) {
            retiradaRadio.checked = true;
            retiradaRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Mostra aviso inline
        if (deliveryWarning) {
            // Identifica quais produtos estão bloqueando
            const boloGrandeItems = analysis.products
                .filter(p => p.ruleCategory === 'bolo_grande')
                .map(p => p.name)
                .join(', ');

            deliveryWarning.innerHTML = `🚫 <strong>Atenção:</strong> Os produtos "${boloGrandeItems}" estão disponíveis apenas para <strong>RETIRADA NA LOJA</strong>. Não oferecemos entrega para bolos grandes, kits festa ou vulcão. (Vulcão Mini e Bolo no Pote podem ser entregues!)`;
            deliveryWarning.classList.remove('hidden');
        }
    } else {
        // Habilita entrega e esconde aviso
        if (deliveryRadio) {
            deliveryRadio.disabled = false;
            deliveryRadio.parentElement?.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        if (deliveryWarning) {
            deliveryWarning.classList.add('hidden');
        }
    }

    // Verifica se só tem bebidas/adicionais
    if (analysis.onlyBebidaAdicionais && window.cart && window.cart.length > 0) {
        if (deliveryWarning) {
            deliveryWarning.innerHTML = '🚫 <strong>Atenção:</strong> Não aceitamos pedidos apenas com bebidas e adicionais. Adicione salgados ou bolos ao carrinho.';
            deliveryWarning.classList.remove('hidden');
        }
    }

    // Atualiza informações de data mínima
    const minDateInfo = window.getMinOrderDate(window.cart);
    const orderDateInput = document.getElementById('orderDate');
    if (orderDateInput) {
        orderDateInput.min = minDateInfo.minDate;

        // Se data selecionada é menor que mínima, atualiza
        if (orderDateInput.value && orderDateInput.value < minDateInfo.minDate) {
            orderDateInput.value = minDateInfo.minDate;
        }
    }

    // Atualiza hint da data com informação sobre o tipo de produto
    const orderTimeHint = document.getElementById('orderTimeHint');
    if (orderTimeHint && minDateInfo.reason) {
        orderTimeHint.textContent = minDateInfo.reason;
    }

    // Atualiza info box de regras baseado no carrinho
    const orderRulesInfo = document.getElementById('orderRulesInfo');
    if (orderRulesInfo) {
        const windowStart = (window.storeConfig && window.storeConfig.order_window_start) || '07:00';
        const windowEnd = (window.storeConfig && window.storeConfig.order_window_end) || '18:00';
        const morningEnabled = window.storeConfig ? window.storeConfig.morning_rule_enabled !== false : true;
        const morningEndTime = (window.storeConfig && window.storeConfig.morning_rule_end_time) || '13:00';
        const morningMinValue = (window.storeConfig && typeof window.storeConfig.morning_rule_min_value === 'number')
            ? window.storeConfig.morning_rule_min_value
            : 40.00;
        const sameDayStart = (window.storeConfig && window.storeConfig.same_day_pickup_start) || '11:00';
        const sameDayMinValue = (window.storeConfig && typeof window.storeConfig.same_day_min_value === 'number')
            ? window.storeConfig.same_day_min_value
            : 15.00;

        let rulesHtml = '';

        if (analysis.hasBoloGrande) {
            rulesHtml = `<strong>🎂 Bolos e Kits Festa:</strong> Mínimo 1 dia de antecedência. Retirada das ${windowStart} às ${windowEnd}. <strong>Apenas retirada, sem entrega.</strong>`;
        } else if (analysis.hasBoloMini) {
            rulesHtml = `<strong>🌋 Vulcão Mini:</strong> Pedidos até 10h para o mesmo dia. Após 10h, só para o dia seguinte. Horário: ${windowStart}-${windowEnd}.`;
        } else if (analysis.hasSalgados) {
            const morningText = morningEnabled ? `• Manhã (${windowStart}-${morningEndTime}): mín. R$ ${morningMinValue.toFixed(2).replace('.', ',')}` : '';
            rulesHtml = `<strong>🥟 Salgados:</strong> Mesmo dia: pedir até 8h (disponível ${sameDayStart}-${windowEnd}, mín. R$ ${sameDayMinValue.toFixed(2).replace('.', ',')}). Encomendas: ${windowStart}-${windowEnd}.<br>
                        <span class="text-xs">${morningText}</span>`;
        } else {
            rulesHtml = `<strong>📋 Horário de funcionamento:</strong> ${windowStart} às ${windowEnd}`;
        }

        orderRulesInfo.innerHTML = rulesHtml;
    }
};

/**
 * Valida valor mínimo por bairro e mostra aviso
 */
window.updateNeighborhoodMinValueWarning = function () {
    const neighborhood = document.getElementById('neighborhood')?.value;
    const warningDiv = document.getElementById('neighborhoodMinValueWarning');
    const isDelivery = document.querySelector('input[name="delivery"]:checked')?.value === 'entrega';

    if (!warningDiv || !isDelivery || !neighborhood) {
        if (warningDiv) warningDiv.classList.add('hidden');
        return;
    }

    const globalMinDelivery = (window.storeConfig && typeof window.storeConfig.min_order_delivery === 'number')
        ? window.storeConfig.min_order_delivery
        : 15;
    const minValue = Math.max(globalMinDelivery, window.getMinDeliveryValue(neighborhood) || 0);

    if (window.cartTotal < minValue) {
        const faltando = (minValue - window.cartTotal).toFixed(2).replace('.', ',');
        warningDiv.innerHTML = `🚚 <strong>Faltam R$ ${faltando}</strong> para liberarmos a entrega para o bairro <strong>${neighborhood}</strong>! Valor mínimo: R$ ${minValue.toFixed(2).replace('.', ',')}`;
        warningDiv.classList.remove('hidden');
    } else {
        warningDiv.classList.add('hidden');
    }
};

// ============================================
// COMPATIBILIDADE COM CÓDIGO LEGADO
// ============================================

// Substitui funções antigas mantendo compatibilidade
window.cartContainsBolo = function (cartItems = window.cart) {
    const analysis = window.analyzeCart(cartItems);
    return analysis.hasBoloGrande || analysis.hasBoloMini;
};

window.hasBlockedProductsForSameDay = function () {
    const analysis = window.analyzeCart(window.cart);
    return analysis.hasBoloGrande; // Bolo mini não bloqueia mais se pedido até 10h
};

console.log('[OrderRules] ✅ Sistema de regras de pedidos carregado');
