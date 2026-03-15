/**
 * ManyChat Unified API Endpoint
 * POST /api/manychat-api
 * 
 * Helper for handling various ManyChat integrations in a single function to save Vercel slots.
 * 
 * Query Params:
 * - type=notify-new-order  (Replaces notify-manychat.js)
 * - type=notify-client     (Replaces manychat-notify-client.js)
 * - type=order-action      (Replaces manychat-order-action.js - Default if no type)
 */

const { createClient } = require('@supabase/supabase-js');
const { notifyNewOrder, isConfigured } = require('./_lib/manychat');

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

let supabaseAdmin = null;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false } }
        );
    }
} catch (err) {
    console.error('[manychat-api] Supabase init error:', err.message);
}

// ==========================================
// HELPERS
// ==========================================

function extractOrderCode(message) {
    if (!message) return null;
    const match = message.match(/FAST-(\d{4})/i);
    return match ? `FAST-${match[1]}` : null;
}

function generateWhatsAppLink(phone, message) {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 11) {
        formattedPhone = '55' + formattedPhone;
    }
    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message || '')}`;
}

async function manychatRequest(endpoint, body) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey) return { success: false, error: 'API key not configured' };

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) return { success: false, error: data?.message || `HTTP ${response.status}` };
        return { success: true, data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function updateCustomField(userId, fieldId, value) {
    if (!userId || !fieldId) return { success: false, error: 'Missing userId or fieldId' };
    return await manychatRequest('/subscriber/setCustomFields', {
        subscriber_id: userId,
        fields: [{ field_id: parseInt(fieldId, 10), field_value: String(value) }]
    });
}

async function sendFlow(userId, flowId) {
    if (!userId || !flowId) return { success: false, error: 'Missing userId or flowId' };
    return await manychatRequest('/sending/sendFlow', {
        subscriber_id: userId,
        flow_ns: flowId
    });
}

// ==========================================
// HANDLER: Notify New Order (Owner)
// ==========================================
async function handleNotifyNewOrder(req, res) {
    if (!isConfigured()) {
        console.log('[manychat-api:notify-new-order] ManyChat not configured');
        return res.status(200).json({ success: false, error: 'ManyChat not configured' });
    }

    const { order } = req.body || {};
    if (!order) {
        return res.status(200).json({ success: false, error: 'No order data provided' });
    }

    console.log(`[manychat-api:notify-new-order] Processing order ${order.order_code || order.id}`);
    const result = await notifyNewOrder(order);
    return res.status(200).json(result);
}

// ==========================================
// HANDLER: Notify Client (Manual)
// ==========================================
async function handleNotifyClient(req, res) {
    if (!supabaseAdmin) return res.status(200).json({ success: false, error: 'Database not configured' });

    const { mensagem_com_pedido, ID_fluxo_enviar_ao_cliente } = req.body || {};

    if (!mensagem_com_pedido || !ID_fluxo_enviar_ao_cliente) {
        return res.status(200).json({ success: false, error: 'Missing required fields' });
    }

    const orderCode = extractOrderCode(mensagem_com_pedido);
    if (!orderCode) {
        return res.status(200).json({ success: false, error: 'Could not extract order code' });
    }

    console.log(`[manychat-api:notify-client] Extracted: ${orderCode}`);

    const { data: orders, error } = await supabaseAdmin
        .from('fast_orders')
        .select('id, client_phone, client_name, manychat_id')
        .eq('order_code', orderCode)
        .limit(1);

    if (error || !orders?.[0]) {
        return res.status(200).json({ success: false, error: `Order ${orderCode} not found` });
    }

    const order = orders[0];
    let clientManychatId = order.manychat_id;

    if (!clientManychatId && order.client_phone) {
        const { data: clients } = await supabaseAdmin
            .from('fast_clients')
            .select('manychat_id')
            .eq('phone', order.client_phone)
            .limit(1);
        clientManychatId = clients?.[0]?.manychat_id;
    }

    if (!clientManychatId) {
        return res.status(200).json({ success: false, error: 'Client has no ManyChat ID', order_code: orderCode });
    }

    const flowResult = await sendFlow(clientManychatId, ID_fluxo_enviar_ao_cliente);

    return res.status(200).json({
        success: flowResult.success,
        order_code: orderCode,
        client_manychat_id: clientManychatId,
        flow_sent: flowResult.success,
        error: flowResult.error
    });
}

// ==========================================
// HANDLER: Order Action (Accept/Reject)
// ==========================================
async function handleOrderAction(req, res) {
    const { action } = req.body || {};
    let detectedAction = action;

    if (!detectedAction) {
        if (req.body.mensagem_com_recusa_do_pedido || req.body.id_fluxo_para_envio_pedido_recusado) {
            detectedAction = 'reject';
        } else if (req.body.mensagem_com_pedido) {
            detectedAction = 'accept';
        }
    }

    console.log(`[manychat-api:order-action] Action: ${detectedAction}`);

    if (detectedAction === 'accept') {
        return _handleAccept(req.body, res);
    } else if (detectedAction === 'reject') {
        return _handleReject(req.body, res);
    }

    return res.status(200).json({ success: false, error: 'Unknown action' });
}

async function _handleAccept(body, res) {
    // Reusing logic from manychat-order-action.js
    const { mensagem_com_pedido } = body;
    const orderCode = extractOrderCode(mensagem_com_pedido);
    if (!orderCode) return res.status(200).json({ success: false, error: 'Could not extract order code' });

    const collaboratorUserId = process.env.MANYCHAT_USER_ID_JESSICA;
    const orderNumberFieldId = process.env.MANYCHAT_FIELD_ID_ORDER_NUMBER;
    const acceptedFlowId = process.env.MANYCHAT_FLOW_ID_ACEITOU_PEDIDO;

    let fieldUpdated = false;
    if (collaboratorUserId && orderNumberFieldId) {
        const r = await updateCustomField(collaboratorUserId, orderNumberFieldId, orderCode);
        fieldUpdated = r.success;
    }

    let flowSent = false;
    if (collaboratorUserId && acceptedFlowId) {
        const r = await sendFlow(collaboratorUserId, acceptedFlowId);
        flowSent = r.success;
    }

    // Update DB
    let order = null;
    let clientManychatId = null;
    let clientPhone = null;

    if (supabaseAdmin) {
        const { data: orders } = await supabaseAdmin
            .from('fast_orders')
            .select('*')
            .eq('order_code', orderCode)
            .limit(1);

        order = orders?.[0];
        if (order) {
            clientManychatId = order.manychat_id;
            clientPhone = order.client_phone;

            await supabaseAdmin.from('fast_orders')
                .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                .eq('order_code', orderCode);

            if (!clientManychatId && clientPhone) {
                const { data: c } = await supabaseAdmin.from('fast_clients').select('manychat_id').eq('phone', clientPhone).limit(1);
                clientManychatId = c?.[0]?.manychat_id;
            }
        }
    }

    // Notify Client
    const flowIdClient = body.id_fluxo_para_envio_pedido_aceito || body.ID_fluxo_enviar_ao_cliente;
    let clientFlowSent = false;
    if (clientManychatId && flowIdClient) {
        const r = await sendFlow(clientManychatId, flowIdClient);
        clientFlowSent = r.success;
    }

    // PrintNode
    let printResult = { success: false, skipped: true };
    const printNodeKey = process.env.PRINTNODE_API_KEY || 't2W6QKkr-yB56svr5ZHod5Kzvp0RTROOSE8bcbrVzDg';
    const printerId = process.env.PRINTNODE_PRINTER_ID || '75185228';

    if (printNodeKey && printerId && order) {
        try {
            const PrintNodeService = require('../api_lib/printnode-service');
            const printer = new PrintNodeService(printNodeKey);
            const receiptText = printer.formatReceipt(order);
            const result = await printer.print(printerId, receiptText);
            printResult = { ...result, skipped: false };
        } catch (e) {
            printResult = { success: false, error: e.message };
        }
    }

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        field_updated: fieldUpdated,
        flow_sent: flowSent,
        client_flow_sent: clientFlowSent,
        print_result: printResult
    });
}

async function _handleReject(body, res) {
    // Reusing logic from manychat-order-action.js
    const { mensagem_com_recusa_do_pedido, id_numero_pedido, id_fluxo_para_envio_pedido_recusado } = body;
    const orderCode = extractOrderCode(id_numero_pedido);

    if (!orderCode) return res.status(200).json({ success: false, error: 'Could not extract order code' });
    if (!id_fluxo_para_envio_pedido_recusado) return res.status(200).json({ success: false, error: 'Missing flow ID' });

    if (!supabaseAdmin) return res.status(200).json({ success: false, error: 'Database not configured' });

    const { data: orders } = await supabaseAdmin.from('fast_orders').select('*').eq('order_code', orderCode).limit(1);
    const order = orders?.[0];
    if (!order) return res.status(200).json({ success: false, error: 'Order not found' });

    let clientManychatId = order.manychat_id;
    if (!clientManychatId && order.client_phone) {
        const { data: c } = await supabaseAdmin.from('fast_clients').select('manychat_id').eq('phone', order.client_phone).limit(1);
        clientManychatId = c?.[0]?.manychat_id;
    }

    if (!clientManychatId) return res.status(200).json({ success: false, error: 'Client has no ManyChat ID' });

    const rejectionFieldId = process.env.MANYCHAT_FIELD_ID_MSG_PEDIDO_RECUSADO;
    if (rejectionFieldId && mensagem_com_recusa_do_pedido) {
        await updateCustomField(clientManychatId, rejectionFieldId, mensagem_com_recusa_do_pedido);
    }

    const flowResult = await sendFlow(clientManychatId, id_fluxo_para_envio_pedido_recusado);

    await supabaseAdmin.from('fast_orders').update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: mensagem_com_recusa_do_pedido
    }).eq('order_code', orderCode);

    return res.status(200).json({
        success: true,
        order_code: orderCode,
        flow_sent: flowResult.success
    });
}

// ==========================================
// HANDLER: Gemini AI (ManyChat Webhook)
// ==========================================
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// --- Prompt base (regras fixas de atendimento) ---
// Define persona, formato de orçamento, regras de entrega e convite ao site
const GEMINI_BASE_PROMPT = `Você é a atendente virtual da FastSavory's, uma lanchonete de delivery localizada em Itamaraju-BA.
Você recebe abaixo o CONTEXTO DE NEGÓCIO com cardápio completo, opções de personalização, taxas, horários e regras.

