/**
 * Fast Savory's - Utils Module
 * Helper functions
 */

// Safe Date Parsing
window.safeDate = function (dateInput) {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    // Handle "DD/MM/YYYY" format
    if (typeof dateInput === 'string' && dateInput.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateInput.split('/');
        return new Date(`${year}-${month}-${day}T00:00:00`);
    }
    return new Date(dateInput);
};

// Format Phone Mask: (XX)XXXXX-XXXX
window.formatPhoneMask = function (value) {
    let digits = (value || '').replace(/\D/g, '');
    if (digits.length > 11) digits = digits.slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
};

// Normalize Phone Digits (remove non-digits, remove 55 prefix if present)
window.normalizePhoneDigits = function (phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
    return digits;
};

// Get Brasilia Date (UTC-3)
window.getBrasiliaDate = function () {
    const now = new Date();
    // Brasília is UTC-3 (no daylight saving since 2019)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brasiliaOffset = -3 * 60 * 60000; // UTC-3 in milliseconds
    const brasiliaDate = new Date(utc + brasiliaOffset);
    return brasiliaDate;
};

// Format Date YYYY-MM-DD
window.formatYYYYMMDD = function (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Normalize string (remove accents, lowercase)
window.norm = function (s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
};

/**
 * Verifica se o carrinho contém bolos (que exigem 1 dia de antecedência)
 */
window.cartContainsBolo = function (cartItems = cart) {
    return (cartItems || []).some(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return false;
        const name = (product.name || '').toLowerCase();
        const category = (product.category || '').toLowerCase();
        return category === 'bolos' || name.includes('bolo p') || name.includes('bolo g') || name.match(/bolo\s*[pg]/i);
    });
};

/**
 * Verifica se produto está bloqueado para pedidos no mesmo dia
 */
window.hasBlockedProductsForSameDay = function () {
    return cart.some(item => {
        const product = products.find(p => p.id === item.id);

        // Preferir flag do banco de dados
        if (product && product.requires_preorder === true) {
            return true;
        }

        // Fallback para lógica legada
        if (product && product.requires_preorder === false) {
            return false;
        }

        const name = (item.name || '').toLowerCase();
        const category = (product?.category || '').toLowerCase();

        // Bolos bloqueados
        if (category === 'bolos' || name.includes('bolo')) return true;

        // Kits Festa bloqueados
        if (category === 'kits' || name.includes('kit festa') || name.includes('kit ')) return true;

        // Vulcão comum bloqueado (Mini Vulcão permitido)
        if (name.includes('vulcão') && !name.includes('mini')) return true;

        return false;
    });
};

/**
 * Verifica se pedido pode ser feito para hoje (mesmo dia)
 */
window.canOrderTodayWithoutBolo = function (isRetirada, cartTotal, timeSlot) {
    if (storeConfig.same_day_orders_enabled === false) {
        return { allowed: false, reason: 'Pedidos para o mesmo dia não estão disponíveis no momento.' };
    }

    if (hasBlockedProductsForSameDay()) {
        return { allowed: false, reason: 'Pedidos com bolos, kits festa ou vulcão exigem 1 dia de antecedência. Apenas salgados, mini salgados, refrigerantes e Mini Vulcão podem ser pedidos para hoje.' };
    }

    if (!isRetirada) {
        return { allowed: false, reason: 'Pedidos para o mesmo dia são apenas para retirada na loja.' };
    }

    if (timeSlot) {
        const normalizedTime = (timeSlot || '').replace(/:/g, '');
        const timeAsNumber = parseInt(normalizedTime, 10) || 0;

        const startTime = (storeConfig.same_day_pickup_start || '12:00').replace(/:/g, '');
        const endTime = (storeConfig.same_day_pickup_end || '18:00').replace(/:/g, '');
        const startNum = parseInt(startTime, 10) || 1200;
        const endNum = parseInt(endTime, 10) || 1800;

        if (timeAsNumber < startNum || timeAsNumber > endNum) {
            const startFormatted = storeConfig.same_day_pickup_start || '12:00';
            const endFormatted = storeConfig.same_day_pickup_end || '18:00';
            return { allowed: false, reason: `Para retirada no mesmo dia, o horário deve ser entre ${startFormatted.replace(':', 'h')} e ${endFormatted.replace(':', 'h')}.` };
        }

        const minValueOffHours = storeConfig.min_order_pickup_offhours || 15;
        const minValueNormal = storeConfig.min_order_pickup || 8;

        if (timeAsNumber >= startNum && timeAsNumber < 1400) {
            if (cartTotal < minValueOffHours) {
                return { allowed: false, reason: `Pedido mínimo de R$ ${minValueOffHours.toFixed(2).replace('.', ',')} para retirada antes das 14h.` };
            }
        } else if (timeAsNumber >= 1400 && timeAsNumber <= endNum) {
            if (cartTotal < minValueNormal) {
                return { allowed: false, reason: `Pedido mínimo de R$ ${minValueNormal.toFixed(2).replace('.', ',')} para retirada no horário normal.` };
            }
        }
    }

    return { allowed: true, reason: '' };
};

