// ============================================================================
// CAIXINHA: CÁLCULO / PREÇOS (módulo isolado)
// ============================================================================
// Reúne a "calculadora de pedido" e a validação de valores de pagamento.
// São funções determinísticas (a IA conversa; o sistema faz as contas).
// Não dependem do resto do handler — a única dependência externa é o cliente
// Supabase, que é passado por parâmetro em fetchProductPriceMap(supabaseAdmin).
// ============================================================================

// Pacotes de mini salgados (do cardápio) — usados na estimativa programática do total.
// FALLBACK: Agora os valores vêm preferencialmente do banco de dados (fetchProductPriceMap).
const MINI_PACK_PRICES = { 20: 20, 30: 30, 40: 39, 50: 45, 100: 85, 150: 130 };

// Preços individuais (fallback legado de estimativa). [DEPRECATED] Mantido por compatibilidade.
const PRODUCT_PRICES = {
    'coxinha': 4.25, 'enroladinho': 4.25, 'risole': 4.50,
    'vulcão mini': 15, 'vulcao mini': 15, 'bolo no pote': 10,
    'coca-cola 350': 6, 'pepsi 1l': 8, 'pepsi 2l': 12, 'pepsi lata': 5.50,
};

// Tokens canônicos de salgados individuais (grandes) reconhecidos pela calculadora.
const SALGADO_UNIT_TOKENS = ['coxinha', 'enroladinho', 'risole', 'rissole', 'quibe', 'kibe', 'bolinha', 'bolinho', 'empadinha', 'empada', 'pastel', 'cazulo', 'croquete', 'esfiha', 'esfirra'];

// Preços-padrão (fallback) caso o cardápio do Supabase não carregue.
const SALGADO_UNIT_FALLBACK = {
    coxinha: 4.25, enroladinho: 4.25, risole: 4.50, rissole: 4.50, quibe: 4.50, kibe: 4.50,
    bolinha: 4.50, bolinho: 4.50, empadinha: 4.50, empada: 4.50, pastel: 4.50, cazulo: 4.50, croquete: 4.50,
    esfiha: 4.50, esfirra: 4.50,
};

// Itens que a calculadora NÃO sabe precificar com segurança (preço fixo/variável). Se aparecerem,
// o total é marcado como incompleto para NÃO afirmar um valor possivelmente errado.
const UNPRICEABLE_FOOD = /\b(bolo|kit|combo|naked|vulc[aã]o|torta|cesta|brigadeiro|doce)\b/i;

function normalizeTxt(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Números por extenso (1 a 12) usados com frequência em pedidos ("dois risole", "quatro coxinhas").
// A calculadora só reconhecia dígitos (\d+); sem essa conversão, itens com quantidade por extenso
// eram simplesmente ignorados/mesclados com o próximo item numerado, gerando total ERRADO mas com
// complete=true (falsa confiança). Converte para dígito ANTES da varredura de chunks.
const NUM_WORDS_PT = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
function wordsToDigits(text) {
    return (text || '')
        .replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b/g,
            (w) => String(NUM_WORDS_PT[w]))
        // 'cento' sem número antes vira '1 cento' para o regex de quantidade.
        .replace(/(?<!\d\s)(cento|centos?|cem)\b/g, '1 $1');
}

// Tokens genéricos de bebida que o cliente pode usar (ex: "refrigerante", "refri").
const DRINK_GENERIC_TOKENS = /\b(refrigerante|refri|guarana|suco|agua|cerveja)\b/;

// Palavras que indicam item alimentar — se a calculadora encontrar uma dessas mas não conseguir
// precificar, deve marcar complete=false para NÃO cravar um total possivelmente errado.
const FOOD_INDICATOR_WORDS = /\b(refrigerante|refri|guarana|suco|agua|cerveja|bebida|pepsi|coca|fanta|x-coxinha|x coxinha|xcoxinha)\b/;

