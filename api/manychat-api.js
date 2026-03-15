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
const GEMINI_BASE_PROMPT = `Você é a atendente virtual da FastSavory's, uma lanchonete de delivery localizada em Itamaraju-BA.

REGRAS DE ATENDIMENTO:
1. Responda SEMPRE em português do Brasil, tom educado e simpático, como atendente de lanchonete de bairro.
2. Seja breve: no máximo 3 a 4 frases por resposta.
3. Quando o cliente pedir algo:
   - Resuma o que ele pediu.
   - Informe o preço de cada item conforme o CARDÁPIO abaixo.
   - Sugira salgados, combos ou bebidas complementares, se fizer sentido.
   - Pergunte se deseja finalizar o pedido e peça: nome completo, endereço de entrega e forma de pagamento.
4. Use SOMENTE os dados do CARDÁPIO, TAXAS e HORÁRIOS fornecidos abaixo. Nunca invente preços ou itens.
5. Se o produto não estiver no cardápio, diga que não temos disponível no momento.
6. Se a loja estiver FECHADA (conforme horário abaixo ou status do dia), informe educadamente o horário de funcionamento e convide o cliente a voltar.
7. Taxa de cartão: informe ao cliente quando ele escolher cartão como pagamento.
8. Se o cliente fizer uma pergunta que não seja sobre a lanchonete, redirecione gentilmente para o atendimento de pedidos.`;

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

// --- Lógica de sessão: verifica se é nova conversa ou continuação ---
async function checkSession(userId) {
    // Se não tiver Supabase ou user_id, assume nova sessão
    if (!supabaseAdmin || !userId) return true;

    try {
        // Busca última interação deste usuário
        const { data: session } = await supabaseAdmin
            .from('whatsapp_sessions')
            .select('last_interaction_at')
            .eq('manychat_user_id', userId)
            .maybeSingle();

        const now = new Date();
        let isNewSession = true;

        if (session?.last_interaction_at) {
            const lastAt = new Date(session.last_interaction_at);
            const diffMs = now.getTime() - lastAt.getTime();
            isNewSession = diffMs > SESSION_WINDOW_MS;
        }

        // Atualiza (ou cria) o registro com o horário atual (UPSERT)
        await supabaseAdmin
            .from('whatsapp_sessions')
            .upsert(
                { manychat_user_id: userId, last_interaction_at: now.toISOString() },
                { onConflict: 'manychat_user_id' }
            );

        return isNewSession;
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao verificar sessão:', err.message);
        return true; // Em caso de erro, trata como nova sessão (mais seguro)
    }
}

// --- Consultas ao Supabase: busca dados reais do negócio ---
async function buildBusinessContext() {
    if (!supabaseAdmin) return '(Dados do cardápio indisponíveis no momento)';

    try {
        // Busca em paralelo para ser mais rápido
        const [productsRes, promotionsRes, feesRes, configRes, hoursRes, storeStatusRes] = await Promise.all([
            // Produtos visíveis, ordenados por categoria e nome
            supabaseAdmin.from('fast_products').select('name, price, category, emoji').eq('visible', true).order('category').order('name'),
            // Promoções ativas
            supabaseAdmin.from('fast_promotions').select('product_name, discount_type, value, description').eq('active', true),
            // Taxas de entrega por bairro
            supabaseAdmin.from('fast_delivery_fees').select('neighborhood, fee').order('fee').order('neighborhood'),
            // Configurações da loja (taxa cartão, delivery habilitado)
            supabaseAdmin.from('fast_store_config').select('*').eq('id', 1).single(),
            // Horários de funcionamento por dia da semana
            supabaseAdmin.from('fast_business_hours').select('day_name, is_open, open_time, close_time').order('day_of_week'),
            // Status da loja hoje (fechada manualmente?)
            supabaseAdmin.from('fast_store_status').select('is_closed').eq('date', new Date().toISOString().split('T')[0]).maybeSingle()
        ]);

        // --- Montagem do contexto de negócio em texto ---
        let ctx = '';

        // Cardápio agrupado por categoria
        if (productsRes.data?.length) {
            ctx += '\n\nCARDÁPIO ATUAL:';
            const grouped = {};
            for (const p of productsRes.data) {
                if (!grouped[p.category]) grouped[p.category] = [];
                grouped[p.category].push(p);
            }
            for (const [cat, items] of Object.entries(grouped)) {
                ctx += `\n[${cat.toUpperCase()}]`;
                for (const item of items) {
                    ctx += `\n  ${item.emoji || ''} ${item.name} — R$ ${Number(item.price).toFixed(2)}`;
                }
            }
        }

        // Promoções ativas
        if (promotionsRes.data?.length) {
            ctx += '\n\nPROMOÇÕES ATIVAS:';
            for (const p of promotionsRes.data) {
                const desc = p.discount_type === 'percentage' ? `${p.value}% OFF` : `R$ ${Number(p.value).toFixed(2)} OFF`;
                ctx += `\n  ${p.product_name}: ${desc}${p.description ? ' (' + p.description + ')' : ''}`;
            }
        }

        // Taxas de entrega
        if (feesRes.data?.length) {
            ctx += '\n\nTAXAS DE ENTREGA POR BAIRRO:';
            const byFee = {};
            for (const f of feesRes.data) {
                const key = Number(f.fee) === 0 ? 'Grátis' : `R$ ${Number(f.fee).toFixed(2)}`;
                if (!byFee[key]) byFee[key] = [];
                byFee[key].push(f.neighborhood);
            }
            for (const [fee, bairros] of Object.entries(byFee)) {
                ctx += `\n  ${fee}: ${bairros.join(', ')}`;
            }
        }

        // Configurações da loja (taxa de cartão)
        if (configRes.data) {
            const c = configRes.data;
            ctx += `\n\nTAXAS DE CARTÃO: 1x = ${c.card_fee_1x}% | 2x = ${c.card_fee_2x}%`;
            if (!c.delivery_enabled) {
                ctx += `\nDELIVERY DESATIVADO${c.delivery_disabled_reason ? ': ' + c.delivery_disabled_reason : ''}. Apenas retirada no local.`;
            }
        }

        // Horários de funcionamento
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

    // Aceita user_id do ManyChat (para controle de sessão)
    const { message, name, user_id } = req.body || {};
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Campo "message" vazio ou ausente' });
    }

    // --- Lógica de sessão: verifica se é nova conversa ou continuação ---
    const isNewSession = await checkSession(user_id);
    const greetingInstruction = isNewSession ? GREETING_NEW_SESSION : GREETING_CONTINUE_SESSION;

    // Hora atual em Itamaraju-BA (UTC-3) para a IA saber se está dentro do horário
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', weekday: 'long' });
    const userMessage = `[Hora atual: ${now}]` + (name ? ` Cliente "${name}" disse: ${message}` : ` ${message}`);

    // --- Busca dados reais do Supabase e monta o prompt final ---
    const businessContext = await buildBusinessContext();
    const fullPrompt = GEMINI_BASE_PROMPT + greetingInstruction + businessContext;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // --- Chamada ao Gemini com o prompt completo ---
    const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: fullPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        })
    });

    if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error('[manychat-api:gemini] Gemini API error:', geminiRes.status, errBody);
        return res.status(502).json({ error: 'Gemini API error', details: errBody });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'Desculpe, não consegui gerar uma resposta agora. Um atendente vai te ajudar!';

    return res.status(200).json({
        version: 'v2',
        content: {
            messages: [{ type: 'text', text: reply }],
            actions: [],
            quick_replies: []
        }
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