REGRAS DE ATENDIMENTO:
1. Responda SEMPRE em português do Brasil, tom educado e simpático, como atendente de lanchonete de bairro.
2. Use SOMENTE os dados do CONTEXTO DE NEGÓCIO. Nunca invente preços, produtos, sabores, políticas ou regras.
3. Se o produto não estiver no cardápio, diga que não temos disponível no momento.
4. Se a loja estiver FECHADA, informe educadamente e convide o cliente a voltar.
5. AGENDAMENTO/ENCOMENDA: nós SIM fazemos agendamento pelo site. Siga as REGRAS DE PEDIDO abaixo.
6. Se não tiver informação suficiente, diga: "Não tenho certeza agora, mas você pode conferir no nosso site ou me perguntar de outra forma."
7. Se o cliente fizer pergunta fora do tema, redirecione gentilmente.

FORMATO DE ORÇAMENTO (usar quando o cliente pedir itens com quantidades):
Quando montar um orçamento, organize a resposta nesta ordem:
  📋 *Produtos:* liste itens e quantidades pedidas.
  💰 *Valor unitário:* preço de cada item principal.
  🛵 *Entrega:* diga se é entrega ou retirada; se entrega, informe bairro e taxa. Se retirada, diga "retirada na loja, sem taxa".
  🏷️ *Descontos:* mencione promoções ativas que se apliquem (preço promocional, combo, cupom).
  🧮 *Valor total aproximado:* soma dos itens + taxa de entrega (se houver). Deixe claro que é aproximado.