// Converte variações de bebidas para tokens sem dígitos para não quebrar o parser de chunks (\d+)
function normalizeBeverages(text) {
    return (text || '')
        // 1 Litro
        .replace(/\b(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\s+(?:de\s+)?(?:1\s*litros?|1\s*l)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_umlitro`)
        .replace(/\b(?:1\s*litros?|1\s*l)\s+(?:de\s+)?(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_umlitro`)
        // 2 Litros
        .replace(/\b(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\s+(?:de\s+)?(?:2\s*litros?|2\s*l)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_doislitros`)
        .replace(/\b(?:2\s*litros?|2\s*l)\s+(?:de\s+)?(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_doislitros`)
        // Lata / 350ml
        .replace(/\b(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\s+(?:de\s+)?(?:lata|350\s*ml|350)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_lata`)
        .replace(/\b(?:lata|350\s*ml|350)\s+(?:de\s+)?(refrigerante|refri|pepsi|coca(?:\s*cola)?|guarana|fanta|suco)\b/gi,
            (_, drink) => `${drink.replace(/\s+/g, '')}_lata`);
}

// Calcula o preço efetivo considerando promoção ativa no produto.
function getEffectivePrice(product) {
    const base = Number(product.price);
    if (product.promo_active && product.promo_type && Number(product.promo_value) > 0) {
        if (product.promo_type === 'percentage') {
            return Math.max(0, base * (1 - Number(product.promo_value) / 100));
        } else if (product.promo_type === 'fixed') {
            return Math.max(0, base - Number(product.promo_value));
        }
    }
    return base;
}

// --- Cache em memória para mapas de preços e taxas (TTL 60 segundos) ---
let _productPriceMapCache = null;
let _productPriceMapCacheExpiresAt = 0;
let _deliveryFeeMapCache = null;
let _deliveryFeeMapCacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

// Monta o mapa de preços a partir do cardápio do Supabase (fonte da verdade).
// Retorna { units: {token: preço}, drinks: [{name, price}], miniPacks: {type:qty: preço} }.
// Em caso de falha, retorna vazio e a calculadora usa os preços de fallback.
async function fetchProductPriceMap(supabaseAdmin, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _productPriceMapCache && now < _productPriceMapCacheExpiresAt) {
        return _productPriceMapCache;
    }
    const map = { units: {}, drinks: [], miniPacks: {} };
    if (!supabaseAdmin) return map;
    try {
        const { data } = await supabaseAdmin.from('fast_products')
            .select('name, price, category, visible, promo_active, promo_type, promo_value');
        if (!data) return map;
        for (const p of data) {
            if (p.visible === false) continue;
            const price = getEffectivePrice(p);
            if (!price || price <= 0) continue;
            const nm = normalizeTxt(p.name);
            if (p.category === 'bebidas') {
                map.drinks.push({ name: nm, price });
            } else if (p.category === 'salgados') {
                // ⛔ X-Coxinha é um produto DIFERENTE de Coxinha (R$ 17 vs R$ 4,50).
                // Não deve sobrescrever o token 'coxinha'. Tratamos como item especial.
                if (/x[- ]?coxinha/i.test(nm)) continue; // pula X-Coxinha — não é salgado unitário simples
                for (const tok of SALGADO_UNIT_TOKENS) {
                    if (nm.includes(tok)) { map.units[tok] = price; break; }
                }
            }

            // Pacotes de mini salgados/empadinhas/coxinhas (ex: Mini Empadinhas 100, Mini Coxinha 12)
            if (p.category === 'mini' || nm.includes('mini')) {
                const qtyMatch = nm.match(/(\d+)\s*(?:un|uni|unid|unidades)?/);
                const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
                if (qty > 0) {
                    let type = 'salgado';
                    for (const tok of SALGADO_UNIT_TOKENS) {
                        if (nm.includes(tok)) { type = tok; break; }
                    }
                    const key = `${type}:${qty}`;
                    map.miniPacks[key] = price;
                }
            }
        }
        _productPriceMapCache = map;
        _productPriceMapCacheExpiresAt = now + CACHE_TTL_MS;
    } catch (e) {
        console.warn('[calc] fetchProductPriceMap erro:', e.message);
    }
    return map;
}

// Preço de um pacote de mini salgados pela quantidade. Retorna null se não souber calcular.
function miniPackPrice(qty, dbMiniPacks = null) {
    if (dbMiniPacks && dbMiniPacks[`salgado:${qty}`] !== undefined) return dbMiniPacks[`salgado:${qty}`];
    if (MINI_PACK_PRICES[qty]) return MINI_PACK_PRICES[qty];
    if (qty > 0 && qty % 100 === 0) return (qty / 100) * MINI_PACK_PRICES[100]; // múltiplos de cento
    return null;
}

// Busca as taxas de entrega da tabela fast_delivery_fees no Supabase
async function fetchDeliveryFeeMap(supabaseAdmin, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _deliveryFeeMapCache && now < _deliveryFeeMapCacheExpiresAt) {
        return _deliveryFeeMapCache;
    }
    const feeMap = {};
    if (!supabaseAdmin) return feeMap;
    try {
        const { data, error } = await supabaseAdmin.from('fast_delivery_fees')
            .select('neighborhood, fee, min_order_value');
        if (error) {
            console.warn('[calc] fetchDeliveryFeeMap erro no Supabase:', error.message);
            return feeMap;
        }
        if (!data) return feeMap;
        
        for (const row of data) {
            const name = (row.neighborhood || '').toLowerCase().trim();
            if (!name) continue;
            const entry = {
                fee: Number(row.fee || 0),
                min: Number(row.min_order_value || 0)
            };
            feeMap[name] = entry;
            // Adiciona também versão normalizada (sem acentos)
            const norm = normalizeTxt(name);
            if (norm && norm !== name) {
                feeMap[norm] = entry;
            }
        }
        _deliveryFeeMapCache = feeMap;
        _deliveryFeeMapCacheExpiresAt = now + CACHE_TTL_MS;
    } catch (e) {
        console.warn('[calc] fetchDeliveryFeeMap exceção:', e.message);
    }
    return feeMap;
}

// ==========================================
// CALCULADORA DE PEDIDO (DETERMINÍSTICA)
// ==========================================
// A IA é boa para CONVERSAR, mas erra CONTAS. Esta função soma o pedido de forma confiável,
// usando os preços do cardápio (Supabase) quando disponíveis. Retorna:
//   { total, description, complete }
// - complete=true  => conseguiu reconhecer e precificar tudo; o total é confiável.
// - complete=false => há item que ela não sabe precificar (bolo/kit/combo) ou houve remoção/alteração;
//                     nesse caso quem chama NÃO deve afirmar o total como verificado.
function estimateCartTotal(history, priceMap = null) {
    const units = Object.assign({}, SALGADO_UNIT_FALLBACK, (priceMap && priceMap.units) || {});
    const drinks = (priceMap && priceMap.drinks) || [];
    const miniPacks = (priceMap && priceMap.miniPacks) || {};

    // Detecta o tipo de mini salgado mencionado (empada, coxinha, etc.) ou null se generico.
    function extractMiniType(phrase) {
        for (const tok of SALGADO_UNIT_TOKENS) {
            if (phrase.includes(tok)) return tok;
        }
        return null;
    }

    // Quantidades vêm SÓ das mensagens do cliente (o bot repete itens e causaria contagem dupla).
    const userMsgs = (history || []).filter(m => m.role === 'user').map(m => normalizeBeverages(wordsToDigits(normalizeTxt(m.text))));
    const fullUserText = userMsgs.join('\n');

    let complete = true;

    // Remoção/alteração de itens torna o cálculo não confiável.
    if (/\b(tira|tirar|remove|remover|retira|cancela|cancelar|troca|trocar|menos)\b/.test(fullUserText)) {
        complete = false;
    }
    // Itens de preço fixo/variável que a calculadora não soma (bolos, kits, combos).
    if (UNPRICEABLE_FOOD.test(fullUserText)) {
        complete = false;
    }

    // Salgados unitários e bebidas usam "a MENSAGEM mais recente vence" por item — é comum o cliente
    // RESTATAR o pedido inteiro (ex: "vamos atualizar seu pedido...") repetindo itens já mencionados
    // antes, o que causaria CONTAGEM DUPLA se apenas somássemos tudo. Mini/cento/genérico continuam
    // aditivos (raramente são restatados por completo).
    const salgadoQty = {};   // token -> qty (última mensagem que citou o token vence)
    const drinkQty = {};     // nome do cardápio -> qty (última mensagem vence)
    let miniTotal = 0;
    let centoTotal = 0;
    let genericTotal = 0;
    const miniItems = [];
    const centoItems = [];
    const genericItems = [];

    const chunkRe = /(\d+)\s*([^\d,;\n]*)/g;

    for (const msgText of userMsgs) {
        const msgSalgado = {}; // acumula dentro da MESMA mensagem (ex: "2 coxinha e mais 1 coxinha")
        const msgDrink = {};
        let m;
        chunkRe.lastIndex = 0;
        while ((m = chunkRe.exec(msgText)) !== null) {
            const qty = parseInt(m[1], 10);
            const phrase = (m[2] || '').trim();
            if (!qty || qty <= 0 || !phrase) continue;

            // "cento(s)" ou quantidades que claramente se referem a pacotes de mini (20/30/40/50/100/150)
            // com tipo especificado (empadinhas, coxinhas) → busca pacote específico do banco.
            const isCento = /\bcento?s?\b/.test(phrase);
            const isMini = /\b(mini|salgadinho)/.test(phrase);
            if (isCento || isMini || MINI_PACK_PRICES[qty]) {
                const wantedQty = isCento ? Math.max(qty * 100, 100) : qty;
                const type = extractMiniType(phrase);

                // Tenta pacote específico primeiro (ex: empada:100, coxinha:12)
                if (type && miniPacks[`${type}:${wantedQty}`]) {
                    const sub = miniPacks[`${type}:${wantedQty}`];
                    miniTotal += sub;
                    miniItems.push(`${wantedQty} mini ${type}(s) = R$ ${sub.toFixed(2)}`);
                    continue;
                }

                // Tenta pacote generico de mini salgados
                const sub = miniPackPrice(wantedQty, miniPacks);
                if (sub != null && (isCento || isMini)) {
                    miniTotal += sub;
                    const label = isCento ? `${qty} cento(s) mini salgados` : `${wantedQty} mini salgados`;
                    miniItems.push(`${label} = R$ ${sub.toFixed(2)}`);
                    continue;
                }

                // Quantidade compatível com pacote mini, mas sem preço específico nem genérico conhecido
                if (isCento || isMini || (MINI_PACK_PRICES[qty] && !/\b(grande|unidade|tradicional|normal)\b/.test(phrase))) {
                    complete = false;
                    continue;
                }
            }
            // Salgado individual (grande) por token conhecido
            let matchedUnit = null;
            for (const tok of SALGADO_UNIT_TOKENS) {
                if (phrase.includes(tok)) { matchedUnit = tok; break; }
            }
            if (matchedUnit) {
                // Ambiguidade mini-vs-grande: se a quantidade é exatamente um tamanho de pacote de mini
                // (20/30/40/50/100/150) e o cliente NÃO disse "grande/unidade", pode ser mini. Marca como
                // incompleto para NÃO cravar um total que pode estar errado.
                const isPackSize = !!MINI_PACK_PRICES[qty];
                const explicitGrande = /\b(grande|unidade|tradicional|normal)\b/.test(phrase);
                if (isPackSize && !explicitGrande) complete = false;
                msgSalgado[matchedUnit] = (msgSalgado[matchedUnit] || 0) + qty;
                continue;
            }
            // Bebida: tenta casar por tokens normalizados de marca e tamanho (1L, 2L, lata/350ml)
            let matchedDrink = null;
            const p = phrase.toLowerCase();

            if (p.includes('_umlitro') || p.includes('1l') || p.includes('1 litro')) {
                if (p.includes('coca')) matchedDrink = drinks.find(d => d.name.includes('coca') && (d.name.includes('1l') || d.name.includes('1 litro')));
                else if (p.includes('pepsi')) matchedDrink = drinks.find(d => d.name.includes('pepsi') && (d.name.includes('1l') || d.name.includes('1 litro')));
                else if (p.includes('guarana')) matchedDrink = drinks.find(d => d.name.includes('guarana') && (d.name.includes('1l') || d.name.includes('1 litro')));
                else matchedDrink = drinks.find(d => d.name.includes('1l') || d.name.includes('1 litro')); // genérico 1L
            } else if (p.includes('_doislitros') || p.includes('2l') || p.includes('2 litros')) {
                if (p.includes('coca')) matchedDrink = drinks.find(d => d.name.includes('coca') && (d.name.includes('2l') || d.name.includes('2 litros')));
                else if (p.includes('pepsi')) matchedDrink = drinks.find(d => d.name.includes('pepsi') && (d.name.includes('2l') || d.name.includes('2 litros')));
                else if (p.includes('guarana')) matchedDrink = drinks.find(d => d.name.includes('guarana') && (d.name.includes('2l') || d.name.includes('2 litros')));
                else matchedDrink = drinks.find(d => d.name.includes('2l') || d.name.includes('2 litros')); // genérico 2L
            } else if (p.includes('_lata') || p.includes('lata') || p.includes('350ml') || p.includes('350')) {
                if (p.includes('coca')) matchedDrink = drinks.find(d => d.name.includes('coca') && (d.name.includes('lata') || d.name.includes('350')));
                else if (p.includes('pepsi')) matchedDrink = drinks.find(d => d.name.includes('pepsi') && (d.name.includes('lata') || d.name.includes('350')));
                else if (p.includes('fanta')) matchedDrink = drinks.find(d => d.name.includes('fanta') && (d.name.includes('lata') || d.name.includes('350')));
                else if (p.includes('guarana')) matchedDrink = drinks.find(d => d.name.includes('guarana') && (d.name.includes('lata') || d.name.includes('350')));
                else matchedDrink = drinks.find(d => d.name.includes('lata') || d.name.includes('350')); // genérico lata
            } else {
                // Match padrão por palavras completas do cardápio
                matchedDrink = drinks.find(d => d.name.split(/\s+/).filter(w => w.length > 2).every(w => phrase.includes(w)));
            }

            if (matchedDrink) {
                msgDrink[matchedDrink.name] = (msgDrink[matchedDrink.name] || 0) + qty;
                continue;
            }

            // Bebida genérica SEM volume ou com volume não encontrado no cardápio
            if (DRINK_GENERIC_TOKENS.test(phrase) || /_umlitro|_doislitros|_lata/.test(phrase)) {
                complete = false;
                continue;
            }
            // Salgado genérico ("10 salgados grandes") — usa preço médio de fallback (aproximado)
            if (/\bsalgad/.test(phrase)) {
                const avg = units.coxinha || 4.50;
                const sub = qty * avg;
                genericTotal += sub;
                genericItems.push(`${qty}x salgado (aprox.) = R$ ${sub.toFixed(2)}`);
                continue;
            }
            // SAFETY NET: se a phrase contém palavra que indica item alimentar/bebida conhecida
            // mas não casou com nada acima, a calculadora não pode confiar no total.
            if (FOOD_INDICATOR_WORDS.test(phrase)) {
                complete = false;
                continue;
            }
            // Quantidade seguida de palavra não-alimentar (endereço, etc.) → ignora silenciosamente.
        }
        // Mensagem mais recente SOBRESCREVE a quantidade de cada token/bebida já visto antes.
        for (const [tok, q] of Object.entries(msgSalgado)) salgadoQty[tok] = q;
        for (const [name, q] of Object.entries(msgDrink)) drinkQty[name] = q;
    }

    // ⛔ CORREÇÃO DE DOUBLE-COUNTING: Se o cliente disse "2 salgados grandes" e depois especificou
    // "1 risole 1 coxinha", os itens específicos SÃO os 2 salgados — não devemos somar ambos.
    // Se temos itens específicos de salgado E genéricos, os específicos prevalecem (o genérico era
    // apenas uma forma do cliente pedir antes de escolher os sabores).
    const hasSpecificSalgados = Object.keys(salgadoQty).length > 0;
    if (hasSpecificSalgados && genericTotal > 0) {
        console.log(`[calc] ⚠️ Zerando genericTotal (R$ ${genericTotal.toFixed(2)}) porque há itens específicos de salgado`);
        genericTotal = 0;
        genericItems.length = 0;
    }

    let total = miniTotal + centoTotal + genericTotal;
    const items = [...centoItems, ...miniItems];
    for (const [tok, q] of Object.entries(salgadoQty)) {
        const sub = q * units[tok];
        total += sub;
        items.push(`${q}x ${tok} = R$ ${sub.toFixed(2)}`);
    }
    for (const [name, q] of Object.entries(drinkQty)) {
        const drink = drinks.find(d => d.name === name);
        const price = drink ? drink.price : 0;
        const sub = q * price;
        total += sub;
        items.push(`${q}x ${name} = R$ ${sub.toFixed(2)}`);
    }
    items.push(...genericItems);

    return { total, description: items.join(' + ') || '', complete };
}

function parseBrlNumber(raw) {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (s.includes(',')) {
        // formato brasileiro: 1.234,56 -> remove pontos de milhar, troca vírgula por ponto
        s = s.replace(/\./g, '').replace(',', '.');
    }
    return parseFloat(s);
}

// Coleta os valores monetários BASE (R$ X) mencionados na conversa + total estimado.
function collectMentionedAmounts(history, effectiveMessage, priceMap = null) {
    const bases = new Set();
    const joined = [...(history || []).map(m => m.text), effectiveMessage || ''].join(' ');
    const re = /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)/gi;
    let m;
    while ((m = re.exec(joined)) !== null) {
        const v = parseBrlNumber(m[1]);
        if (!isNaN(v) && v > 0) bases.add(v);
    }

    // Captura números explícitos expressos pelo cliente em contexto de pagamento (ex: "vou enviar 50", "passar 60", "pago 50", "50 reais", "manda de 50")
    const payPattern = /(?:enviar|pagar|passar|transferir|dar|mandar|manda|pix|entrada|adiantar|ser|vou)\s*(?:de)?\s*(?:R\$\s*)?([0-9]+(?:[.,][0-9]{2})?)|([0-9]+(?:[.,][0-9]{2})?)\s*(?:reais|conto)/gi;
    while ((m = payPattern.exec(joined)) !== null) {
        const numStr = m[1] || m[2];
        if (numStr) {
            const v = parseBrlNumber(numStr);
            if (!isNaN(v) && v > 0) bases.add(v);
        }
    }

    const est = estimateCartTotal([...(history || [])], priceMap);
    if (est.total > 0) bases.add(est.total);
    return bases;
}

// ==========================================
// VALIDAÇÃO DE SEGURANÇA DO VALOR DO PIX
// ==========================================
// O modelo às vezes alucina o valor dentro de [GERAR_PIX:VALOR]. Esta função só aceita o valor se
// ele corresponder a algum valor JÁ MENCIONADO na conversa (total), à metade dele (entrada 50%),
// a um valor de entrada personalizado proposto pelo cliente, ou ao total estimado programaticamente.
function validatePixAmount(amt, history, effectiveMessage, priceMap = null) {
    if (!amt || amt <= 0) return amt; // PIX sem valor: nada a validar
    try {
        const bases = collectMentionedAmounts(history, effectiveMessage, priceMap);
        // Candidatos válidos: cada valor mencionado, sua metade (entrada de 50%) e valores personalizados
        const candidates = new Set();
        for (const b of bases) {
            candidates.add(b);
            candidates.add(b / 2);
        }

        // Sem nenhum sinal de valor na conversa: não temos como validar, confia no modelo
        if (candidates.size === 0) return amt;

        const TOL = 1.0; // tolerância de R$ 1,00
        const ok = [...candidates].some(c => Math.abs(amt - c) <= TOL);
        if (ok) return amt;

        console.warn(`[pix] ⚠️ Valor do PIX (R$ ${amt.toFixed(2)}) NÃO corresponde a nenhum valor mencionado na conversa (candidatos: ${[...candidates].map(c => c.toFixed(2)).join(', ')}). Gerando PIX SEM valor por segurança.`);
        return null;
    } catch (e) {
        console.warn('[pix] validatePixAmount erro:', e.message);
        return amt; // em caso de erro, não quebra o fluxo
    }
}

// Valida o valor do link de cartão. O valor do cartão inclui a taxa (acréscimo sobre os
// produtos), então aceita o valor base mencionado OU esse valor acrescido de até 15%
// (cobre a taxa de cartão configurável). Retorna o valor se válido, ou -1 se for um valor
// claramente inventado pelo modelo (nesse caso o link NÃO é gerado, por segurança).
function validateCartaoAmount(amt, history, effectiveMessage, priceMap = null) {
    if (!amt || amt <= 0) return -1;
    try {
        const bases = collectMentionedAmounts(history, effectiveMessage, priceMap);
        // Sem nenhum sinal de valor na conversa: não temos como validar, confia no modelo
        if (bases.size === 0) return amt;

        const TOL = 1.0;       // tolerância de R$ 1,00
        const MAX_FEE = 0.15;  // até 15% de acréscimo (taxa de cartão + margem de segurança)
        const ok = [...bases].some(c =>
            Math.abs(amt - c) <= TOL ||                          // valor base (sem taxa)
            (amt >= c - TOL && amt <= c * (1 + MAX_FEE) + TOL)   // valor + taxa de cartão
        );
        if (ok) return amt;

        console.warn(`[cartao] ⚠️ Valor do link de cartão (R$ ${amt.toFixed(2)}) NÃO corresponde a nenhum valor mencionado na conversa (bases: ${[...bases].map(c => c.toFixed(2)).join(', ')}). Link NÃO será gerado por segurança.`);
        return -1;
    } catch (e) {
        console.warn('[cartao] validateCartaoAmount erro:', e.message);
        return amt; // em caso de erro, não quebra o fluxo
    }
}

module.exports = {
    MINI_PACK_PRICES,
    PRODUCT_PRICES,
    SALGADO_UNIT_TOKENS,
    SALGADO_UNIT_FALLBACK,
    UNPRICEABLE_FOOD,
    normalizeTxt,
    fetchProductPriceMap,
    fetchDeliveryFeeMap,
    miniPackPrice,
    estimateCartTotal,
    parseBrlNumber,
    collectMentionedAmounts,
    validatePixAmount,
    validateCartaoAmount,
};
