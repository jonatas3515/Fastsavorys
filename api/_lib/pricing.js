// ============================================================================
// CAIXINHA: CÁLCULO / PREÇOS (módulo isolado)
// ============================================================================
// Reúne a "calculadora de pedido" e a validação de valores de pagamento.
// São funções determinísticas (a IA conversa; o sistema faz as contas).
// Não dependem do resto do handler — a única dependência externa é o cliente
// Supabase, que é passado por parâmetro em fetchProductPriceMap(supabaseAdmin).
// ============================================================================

// Pacotes de mini salgados (do cardápio) — usados na estimativa programática do total.
const MINI_PACK_PRICES = { 20: 20, 30: 29, 40: 39, 50: 45, 100: 85, 150: 130 };

// Preços individuais (fallback legado de estimativa).
const PRODUCT_PRICES = {
    'coxinha': 4.50, 'enroladinho': 4.00, 'risole': 4.50,
    'vulcão mini': 15, 'vulcao mini': 15, 'bolo no pote': 10,
    'coca-cola 350': 6, 'pepsi 1l': 8, 'pepsi 2l': 12, 'pepsi lata': 5.50,
};

// Tokens canônicos de salgados individuais (grandes) reconhecidos pela calculadora.
const SALGADO_UNIT_TOKENS = ['coxinha', 'enroladinho', 'risole', 'rissole', 'quibe', 'kibe', 'bolinha', 'bolinho', 'empadinha', 'empada', 'pastel', 'cazulo', 'croquete', 'esfiha', 'esfirra'];

// Preços-padrão (fallback) caso o cardápio do Supabase não carregue.
const SALGADO_UNIT_FALLBACK = {
    coxinha: 4.50, enroladinho: 4.00, risole: 4.50, rissole: 4.50, quibe: 4.50, kibe: 4.50,
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

// Monta o mapa de preços a partir do cardápio do Supabase (fonte da verdade).
// Retorna { units: {token: preço}, drinks: [{name, price}], miniPacks: {type:qty: preço} }.
// Em caso de falha, retorna vazio e a calculadora usa os preços de fallback.
async function fetchProductPriceMap(supabaseAdmin) {
    const map = { units: {}, drinks: [], miniPacks: {} };
    if (!supabaseAdmin) return map;
    try {
        const { data } = await supabaseAdmin.from('fast_products')
            .select('name, price, category, visible');
        if (!data) return map;
        for (const p of data) {
            if (p.visible === false) continue;
            const price = Number(p.price);
            if (!price || price <= 0) continue;
            const nm = normalizeTxt(p.name);
            if (p.category === 'bebidas') {
                map.drinks.push({ name: nm, price });
            } else if (p.category === 'salgados') {
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
    } catch (e) {
        console.warn('[calc] fetchProductPriceMap erro:', e.message);
    }
    return map;
}

// Preço de um pacote de mini salgados pela quantidade. Retorna null se não souber calcular.
function miniPackPrice(qty) {
    if (MINI_PACK_PRICES[qty]) return MINI_PACK_PRICES[qty];
    if (qty > 0 && qty % 100 === 0) return (qty / 100) * MINI_PACK_PRICES[100]; // múltiplos de cento
    return null;
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
    const userMsgs = (history || []).filter(m => m.role === 'user').map(m => wordsToDigits(normalizeTxt(m.text)));
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
                const sub = miniPackPrice(wantedQty);
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
            // Bebida: casa pelo nome do cardápio (todas as palavras significativas presentes na frase)
            const drink = drinks.find(d => d.name.split(/\s+/).filter(w => w.length > 2).every(w => phrase.includes(w)));
            if (drink) {
                msgDrink[drink.name] = (msgDrink[drink.name] || 0) + qty;
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
            // Quantidade seguida de palavra não-alimentar (endereço, etc.) → ignora silenciosamente.
        }
        // Mensagem mais recente SOBRESCREVE a quantidade de cada token/bebida já visto antes.
        for (const [tok, q] of Object.entries(msgSalgado)) salgadoQty[tok] = q;
        for (const [name, q] of Object.entries(msgDrink)) drinkQty[name] = q;
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
    const est = estimateCartTotal([...(history || [])], priceMap);
    if (est.total > 0) bases.add(est.total);
    return bases;
}

// ==========================================
// VALIDAÇÃO DE SEGURANÇA DO VALOR DO PIX
// ==========================================
// O modelo às vezes alucina o valor dentro de [GERAR_PIX:VALOR]. Esta função só aceita o valor se
// ele corresponder a algum valor JÁ MENCIONADO na conversa (total) ou à metade dele (entrada 50%),
// ou ao total estimado programaticamente. Se for "inventado", retorna null para gerar PIX SEM valor.
function validatePixAmount(amt, history, effectiveMessage, priceMap = null) {
    if (!amt || amt <= 0) return amt; // PIX sem valor: nada a validar
    try {
        const bases = collectMentionedAmounts(history, effectiveMessage, priceMap);
        // Candidatos válidos: cada valor mencionado e sua metade (entrada de 50%)
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
    miniPackPrice,
    estimateCartTotal,
    parseBrlNumber,
    collectMentionedAmounts,
    validatePixAmount,
    validateCartaoAmount,
};