Se o cliente não pediu orçamento (só fez pergunta simples), NÃO use esse formato — responda de forma natural e breve (3-4 frases).

REGRAS DE ENTREGA (MUITO IMPORTANTE — siga à risca):
- SALGADOS, MINI SALGADOS, BEBIDAS e COMBOS podem ser ENTREGUES nos bairros listados, com taxa por bairro (veja TAXAS DE ENTREGA abaixo).
- Horário de entrega: entre 14h e 18h (dias de funcionamento).
- BOLOS, KITS FESTA e VULCÃO são apenas para RETIRADA na loja (não entregamos bolos).
- Para bairros cadastrados com taxa R$ 0,00: entrega GRÁTIS.
- Para bairros com taxa > R$ 0,00: a entrega é feita via MOTOTÁXI e a taxa está na tabela abaixo.
- Se o cliente citar um bairro que NÃO está na lista, diga que usamos mototáxi e a taxa pode variar — ele pode confirmar pelo site.
- NUNCA diga "só fazemos retirada" quando o pedido for de salgados dentro do horário de entrega.

CONTINUAÇÃO DE PEDIDO (quando há histórico de conversa):
Se o cliente já fez um pedido parcial nesta conversa (visível no histórico acima), NÃO refaça tudo do zero.
Atualize apenas o que mudou (bairro, modo de entrega, itens extras, forma de pagamento) e mostre o resumo COMPLETO atualizado no formato de orçamento.
Exemplo: se o cliente pediu "10 coxinhas" e depois mandou "entrega no Centro", inclua a taxa do Centro no orçamento atualizado.

