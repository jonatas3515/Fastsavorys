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
const SALGADO_UNIT_TOKENS = ['coxinha', 'enroladinho', 'risole', 'rissole', 'quibe', 'kibe', 'bolinha', 'bolinho', 'empada', 'pastel', 'cazulo', 'croquete', 'esfiha', 'esfirra'];

// Preços-padrão (fallback) caso o cardápio do Supabase não carregue.
const SALGADO_UNIT_FALLBACK = {
    coxinha: 4.50, enroladinho: 4.00, risole: 4.50, rissole: 4.50, quibe: 4.50, kibe: 4.50,
    bolinha: 4.50, bolinho: 4.50, empada: 4.50, pastel: 4.50, cazulo: 4.50, croquete: 4.50,
    esfiha: 4.50, esfirra: 4.50,
};

// Itens que a calculadora NÃO sabe precificar com segurança (preço fixo/variável). Se aparecerem,
// o total é marcado como incompleto para NÃO afirmar um valor possivelmente errado.
const UNPRICEABLE_FOOD = /\b(bolo|kit|combo|naked|vulc[aã]o|torta|cesta|brigadeiro|doce)\b/i;

function normalizeTxt(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Monta o mapa de preços a partir do cardápio do Supabase (fonte da verdade).
// Retorna { units: {token: preço}, drinks: [{name, price}] }. Em caso de falha, retorna vazio
// e a calculadora usa os preços de fallback.
async function fetchProductPriceMap(supabaseAdmin) {
    const map = { units: {}, drinks: [] };
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

    // Quantidades vêm SÓ das mensagens do cliente (o bot repete itens e causaria contagem dupla).
    const userText = (history || []).filter(m => m.role === 'user').map(m => normalizeTxt(m.text)).join('\n');

    let total = 0;
    const items = [];
    let complete = true;

    // Remoção/alteração de itens torna o cálculo não confiável.
    if (/\b(tira|tirar|remove|remover|retira|cancela|cancelar|troca|trocar|menos)\b/.test(userText)) {
        complete = false;
    }
    // Itens de preço fixo/variável que a calculadora não soma (bolos, kits, combos).
    if (UNPRICEABLE_FOOD.test(userText)) {
        complete = false;
    }

    // Varre "quantidade + descrição" e classifica cada pedaço em UMA categoria (evita contagem dupla).
    const chunkRe = /(\d+)\s*([^\d,;\n]*)/g;
    let m;
    while ((m = chunkRe.exec(userText)) !== null) {
        const qty = parseInt(m[1], 10);
        const phrase = (m[2] || '').trim();
        if (!qty || qty <= 0 || !phrase) continue;

        // "cento(s)" de mini salgados (1 cento = 100 un)
        if (/\bcento?s?\b/.test(phrase)) {
            const sub = qty * MINI_PACK_PRICES[100];
            total += sub;
            items.push(`${qty} cento(s) mini salgados = R$ ${sub.toFixed(2)}`);
            continue;
        }
        // Pacote de mini salgados ("20 mini", "100 salgadinhos")
        if (/\b(mini|salgadinho)/.test(phrase)) {
            const sub = miniPackPrice(qty);
            if (sub == null) { complete = false; continue; }
            total += sub;
            items.push(`${qty} mini salgados = R$ ${sub.toFixed(2)}`);
            continue;
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
            const sub = qty * units[matchedUnit];
            total += sub;
            items.push(`${qty}x ${matchedUnit} = R$ ${sub.toFixed(2)}`);
            continue;
        }
        // Bebida: casa pelo nome do cardápio (todas as palavras significativas presentes na frase)
        const drink = drinks.find(d => d.name.split(/\s+/).filter(w => w.length > 2).every(w => phrase.includes(w)));
        if (drink) {
            const sub = qty * drink.price;
            total += sub;
            items.push(`${qty}x ${drink.name} = R$ ${sub.toFixed(2)}`);
            continue;
        }
        // Salgado genérico ("10 salgados grandes") — usa preço médio de fallback (aproximado)
        if (/\bsalgad/.test(phrase)) {
            const avg = units.coxinha || 4.50;
            const sub = qty * avg;
            total += sub;
            items.push(`${qty}x salgado (aprox.) = R$ ${sub.toFixed(2)}`);
            continue;
        }
        // Quantidade seguida de palavra não-alimentar (endereço, etc.) → ignora silenciosamente.
    }

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