/**
 * Calcula data mínima para encomenda
 */
window.getMinEncomendaDateYYYYMMDD = function (forceBoloRules = false) {
    const brasilia = getBrasiliaDate();
    const mins = brasilia.getHours() * 60 + brasilia.getMinutes();
    const cutoff = 7 * 60; // 07:00
    const d = new Date(brasilia.getTime());

    if (!forceBoloRules && !cartContainsBolo()) {
        d.setHours(0, 0, 0, 0);
        return formatYYYYMMDD(d);
    }

    if (mins > cutoff) d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return formatYYYYMMDD(d);
};

// Verifica se a loja está aberta
window.isFastOpen = function () {
    if (storeClosedToday) return false;

    const brasilia = getBrasiliaDate();
    const d = brasilia.getDay();
    const h = brasilia.getHours();
    const m = brasilia.getMinutes();
    const timeNow = h + m / 60;

    const todayHours = businessHours.find(bh => bh.day_of_week === d);
    if (todayHours) {
        if (!todayHours.is_open) return false;
        const [openH, openM] = (todayHours.open_time || '14:00').split(':').map(Number);
        const [closeH, closeM] = (todayHours.close_time || '18:00').split(':').map(Number);
        const openTime = openH + openM / 60;
        const closeTime = closeH + closeM / 60;
        return timeNow >= openTime && timeNow < closeTime;
    }

    if (d === 0) return false;
    if (d === 5) return timeNow >= 14 && timeNow < 19.5;
    return timeNow >= 14 && timeNow < 18;
};

// Verifica regras de horário para encomenda
window.isOrderAllowedAtTime = function (timeSlot, cartTotal, cartItems) {
    if (storeConfig.morning_rule_enabled === false) {
        return { allowed: true, reason: '' };
    }

    const normalizedTime = (timeSlot || '').replace(/:/g, '');
    const timeAsNumber = parseInt(normalizedTime, 10) || 0;

    if (timeAsNumber >= 1400) {
        const minNormal = storeConfig.min_order_pickup || 8;
        if (cartTotal < minNormal) {
            return { allowed: false, reason: `Pedido mínimo de R$ ${minNormal.toFixed(2).replace('.', ',')} para este horário.` };
        }
        return { allowed: true, reason: '' };
    }

    if (timeAsNumber >= 1200 && timeAsNumber < 1400) {
        const minOffHours = storeConfig.min_order_pickup_offhours || 15;
        if (cartTotal < minOffHours) {
            return { allowed: false, reason: `Pedido mínimo de R$ ${minOffHours.toFixed(2).replace('.', ',')} para retirada entre 12h e 14h.` };
        }
        return { allowed: true, reason: '' };
    }

    if (timeAsNumber >= 700 && timeAsNumber < 1200) {
        const hasCake = cartItems.some(item => {
            const product = products.find(p => p.id === item.id);
            const productName = (item.name || '').toLowerCase();
            const productCategory = (product?.category || '').toLowerCase();
            return productCategory === 'bolos' || productName.includes('bolo');
        });

        if (hasCake) return { allowed: true, reason: '' };

        const minMorning = storeConfig.morning_rule_min_value || 25;
        if (cartTotal < minMorning) {
            return { allowed: false, reason: `Entre 7h e 12h, pedido mínimo de R$ ${minMorning.toFixed(2).replace('.', ',')} (ou inclua um bolo).` };
        }
        return { allowed: true, reason: '' };
    }

    if (timeAsNumber < 700) {
        return { allowed: false, reason: 'Não aceitamos pedidos para retirada antes das 7h.' };
    }

    return { allowed: true, reason: '' };
};

// Formata código do pedido
window.formatOrderCode = function (orderIdOrSeq) {
    if (!orderIdOrSeq) return 'FAST-0000';
    if (String(orderIdOrSeq).startsWith('FAST-')) return orderIdOrSeq;

    const num = parseInt(orderIdOrSeq, 10);
    if (!isNaN(num) && num < 100000) {
        return `FAST-${String(num).padStart(4, '0')}`;
    }

    const numericId = String(orderIdOrSeq).slice(-4);
    const paddedId = numericId.padStart(4, '0');
    return `FAST-${paddedId}`;
};

// Verifica se entrega é permitida para o bairro
window.isFastDeliveryAllowed = function (nei) {
    const n = norm(nei);
    if (!n) return false;

    let fees = {};
    try {
        fees = JSON.parse(localStorage.getItem('fastDeliveryFees') || '{}');
    } catch (e) {
        fees = {};
    }

    const registeredNeighborhoods = Object.keys(fees).map(k => norm(k));
    return registeredNeighborhoods.includes(n);
};