CONVITE AO SITE (incluir SEMPRE no final de cada resposta):
Termine TODA resposta com uma frase curta convidando o cliente a acessar o site, por exemplo:
"Acesse nosso site para ver o cardápio completo, promoções e fazer seu pedido: fastsavorys.vercel.app/pages/fast.html"`;

// Instrução extra para NOVA SESSÃO (primeira msg em 3h)
const GREETING_NEW_SESSION = `
INSTRUÇÃO DE SAUDAÇÃO: Esta é a PRIMEIRA mensagem do cliente nesta conversa.
Faça uma saudação completa e calorosa usando o nome dele (se disponível), ex: "Olá, [nome]! Seja bem-vindo(a) à FastSavory's! 😊"`;

// Instrução extra para SESSÃO EM ANDAMENTO (já falou há menos de 3h)
const GREETING_CONTINUE_SESSION = `
INSTRUÇÃO DE SAUDAÇÃO: O cliente JÁ ESTÁ em conversa recente com você.
NÃO repita saudação completa, NÃO repita "Seja bem-vindo", NÃO repita o nome toda hora.
Responda direto ao ponto. No máximo use algo curto como "Perfeito!", "Claro!", "Boa escolha!" antes de responder.`;

// Janela de sessão: 3 horas em milissegundos
const SESSION_WINDOW_MS = 3 * 60 * 60 * 1000;

// --- Lógica de sessão: carrega sessão completa (histórico + unclear_count) ---
// Retorna { isNewSession, history (array de {role,text}), unclearCount }
async function loadSession(userId) {
    if (!supabaseAdmin || !userId) return { isNewSession: true, history: [], unclearCount: 0 };

    try {
        // Usa select('*') para compatibilidade caso as colunas novas ainda não existam
        const { data: session } = await supabaseAdmin
            .from('whatsapp_sessions')
            .select('*')
            .eq('manychat_user_id', userId)
            .maybeSingle();

        const now = new Date();
        let isNewSession = true;
        let history = [];
        let unclearCount = 0;

        if (session) {
            if (session.last_interaction_at) {
                const lastAt = new Date(session.last_interaction_at);
                isNewSession = (now.getTime() - lastAt.getTime()) > SESSION_WINDOW_MS;
            }
            // Se sessão em andamento, carrega histórico e contador; se nova, reseta tudo
            if (!isNewSession) {
                history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
                unclearCount = session.unclear_count || 0;
            }
        }

        return { isNewSession, history, unclearCount };
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao carregar sessão:', err.message);
        return { isNewSession: true, history: [], unclearCount: 0 };
    }
}

// --- Salva sessão: atualiza histórico de conversa e unclear_count ---
// conversation_history é trimado para as últimas 10 mensagens (5 turnos)
async function saveSession(userId, history, unclearCount) {
    if (!supabaseAdmin || !userId) return;

    try {
        const trimmed = (history || []).slice(-10);
        await supabaseAdmin
            .from('whatsapp_sessions')
            .upsert({
                manychat_user_id: userId,
                last_interaction_at: new Date().toISOString(),
                conversation_history: trimmed,
                unclear_count: unclearCount || 0
            }, { onConflict: 'manychat_user_id' });
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao salvar sessão:', err.message);
    }
}

// --- Detecção de intenção simples (prioriza seções relevantes no prompt) ---
// Também serve para determinar se a mensagem é "clara" (handover se 3+ seguidas sem intenção)
function detectIntent(msg) {
    const m = (msg || '').toLowerCase();
    const intents = [];
    // Bolos e personalização
    if (/bolo|naked|cake|kit\s*festa|vulc[aã]o/.test(m))                intents.push('bolos');
    if (/recheio|massa\s*(branca|chocolate)|sabor\s*do\s*bolo/.test(m)) intents.push('opcoes_bolo');
    // Bebidas
    if (/bebida|refrigerante|refri|suco|agua|água|pepsi|coca|guaran[aá]/.test(m)) intents.push('bebidas');
    // Agendamento / encomenda
    if (/agend|encomend|amanh[aã]|antecedência|antecedencia|marcar|reserv/.test(m)) intents.push('agendamento');
    // Entrega / bairro
    if (/taxa|entrega|frete|bairro|delivery|entregar|retirada|retirar/.test(m)) intents.push('entrega');
    // Pagamento
    if (/cart[aã]o|pix|dinheiro|pagamento|pagar/.test(m))               intents.push('pagamento');
    // Mini salgados
    if (/mini\s*salgado|100\s*un|50\s*un|cento/.test(m))                intents.push('mini');
    // Promoções
    if (/promo[çc][aã]o|desconto|cupom|oferta/.test(m))                 intents.push('promocoes');
    // Salgados específicos
    if (/salgado|coxinha|kibe|risole|pastel|empada|bolinha|combo/.test(m)) intents.push('salgados');
    // Cardápio / preços
    if (/card[aá]pio|menu|pre[cç]o|quanto\s*custa|quanto\s*[eé]/.test(m)) intents.push('cardapio');
    // Horário / funcionamento
    if (/hor[aá]rio|aberto|fechado|funciona|abre|fecha/.test(m))        intents.push('horario');
    // Pedido genérico (quero, manda, pedir)
    if (/quero|queria|manda|pedir|pedido|me\s*v[eê]|fa[zç]/.test(m))    intents.push('pedido');
    // Saudações e confirmações (não conta como "unclear")
    if (/^(oi|ol[aá]|e\s*a[ií]|bom\s*dia|boa\s*(tarde|noite)|obrigad|valeu|ok|beleza|sim|n[aã]o|tchau|at[eé]|blz|show|perfeito|pode|isso|certo)\b/i.test(m)) intents.push('geral');
    return intents;
}

// --- Consultas ao Supabase: busca dados reais do negócio ---
async function buildBusinessContext(intents) {
    if (!supabaseAdmin) return '(Dados do cardápio indisponíveis no momento)';

    try {
        // Busca em paralelo: produtos, promoções, taxas, config, horários, status, opções de produto
        const [productsRes, promotionsRes, feesRes, configRes, hoursRes, storeStatusRes, optionsRes] = await Promise.all([
            // Produtos visíveis com descrição e flags de encomenda/personalização
            supabaseAdmin.from('fast_products')
                .select('name, description, price, category, emoji, requires_preorder, is_encomenda, block_massa, block_recheio')
                .eq('visible', true).order('category').order('name'),
            // Promoções ativas
            supabaseAdmin.from('fast_promotions')
                .select('product_name, discount_type, value, description')
                .eq('active', true),
            // Taxas de entrega por bairro
            supabaseAdmin.from('fast_delivery_fees')
                .select('neighborhood, fee').order('fee').order('neighborhood'),
            // Configurações da loja (taxas, mínimos, regras)
            supabaseAdmin.from('fast_store_config')
                .select('*').eq('id', 1).single(),
            // Horários de funcionamento
            supabaseAdmin.from('fast_business_hours')
                .select('day_name, is_open, open_time, close_time').order('day_of_week'),
            // Status da loja hoje
            supabaseAdmin.from('fast_store_status')
                .select('is_closed').eq('date', new Date().toISOString().split('T')[0]).maybeSingle(),
            // Opções de produto: massas de bolo, recheios, sabores de salgados
            supabaseAdmin.from('fast_product_options')
                .select('type, name, visible').eq('visible', true).order('sort_order')
        ]);

        // --- Montagem do contexto de negócio em texto ---
        let ctx = '';

        // ============ CARDÁPIO COMPLETO (todas as categorias) ============
        if (productsRes.data?.length) {
            ctx += '\n\nCARDÁPIO COMPLETO:';
            const grouped = {};
            for (const p of productsRes.data) {
                if (!grouped[p.category]) grouped[p.category] = [];
                grouped[p.category].push(p);
            }
            // Ordem desejada das categorias
            const catOrder = ['salgados', 'mini', 'bolos', 'kits', 'bebidas', 'adicionais'];
            const catLabels = { salgados: 'SALGADOS', mini: 'MINI SALGADOS (CENTO/50 UN)', bolos: 'BOLOS', kits: 'KITS FESTA', bebidas: 'BEBIDAS', adicionais: 'ADICIONAIS' };
            for (const cat of catOrder) {
                const items = grouped[cat];
                if (!items?.length) continue;
                ctx += `\n\n[${catLabels[cat] || cat.toUpperCase()}]`;
                for (const item of items) {
                    let line = `\n  ${item.emoji || ''} ${item.name} — R$ ${Number(item.price).toFixed(2)}`;
                    // Inclui descrição resumida se existir (máx 80 chars)
                    if (item.description) {
                        const desc = item.description.length > 80 ? item.description.substring(0, 80) + '…' : item.description;
                        line += ` (${desc})`;
                    }
                    // Flags úteis
                    if (item.requires_preorder || item.is_encomenda) line += ' [ENCOMENDA - 1 dia antecedência]';
                    if (cat === 'bolos' || cat === 'kits') {
                        if (!item.block_massa) line += ' [escolhe massa]';
                        if (!item.block_recheio) line += ' [escolhe recheio]';
                    }
                    ctx += line;
                }
            }
        }

        // ============ OPÇÕES DE PERSONALIZAÇÃO (massas, recheios, sabores) ============
        if (optionsRes.data?.length) {
            const optGrouped = {};
            for (const o of optionsRes.data) {
                if (!optGrouped[o.type]) optGrouped[o.type] = [];
                optGrouped[o.type].push(o.name);
            }
            ctx += '\n\nOPÇÕES DE PERSONALIZAÇÃO:';
            if (optGrouped.cakeMass?.length) {
                ctx += `\n  Massas de bolo: ${optGrouped.cakeMass.join(', ')}`;
            }
            if (optGrouped.filling?.length) {
                ctx += `\n  Recheios de bolo: ${optGrouped.filling.join(', ')}`;
            }
            if (optGrouped.salgados?.length) {
                ctx += `\n  Sabores de salgado (kits): ${optGrouped.salgados.join(', ')}`;
            }
            if (optGrouped.miniSalgadosFlavors?.length) {
                ctx += `\n  Sabores mini salgado: ${optGrouped.miniSalgadosFlavors.join(', ')}`;
            }
        }

        // ============ PROMOÇÕES ATIVAS ============
        if (promotionsRes.data?.length) {
            ctx += '\n\nPROMOÇÕES ATIVAS:';
            for (const p of promotionsRes.data) {
                const desc = p.discount_type === 'percentage' ? `${p.value}% OFF` : `R$ ${Number(p.value).toFixed(2)} OFF`;
                ctx += `\n  ${p.product_name}: ${desc}${p.description ? ' (' + p.description + ')' : ''}`;
            }
        }

        // ============ TAXAS DE ENTREGA POR BAIRRO ============
        // Separamos bairros com entrega grátis e bairros com taxa (mototáxi)
        if (feesRes.data?.length) {
            ctx += '\n\nTAXAS DE ENTREGA POR BAIRRO (apenas para salgados, mini salgados, bebidas e combos — das 14h às 18h):';
            const gratis = [];
            const comTaxa = {};
            for (const f of feesRes.data) {
                if (Number(f.fee) === 0) {
                    gratis.push(f.neighborhood);
                } else {
                    const key = `R$ ${Number(f.fee).toFixed(2)}`;
                    if (!comTaxa[key]) comTaxa[key] = [];
                    comTaxa[key].push(f.neighborhood);
                }
            }
            if (gratis.length) {
                ctx += `\n  Entrega GRÁTIS: ${gratis.join(', ')}`;
            }
            for (const [fee, bairros] of Object.entries(comTaxa)) {
                ctx += `\n  ${fee} (mototáxi): ${bairros.join(', ')}`;
            }
            ctx += '\n  Bairro não listado? Usamos mototáxi e a taxa pode variar — o cliente pode confirmar pelo site.';
        }

        // ============ CONFIGURAÇÕES DA LOJA ============
        if (configRes.data) {
            const c = configRes.data;
            ctx += `\n\nTAXAS DE CARTÃO: 1x = ${c.card_fee_1x}% | 2x = ${c.card_fee_2x}%`;
            ctx += '\n  (taxa de cartão é cobrada sobre o valor do pedido, NÃO sobre a taxa de entrega)';
            if (!c.delivery_enabled) {
                ctx += `\n⚠️ DELIVERY DESATIVADO${c.delivery_disabled_reason ? ': ' + c.delivery_disabled_reason : ''}. Apenas retirada no local no momento.`;
            }
        }

        // ============ REGRAS DE PEDIDO / AGENDAMENTO ============
        ctx += '\n\nREGRAS DE PEDIDO E AGENDAMENTO:';
        ctx += '\n  - Bolos, Kits Festa e Vulcão: ENCOMENDA com 1 dia de antecedência, feita pelo site. Apenas RETIRADA na loja.';
        ctx += '\n  - Salgados, mini salgados, bebidas, combos: podem ser pedidos para o MESMO DIA.';
        ctx += '\n    • Se for ENTREGA: entre 14h-18h, nos bairros listados acima, com a taxa correspondente.';
        ctx += '\n    • Se for RETIRADA: a partir das 12h na loja.';
        if (configRes.data) {
            const c = configRes.data;
            const minNormal = c.min_order_pickup || 8;
            const minOff = c.min_order_pickup_offhours || 15;
            const minMorning = c.morning_rule_min_value || 25;
            ctx += `\n  - Pedido mínimo retirada 14h-18h: R$ ${Number(minNormal).toFixed(2)}`;
            ctx += `\n  - Pedido mínimo retirada 12h-14h: R$ ${Number(minOff).toFixed(2)}`;
            ctx += `\n  - Pedido mínimo manhã 7h-12h (sem bolo): R$ ${Number(minMorning).toFixed(2)}`;
        }
        ctx += '\n  - Para fazer encomenda/agendamento, acesse o site: fastsavorys.vercel.app/pages/fast.html';
        ctx += '\n  - No site o cliente pode usar cupons de desconto, ver promoções de aniversário e fidelidade.';

        // ============ HORÁRIOS DE FUNCIONAMENTO ============
        if (hoursRes.data?.length) {
            ctx += '\n\nHORÁRIO DE FUNCIONAMENTO:';
            for (const h of hoursRes.data) {
                ctx += h.is_open
                    ? `\n  ${h.day_name}: ${h.open_time} às ${h.close_time}`
                    : `\n  ${h.day_name}: FECHADO`;
            }
        }

        // Status de hoje (fechada manualmente pelo admin?)
        if (storeStatusRes.data?.is_closed) {
            ctx += '\n\n⚠️ ATENÇÃO: A loja está FECHADA hoje por decisão da administração.';
        }

        return ctx || '(Sem dados adicionais)';
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao buscar contexto do Supabase:', err.message);
        return '(Erro ao carregar dados do cardápio)';
    }
}

async function handleGemini(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[manychat-api:gemini] GEMINI_API_KEY não configurada');
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { message, name, user_id } = req.body || {};
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Campo "message" vazio ou ausente' });
    }

    // --- Carrega sessão: histórico de conversa e contador de msgs sem intenção ---
    // (conversation_state é o histórico multi-turn salvo no Supabase)
    const session = await loadSession(user_id);
    const greetingInstruction = session.isNewSession ? GREETING_NEW_SESSION : GREETING_CONTINUE_SESSION;

    // --- Detecção de intenção ---
    const intents = detectIntent(message);
    let intentHint = '';
    if (intents.includes('bolos') || intents.includes('opcoes_bolo')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre BOLOS. Priorize informações de bolos, massas e recheios.]';
    } else if (intents.includes('bebidas')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre BEBIDAS.]';
    } else if (intents.includes('agendamento')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre AGENDAMENTO/ENCOMENDA. Use as REGRAS DE PEDIDO.]';
    } else if (intents.includes('mini')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre MINI SALGADOS e sabores disponíveis.]';
    } else if (intents.includes('promocoes')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre PROMOÇÕES.]';
    } else if (intents.includes('entrega')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre ENTREGA/BAIRRO. Se há pedido em andamento no histórico, atualize com o bairro e mostre orçamento completo.]';
    }

    // --- Lógica de handover: 3 mensagens substantivas consecutivas sem intenção clara ---
    // (handover_to_human = true aciona atribuição a atendente no ManyChat)
    let unclearCount = session.unclearCount;
    const isSubstantive = message.trim().length > 10; // msgs curtas tipo "oi" não contam
    if (intents.length === 0 && isSubstantive) {
        unclearCount++;
    } else if (intents.length > 0) {
        unclearCount = 0; // intenção clara reseta o contador
    }

    const HANDOVER_THRESHOLD = 3;
    const SITE_URL = 'fastsavorys.vercel.app/pages/fast.html';

    // Se atingiu o limite: responde com handover e para de tentar calcular
    if (unclearCount >= HANDOVER_THRESHOLD) {
        const handoverReply = 'Acho que fiquei um pouco confuso aqui para entender certinho o que você quer 😅. Vou pedir para alguém do time te atender!\n\n'
            + `Enquanto isso, acesse nosso site: ${SITE_URL}`;
        // Reseta o contador ao acionar handover para não travar em loop
        await saveSession(user_id, session.history, 0);
        return res.status(200).json({
            version: 'v2',
            content: {
                messages: [{ type: 'text', text: handoverReply }],
                actions: [],
                quick_replies: []
            },
            handover_to_human: true  // <-- campo para o ManyChat acionar atendente
        });
    }

    // Hora atual em Itamaraju-BA (UTC-3)
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', weekday: 'long' });
    const userMessage = `[Hora atual: ${now}]${intentHint}` + (name ? ` Cliente "${name}" disse: ${message}` : ` ${message}`);

    // --- Busca dados reais do Supabase e monta o prompt final ---
    const businessContext = await buildBusinessContext(intents);
    const fullPrompt = GEMINI_BASE_PROMPT + greetingInstruction + businessContext;

    // --- Monta conversa multi-turn para o Gemini (histórico + msg atual) ---
    // Histórico preserva contexto do pedido em andamento (itens, bairro, modo)
    const contents = [];
    for (const msg of session.history) {
        contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        });
    }
    // Mensagem atual: enriquecida com hora e dica de foco
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // --- Chamada ao Gemini com conversa multi-turn ---
    const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: fullPrompt }] },
            contents: contents,
            generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
        })
    });

    if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error('[manychat-api:gemini] Gemini API error:', geminiRes.status, errBody);
        return res.status(502).json({ error: 'Gemini API error', details: errBody });
    }

    const data = await geminiRes.json();
    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'Desculpe, não consegui gerar uma resposta agora. Um atendente vai te ajudar!';

    // --- Convite ao site: garante que aparece no final de toda resposta ---
    if (!reply.includes('fastsavorys.vercel.app')) {
        reply += `\n\nAcesse nosso site para cardápio completo, promoções e cupons: ${SITE_URL}`;
    }

    // --- Salva sessão com histórico atualizado (conversation_state) ---
    // Guarda msg original do usuário (sem enriquecimento) + resposta da IA
    const updatedHistory = [
        ...session.history,
        { role: 'user', text: message },
        { role: 'assistant', text: reply.length > 500 ? reply.substring(0, 500) : reply }
    ];
    await saveSession(user_id, updatedHistory, unclearCount);

    return res.status(200).json({
        version: 'v2',
        content: {
            messages: [{ type: 'text', text: reply }],
            actions: [],
            quick_replies: []
        },
        handover_to_human: false  // <-- sem handover, conversa normal
    });
}

// ==========================================
// MAIN EXPORT
// ==========================================
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).json({ success: false, error: 'Use POST' });

    const type = req.query.type;

    try {
        if (type === 'notify-new-order') {
            return await handleNotifyNewOrder(req, res);
        } else if (type === 'notify-client') {
            return await handleNotifyClient(req, res);
        } else if (type === 'gemini') {
            return await handleGemini(req, res);
        } else {
            // Default: Order Action (Accept/Reject)
            return await handleOrderAction(req, res);
        }
    } catch (err) {
        console.error('[manychat-api] Unexpected error:', err);
        return res.status(200).json({ success: false, error: 'Internal server error: ' + err.message });
    }
};
