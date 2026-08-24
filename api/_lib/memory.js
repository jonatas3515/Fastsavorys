// ============================================================================
// CAIXINHA: MEMÓRIA DO CLIENTE (módulo isolado)
// ============================================================================
// Sistema de memória persistente que armazena fatos sobre cada cliente
// (bairro, preferências de entrega/pagamento, produtos frequentes, etc.)
// e os injeta no prompt para personalizar o atendimento.
//
// Segurança: todas as funções falham silenciosamente — se a tabela não existir
// ou o Supabase falhar, o sistema continua funcionando normalmente sem memória.
// ============================================================================

/**
 * Carrega a memória do cliente do Supabase.
 * Retorna { memories, interaction_count, last_interaction } ou null.
 */
async function loadClientMemory(supabase, userId) {
    if (!supabase || !userId) return null;
    try {
        const { data, error } = await supabase
            .from('fast_client_memory')
            .select('memories, interaction_count, last_interaction')
            .eq('user_id', userId)
            .single();
        if (error) {
            // PGRST116 = row not found, 42P01 = table doesn't exist — ambos são OK
            if (error.code === 'PGRST116' || error.code === '42P01') return null;
            console.warn('[memory] load error:', error.message);
            return null;
        }
        return data || null;
    } catch (e) {
        console.warn('[memory] load exception:', e.message);
        return null;
    }
}

/**
 * Extrai fatos do histórico de conversa de forma PROGRAMÁTICA (sem Gemini).
 * Rápido (microsegundos) e não adiciona latência à resposta.
 */
function extractFactsFromConversation(history, existingMemories = null) {
    if (!history || history.length < 2) return null;

    const userMsgs = history.filter(m => m.role === 'user').map(m => (m.text || '').toLowerCase());
    const botMsgs = history.filter(m => m.role === 'assistant').map(m => (m.text || '').toLowerCase());
    const allUserText = userMsgs.join(' ');
    const allBotText = botMsgs.join(' ');

    // Normaliza removendo acentos para matching
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const allUserNorm = norm(allUserText);
    const allBotNorm = norm(allBotText);

    const facts = {};

    // 1. Preferência de entrega
    if (/\b(entrega|entregar|delivery|mototaxi)\b/.test(allUserNorm)) {
        facts.preferencia_entrega = 'entrega';
    } else if (/\b(retirada|retirar|buscar|pegar na loja)\b/.test(allUserNorm)) {
        facts.preferencia_entrega = 'retirada';
    }

    // 2. Preferência de pagamento
    if (/\bpix\b/.test(allUserNorm)) facts.preferencia_pagamento = 'pix';
    else if (/\b(cartao|credito|debito)\b/.test(allUserNorm)) facts.preferencia_pagamento = 'cartão';
    else if (/\bdinheiro\b/.test(allUserNorm)) facts.preferencia_pagamento = 'dinheiro';

    // 3. Bairro — detecta no texto do usuário ou na confirmação do bot
    const bairroUserPatterns = [
        /(?:moro|fico|estou|sou)\s+(?:do|no|na|em)\s+([a-zA-Z\u00c0-\u00ff\s]{3,30}?)(?:\.|,|\n|!|$)/i,
        /(?:bairro|endere[cç]o)[:\s]+([a-zA-Z\u00c0-\u00ff\s]{3,30}?)(?:\.|,|\n|!|$)/i,
    ];
    for (const pattern of bairroUserPatterns) {
        const match = allUserText.match(pattern);
        if (match && match[1].trim().length > 2) {
            facts.bairro = match[1].trim().replace(/\s+/g, ' ');
            break;
        }
    }
    // Também checa confirmação do bot (mais confiável)
    const botBairroMatch = allBotText.match(/bairro[:\s]+([a-zA-Z\u00c0-\u00ff\s]{3,30}?)(?:\.|,|\n|taxa|pedido|entrega)/i);
    if (botBairroMatch && botBairroMatch[1].trim().length > 2) {
        facts.bairro = botBairroMatch[1].trim().replace(/\s+/g, ' ');
    }

    // 4. Produtos mencionados pelo usuário
    const productsSet = new Set();

    // Salgados individuais
    const salgadoPattern = /\b(\d+)\s*(coxinha|enroladinho|risole|rissole|quibe|kibe|bolinha|empada|empadinha|pastel|cazulo|esfiha|esfirra)s?\b/gi;
    let m;
    while ((m = salgadoPattern.exec(allUserNorm)) !== null) {
        productsSet.add(`${m[1]} ${m[2]}`);
    }

    // Mini salgados
    const miniPattern = /\b(\d+)\s*mini\s*(salgad|coxinha|empada|quibe|sortid|variado)?/gi;
    while ((m = miniPattern.exec(allUserNorm)) !== null) {
        productsSet.add(`${m[1]} mini salgados`);
    }

    // Centos
    const centoPattern = /\b(\d+)\s*centos?\b/gi;
    while ((m = centoPattern.exec(allUserNorm)) !== null) {
        productsSet.add(`${m[1]} cento(s) mini`);
    }

    // Bebidas
    const bebidaPattern = /\b(coca[- ]?cola|pepsi|fanta|guarana|suco|refrigerante)\b/gi;
    while ((m = bebidaPattern.exec(allUserNorm)) !== null) {
        productsSet.add(m[1]);
    }

    // Bolos/especiais
    const especPattern = /\b(vulcao\s*mini|bolo\s*no\s*pote|kit\s*festa|mini\s*pizza|naked)\b/gi;
    while ((m = especPattern.exec(allUserNorm)) !== null) {
        productsSet.add(m[1]);
    }

    if (productsSet.size > 0) {
        const newProducts = [...productsSet];
        // Merge com produtos anteriores
        const existing = existingMemories?.produtos_frequentes || [];
        const merged = [...new Set([...newProducts, ...existing])].slice(0, 10);
        facts.produtos_frequentes = merged;
        facts.ultimo_pedido = newProducts.join(', ');
    }

    // Só retorna se encontrou algo útil
    return Object.keys(facts).length > 0 ? facts : null;
}

