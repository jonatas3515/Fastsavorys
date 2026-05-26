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
    if (neighborhood) {
        const minValue = window.getMinDeliveryValue(neighborhood);
        if (minValue > 0 && cartTotal < minValue) {
            const faltando = (minValue - cartTotal).toFixed(2).replace('.', ',');
            return {
                allowed: false,
                reason: `🚚 Faltam apenas R$ ${faltando} para liberarmos a entrega para o seu bairro! Valor mínimo: R$ ${minValue.toFixed(2).replace('.', ',')}`,
                minValue: minValue
            };
        }
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
            return config.minOrder || config.min_order || 0;
        }
    }

    return 0;
};

// ============================================
// VALIDAÇÃO DE DATA E ANTECEDÊNCIA
// ============================================

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
            return {
                minDate: today, // Ainda pode pedir para hoje, mas com restrições de horário
                reason: '🥟 Salgados: após as 8h, pedidos para entrega/retirada somente a partir das 11h30.',
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

    // Limites gerais
    const MIN_TIME = 700;  // 07:00
    const MAX_TIME = 1800; // 18:00

    // Regra 1: Kit Festa, Bolo G/P, Vulcão → 7h-18h (D+1 já validado em getMinOrderDate)
    if (analysis.hasBoloGrande) {
        if (timeNum < MIN_TIME || timeNum > MAX_TIME) {
            return {
                allowed: false,
                reason: `⏰ Para bolos e kits festa, a retirada deve ser entre 07:00 e 18:00.`
            };
        }
        return { allowed: true, reason: '' };
    }

    // Regra 2: Vulcão Mini → 7h-18h
    if (analysis.hasBoloMini) {
        if (timeNum < MIN_TIME || timeNum > MAX_TIME) {
            return {
                allowed: false,
                reason: `⏰ Para Bolo Vulcão Mini, o horário deve ser entre 07:00 e 18:00.`
            };
        }

        // Verifica valor mínimo por bairro para entrega
        if (isDelivery) {
            // Validação já feita em canUseDelivery
        }

        return { allowed: true, reason: '' };
    }

    // Regra 3: Salgados
    if (analysis.hasSalgados) {
        if (isToday) {
            // MESMO DIA: entrega/retirada 11:30-18:00
            const MIN_SAME_DAY = 1130; // 11:30

            if (timeNum < MIN_SAME_DAY || timeNum > MAX_TIME) {
                return {
                    allowed: false,
                    reason: `⏰ Para pedidos no mesmo dia, o horário deve ser entre 11:30 e 18:00.`
                };
            }

            // Entrega 11:30-14:00: mínimo R$ 20,00
            if (isDelivery && timeNum >= 1130 && timeNum < 1400) {
                const minValue = 20;
                if (cartTotal < minValue) {
                    return {
                        allowed: false,
                        reason: `💰 Para entrega entre 11:30 e 14:00, pedido mínimo de R$ ${minValue.toFixed(2).replace('.', ',')}.`
                    };
                }
            }
        } else {
            // DATA FUTURA: 7h-18h com regras de valor mínimo
            if (timeNum < MIN_TIME || timeNum > MAX_TIME) {
                return {
                    allowed: false,
                    reason: `⏰ Para pedidos agendados, o horário deve ser entre 07:00 e 18:00.`
                };
            }

            // 7h-11h: mínimo R$ 35,00
            if (timeNum >= 700 && timeNum < 1100) {
                const minValue = 35;
                if (cartTotal < minValue) {
                    return {
                        allowed: false,
                        reason: `💰 Para ${isDelivery ? 'entregas' : 'retiradas'} entre 07:00 e 11:00, pedido mínimo de R$ ${minValue.toFixed(2).replace('.', ',')}.`
                    };
                }
            }

            // 11h-14h: mínimo R$ 25,00
            if (timeNum >= 1100 && timeNum < 1400) {
                const minValue = 25;
                if (cartTotal < minValue) {
                    return {
                        allowed: false,
                        reason: `💰 Para ${isDelivery ? 'entregas' : 'retiradas'} entre 11:00 e 14:00, pedido mínimo de R$ ${minValue.toFixed(2).replace('.', ',')}.`
                    };
                }
            }
        }

        return { allowed: true, reason: '' };
    }

    // Default: permitir horário comercial
    if (timeNum < MIN_TIME || timeNum > MAX_TIME) {
        return {
            allowed: false,
            reason: `⏰ O horário deve ser entre 07:00 e 18:00.`
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
        let rulesHtml = '';

        if (analysis.hasBoloGrande) {
            rulesHtml = `<strong>🎂 Bolos e Kits Festa:</strong> Mínimo 1 dia de antecedência. Retirada das 07:00 às 18:00. <strong>Apenas retirada, sem entrega.</strong>`;
        } else if (analysis.hasBoloMini) {
            rulesHtml = `<strong>🌋 Vulcão Mini:</strong> Pedidos até 10h para o mesmo dia. Após 10h, só para o dia seguinte. Horário: 07:00-18:00.`;
        } else if (analysis.hasSalgados) {
            rulesHtml = `<strong>🥟 Salgados:</strong> Mesmo dia: pedir até 8h (entrega/retirada 11:30-18h). Data futura: 07:00-18:00.<br>
                        <span class="text-xs">• 11:30-14:00: mín. R$ 20 | 07:00-11:00: mín. R$ 35 | 11:00-14:00: mín. R$ 25</span>`;
        } else {
            rulesHtml = `<strong>📋 Horário de funcionamento:</strong> 07:00 às 18:00`;
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

    const minValue = window.getMinDeliveryValue(neighborhood);

    if (minValue > 0 && window.cartTotal < minValue) {
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
