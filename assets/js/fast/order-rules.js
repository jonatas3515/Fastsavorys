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

    const name = (product.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const category = (product.category || '').toLowerCase();

    // Produtos com flag explícito de encomenda / pré-reserva exigem 1 dia
    if (product.requires_preorder === true || product.is_encomenda === true || product.isEncomenda === true) {
        return 'bolo_grande';
    }

    // Empadão → exige 1 dia de antecedência (tratar ANTES de salgados comuns)
    if (name.includes('empadao')) {
        return 'bolo_grande';
    }

    // Mini Pizza Festa → exige 1 dia de antecedência
    if (name.includes('mini pizza festa') || name.includes('pizza festa')) {
        return 'bolo_grande';
    }

    // Kit Festa → sempre bolo_grande (apenas retirada e exige 1 dia de antecedência)
    if (category === 'kits' || name.includes('kit festa') || name.includes('kit ')) {
        return 'bolo_grande';
    }

    // Combos → verificar se contém Vulcão Mini
    if (category === 'combo' || category === 'combos' || name.includes('combo')) {
        // Combo com Vulcão Mini → permite entrega (classificado como combo_vulcao)
        if (name.includes('vulcao') || name.includes('explosao')) {
            return 'combo_vulcao';
        }
        // Outros combos → tratados como salgados (permite entrega)
        return 'combo';
    }

    // Bolos
    if (category === 'bolos' || name.includes('bolo')) {
        // Vulcão Mini → pode entrega
        if (name.includes('vulcao mini') || name.includes('mini vulcao')) {
            return 'bolo_mini';
        }
        // Bolo no Pote → pode entrega (mesmo tratamento do Vulcão Mini)
        if (name.includes('pote')) {
            return 'bolo_mini';
        }
        // Qualquer outro bolo (G, P, Vulcão normal) → apenas retirada e exige 1 dia
        return 'bolo_grande';
    }

    // Vulcão sem "bolo" no nome
    if (name.includes('vulcao')) {
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
        name.includes('guarana') || name.includes('suco') || name.includes('agua') ||
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
    const afterTomorrow = window.formatYYYYMMDD(new Date(brasilia.getTime() + 48 * 60 * 60 * 1000));

    // Regra 0: Pedidos do mesmo dia desabilitados pelo administrador
    if (window.storeConfig && window.storeConfig.same_day_orders_enabled === false) {
        return {
            minDate: tomorrow,
            reason: '📅 Pedidos para o mesmo dia estão desativados no momento. Agende a partir de amanhã.',
            canOrderToday: false
        };
    }

    // Regra 1: Kit Festa, Bolo G/P, Vulcão:
    // "Para Kits festa, só aceite pedidos até as 18h do dia anterior, se pedir as 18h01, fica para dois dias (D+2)"
    if (analysis.hasBoloGrande) {
        const cutoffBolo = 18 * 60; // 18:00
        if (tempoAtual > cutoffBolo) {
            const [y, m, d] = afterTomorrow.split('-');
            return {
                minDate: afterTomorrow,
                reason: `🎂 Kits Festa e Bolos para o dia seguinte devem ser pedidos até as 18h. Pedidos feitos após as 18h ficam para 2 dias de antecedência (a partir de ${d}/${m}/${y}).`,
                canOrderToday: false
            };
        }
        return {
            minDate: tomorrow,
            reason: '🎂 Bolos e Kits Festa exigem antecedência (pedidos até as 18h para o dia seguinte).',
            canOrderToday: false
        };
    }

    // Regra 2: Vulcão Mini
    if (analysis.hasBoloMini) {
        const cutoffMini = 18 * 60; // 18:00
        if (tempoAtual > cutoffMini) {
            const [y, m, d] = afterTomorrow.split('-');
            return {
                minDate: afterTomorrow,
                reason: `🌋 Bolo Vulcão Mini: pedidos após as 18h ficam disponíveis a partir de ${d}/${m}/${y}.`,
                canOrderToday: false
            };
        }
        return {
            minDate: tomorrow,
            reason: '🌋 Bolo Vulcão Mini: pedidos aceitos até as 18h para amanhã.',
            canOrderToday: false
        };
    }

    // Regra 3: Apenas Salgados
    // "Agora se for apenas salgados pode aceitar pedidos feitos até as 21h."
    // - Para amanhã (D+1): pedidos aceitos até as 21h do dia anterior. Após as 21h, pula para D+2!
    // - Para hoje (mesmo dia): liberado das 16h às 18h. Se já passou das 18h, encerra para hoje e permite agendar para amanhã até as 21h.
    const cutoffSalgadosNextDay = 21 * 60; // 21:00
    const cutoffSameDay = 18 * 60; // 18:00

    if (tempoAtual > cutoffSalgadosNextDay) {
        const [y, m, d] = afterTomorrow.split('-');
        return {
            minDate: afterTomorrow,
            reason: `🥟 Pedidos de salgados para o dia seguinte são aceitos até as 21h. Pedidos após as 21h ficam para ${d}/${m}/${y}.`,
            canOrderToday: false
        };
    }

    if (tempoAtual >= cutoffSameDay) {
        return {
            minDate: tomorrow,
            reason: '🥟 Pedidos para hoje encerrados às 18h. Agendamento disponível para amanhã (pedidos até as 21h).',
            canOrderToday: false
        };
    }

    // Antes das 18h: pode pedir para hoje (liberado a partir das 16h) ou agendar para amanhã
    return {
        minDate: today,
        reason: '🥟 Salgados: pedidos para hoje disponíveis para retirada/entrega das 16h às 18h.',
        canOrderToday: true
    };
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
        return { allowed: false, reason: isDelivery ? 'Por favor, selecione o horário desejado para entrega (das 16h às 18h).' : 'Por favor, selecione o horário desejado para retirada.' };
    }

    const brasilia = window.getBrasiliaDate();
    const today = window.formatYYYYMMDD(brasilia);
    const isToday = orderDate === today;

    // Normalizar horário (ex: "16:00" -> 1600, "08:30" -> 830)
    const normalizeTime = (t) => (t || '').replace(/:/g, '').substring(0, 4).padStart(4, '0');
    const timeNum = parseInt(normalizeTime(timeSlot), 10);

    // REGRA 1: ENTREGAS
    // "entregas das 16h as 18h" - Tanto para o mesmo dia quanto agendadas no dia anterior!
    if (isDelivery) {
        if (timeNum < 1600 || timeNum > 1800) {
            return {
                allowed: false,
                reason: '🛵 Nossas entregas funcionam exclusivamente das 16:00 às 18:00.'
            };
        }
        return { allowed: true, reason: '' };
    }

    // REGRA 2: RETIRADAS NO MESMO DIA
    // "Pedidos feitos no mesmo dia só podem ser liberados para retirar ou entregar após as 16h até as 18h"
    if (isToday) {
        if (window.storeConfig && window.storeConfig.same_day_orders_enabled === false) {
            return {
                allowed: false,
                reason: '📅 Pedidos para o mesmo dia estão desativados no momento. Selecione uma data futura.'
            };
        }

        if (timeNum < 1600 || timeNum > 1800) {
            return {
                allowed: false,
                reason: '⏰ Para pedidos no mesmo dia, a retirada na loja é permitida exclusivamente das 16:00 às 18:00.'
            };
        }
        return { allowed: true, reason: '' };
    }

    // REGRA 3: RETIRADAS AGENDADAS (DIA ANTERIOR / FUTURO)
    // "Pedido feitos no dia anterior, pode ser agendados, apenas para retirada das 8h até as 16h e entregas das 16h as 18h"
    // Retirada agendada permitida das 08:00 às 18:00
    if (timeNum < 800 || timeNum > 1800) {
        return {
            allowed: false,
            reason: '⏰ Para encomendas agendadas, a retirada é permitida das 08:00 às 18:00.'
        };
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
        const minPickup = (window.storeConfig && window.storeConfig.min_order_pickup != null)
            ? (parseFloat(window.storeConfig.min_order_pickup) || 9)
            : 9;
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

    // 5. Validar horário (obrigatório selecionar horário)
    if (!timeSlot) {
        const sameDayStart = (window.storeConfig && window.storeConfig.same_day_pickup_start) || '12:00';
        const sameDayEnd = (window.storeConfig && window.storeConfig.same_day_pickup_end) || (window.storeConfig && window.storeConfig.order_window_end) || '18:00';
        errors.push(`⏰ Por favor, selecione o horário desejado para ${isDelivery ? 'entrega' : 'retirada'} (das ${sameDayStart} às ${sameDayEnd}).`);
    } else if (orderDate) {
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
        const sameDayStart = (window.storeConfig && window.storeConfig.same_day_pickup_start) || '12:00';
        const sameDayMinValue = (window.storeConfig && typeof window.storeConfig.same_day_min_value === 'number')
            ? window.storeConfig.same_day_min_value
            : 25.00;

        let rulesHtml = '';

        if (analysis.hasBoloGrande) {
            rulesHtml = `<strong>🎂 Bolos e Kits Festa:</strong> Pedidos até as 18h do dia anterior (pedidos após as 18h ficam para 2 dias). <strong>Apenas retirada na loja, das 08h às 18h.</strong>`;
        } else if (analysis.hasBoloMini) {
            rulesHtml = `<strong>🌋 Vulcão Mini:</strong> Pedidos até as 18h para o dia seguinte. Retirada das 08h às 18h, entregas das 16h às 18h.`;
        } else if (analysis.hasSalgados) {
            rulesHtml = `<strong>🥟 Salgados:</strong> Mesmo dia: retirada e entrega das 16h às 18h.<br>
                        • Encomendas para o dia seguinte: aceitas até as 21h (retirada das 08h às 18h, entregas das 16h às 18h).`;
        } else {
            rulesHtml = `<strong>📋 Horário de funcionamento:</strong> Loja aberta das 16h às 18h (retiradas agendadas a partir das 08h).`;
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