/**
 * Salva/merge memória do cliente no Supabase via upsert.
 * Fatos novos sobrescrevem antigos (scalares) ou são mesclados (arrays).
 */
async function saveClientMemory(supabase, userId, newFacts) {
    if (!supabase || !userId || !newFacts || Object.keys(newFacts).length === 0) return;
    try {
        // Carrega memória existente
        const existing = await loadClientMemory(supabase, userId);
        const existingMemories = existing?.memories || {};
        const interactionCount = (existing?.interaction_count || 0) + 1;

        // Merge: novos fatos sobrescrevem antigos; arrays são mesclados
        const merged = { ...existingMemories };
        for (const [key, value] of Object.entries(newFacts)) {
            if (Array.isArray(value) && Array.isArray(merged[key])) {
                merged[key] = [...new Set([...value, ...merged[key]])].slice(0, 15);
            } else {
                merged[key] = value;
            }
        }

        const { error } = await supabase.from('fast_client_memory').upsert({
            user_id: userId,
            memories: merged,
            interaction_count: interactionCount,
            last_interaction: new Date().toISOString()
        }, { onConflict: 'user_id' });

        if (error) {
            // Tabela pode não existir ainda — falha silenciosamente
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                console.warn('[memory] ⚠️ Tabela fast_client_memory não existe. Execute a migration.');
                return;
            }
            console.warn('[memory] save error:', error.message);
        } else {
            console.log(`[memory] ✅ Memória salva para user ${userId} (${interactionCount} interações): ${JSON.stringify(merged).substring(0, 200)}`);
        }
    } catch (e) {
        console.warn('[memory] save exception:', e.message);
    }
}

/**
 * Formata a memória do cliente como hint para injetar no prompt da IA.
 * Retorna string vazia se não houver memória.
 */
function formatMemoryForPrompt(memoryData) {
    if (!memoryData?.memories || Object.keys(memoryData.memories).length === 0) return '';
    const mem = memoryData.memories;
    const count = memoryData.interaction_count || 0;

    let hint = '\n[📋 MEMÓRIA DO CLIENTE (informações de interações anteriores — use para personalizar o atendimento):';
    if (count > 0) hint += `\n  Interações anteriores: ${count}`;
    if (mem.bairro) hint += `\n  Bairro habitual: ${mem.bairro}`;
    if (mem.preferencia_entrega) hint += `\n  Prefere: ${mem.preferencia_entrega}`;
    if (mem.preferencia_pagamento) hint += `\n  Pagamento preferido: ${mem.preferencia_pagamento}`;
    if (mem.produtos_frequentes?.length) {
        hint += `\n  Produtos frequentes: ${mem.produtos_frequentes.slice(0, 5).join(', ')}`;
    }
    if (mem.ultimo_pedido) hint += `\n  Último pedido: ${mem.ultimo_pedido}`;
    hint += '\n  ⚠️ Use para personalizar (ex: "vi que você costuma pedir..."), mas SEMPRE confirme com o cliente. NÃO assuma que o pedido de hoje é igual ao anterior.]';

    return hint;
}

module.exports = {
    loadClientMemory,
    extractFactsFromConversation,
    saveClientMemory,
    formatMemoryForPrompt,
};
