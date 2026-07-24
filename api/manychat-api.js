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
const Stripe = require('stripe');
// CAIXINHA de cálculo/preços (calculadora determinística + validação de valores de pagamento)
const {
    fetchProductPriceMap,
    estimateCartTotal,
    validatePixAmount,
    validateCartaoAmount,
    parseBrlNumber,
    normalizeTxt,
} = require('./_lib/pricing');
// CAIXINHA de pagamento (geradores puros: PIX copia-e-cola + link de cartão Stripe)
const { generatePixBrCode, generateStripeCheckoutLink } = require('./_lib/payment');
// CAIXINHA de atendimento (prompt/persona do Fast). Movido para ./_lib/prompt.js
const { GEMINI_BASE_PROMPT, GREETING_NEW_SESSION, GREETING_CONTINUE_SESSION } = require('./_lib/prompt');

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

let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
} catch (err) {
    console.error('[manychat-api] Stripe init error:', err.message);
}

// [CAIXINHA] generateStripeCheckoutLink foi movida para ./_lib/payment.js
// (importada no topo). Recebe a instância `stripe` por parâmetro.

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
        return res.status(200).json({ success: false, error: 'ManyChat not configured' });
    }

    const { order } = req.body || {};
    if (!order) {
        return res.status(200).json({ success: false, error: 'No order data provided' });
    }

    // Normaliza total: aceita "R$ 93,00" ou 93.00
    let totalNormalized = order.total;
    if (typeof totalNormalized === 'string') {
        totalNormalized = parseFloat(
            totalNormalized.replace('R$', '').replace('.', '').replace(',', '.').trim()
        );
    }

    // Normaliza items: aceita string de texto ou array
    let itemsNormalized = order.items;
    if (typeof itemsNormalized === 'string' && itemsNormalized.trim()) {
        itemsNormalized = [{ name: itemsNormalized, quantity: 1, price: null }];
    }

    // Normaliza phone
    let phoneNormalized = order.client_phone || order.phone || '';
    if (!phoneNormalized) {
        phoneNormalized = 'Não informado';
    }

    const normalizedOrder = {
        ...order,
        total: totalNormalized,
        items: itemsNormalized,
        client_phone: phoneNormalized,
        delivery_type: order.delivery_type || order.delivery_mode,
        scheduled_date: order.scheduled_date,
    };

    console.log(`[manychat-api:notify-new-order] Processing order ${normalizedOrder.order_code || normalizedOrder.id}`);
    const result = await notifyNewOrder(normalizedOrder);
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
    // Credenciais SOMENTE via variáveis de ambiente (Vercel). Sem fallback hardcoded por segurança.
    // Se não estiverem configuradas, a impressão é simplesmente pulada (guard abaixo).
    const printNodeKey = process.env.PRINTNODE_API_KEY;
    const printerId = process.env.PRINTNODE_PRINTER_ID;

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
// Modelos validados (21/abr/2026): cascata econômica sem modelos descontinuados (1.5/2.0 removidos)
// Ordem: mais barato → mais capaz. Fallbacks 3/4 em infra 3.x (separada da 2.5, protege contra overload)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_MODEL_FALLBACK = 'gemini-3.1-flash-lite';
const GEMINI_MODEL_FALLBACK_2 = 'gemini-2.5-flash';
const GEMINI_MODEL_FALLBACK_3 = 'gemini-3-flash-preview';
// Modelo multimodal para processar áudio/imagem/PDF (modelos lite não suportam inline_data)
const GEMINI_MODEL_MULTIMODAL = 'gemini-2.5-flash';



// Janela de sessão: 3 horas em milissegundos
const SESSION_WINDOW_MS = 3 * 60 * 60 * 1000;

// --- Lógica de sessão: carrega sessão completa (histórico + unclear_count) ---
// Retorna { isNewSession, history (array de {role,text}), unclearCount, ownerApprovalNoticeCount }
async function loadSession(userId) {
    if (!supabaseAdmin || !userId) {
        console.warn(`[session] loadSession skip: supabaseAdmin=${!!supabaseAdmin}, userId=${userId}`);
        return { isNewSession: true, history: [], unclearCount: 0, ownerApprovalNoticeCount: 0, _loadErr: `skip:supa=${!!supabaseAdmin},uid=${userId}` };
    }

    try {
        // Usa select('*') para compatibilidade caso as colunas novas ainda não existam
        const { data: session, error: loadErr } = await supabaseAdmin
            .from('whatsapp_sessions')
            .select('*')
            .eq('manychat_user_id', userId)
            .maybeSingle();
        if (loadErr) console.error('[session] loadSession DB error:', loadErr.message, loadErr.details);
        console.log(`[session] loadSession result: found=${!!session}, userId=${userId}`);

        const now = new Date();
        let isNewSession = true;
        let history = [];
        let unclearCount = 0;
        let ownerApprovalNoticeCount = 0;

        if (session) {
            if (session.last_interaction_at) {
                const lastAt = new Date(session.last_interaction_at);
                isNewSession = (now.getTime() - lastAt.getTime()) > SESSION_WINDOW_MS;
            }
            // Se sessão em andamento, carrega histórico e contador; se nova, reseta tudo
            if (!isNewSession) {
                history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
                unclearCount = session.unclear_count || 0;
                ownerApprovalNoticeCount = session.owner_approval_notice_count || 0;
            }
        }

        return { isNewSession, history, unclearCount, ownerApprovalNoticeCount, _loadErr: loadErr ? loadErr.message : null, _found: !!session };
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao carregar sessão:', err.message);
        return { isNewSession: true, history: [], unclearCount: 0, ownerApprovalNoticeCount: 0, _loadErr: 'exception:' + err.message };
    }
}

// --- Salva sessão: atualiza histórico de conversa e unclear_count ---
// conversation_history é trimado para as últimas 30 mensagens (15 turnos) para não perder o contexto das correções
async function saveSession(userId, history, unclearCount, ownerApprovalNoticeCount) {
    if (!supabaseAdmin || !userId) return 'skip:no-supa-or-uid';

    try {
        const trimmed = (history || []).slice(-30);
        const payload = {
            manychat_user_id: userId,
            last_interaction_at: new Date().toISOString(),
            conversation_history: trimmed,
            unclear_count: unclearCount || 0,
            owner_approval_notice_count: ownerApprovalNoticeCount || 0
        };
        let { error: saveErr } = await supabaseAdmin
            .from('whatsapp_sessions')
            .upsert(payload, { onConflict: 'manychat_user_id' });
        // Fallback: se coluna não existe, tenta sem ela
        if (saveErr && /column.*not.*found|schema cache/i.test(saveErr.message || '')) {
            console.warn(`[session] saveSession fallback: removendo colunas desconhecidas e tentando novamente`);
            delete payload.owner_approval_notice_count;
            const retry = await supabaseAdmin
                .from('whatsapp_sessions')
                .upsert(payload, { onConflict: 'manychat_user_id' });
            saveErr = retry.error;
            // Se ainda falhar, tenta só com colunas básicas
            if (saveErr && /column.*not.*found|schema cache/i.test(saveErr.message || '')) {
                console.warn(`[session] saveSession fallback 2: apenas colunas básicas`);
                delete payload.unclear_count;
                delete payload.conversation_history;
                const retry2 = await supabaseAdmin
                    .from('whatsapp_sessions')
                    .upsert(payload, { onConflict: 'manychat_user_id' });
                saveErr = retry2.error;
            }
        }
        if (saveErr) {
            console.error('[session] saveSession DB error:', saveErr.message, saveErr.details, saveErr.code);
            return saveErr.message || saveErr.code || 'db-error';
        }
        console.log(`[session] saveSession OK: userId=${userId}, histLen=${trimmed.length}`);
        return null;
    } catch (err) {
        console.error('[session] saveSession exception:', err.message);
        return 'exception:' + err.message;
    }
}

// ==========================================
// BAIRRO FEE MAP — HARDCODED SOURCE OF TRUTH
// ==========================================
// Used for PROGRAMMATIC validation so the model can't hallucinate wrong values.
// Sorted longest-key-first for matching priority.
const BAIRRO_FEE_MAP = {
    'centro cidade baixa': { fee: 5, min: 15 },
    'tarcizio carleto': { fee: 8, min: 30 },
    'tarcisio carleto': { fee: 8, min: 30 },
    'village das pedras': { fee: 8, min: 30 },
    'vale do jucurucu': { fee: 8, min: 30 },
    'vale do jucuruçu': { fee: 8, min: 30 },
    'portal do monte': { fee: 8, min: 30 },
    'monte pescoco': { fee: 8, min: 30 },
    'monte pescoço': { fee: 8, min: 30 },
    'cristo redentor': { fee: 6, min: 15 },
    'santo antonio': { fee: 6, min: 15 },
    'santo antônio': { fee: 6, min: 15 },
    'sao domingos': { fee: 4, min: 15 },
    'são domingos': { fee: 4, min: 15 },
    'vista da pedra': { fee: 8, min: 30 },
    'varzea alegre': { fee: 6, min: 20 },
    'várzea alegre': { fee: 6, min: 20 },
    '31 de marco': { fee: 6, min: 20 },
    '31 de março': { fee: 6, min: 20 },
    'sao bernardo': { fee: 8, min: 30 },
    'são bernardo': { fee: 8, min: 30 },
    'cidade baixa': { fee: 5, min: 15 },
    'vista bela': { fee: 8, min: 30 },
    'novo prado': { fee: 0, min: 15 },
    'bela vista': { fee: 8, min: 30 },
    'baixa fria': { fee: 5, min: 20 },
    'beira rio': { fee: 6, min: 20 },
    'liberdade': { fee: 8, min: 30 },
    'primavera': { fee: 8, min: 30 },
    'marotinho': { fee: 8, min: 30 },
    'tarcisao': { fee: 8, min: 30 },
    'tarcisão': { fee: 8, min: 30 },
    'tarcizio': { fee: 8, min: 30 },
    'itatiaia': { fee: 8, min: 30 },
    'jaqueira': { fee: 8, min: 25 },
    'alvorada': { fee: 8, min: 30 },
    'corujao': { fee: 8, min: 25 },
    'corujão': { fee: 8, min: 25 },
    'italage': { fee: 8, min: 30 },
    'urbis 2': { fee: 8, min: 30 },
    'urbis 3': { fee: 8, min: 30 },
    'urbis ii': { fee: 8, min: 30 },
    'urbis iii': { fee: 8, min: 30 },
    'fatima': { fee: 8, min: 25 },
    'fátima': { fee: 8, min: 25 },
    'furlan': { fee: 8, min: 30 },
    'centro': { fee: 6, min: 20 },
    'canaa': { fee: 8, min: 25 },
    'canaã': { fee: 8, min: 25 },
    'bnh': { fee: 6, min: 20 },
};

function detectBairroInText(text) {
    const t = (text || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove accents for matching
    // Avoid false positives: "centro/cento de salgados" is NOT bairro Centro
    const falsePositivePatterns = /centr?o\s*(de\s*)?(salgad|mini|unidade|coxinha|quibe|bolinha)/i;
    if (falsePositivePatterns.test(t)) return null;
    const sorted = Object.entries(BAIRRO_FEE_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [bairro, data] of sorted) {
        const bairroNorm = bairro.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Use word boundary to avoid partial matches
        const re = new RegExp(`\\b${bairroNorm.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (re.test(t)) {
            return { name: bairro, fee: data.fee, min: data.min };
        }
    }
    return null;
}

// [CAIXINHA] Calculadora de pedido + validação de valores de pagamento foram movidas para
// ./_lib/pricing.js (importadas no topo: fetchProductPriceMap, estimateCartTotal,
// validatePixAmount, validateCartaoAmount, parseBrlNumber, normalizeTxt).


function buildDeliveryFactHint(history, currentMessage, priceMap = null) {
    // Only look at USER messages for bairro detection (bot messages list ALL bairros)
    const userMsgs = history.filter(m => m.role === 'user').map(m => m.text);
    userMsgs.push(currentMessage);

    // Check if conversation is in delivery context
    const allTexts = history.map(m => m.text).join(' ') + ' ' + currentMessage;
    const isDeliveryCtx = /entrega|entregar|delivery|bairro|endereço|para qual bairro/i.test(allTexts);
    if (!isDeliveryCtx) return '';

    // Detect bairro from user messages (prefer most recent)
    let bairroInfo = null;
    for (let i = userMsgs.length - 1; i >= 0; i--) {
        bairroInfo = detectBairroInText(userMsgs[i]);
        if (bairroInfo) break;
    }
    if (!bairroInfo) return '';

    // Estimate order total from full conversation (calculadora determinística)
    const { total, description, complete } = estimateCartTotal([...history, { role: 'user', text: currentMessage }], priceMap);

    const feeStr = bairroInfo.fee === 0 ? 'GRÁTIS' : `R$ ${bairroInfo.fee.toFixed(2)}`;
    let hint = `\n[⛔ DADOS VERIFICADOS PELO SISTEMA (USE ESTES VALORES — NÃO INVENTE):`;
    hint += `\n  BAIRRO: ${bairroInfo.name.toUpperCase()} → TAXA DE ENTREGA = ${feeStr} | PEDIDO MÍNIMO = R$ ${bairroInfo.min.toFixed(2)}`;

    // Só afirma o TOTAL quando a calculadora conseguiu precificar TUDO com segurança.
    // Se complete=false (tem bolo/kit/combo ou houve remoção), NÃO crava um total — deixa a IA somar
    // a partir do cardápio, para não injetar um valor possivelmente errado.
    if (total > 0 && complete) {
        const effectiveMin = Math.max(15, bairroInfo.min);
        hint += `\n  PEDIDO (ITENS EXATOS QUE O CLIENTE PEDIU): ${description} | TOTAL = R$ ${total.toFixed(2)}`;
        hint += `\n  ⛔ NÃO adicione, NÃO invente e NÃO "complete" o pedido com itens que o cliente NÃO pediu. O total É EXATAMENTE R$ ${total.toFixed(2)}. Só mude esse valor se o PRÓPRIO cliente pedir mais itens explicitamente.`;
        if (total >= effectiveMin) {
            const totalComTaxa = total + bairroInfo.fee;
            hint += `\n  ✅ R$ ${total.toFixed(2)} ≥ R$ ${effectiveMin.toFixed(2)} → ENTREGA PERMITIDA.`;
            hint += ` Total com taxa: R$ ${total.toFixed(2)} + ${feeStr} = R$ ${totalComTaxa.toFixed(2)}`;
        } else {
            const falta = (effectiveMin - total).toFixed(2).replace('.', ',');
            hint += `\n  ❌ R$ ${total.toFixed(2)} < R$ ${effectiveMin.toFixed(2)} → ABAIXO DO MÍNIMO. Faltam R$ ${falta}. NÃO aceite entrega.`;
        }
    } else if (total > 0 && !complete) {
        hint += `\n  ⚠️ Pedido tem itens de preço fixo/variável (bolo/kit/combo) ou foi alterado. Some os valores a partir do CARDÁPIO acima com atenção. NÃO invente — confira item por item.`;
    }

    hint += `]`;
    console.log(`[delivery-hint] ${hint.replace(/\n/g, ' | ')}`);
    return hint;
}

// Calcula o total FINAL do pedido (produtos + taxa de entrega, se houver) de forma determinística,
// a partir da conversa inteira. Usado para BLINDAR a geração do PIX contra o modelo usando um valor
// antigo/errado que foi mencionado em algum ponto anterior da conversa (ex: um total incorreto que a
// IA disse antes de terminar de somar todos os itens). Só retorna um valor quando a calculadora
// conseguiu precificar TUDO com segurança (complete=true) — caso contrário retorna null e quem chamou
// deve confiar na validação por "valores mencionados" (validatePixAmount) como fallback.
function computeDeterministicOrderTotal(history, currentMessage, priceMap = null) {
    try {
        const { total, complete } = estimateCartTotal([...(history || []), { role: 'user', text: currentMessage }], priceMap);
        if (!complete || !(total > 0)) return null;
        // Detecta bairro (taxa de entrega) na conversa — mensagem mais recente do cliente que citar um bairro.
        const userMsgs = (history || []).filter(m => m.role === 'user').map(m => m.text);
        userMsgs.push(currentMessage);
        let bairroInfo = null;
        for (let i = userMsgs.length - 1; i >= 0; i--) {
            bairroInfo = detectBairroInText(userMsgs[i]);
            if (bairroInfo) break;
        }
        const fee = bairroInfo ? bairroInfo.fee : 0;
        return { total: total + fee, productsTotal: total, fee };
    } catch (e) {
        console.warn('[pix] computeDeterministicOrderTotal erro:', e.message);
        return null;
    }
}

// Resolve o valor FINAL a usar no PIX/link de cartão. Prioriza o total calculado
// deterministicamente (produtos + taxa de entrega) sobre o valor que o modelo colocou na tag —
// o modelo pode ter pego um total antigo/errado mencionado em algum ponto anterior da conversa
// (ex: disse R$ 23,00 antes de somar todos os itens, e depois usa esse valor errado no PIX).
// Só cai no valor do modelo (validado por validatePixAmount) quando a calculadora não tem certeza
// (bolo/kit/combo no pedido, etc).
function resolvePixFinalAmount(amt, history, currentMessage, priceMap) {
    const detTotal = computeDeterministicOrderTotal(history, currentMessage, priceMap);
    const safeAmt = validatePixAmount(amt, history, currentMessage, priceMap);
    if (detTotal && Math.abs((safeAmt || 0) - detTotal.total) > 1.0) {
        console.warn(`[pix] ⚠️ Valor da tag (R$ ${(safeAmt || 0).toFixed(2)}) difere do total calculado deterministicamente (R$ ${detTotal.total.toFixed(2)} = produtos R$ ${detTotal.productsTotal.toFixed(2)} + taxa R$ ${detTotal.fee.toFixed(2)}). Usando o valor calculado.`);
        return detTotal.total;
    }
    return safeAmt;
}

// Lembrete just-in-time para o Bolo Vulcão Mini / Bolo no Pote.
// Esses bolos NÃO têm personalização (massa/recheio/sabor) e PODEM ser entregues. O modelo às vezes
// perde esse detalhe ao longo da conversa e os trata como bolo grande (pede personalização / diz que
// é só retirada). Injeta um fato verificado para corrigir isso — só quando NÃO houver bolo grande/kit.
function buildBoloFactHint(history, currentMessage) {
    const allText = (history || []).map(m => m.text).join('\n') + '\n' + (currentMessage || '');
    const t = normalizeTxt(allText);
    const hasMiniVulcao = /(vulcao\s*mini|mini\s*vulcao|bolo\s*no\s*pote)/.test(t);
    if (!hasMiniVulcao) return '';
    // Se há bolo GRANDE ou kit festa no contexto, a regra é outra (retirada + personalização do grande).
    const hasBoloGrande = /(bolo\s*(pp|p|g)\b|vulcao\s*p\b|kit\s*festa|naked)/.test(t);
    if (hasBoloGrande) return '';
    const boloHint = `\n[⛔ FATO VERIFICADO (pedido tem Bolo Vulcão Mini / Bolo no Pote): Esses bolos JÁ VÊM PRONTOS — sabor único. NÃO pergunte massa, recheio, sabor nem cor de fita. E eles PODEM SER ENTREGUES normalmente (NÃO são "apenas retirada"). NÃO os trate como bolo grande.]`;
    console.log(`[bolo-hint] ${boloHint.replace(/\n/g, ' | ')}`);
    return boloHint;
}

// Guard para Kit Festa / bolo GRANDE (PP/P/G/Vulcão P): são APENAS RETIRADA e precisam de 1 dia de
// antecedência (não podem ser para HOJE). O modelo às vezes libera entrega/mesmo-dia indevidamente,
// principalmente quando renomeia "Kit Festa" para "Combo Festa". Injeta fato verificado.
function buildKitFactHint(history, currentMessage) {
    const allText = (history || []).map(m => m.text).join('\n') + '\n' + (currentMessage || '');
    const t = normalizeTxt(allText);
    const hasKitOuBoloGrande = /(kit\s*festa|combo\s*festa|festa\s*(pp|p|g)\b|bolo\s*(pp|p|g)\b|vulcao\s*p\b|naked)/.test(t);
    if (!hasKitOuBoloGrande) return '';
    const kitHint = `\n[⛔ FATO VERIFICADO (pedido contém Kit Festa e/ou bolo grande): (1) É APENAS RETIRADA na loja (Rua Palmeiras, 105, Novo Prado) — NUNCA ofereça nem aceite ENTREGA, nem mesmo para os salgados/bebidas do mesmo pedido. (2) Precisa de no mínimo 1 DIA de antecedência — NÃO pode ser para HOJE. Se o cliente pediu para hoje, recuse com educação (diga que não é possível atender hoje e que fica para uma próxima) e PARE — ⛔ NÃO ofereça proativamente agendar para amanhã/outro dia (quem pede pra hoje está com urgência). Só mencione agendar outro dia SE o próprio cliente perguntar. NÃO confunda Kit Festa (bolo+refri+mini) com "combo de mini salgados".]`;
    console.log(`[kit-hint] ${kitHint.replace(/\n/g, ' | ')}`);
    return kitHint;
}

// Guard de pagamento: a opção de 50% de entrada SÓ pode ser oferecida quando o total do pedido for
// MAIOR que R$ 50,00. O modelo às vezes oferece 50% em pedidos pequenos (ex: R$ 26,75). Injeta um
// fato verificado com o total calculado deterministicamente para o modelo obedecer ao limiar correto.
function buildPaymentFactHint(history, currentMessage, priceMap = null) {
    const allText = (history || []).map(m => m.text).join(' ') + ' ' + (currentMessage || '');
    const isPaymentCtx = /\b(pix|pagar|pagamento|gera.*pix|chave pix|copia e cola|cart[aã]o|dinheiro)\b/i.test(allText);
    if (!isPaymentCtx) return '';
    const det = computeDeterministicOrderTotal(history, currentMessage, priceMap);
    if (!det || det.total <= 0) return '';
    const totalFmt = det.total.toFixed(2).replace('.', ',');
    let hint = `\n[⛔ FATO VERIFICADO (pagamento): O total do pedido é R$ ${totalFmt}. `;
    if (det.total > 50) {
        const entrada = (det.total * 0.5).toFixed(2).replace('.', ',');
        hint += `Como o total é MAIOR que R$ 50,00, você PODE oferecer pagamento integral OU 50% de entrada (R$ ${entrada}). NÃO ofereça entrada abaixo de 50%. NÃO deixe o cliente pagar menos sem passar para a Jéssica.]`;
    } else {
        hint += `Como o total é R$ 50,00 ou MENOS, ⛔ NÃO ofereça 50% de entrada. Exija pagamento integral de R$ ${totalFmt}. Para PIX, gere [GERAR_PIX:${det.total.toFixed(2)}] depois que o cliente confirmar.]`;
    }
    console.log(`[payment-hint] ${hint.replace(/\n/g, ' | ')}`);
    return hint;
}

// --- Detecção de intenção simples (prioriza seções relevantes no prompt) ---
// Também serve para determinar se a mensagem é "clara" (handover se 3+ seguidas sem intenção)
function detectIntent(msg) {
    const m = (msg || '').toLowerCase();
    const intents = [];
    // Bolos e personalização
    if (/bolo|naked|cake|kit\s*festa|vulc[aã]o/.test(m))                intents.push('bolos');
    if (/recheio|sabor\s*do\s*bolo/.test(m)) intents.push('opcoes_bolo');
    // Bebidas
    if (/bebida|refrigerante|refri|suco|agua|água|pepsi|coca|guaran[aá]/.test(m)) intents.push('bebidas');
    // Agendamento / encomenda
    if (/agend|encomend|amanh[aã]|antecedência|antecedencia|marcar|reserv/.test(m)) intents.push('agendamento');
    // Entrega / bairro
    if (/taxa|entrega|frete|bairro|delivery|entregar|retirada|retirar/.test(m)) intents.push('entrega');
    // Pagamento ou chave PIX
    if (/cart[aã]o|pix|dinheiro|pagamento|pagar|chave|c[oó]pia\s*e\s*cola|qr\s*code/.test(m)) intents.push('pagamento');
    // Mini salgados
    if (/mini\s*salgado|100\s*un|50\s*un|cento/.test(m))                intents.push('mini');
    // Promoções
    if (/promo[çc][aã]o|desconto|cupom|oferta/.test(m))                 intents.push('promocoes');
    // Salgados específicos
    if (/salgado|salgadinho|coxinha|kibe|risole|pastel|empada|bolinha|combo/.test(m)) intents.push('salgados');
    // Doces (FastSavory’s NÃO vende doces tradicionais)
    if (/\bdoce|\bdoces|brigadeiro|cajuzinho|bem.casado|trufa|brownie|cupcake|torta\s*doce/i.test(m)) intents.push('doces');
    // Diminutivo, festa ou quantidade >20 → provavelmente mini salgados
    if (/salgadinho|pequenin|pequeninho|dos\s*pequeno|miniatura|minizinho|de\s*festa|pra\s*festa|para\s*festa|festinha/i.test(m) || (/\b(2[1-9]|[3-9]\d|\d{3,})\s*(salgad|coxinha|kibe|risole|pastel|empada|bolinha|unidade|un\b)/i.test(m) && !/grande|tradicional|normal/i.test(m))) intents.push('mini');
    // Cardápio / preços
    if (/card[aá]pio|menu|pre[cç]o|quanto\s*custa|quanto\s*[eé]/.test(m)) intents.push('cardapio');
    // Horário / funcionamento
    if (/hor[aá]rio|aberto|fechado|funciona|abre|fecha/.test(m))        intents.push('horario');
    // Pedido genérico (quero, manda, pedir)
    if (/quero|queria|manda|pedir|pedido|me\s*v[eê]|fa[zç]/.test(m))    intents.push('pedido');
    // Handover direto: cliente pede para falar com humano/atendente
    if (/falar\s*(com)?\s*(atendente|algu[eé]m|humano|pessoa|gente)|atendente|atendimento\s*humano/i.test(m)) intents.push('handover_direto');
    // Confirmação de pedido (sim/pode/ok — verificado no handler se há orçamento pendente)
    if (/^(sim|pode|confirmo|confirma|fecha|é isso|tá bom|ta bom|pode ser|isso mesmo|manda|certo|confirmar|fechar)\b/i.test(m.trim()) || /confirm|fecha(r)?\s*(o\s*)?pedido/i.test(m)) intents.push('confirmacao');
    // Mensagens sociais/pessoais (aniversário, elogios, carinho — NÃO é pedido de comida)
    if (/feliz\s*aniv|parab[eé]ns|anivers[aá]rio|deus\s*te\s*aben[cç]|deus\s*aben[cç]|felicidade|sa[uú]de\s*e|sucesso|maravilhos[aoe]|talentosa|muito\s*linda|linda\s*demais|te\s*amo|te\s*adoro|saudade|gratid[aã]o|aben[cç]o|ben[cç][aã]o|tudo\s*de\s*bom|arrasou|incr[ií]vel|amei|am[eé]i\s*(o|a|os|as|demais|muito)|perfeit[oa]\s*(demais|o\s*bolo|a\s*festa)|ficou\s*(lind|maravilhos|perfeit|incr[ií]vel)|elogio/.test(m) && !/quero|queria|pedir|pedido|quanto|pre[cç]o|card[aá]pio|entrega/.test(m)) intents.push('social');
    // Saudações e confirmações (não conta como "unclear")
    if (/^(oi|ol[aá]|e\s*a[ií]|bom\s*dia|boa\s*(tarde|noite)|obrigad|valeu|ok|beleza|sim|n[aã]o|tchau|at[eé]|blz|show|perfeito|pode|isso|certo)\b/i.test(m)) intents.push('geral');
    return intents;
}

// --- Consultas ao Supabase: busca dados reais do negócio ---
async function buildBusinessContext(intents) {
    if (!supabaseAdmin) return '(Dados do cardápio indisponíveis no momento)';

    try {
        // Busca em paralelo: produtos, promoções, taxas, config, horários, status, opções de produto
        const [productsRes, promotionsRes, feesRes, configRes, hoursRes, storeStatusRes, optionsRes, couponsRes] = await Promise.all([
            // Produtos (todos, filtrados depois)
            supabaseAdmin.from('fast_products')
                .select('name, description, price, category, emoji, requires_preorder, is_encomenda, block_massa, block_recheio, visible')
                .order('category').order('name'),
            // Promoções ativas
            supabaseAdmin.from('fast_promotions')
                .select('product_name, discount_type, value, description')
                .eq('active', true),
            // Taxas de entrega por bairro
            supabaseAdmin.from('fast_delivery_fees')
                .select('neighborhood, fee, min_order_value').order('fee').order('neighborhood'),
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
                .select('type, name, visible').eq('visible', true).order('sort_order'),
            // Cupons de desconto ativos
            supabaseAdmin.from('fast_coupons')
                .select('code, discount_type, value, min_order, max_discount_value, expiry_date, active')
                .eq('active', true)
        ]);

        // --- Montagem do contexto de negócio em texto ---
        let ctx = '';

        // ============ CARDÁPIO COMPLETO (todas as categorias) ============
        if (productsRes.data?.length) {
            ctx += '\n\nCARDÁPIO COMPLETO:';
            const grouped = {};
            const unavailable = [];
            for (const p of productsRes.data) {
                if (p.visible === false || p.visible === null) {
                    unavailable.push(p.name);
                    continue;
                }
                // O admin salva combos com categoria 'combo' (singular), mas o cardápio usa 'combos'
                // (plural). Sem normalizar, os combos somem do cardápio enviado à IA. Normaliza aqui.
                const cat = p.category === 'combo' ? 'combos' : p.category;
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(p);
            }
            // Ordem desejada das categorias
            const catOrder = ['salgados', 'mini', 'combos', 'bolos', 'kits', 'bebidas', 'adicionais'];
            const catLabels = { salgados: 'SALGADOS', mini: 'MINI SALGADOS (CENTO/50 UN)', combos: '⚠️ COMBOS FECHADOS (NÃO ALTERAR ITENS NEM PREÇOS)', bolos: 'BOLOS', kits: 'KITS FESTA', bebidas: 'BEBIDAS', adicionais: 'ADICIONAIS' };
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
                    if (cat === 'combos') line += ' [PREÇO FIXO - NÃO SOMAR ITENS]';
                    if ((item.requires_preorder || item.is_encomenda) && !/vulc[aã]o\s*mini|bolo\s*no\s*pote/i.test(item.name)) line += ' [ENCOMENDA - 1 dia antecedência]';
                    if (cat === 'bolos' || cat === 'kits') {
                        if (item.block_massa && item.block_recheio) {
                            line += ' [sem personalização]';
                        } else if (!item.block_recheio) {
                            line += ' [escolhe recheio]';
                        }
                    }
                    ctx += line;
                }
            }
            if (grouped['combos']?.length) {
                ctx += '\n\n  ⛔ REGRA ESTrita PARA COMBOS (Ex: Combo Só pra Mim, Combo Explosão, etc):';
                ctx += '\n  1. Nunca some preços de itens para formar um combo. O preço do combo listado aqui é o ÚNICO que deve ser usado.';
                ctx += '\n  2. Nunca altere os itens de um combo. Eles vêm fechados.';
            }
            if (unavailable.length > 0) {
                ctx += `\n\n[🚨 PRODUTOS OCULTOS/INDISPONÍVEIS (Estão marcados como Venda Pausada). NUNCA OFEREÇA nem mostre o preço de: ${unavailable.join(', ')} — Diga sempre que não temos ou estão esgotados no momento.]`;
                const specialUnavailable = unavailable.filter(n => /vulc[aã]o\s*mini|bolo\s*(no|de)\s*pote/i.test(n));
                if (specialUnavailable.length > 0) {
                    ctx += `\n[⛔ ATENÇÃO: ${specialUnavailable.join(' e ')} está(estão) INDISPONÍVEL(IS) no momento. IGNORE as exceções do prompt sobre esses produtos. NÃO ofereça, NÃO informe preço. Diga que está esgotado/indisponível.]`;
                }
            }
        }

        // ============ OPÇÕES DE PERSONALIZAÇÃO (recheios, sabores) ============
        if (optionsRes.data?.length) {
            const optGrouped = {};
            for (const o of optionsRes.data) {
                if (!optGrouped[o.type]) optGrouped[o.type] = [];
                optGrouped[o.type].push(o.name);
            }
            ctx += '\n\nOPÇÕES DE PERSONALIZAÇÃO:';
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

        // ============ PROMOÇÕES ATIVAS (APENAS SITE) ============
        if (promotionsRes.data?.length) {
            ctx += '\n\nPROMOÇÕES ATIVAS (⛔ VÁLIDAS APENAS PARA PEDIDOS PELO SITE — NÃO aplicar no WhatsApp):';
            for (const p of promotionsRes.data) {
                const desc = p.discount_type === 'percentage' ? `${p.value}% OFF` : `R$ ${Number(p.value).toFixed(2)} OFF`;
                ctx += `\n  ${p.product_name}: ${desc}${p.description ? ' (' + p.description + ')' : ''}`;
            }
            ctx += '\n  ⛔ REGRA CRÍTICA: Promoções são EXCLUSIVAS para pedidos feitos pelo SITE. No WhatsApp, SEMPRE informe o PREÇO CHEIO (sem desconto). Se o cliente pedir desconto, diga que não está autorizado, mas que há descontos especiais no site e indique os cupons ativos.';
            ctx += '\n  ⚠️ Promoções NÃO se aplicam a combos. Combos já têm preço fixo próprio — use o preço do combo direto, sem somar itens nem aplicar descontos.';
        }

        // ============ CUPONS DE DESCONTO (SITE) ============
        console.log('[buildBusinessContext] couponsRes:', JSON.stringify({ data: couponsRes.data, error: couponsRes.error }));
        if (couponsRes.data?.length) {
            const today = new Date().toISOString().split('T')[0];
            console.log('[buildBusinessContext] today:', today, 'coupons raw:', couponsRes.data.map(c => ({ code: c.code, active: c.active, expiry: c.expiry_date })));
            const validCoupons = couponsRes.data.filter(c => !c.expiry_date || c.expiry_date.split('T')[0] >= today);
            if (validCoupons.length) {
                ctx += '\n\nCUPONS DE DESCONTO (válidos para pedidos pelo SITE):';
                for (const c of validCoupons) {
                    const desc = c.discount_type === 'percentage' ? `${c.value}% OFF` : `R$ ${Number(c.value).toFixed(2)} OFF`;
                    let line = `\n  🎟️ ${c.code}: ${desc}`;
                    if (Number(c.min_order) > 0) line += ` (pedido mínimo R$ ${Number(c.min_order).toFixed(2)})`;
                    if (c.max_discount_value) line += ` (máx desconto R$ ${Number(c.max_discount_value).toFixed(2)})`;
                    if (c.expiry_date) line += ` — válido até ${c.expiry_date.split('T')[0].split('-').reverse().join('/')}`;
                    ctx += line;
                }
                ctx += '\n  ⚠️ Cupons são válidos APENAS para pedidos feitos pelo site. Cada cupom só pode ser usado 1 vez por telefone.';
            }
        }

        // ============ TAXAS DE ENTREGA POR BAIRRO ============
        // Separamos bairros com entrega grátis e bairros com taxa (mototáxi)
        if (feesRes.data?.length) {
            ctx += '\n\nENTREGA POR BAIRRO (salgados, mini salgados, bebidas, combos e Vulcão Mini):';
            ctx += '\n  ⚠️ Cada bairro tem TAXA DE ENTREGA (valor cobrado pela mototáxi) e PEDIDO MÍNIMO (uso interno). ⛔ REGRA: SÓ mencione o pedido mínimo se o pedido do cliente for MENOR que o mínimo do bairro. Se o pedido já for MAIOR ou IGUAL, NÃO mencione o mínimo — é informação interna que o cliente NÃO precisa saber.';
            // Lista cada bairro com taxa E mínimo na mesma linha para evitar confusão
            for (const f of feesRes.data) {
                const fee = Number(f.fee);
                const min = f.min_order_value ? Number(f.min_order_value) : 0;
                const name = f.neighborhood.charAt(0).toUpperCase() + f.neighborhood.slice(1);
                let line = `\n  ${name}: TAXA `;
                if (fee === 0) {
                    line += 'GRÁTIS';
                } else {
                    line += `R$ ${fee.toFixed(2)}`;
                }
                if (min > 0) {
                    line += ` (pedido mín. R$ ${min.toFixed(2)})`;
                }
                ctx += line;
            }
            const defaultFee = configRes.data?.default_delivery_fee ?? 8;
            ctx += `\n  ⚠️ Bairro NÃO listado (SE FOR EM ITAMARAJU): TAXA padrão R$ ${Number(defaultFee).toFixed(2)}.`;
            ctx += '\n  🚨 NUNCA aceite entrega para cidades vizinhas (como Prado, Guarani, etc). SÓ entregamos na zona urbana de ITAMARAJU.';
        }

        // ============ CONFIGURAÇÕES DA LOJA ============
        if (configRes.data) {
            const c = configRes.data;
            ctx += `\n\nTAXAS DE CARTÃO: 1x = ${c.card_fee_1x}% | 2x = ${c.card_fee_2x}%`;
            ctx += '\n  (taxa de cartão é cobrada sobre o valor do pedido, NÃO sobre a taxa de entrega)';
            if (!c.delivery_enabled) {
                ctx += `\n\n⛔ ENTREGAS TEMPORARIAMENTE SUSPENSAS${c.delivery_disabled_reason ? ' (' + c.delivery_disabled_reason + ')' : ''}.`;
                ctx += '\n  - No momento atendemos APENAS RETIRADA na loja (Rua Palmeiras, 105, Novo Prado).';
                ctx += '\n  - Se o cliente perguntar sobre ENTREGA: informe que as entregas estão temporariamente suspensas e retornarão assim que tudo for normalizado. ⛔ NÃO prometa horário de volta das entregas (ex: "a partir das 14h"), NÃO dê previsão de quando volta.';
                ctx += '\n  - Você PODE combinar horário de RETIRADA normalmente, dentro do horário de funcionamento. Apenas NÃO confunda retirada com entrega.';
            }
        }

        // ============ REGRAS DE PEDIDO / AGENDAMENTO ============
        ctx += '\n\nREGRAS DE PEDIDO E AGENDAMENTO:';
        ctx += '\n  - Bolos (exceto Vulcão Mini) e Kits Festa: NÃO podem ser feitos para o mesmo dia. Se o cliente pedir para HOJE, recuse. Se já pediu para data futura, confirme normalmente SEM repetir regra de antecedência. Apenas RETIRADA na loja (Rua Palmeiras, 105, Novo Prado). NUNCA sugira entrega para eles.';
        ctx += '\n  - PEDIDO MISTO COM BOLO: Se o pedido incluir bolo grande OU kit festa junto com salgados/bebidas, o PEDIDO INTEIRO é apenas retirada. NÃO ofereça entrega separada para os salgados.';
        ctx += '\n  - Bolo Vulcão Mini (R$ 15,00): exceção — NÃO precisa de antecedência, pode ser pedido para HOJE (verificar disponibilidade). Pode ser ENTREGUE junto com salgados/bebidas.';
        ctx += '\n  - Salgados, mini salgados, bebidas, combos: podem ser pedidos para o MESMO DIA.';
        ctx += '\n    • ENTREGA (Mototáxi): das 7h às 18h, segunda a sábado, bairros listados, com taxa. (Aceite o horário que o cliente pedir dentro deste intervalo, não force para a tarde).';
        ctx += '\n    • RETIRADA: 7h–18h na loja (Rua Palmeiras, 105, Novo Prado).';
        ctx += '\n\nVALOR MÍNIMO POR FAIXA DE HORÁRIO (retirada):';
        if (configRes.data) {
            const c = configRes.data;
            const minNormal = c.min_order_pickup || 8;
            const minOff = c.min_order_pickup_offhours || 15;
            const minMorning = c.morning_rule_min_value || 25;
            ctx += `\n  • Retirada 7h–11h (sem bolo): mínimo do carrinho = R$ ${Number(minMorning).toFixed(2)}`;
            ctx += `\n  • Retirada 11h–14h: mínimo do carrinho = R$ ${Number(minOff).toFixed(2)}`;
            ctx += `\n  • Retirada 14h–18h: mínimo do carrinho = R$ ${Number(minNormal).toFixed(2)}`;
        }
        ctx += '\n\n  - Pagamento Antecipado (Entrada) — SÓ PARA AGENDAMENTOS: Para ENCOMENDAS/AGENDAMENTOS com total acima de R$ 50,00, é OBRIGATÓRIA 50% de entrada para confirmar. Para pedidos do MESMO DIA (entrega/retirada hoje), NÃO peça entrada — cobre integral ou combine dinheiro na entrega. Se cliente recusar entrada em agendamento, passe para Jéssica.';

        // ============ HORÁRIOS DE FUNCIONAMENTO ============
        if (hoursRes.data?.length) {
            ctx += '\n\nHORÁRIO DE FUNCIONAMENTO:';
            for (const h of hoursRes.data) {
                ctx += h.is_open
                    ? `\n  ${h.day_name}: ${h.open_time} às ${h.close_time}`
                    : `\n  ${h.day_name}: FECHADO`;
            }
            ctx += '\n  🚨 IMPORTANTE: Segunda a sábado, funcionamos até as 18:00.';
            ctx += '\n  ⛔ ATENÇÃO: Esses horários (14h–18h) são para DELIVERY/pedidos do mesmo dia. Retirada de ENCOMENDAS agendadas pode ser das 7h às 18h.';
        }

        // ============ SITUAÇÃO DE HOJE (domingo / feriado / fechamento admin) ============
        // Identifica se hoje é dia de não-funcionamento e instrui a IA a NÃO bloquear info
        const baFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', weekday: 'long' });
        const todayWeekday = baFormatter.format(new Date()).toLowerCase();
        const todayHours = hoursRes.data?.find(h => h.day_name.toLowerCase() === todayWeekday);
        const closedByAdmin = storeStatusRes.data?.is_closed;
        const closedBySchedule = todayHours && !todayHours.is_open;

        // Detecta feriados nacionais 2026
        const nowBA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
        const todayMMDD = String(nowBA.getMonth() + 1).padStart(2, '0') + '-' + String(nowBA.getDate()).padStart(2, '0');
        const feriados2026 = {
            '01-01': 'Confraternização Universal', '04-03': 'Sexta-feira Santa', '04-21': 'Tiradentes',
            '05-01': 'Dia do Trabalho', '06-04': 'Corpus Christi', '09-07': 'Independência do Brasil',
            '10-12': 'Nossa Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República',
            '11-20': 'Consciência Negra', '12-25': 'Natal'
        };
        const feriadoHoje = feriados2026[todayMMDD] || null;

        if (feriadoHoje) {
            ctx += `\n\n🎌 HOJE É FERIADO NACIONAL: ${feriadoHoje}. Pedidos para HOJE precisam de aprovação da proprietária Jéssica (mesma regra de domingo). Horário especial: 9h às 17h30.`;
        }

        if (closedByAdmin || closedBySchedule) {
            ctx += '\n\nSITUAÇÃO DE HOJE:';
            if (closedByAdmin) {
                ctx += '\n  Loja FECHADA hoje (decisão da administração).';
            } else {
                ctx += `\n  Hoje é ${todayWeekday} e estamos fechados.`;
            }
            ctx += '\n  Comportamento:';
            ctx += '\n  - Informe UMA VEZ de forma curta: "Encerramos por hoje! Gostaria de agendar para outro dia?" (máx 2 linhas).';
            ctx += '\n  - Se o cliente insistir que queria para hoje: "Que pena! Amanhã estaremos na ativa das 14h às 18h 😊" — NÃO repita a oferta de agendamento.';
            ctx += '\n  - Se o cliente quiser agendar: siga o roteiro normalmente (pergunte data, produto, etc).';
            ctx += '\n  - Responda preços, cardápio e regras NORMALMENTE.';
            ctx += '\n  - ⛔ NÃO fique repetindo que está fechado a cada mensagem. Uma vez basta.';
        } else if (todayHours && todayHours.is_open) {
            // Loja está aberta hoje — calcula se AGORA está dentro do expediente
            const nowBA = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
            const nowMinutes = nowBA.getHours() * 60 + nowBA.getMinutes();
            const [openH, openM] = (todayHours.open_time || '07:00').split(':').map(Number);
            const [closeH, closeM] = (todayHours.close_time || '18:00').split(':').map(Number);
            const openMinutes = openH * 60 + (openM || 0);
            const closeMinutes = closeH * 60 + (closeM || 0);
            if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
                ctx += `\n\nSITUAÇÃO DE HOJE: LOJA ABERTA AGORA (${todayHours.open_time} às ${todayHours.close_time}). Pedidos para hoje são aceitos normalmente até ${todayHours.close_time}.`;
            } else if (nowMinutes >= closeMinutes) {
                ctx += `\n\nSITUAÇÃO DE HOJE: Expediente de hoje (${todayHours.open_time} às ${todayHours.close_time}) já encerrou. Se o cliente pedir para HOJE, informe UMA VEZ de forma curta e simpática (ex: "Já encerramos por hoje! Amanhã estaremos na ativa das 14h às 18h 😊"). NÃO repita essa informação a cada mensagem. Se o cliente quiser agendar, ajude normalmente.`;
            } else {
                ctx += `\n\nSITUAÇÃO DE HOJE: Loja ainda não abriu (abre às ${todayHours.open_time}). Aceite agendamentos.`;
            }
        }
        ctx += '\n\n⚠️ REGRA MINI SALGADOS >100 PERTO DO FECHAMENTO: Salgados são fritos na hora. Se pedido tiver MAIS de 100 mini salgados e for após 17:40, avise que precisa da aprovação da Jéssica (proprietária) para confirmar se dá tempo de preparar. Até 100 unidades ou antes desse horário: aceitar normalmente.';

        return ctx || '(Sem dados adicionais)';
    } catch (err) {
        console.error('[manychat-api:gemini] Erro ao buscar contexto do Supabase:', err.message);
        return '(Erro ao carregar dados do cardápio)';
    }
}

// ==========================================
// MESSAGE BUFFER SYSTEM (Phase 1 — text only)
// ==========================================
// When enabled, incoming text messages are buffered per user.
// The function waits buffer_delay_seconds, then checks if newer
// messages arrived. Only the LAST function invocation processes
// the consolidated batch. Earlier invocations return empty.
// Feature flag: message_buffer_enabled (default false = zero risk).

// Cache bot config for 60s to avoid hitting DB on every request
let _botConfigCache = null;
let _botConfigCacheTs = 0;
const BOT_CONFIG_CACHE_TTL = 60000; // 60s

const BOT_CONFIG_DEFAULTS = {
    enabled: false,              // buffer feature flag
    delaySeconds: 5,             // buffer delay
    mediaProcessingEnabled: true,// process images/PDFs instead of fallback
    aiModelPrimary: 'gemini-2.5-flash-lite',
    aiModelMultimodal: 'gemini-2.5-flash',
    aiTemperature: 0.7,
    aiMaxOutputTokens: 2048
};

async function loadBotConfig() {
    const now = Date.now();
    if (_botConfigCache && (now - _botConfigCacheTs) < BOT_CONFIG_CACHE_TTL) {
        return _botConfigCache;
    }
    if (!supabaseAdmin) return { ...BOT_CONFIG_DEFAULTS };
    try {
        const { data, error } = await supabaseAdmin
            .from('fast_store_config')
            .select('message_buffer_enabled, message_buffer_delay_seconds, media_processing_enabled, ai_model_primary, ai_model_multimodal, ai_temperature, ai_max_output_tokens')
            .eq('id', 1)
            .maybeSingle();
        if (error) {
            console.warn('[config] loadBotConfig DB error (columns may not exist yet):', error.message);
            _botConfigCache = { ...BOT_CONFIG_DEFAULTS };
        } else {
            _botConfigCache = {
                enabled: data?.message_buffer_enabled === true,
                delaySeconds: Math.max(2, Math.min(15, parseInt(data?.message_buffer_delay_seconds) || 5)),
                mediaProcessingEnabled: data?.media_processing_enabled !== false,
                aiModelPrimary: data?.ai_model_primary || BOT_CONFIG_DEFAULTS.aiModelPrimary,
                aiModelMultimodal: data?.ai_model_multimodal || BOT_CONFIG_DEFAULTS.aiModelMultimodal,
                aiTemperature: parseFloat(data?.ai_temperature) || BOT_CONFIG_DEFAULTS.aiTemperature,
                aiMaxOutputTokens: parseInt(data?.ai_max_output_tokens) || BOT_CONFIG_DEFAULTS.aiMaxOutputTokens
            };
        }
        _botConfigCacheTs = now;
        return _botConfigCache;
    } catch (err) {
        console.error('[config] loadBotConfig exception:', err.message);
        return { ...BOT_CONFIG_DEFAULTS };
    }
}

// Backward-compatible alias
async function loadBufferConfig() { return loadBotConfig(); }

// ==========================================
// MEDIA-TO-TEXT UTILITIES
// ==========================================
// Reusable functions that convert media (audio, image, PDF) to text
// using Gemini multimodal. Used both by buffer pipeline and handleGeminiCore.

async function fetchMediaAsBase64(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[media] Fetch failed (HTTP ${res.status}) for: ${url.substring(0, 100)}`);
            return null;
        }
        const buffer = await res.arrayBuffer();
        const mimeType = res.headers.get('content-type') || 'application/octet-stream';
        return {
            base64: Buffer.from(buffer).toString('base64'),
            mimeType,
            byteLength: buffer.byteLength
        };
    } catch (e) {
        clearTimeout(timer);
        const reason = e.name === 'AbortError' ? 'TIMEOUT' : e.message;
        console.warn(`[media] Fetch error (${reason}) for: ${url.substring(0, 100)}`);
        return null;
    }
}

async function callGeminiMultimodal(apiKey, modelName, inlineData, promptText, maxTokens = 512, timeoutMs = 12000) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const body = {
        contents: [{ parts: [
            { inlineData: { mimeType: inlineData.mimeType, data: inlineData.base64 } },
            { text: promptText }
        ]}],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 }
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify(body)
        });
        clearTimeout(timer);
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.warn(`[media] Gemini multimodal failed (HTTP ${res.status}): ${errBody.substring(0, 300)}`);
            return null;
        }
        const data = await res.json();
        // Debug: log blockReason/finishReason for failed responses
        const candidate = data?.candidates?.[0];
        if (candidate && !candidate?.content?.parts?.[0]?.text) {
            const blockReason = data?.promptFeedback?.blockReason || candidate?.finishReason || 'unknown';
            console.warn(`[media] Gemini multimodal empty content. blockReason=${blockReason}, model=${modelName}`);
        }
        const text = candidate?.content?.parts?.[0]?.text;
        return text && text.trim().length > 0 ? text.trim() : null;
    } catch (e) {
        clearTimeout(timer);
        const reason = e.name === 'AbortError' ? 'TIMEOUT' : e.message;
        console.warn(`[media] Gemini multimodal error (${reason})`);
        return null;
    }
}

async function transcribeAudio(audioUrl, apiKey, multimodalModel) {
    console.log(`[media] 🎤 Transcribing audio: ${audioUrl.substring(0, 80)}...`);
    const media = await fetchMediaAsBase64(audioUrl, 8000);
    if (!media) {
        console.warn('[media] 🎤 Audio download failed');
        return null;
    }
    // Normalize mime type for audio
    let mime = media.mimeType;
    if (!mime.startsWith('audio/')) mime = 'audio/ogg';
    console.log(`[media] 🎤 Audio downloaded: ${media.byteLength} bytes, mime: ${mime}`);

    // Attempt 1: primary model
    let text = await callGeminiMultimodal(
        apiKey, multimodalModel,
        { base64: media.base64, mimeType: mime },
        'Transcreva o áudio acima em texto, em português. Retorne APENAS a transcrição, sem explicações.',
        512, 12000
    );

    // Attempt 2: retry with different prompt if first attempt returned empty
    if (!text) {
        console.log('[media] 🎤 Retry with alternative prompt...');
        text = await callGeminiMultimodal(
            apiKey, multimodalModel,
            { base64: media.base64, mimeType: mime },
            'O áudio acima é de um cliente de uma lanchonete. Transcreva o que a pessoa disse em português. Se não entender, escreva "[áudio inaudível]".',
            512, 12000
        );
    }

    // Attempt 3: try fallback model (gemini-2.5-flash) if multimodal model different
    if (!text && multimodalModel !== 'gemini-2.5-flash') {
        console.log('[media] 🎤 Retry with fallback model gemini-2.5-flash...');
        text = await callGeminiMultimodal(
            apiKey, 'gemini-2.5-flash',
            { base64: media.base64, mimeType: mime },
            'Transcreva o áudio acima em texto, em português. Retorne APENAS a transcrição.',
            512, 12000
        );
    }

    if (text && text !== '[áudio inaudível]') {
        console.log(`[media] 🎤 ✅ Transcription OK: "${text.substring(0, 100)}"`);
    } else {
        console.warn(`[media] 🎤 Transcription failed after retries (text=${text || 'null'})`);
        text = null;
    }
    return text;
}

async function describeImage(imageUrl, apiKey, multimodalModel) {
    console.log(`[media] 🖼️ Describing image: ${imageUrl.substring(0, 80)}...`);
    const media = await fetchMediaAsBase64(imageUrl, 8000);
    if (!media) return null;
    let mime = media.mimeType;
    if (!mime.startsWith('image/')) mime = 'image/jpeg';
    console.log(`[media] 🖼️ Image downloaded: ${media.byteLength} bytes, mime: ${mime}`);
    const text = await callGeminiMultimodal(
        apiKey, multimodalModel,
        { base64: media.base64, mimeType: mime },
        'Analise esta imagem e descreva o conteúdo de forma concisa em português. Se contém texto (print de tela, cardápio, lista de produtos, conversa), extraia o texto relevante. Se é uma foto de produto, comida ou cenário, descreva brevemente. SOMENTE se for CLARAMENTE um comprovante bancário/recibo de pagamento (com dados de transferência, valor pago, data, instituição financeira), diga "COMPROVANTE DE PAGAMENTO" e extraia: valor, data, favorecido. Se NÃO for claramente um recibo bancário, NÃO diga "COMPROVANTE DE PAGAMENTO".',
        1024, 12000
    );
    if (text) console.log(`[media] 🖼️ ✅ Image description OK: "${text.substring(0, 100)}"`);
    else console.warn('[media] 🖼️ Image description failed or empty');
    return text;
}

async function extractPdfText(pdfUrl, apiKey, multimodalModel) {
    console.log(`[media] 📄 Extracting PDF text: ${pdfUrl.substring(0, 80)}...`);
    const media = await fetchMediaAsBase64(pdfUrl, 10000);
    if (!media) return null;
    console.log(`[media] 📄 PDF downloaded: ${media.byteLength} bytes`);
    const text = await callGeminiMultimodal(
        apiKey, multimodalModel,
        { base64: media.base64, mimeType: 'application/pdf' },
        'Extraia todo o texto relevante deste documento PDF. Retorne o conteúdo em texto puro, em português, de forma organizada.',
        2048, 15000
    );
    if (text) console.log(`[media] 📄 ✅ PDF extraction OK: "${text.substring(0, 100)}"`);
    else console.warn('[media] 📄 PDF extraction failed or empty');
    return text;
}

// Detect media type and URL from request body
function detectMediaInfo(reqBody, trimmedMessage) {
    const { attachments, audio_url, image_url, file_url } = reqBody || {};
    const mediaAttachment = attachments?.[0] || null;

    // Audio detection
    const audioUrlInMessage = trimmedMessage.match(/https?:\/\/[^\s]+\.(ogg|mp3|m4a|opus|wav|webm|aac|oga)(\?[^\s]*)?/i);
    const detectedAudioUrl = audio_url
        || (mediaAttachment?.type === 'audio' ? mediaAttachment?.url : null)
        || (audioUrlInMessage ? audioUrlInMessage[0] : null);
    const looksLikeAudio = /\[áudio\]|\[audio\]|\[voice\]|\[ptt\]/i.test(trimmedMessage);
    const hasAudio = !!(detectedAudioUrl || looksLikeAudio);

    // Image detection
    const detectedImageUrl = image_url || (mediaAttachment?.type === 'image' ? mediaAttachment?.url : null);
    const looksLikeImage = /\[foto\]|\[photo\]|\[image\]|\[imagem\]|\[sticker\]/i.test(trimmedMessage);
    const hasImage = !!(detectedImageUrl || looksLikeImage);

    // File/PDF detection
    const detectedFileUrl = file_url || (mediaAttachment?.type === 'file' ? mediaAttachment?.url : null);
    const looksLikeFile = /\[arquivo\]|\[file\]|\[pdf\]|\[document\]/i.test(trimmedMessage);
    const hasFile = !!(detectedFileUrl || looksLikeFile);

    // Determine primary media type
    let mediaType = null;
    let mediaUrl = null;
    if (hasAudio) { mediaType = 'audio'; mediaUrl = detectedAudioUrl; }
    else if (hasImage) { mediaType = 'image'; mediaUrl = detectedImageUrl; }
    else if (hasFile) { mediaType = 'file'; mediaUrl = detectedFileUrl; }

    return { mediaType, mediaUrl, hasAudio, hasImage, hasFile, looksLikeAudio, looksLikeImage, looksLikeFile, audioUrlInMessage };
}

// Convert any media to text. Returns { text, type } or null if no media.
async function convertMediaToText(reqBody, trimmedMessage, apiKey, multimodalModel, mediaProcessingEnabled) {
    const info = detectMediaInfo(reqBody, trimmedMessage);
    if (!info.mediaType) return null; // No media detected

    console.log(`[media] Detected ${info.mediaType} (url: ${info.mediaUrl ? 'yes' : 'no'}, processing: ${mediaProcessingEnabled})`);

    // Audio — always attempt transcription (already worked before Phase 2)
    if (info.mediaType === 'audio') {
        if (info.mediaUrl) {
            const transcription = await transcribeAudio(info.mediaUrl, apiKey, multimodalModel);
            if (transcription) {
                return { text: transcription, type: 'audio', originalUrl: info.mediaUrl };
            }
        }
        // Transcription failed or no URL — check if there's real text alongside
        if (!trimmedMessage || trimmedMessage.length < 3 || info.looksLikeAudio || info.audioUrlInMessage) {
            return { text: null, type: 'audio_failed' }; // Caller should send fallback
        }
        return null; // Has real text alongside, process as text
    }

    // Image — process if enabled, otherwise fallback
    if (info.mediaType === 'image') {
        if (mediaProcessingEnabled && info.mediaUrl) {
            const description = await describeImage(info.mediaUrl, apiKey, multimodalModel);
            if (description) {
                return { text: `[O cliente enviou uma imagem. Conteúdo: ${description}]`, type: 'image', originalUrl: info.mediaUrl };
            }
        }
        return { text: null, type: 'image_failed' }; // Caller sends fallback
    }

    // File/PDF — process if enabled, otherwise fallback
    if (info.mediaType === 'file') {
        if (mediaProcessingEnabled && info.mediaUrl) {
            // Detect if it's a PDF by URL or mime type
            const isPdf = /\.pdf(\?|$)/i.test(info.mediaUrl);
            if (isPdf) {
                const pdfText = await extractPdfText(info.mediaUrl, apiKey, multimodalModel);
                if (pdfText) {
                    return { text: `[O cliente enviou um documento PDF. Conteúdo: ${pdfText}]`, type: 'pdf', originalUrl: info.mediaUrl };
                }
            } else {
                // Non-PDF file — try image processing as fallback (could be screenshot, etc.)
                const description = await describeImage(info.mediaUrl, apiKey, multimodalModel);
                if (description) {
                    return { text: `[O cliente enviou um arquivo. Conteúdo: ${description}]`, type: 'file', originalUrl: info.mediaUrl };
                }
            }
        }
        return { text: null, type: 'file_failed' }; // Caller sends fallback
    }

    return null;
}

async function bufferMessage(userId, userName, messageText) {
    if (!supabaseAdmin) return null;
    try {
        const { data, error } = await supabaseAdmin
            .from('fast_message_buffer')
            .insert({
                user_id: userId,
                user_name: userName || null,
                message: messageText,
                message_type: 'text',
                created_at: new Date().toISOString()
            })
            .select('id, created_at')
            .single();
        if (error) {
            console.error('[buffer] bufferMessage insert error:', error.message);
            return null;
        }
        console.log(`[buffer] Buffered msg id=${data.id} for user=${userId}, created_at=${data.created_at}`);
        return data;
    } catch (err) {
        console.error('[buffer] bufferMessage exception:', err.message);
        return null;
    }
}

async function claimAndConsolidateBuffer(userId, myMsgId) {
    if (!supabaseAdmin) return null;
    try {
        // Generate unique batch ID
        const batchId = `batch_${userId}_${Date.now()}`;

        // Atomically claim all unprocessed messages for this user
        // Only claim if our message is still the latest (no newer unprocessed msg exists)
        const { data: newerCheck } = await supabaseAdmin
            .from('fast_message_buffer')
            .select('id')
            .eq('user_id', userId)
            .is('processed_at', null)
            .is('batch_id', null)
            .gt('id', myMsgId)
            .limit(1);

        if (newerCheck && newerCheck.length > 0) {
            console.log(`[buffer] Newer msg exists (id=${newerCheck[0].id} > ${myMsgId}), bailing out`);
            return null; // Newer message exists — bail out
        }

        // Claim the batch: set batch_id on all unprocessed messages for this user
        const { data: claimed, error: claimErr } = await supabaseAdmin
            .from('fast_message_buffer')
            .update({ batch_id: batchId })
            .eq('user_id', userId)
            .is('processed_at', null)
            .is('batch_id', null)
            .select('id, message, created_at')
            .order('created_at', { ascending: true });

        if (claimErr) {
            console.error('[buffer] claimAndConsolidate claim error:', claimErr.message);
            return null;
        }

        if (!claimed || claimed.length === 0) {
            console.warn(`[buffer] No messages to claim for user=${userId} (already claimed by another invocation)`);
            return null; // Already claimed by concurrent invocation
        }

        console.log(`[buffer] Claimed ${claimed.length} messages for user=${userId}, batchId=${batchId}`);

        // Consolidate messages in chronological order
        const consolidatedText = claimed.map(m => m.message).join('\n');

        // Mark batch as processed
        await supabaseAdmin
            .from('fast_message_buffer')
            .update({ processed_at: new Date().toISOString() })
            .eq('batch_id', batchId);

        return {
            batchId,
            messageCount: claimed.length,
            consolidatedText,
            messageIds: claimed.map(m => m.id)
        };
    } catch (err) {
        console.error('[buffer] claimAndConsolidateBuffer exception:', err.message);
        return null;
    }
}

// Empty response for buffered messages — ManyChat gets immediate reply (no timeout)
const BUFFER_EMPTY_RESPONSE = {
    version: 'v2',
    content: { messages: [], actions: [], quick_replies: [] },
    buffered: true,
    handover_to_human: false,
    order_ready: false,
    order_summary: null
};

// Send consolidated reply to user via ManyChat Send Content API (async delivery)
// Accepts either a plain text string OR a full ManyChat content object { messages, actions, quick_replies }
async function sendBufferReplyViaManyChat(subscriberId, contentOrText) {
    const apiKey = process.env.MANYCHAT_API_KEY;
    if (!apiKey) {
        console.warn('[buffer] MANYCHAT_API_KEY not set, cannot send reply');
        return false;
    }
    // Build content: accept string (legacy) or full content object
    let content;
    if (typeof contentOrText === 'string') {
        content = { messages: [{ type: 'text', text: contentOrText }], actions: [], quick_replies: [] };
    } else if (contentOrText?.messages) {
        content = contentOrText;
    } else {
        console.warn('[buffer] sendBufferReplyViaManyChat: invalid content');
        return false;
    }
    // Filter out empty messages
    if (!content.messages || content.messages.length === 0) {
        console.warn('[buffer] sendBufferReplyViaManyChat: no messages to send');
        return false;
    }
    try {
        const response = await fetch('https://api.manychat.com/fb/sending/sendContent', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscriber_id: subscriberId,
                data: {
                    version: 'v2',
                    content: content
                },
                message_tag: 'ACCOUNT_UPDATE'
            })
        });
        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`[buffer] ManyChat sendContent failed (HTTP ${response.status}): ${errText.substring(0, 300)}`);
            return false;
        }
        console.log(`[buffer] ✅ Reply sent via ManyChat API to user=${subscriberId} (${content.messages.length} msg(s))`);
        return true;
    } catch (err) {
        console.error('[buffer] sendViaManyChat error:', err.message);
        return false;
    }
}

// Mock res object to capture handleGeminiCore output without sending HTTP response
function createMockRes() {
    const mock = { _statusCode: 200, _body: null };
    mock.status = function(code) { mock._statusCode = code; return mock; };
    mock.json = function(body) { mock._body = body; return mock; };
    mock.end = function() { return mock; };
    mock.setHeader = function() { return mock; };
    return mock;
}

async function handleGemini(req, res) {
    const { message, user_id, attachments, audio_url, image_url, file_url } = req.body || {};
    const rawMessage = message || req.body?.text || req.body?.content || '';
    const trimmed = rawMessage.trim();

    // --- Load bot config (buffer + AI + media settings) ---
    const botConfig = await loadBotConfig();

    // --- Phase 2: Detect media and convert to text BEFORE buffering ---
    const mediaInfo = detectMediaInfo(req.body, trimmed);
    const isMediaMessage = !!mediaInfo.mediaType;

    // Buffer OFF → pass through to core (zero change in behavior)
    if (!botConfig.enabled) {
        console.log('[buffer] Feature flag OFF — passing through to core');
        return handleGeminiCore(req, res);
    }

    // --- Buffer is enabled ---
    if (!user_id) {
        console.warn('[buffer] No user_id, cannot buffer — passing through');
        return handleGeminiCore(req, res);
    }

    // If media message: convert to text first, then buffer the converted text
    let textToBuffer = trimmed;
    let mediaType = null;

    if (isMediaMessage) {
        console.log(`[buffer] Media message detected (${mediaInfo.mediaType}), converting to text before buffering...`);
        const apiKey = process.env.GEMINI_API_KEY;
        const multimodalModel = botConfig.aiModelMultimodal || GEMINI_MODEL_MULTIMODAL;

        if (apiKey) {
            const mediaResult = await convertMediaToText(req.body, trimmed, apiKey, multimodalModel, botConfig.mediaProcessingEnabled);
            if (mediaResult?.text) {
                textToBuffer = mediaResult.text;
                mediaType = mediaResult.type;
                console.log(`[buffer] ✅ Media (${mediaType}) → text: "${textToBuffer.substring(0, 80)}"`);
                // Update req.body.message so handleGeminiCore also sees converted text
                req.body.message = textToBuffer;
            } else if (mediaResult) {
                // Conversion failed — pass through to core (which handles fallback)
                console.log(`[buffer] Media conversion failed (${mediaResult.type}) — passing through to core for fallback`);
                return handleGeminiCore(req, res);
            }
            // mediaResult === null means no media detected (shouldn't happen here), fall through
        } else {
            // No API key — can't convert, pass through
            return handleGeminiCore(req, res);
        }
    }

    if (!textToBuffer || textToBuffer.length < 2) {
        console.log('[buffer] Message too short to buffer — passing through');
        return handleGeminiCore(req, res);
    }

    console.log(`[buffer] === BUFFER ACTIVE (delay=${botConfig.delaySeconds}s) === user=${user_id}, msg="${textToBuffer.substring(0, 60)}"${mediaType ? ` [${mediaType}]` : ''}`);

    // 1. Store message (or converted media text) in buffer
    const buffered = await bufferMessage(user_id, req.body?.name, textToBuffer);
    if (!buffered) {
        console.warn('[buffer] Failed to buffer message — falling back to core');
        return handleGeminiCore(req, res);
    }

    // 2. Return IMMEDIATELY to ManyChat (prevents webhook timeout)
    //    Then continue processing async — Vercel keeps function alive for up to maxDuration (30s)
    res.status(200).json(BUFFER_EMPTY_RESPONSE);
    console.log(`[buffer] Returned empty response immediately, now waiting ${botConfig.delaySeconds}s async...`);

    // --- ASYNC PROCESSING (after HTTP response sent) ---
    try {
        await new Promise(resolve => setTimeout(resolve, botConfig.delaySeconds * 1000));

        // 3. Check if newer messages arrived
        const batch = await claimAndConsolidateBuffer(user_id, buffered.id);
        if (!batch) {
            console.log(`[buffer] Bailing out for user=${user_id}, msg id=${buffered.id} — newer msg will process`);
            return; // Another invocation will handle it
        }

        // 4. This is the LAST message — process consolidated text through Gemini
        console.log(`[buffer] ✅ Processing batch for user=${user_id}: ${batch.messageCount} msgs, batchId=${batch.batchId}`);
        console.log(`[buffer] Consolidated: "${batch.consolidatedText.substring(0, 120)}"`);

        req.body.message = batch.consolidatedText;

        // Use mock res to capture Gemini's response (real res already sent)
        const mockRes = createMockRes();
        await handleGeminiCore(req, mockRes);

        // 5. Send the captured response to user via ManyChat Send Content API
        if (mockRes._body?.content?.messages?.length > 0) {
            const sent = await sendBufferReplyViaManyChat(user_id, mockRes._body.content);
            if (!sent) {
                console.error(`[buffer] ❌ Failed to send reply via ManyChat API for user=${user_id}`);
            }
        } else {
            console.warn(`[buffer] handleGeminiCore produced no messages for user=${user_id}`);
        }
    } catch (err) {
        console.error(`[buffer] Async processing error for user=${user_id}:`, err.message);
    }
}

async function handleGeminiCore(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[manychat-api:gemini] GEMINI_API_KEY não configurada');
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { message, name, user_id, attachments, media_url, audio_url, image_url, file_url } = req.body || {};

    const SITE_URL = 'https://fastsavorys.vercel.app/pages/fast.html';

    console.log('[gemini] req.body:', JSON.stringify(req.body || {}));

    const rawMessage = message || req.body?.text || req.body?.content || '';
    const trimmed = rawMessage.trim();

    // --- Load bot config for media processing settings ---
    const botConfig = await loadBotConfig();
    const multimodalModel = botConfig.aiModelMultimodal || GEMINI_MODEL_MULTIMODAL;

    // --- Phase 2: Unified media-to-text conversion ---
    // Uses reusable utility functions (transcribeAudio, describeImage, extractPdfText)
    const mediaResult = await convertMediaToText(req.body, trimmed, apiKey, multimodalModel, botConfig.mediaProcessingEnabled);

    if (mediaResult) {
        if (mediaResult.text) {
            // Media successfully converted to text — use it as the message
            console.log(`[gemini] ✅ Media (${mediaResult.type}) converted to text: "${mediaResult.text.substring(0, 100)}"`);
        } else {
            // Media detected but conversion failed — send appropriate fallback
            const fallbackMessages = {
                'audio_failed': 'Recebi seu áudio! 🎤 Infelizmente não consegui entender dessa vez. Pode repetir ou me escrever o que precisa?',
                'image_failed': 'Recebi sua imagem! 🖼️ Infelizmente não consegui processar dessa vez. Pode me escrever o que precisa?',
                'file_failed': 'Recebi seu arquivo! 📄 Infelizmente não consegui processar dessa vez. Pode me escrever o que precisa?'
            };
            const fallbackText = fallbackMessages[mediaResult.type] || 'Recebi seu arquivo, mas não consegui processar. Pode me escrever o que precisa?';
            return res.status(200).json({
                version: 'v2',
                content: { messages: [{ type: 'text', text: fallbackText }], actions: [], quick_replies: [] },
                handover_to_human: false, order_ready: false, order_summary: null
            });
        }
    }

    // Mensagem muito curta e sem mídia — trata como saudação para não perder a primeira msg
    if (!mediaResult?.text && (!trimmed || trimmed.length < 2)) {
        console.warn(`[gemini] Mensagem vazia ou muito curta. message="${message}", text="${req.body?.text}", content="${req.body?.content}", user_id="${user_id}", name="${name}"`);
        // Se não tem NADA de texto, retorna saudação simples (sem link do site)
        if (!trimmed) {
            return res.status(200).json({
                version: 'v2',
                content: { messages: [{ type: 'text', text: 'Oi! 😊 Como posso te ajudar?' }], actions: [], quick_replies: [] },
                handover_to_human: false, order_ready: false, order_summary: null
            });
        }
        // Se tem 1 char (ex: "k", "."), ignora
        // Mensagens de 2+ chars (ex: "oi") passam adiante para o Gemini normalmente
    }

    // Usa texto convertido de mídia (se disponível) ou rawMessage
    let effectiveMessage = mediaResult?.text || rawMessage;
    if (mediaResult?.text) {
        console.log(`[gemini] 📎 Usando texto convertido de mídia como effectiveMessage: "${effectiveMessage.substring(0, 80)}..."`);
    }

    // Pré-processa mensagens com quebra de linha para a IA entender listas (Multi-linha)
    const msgLines = effectiveMessage.split('\n').map(l => l.trim()).filter(Boolean);
    if (msgLines.length > 1) {
        effectiveMessage = "Itens do pedido (múltiplas linhas):\n" + msgLines.map(l => `- ${l}`).join('\n');
    }

    // --- Carrega sessão: histórico de conversa e contador de msgs sem intenção ---
    const session = await loadSession(user_id);
    console.log(`[gemini] Sessão carregada: isNew=${session.isNewSession}, histLen=${session.history.length}, user_id=${user_id}`);
    if (session.history.length > 0) {
        console.log(`[gemini] Última msg histórico: role=${session.history[session.history.length - 1].role}, text="${session.history[session.history.length - 1].text.substring(0, 80)}..."`);
    }
    const greetingInstruction = session.isNewSession ? GREETING_NEW_SESSION : GREETING_CONTINUE_SESSION;
    let ownerApprovalNoticeCount = session.ownerApprovalNoticeCount || 0;

    // --- Detecção de intenção ---
    const intents = detectIntent(effectiveMessage);

    // --- Handover direto: cliente pediu explicitamente para falar com atendente ---
    if (intents.includes('handover_direto')) {
        const handoverDirectReply = 'Claro, vou chamar um atendente para te ajudar. Só um instante, por favor! 😊';
        await saveSession(user_id, [
            ...session.history,
            { role: 'user', text: effectiveMessage },
            { role: 'assistant', text: handoverDirectReply }
        ], 0, ownerApprovalNoticeCount);
        return res.status(200).json({
            version: 'v2',
            content: { messages: [{ type: 'text', text: handoverDirectReply }], actions: [], quick_replies: [] },
            handover_to_human: true, order_ready: false, order_summary: null
        });
    }
    let intentHint = '';
    // Detecta se msg contém quantidade + salgado/coxinha sem especificar mini
    const salgadoQtyMatch = effectiveMessage.match(/(\d+)\s*(coxinha|salgado|kibe|risole|pastel|empada|bolinha)/i);
    const hasSalgadoQty = !!salgadoQtyMatch;
    const salgadoQtyNum = salgadoQtyMatch ? parseInt(salgadoQtyMatch[1]) : 0;
    const specifiedMini = /mini/i.test(effectiveMessage);
    const specifiedGrande = /grande|tradicional|normal|unidade/i.test(effectiveMessage);

    // Pré-calcula se há intent de produto novo (usado por social e confirmação)
    const newProductIntents = ['bolos', 'opcoes_bolo', 'bebidas', 'salgados', 'mini', 'pedido', 'cardapio', 'agendamento'];
    const hasNewProductIntent = intents.some(i => newProductIntents.includes(i));

    if (intents.includes('social') && !hasNewProductIntent) {
        intentHint = '\n[FOCO: MENSAGEM SOCIAL/PESSOAL. O cliente NÃO está pedindo comida — é uma mensagem de carinho, aniversário, elogio ou afeto. Responda com CALOR HUMANO e BREVIDADE. Agradeça de coração. Diga que vai repassar o carinho para a Jéssica (proprietária). NÃO mencione horário de funcionamento, cardápio, preços nem tente vender. NÃO pergunte "o que deseja pedir?". Se for elogio sobre um produto (bolo, salgado), agradeça e diga que fica feliz, e que está à disposição para futuros pedidos. Se for mensagem de aniversário para a Jéssica, agradeça muito e diga que vai passar para ela.]';
    } else if (intents.includes('bolos') || intents.includes('opcoes_bolo')) {
        intentHint = '\n[FOCO: BOLO/KIT FESTA. Siga o ROTEIRO DE PEDIDO: 1) produto+preço, 2) entrega/retirada (se o pedido contiver bolo grande ou kit, o PEDIDO INTEIRO é apenas retirada — NÃO ofereça entrega para nenhum item separado), 3) personalização (massa+recheio+fita), 4) sabores dos mini salgados (se kit festa). Uma pergunta por vez. NÃO pule direto para pagamento.]';
    } else if (intents.includes('bebidas')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre BEBIDAS.]';
    } else if (intents.includes('agendamento')) {
        intentHint = '\n[FOCO: AGENDAMENTO/ENCOMENDA. Siga o ROTEIRO DE PEDIDO por etapas. SEMPRE pergunte DATA e HORÁRIO EXATOS.]';
    } else if (intents.includes('mini')) {
        intentHint = '\n[FOCO: MINI SALGADOS. O cliente está perguntando sobre MINI SALGADOS (pode ter usado diminutivo como "salgadinhos", "pequeninos", "de festa", "pra festa", ou pedido quantidade alta). ASSUMA que são MINI salgados e responda com preços de MINI. NÃO pergunte se é tradicional ou mini. Se a quantidade bater com combo do cardápio (20, 30, 50, 100un), OFEREÇA O COMBO — é mais vantajoso que preço unitário.]';
    } else if (intents.includes('promocoes')) {
        intentHint = '\n[FOCO: PROMOÇÕES/DESCONTO. O cliente perguntou sobre promoções ou desconto. REGRA: Você NÃO está autorizado a dar descontos pelo WhatsApp. Promoções e descontos são EXCLUSIVOS para pedidos feitos pelo SITE. Informe que sempre há descontos especiais no site e indique os cupons ativos (se houver no contexto). Envie o link do site.]';
    } else if (intents.includes('pagamento')) {
        intentHint = '\n[FOCO: PAGAMENTO/PIX/CARTÃO. REGRAS CRÍTICAS:'
            + '\n- Se o cliente escolheu PIX e já confirmou o valor (integral ou entrada 50%): responda APENAS com a tag [GERAR_PIX:VALOR]. NENHUM texto junto. Exemplo: [GERAR_PIX:95.00]'
            + '\n- Se o cliente pediu "chave pix", "copia e cola", "manda o pix" sem valor definido: responda APENAS com [GERAR_PIX:] (sem valor).'
            + '\n- Se o cliente escolheu CARTÃO: use [GERAR_LINK_CARTAO:VALOR_COM_TAXA]. ⛔ NUNCA escreva uma URL de pagamento você mesmo (links de checkout inventados NÃO funcionam) — use SOMENTE a tag; o sistema gera o link real.'
            + '\n- ⛔ NUNCA escreva o CNPJ como texto. NUNCA escreva a chave PIX como texto. USE APENAS AS TAGS acima. O sistema gera o copia-e-cola automaticamente.'
            + '\n- Se o pedido > R$50 e PIX: primeiro pergunte integral ou 50% entrada. Só gere a tag DEPOIS da resposta.]';
    } else if (intents.includes('entrega')) {
        intentHint = '\n[FOCO: ENTREGA/BAIRRO. O cliente mencionou entrega.'
            + '\n- Se o cliente APENAS perguntou "vocês entregam?" ou "faz entrega?": responda SIM ou NÃO de forma curta. NÃO mostre resumo do pedido, NÃO informe taxa, NÃO peça endereço ainda.'
            + '\n- SÓ peça bairro/endereço quando o cliente CONFIRMAR que quer entrega para o pedido dele.'
            + '\n- NUNCA informe taxa sem saber o bairro do cliente. Se bairro não foi informado, PERGUNTE.]';
    }
    // Dica extra: cliente pediu doces
    if (intents.includes('doces')) {
        intentHint += '\n[⛔ ATENÇÃO: O cliente perguntou sobre DOCES. A FastSavory\'s NÃO vende doces tradicionais (brigadeiro, cajuzinho, bem-casado, trufa, brownie, cupcake etc.). NÃO diga "sim, fazemos doces". Esclareça com honestidade e ofereça o que temos: bolos (Naked Cake/Vulcão) e mini salgados. Se ele pedir "50 doces", NÃO interprete como mini salgados.]';
    }
    // Dica extra: salgado com quantidade mas sem especificar mini/grande
    if (hasSalgadoQty && !specifiedMini && !specifiedGrande && intents.includes('salgados')) {
        if (salgadoQtyNum > 50) {
            // Quantities > 50 are ALWAYS mini salgados — do NOT ask
            intentHint += '\n[ATENÇÃO: O cliente pediu ' + salgadoQtyNum + ' salgados. Quantidade acima de 50 = MINI SALGADOS. NÃO pergunte "tradicional ou mini?". Trate como MINI e ofereça o pacote/combo correspondente.]';
        } else if (salgadoQtyNum > 5) {
            intentHint += '\n[ATENÇÃO: O cliente pediu salgados com quantidade mas NÃO especificou se é tradicional ou mini. PERGUNTE antes de dar preço.]';
        }
    }
    // Dica extra: mini com quantidade compatível com combo
    if (specifiedMini && hasSalgadoQty) {
        intentHint += '\n[ATENÇÃO: Cliente pediu MINI com quantidade. Verifique se existe COMBO correspondente no cardápio e ofereça-o.]';
    }

    if (ownerApprovalNoticeCount >= 2) {
        intentHint += '\n[ATENÇÃO: Você já avisou sobre a aprovação da proprietária (Jéssica) no domingo. NÃO mencione mais isso nesta conversa. Apenas siga com sabores, valores, pagamento etc.]';
    }

    // --- Detecção contextual de etapa de personalização (Kit Festa / Bolo) ---
    // Fluxo: Produto → Entrega/Retirada → Recheio → Sabores → Pagamento
    const lastAssistantMsg = [...session.history].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMsg) {
        const lastAText = lastAssistantMsg.text.toLowerCase();
        const isKitFesta = session.history.some(m => /kit\s*festa/i.test(m.text));

        // Detect if client REFUSED cake at any point (history + current message)
        const boloRefusalPattern = /n[aã]o\s*(quero|vou\s*querer|preciso\s*de?|queria)\s*(mais\s*)?(o\s*)?bolo|sem\s*bolo|deixa\s*(o\s*)?bolo|n[aã]o.*bolo\s*n[aã]o|cancela.*bolo/i;
        const clientRefusedBolo = boloRefusalPattern.test(effectiveMessage) || session.history.some(m => m.role === 'user' && boloRefusalPattern.test(m.text));

        const hasBoloInHist = !clientRefusedBolo && session.history.some(m => {
            if (/vulc[aã]o\s*mini|bolo\s*(no|de)\s*pote|pote\s*(de\s*)?bolo/i.test(m.text)) return false;
            // Exclude user QUESTIONS about availability ("tem bolo?", "está tendo bolo?", "bolo pronta entrega?")
            if (m.role === 'user') {
                const t = m.text.toLowerCase();
                if (/tem\s*bolo|t[aá]\s*tendo\s*bolo|bolo.*pronta\s*entrega|bolo.*dispon[ií]vel|vende.*bolo\?/i.test(t)) return false;
                return /\bbolo\b/i.test(t);
            }
            return /bolo\s*(pp|p\b|g\b)/i.test(m.text) && /R\$\s*\d/i.test(m.text);
        });
        const needsCustom = isKitFesta || hasBoloInHist;

        // Verifica se ENTREGA/RETIRADA já foi discutida
        const deliveryAlreadyDiscussed = session.history.some(m => m.role === 'assistant' && /retirada|entrega|retirar.*loja|rua palmeiras/i.test(m.text.toLowerCase()));
        // Verifica se PERSONALIZAÇÃO já foi perguntada (massa+recheio+sabores tudo junto)
        const personalizacaoAsked = session.history.some(m => m.role === 'assistant' && /massa.*bolo|massa.*branca|massa.*chocolate|personalizar.*kit|personalizar.*bolo/i.test(m.text.toLowerCase()));
        // Verifica itens já respondidos pelo cliente
        const allUserTexts = session.history.filter(m => m.role === 'user').map(m => m.text.toLowerCase()).join(' ');
        const allBotTexts = session.history.filter(m => m.role === 'assistant').map(m => m.text.toLowerCase()).join(' ');
        const massaAnswered = /massa\s*(branca|chocolate)|branca|chocolate/i.test(allUserTexts) && personalizacaoAsked;
        const recheioAnswered = /(ninho|beijinho|chocolate\s*com|c[oô]co)/i.test(allUserTexts) && (personalizacaoAsked || /recheio/i.test(allBotTexts));
        const saboresAnswered = session.history.some(m => m.role === 'assistant' && /sabor.*salgado|mini\s*salgado.*sabor|escolher.*tipo/i.test(m.text.toLowerCase())) && session.history.some(m => m.role === 'user' && /coxinha|enroladinho|quibe|bolinha|cazulo|sortido|variado/i.test(m.text.toLowerCase()));

        const kitMatch = session.history.map(m => m.text).join(' ').match(/kit\s*festa\s*(pp|p|g)/i);
        const kitSize = kitMatch ? kitMatch[1].toUpperCase() : 'P';
        const maxSabores = (kitSize === 'G') ? 5 : 3;

        // Passo 1: Se bolo/kit escolhido mas entrega/retirada NÃO discutida → forçar pergunta de entrega/retirada
        if (needsCustom && !deliveryAlreadyDiscussed) {
            const botConfirmedProduct = /kit\s*festa|\bR\$\s*\d|ótima\s*escolha|bolo/i.test(lastAText);
            if (botConfirmedProduct) {
                if (isKitFesta) {
                    intentHint = '\n[⛔ ETAPA OBRIGATÓRIA: O cliente escolheu um KIT FESTA. Kits são APENAS para RETIRADA. Informe que a retirada é na Rua Palmeiras, 105, Novo Prado. NÃO pergunte personalização ainda — primeiro confirme a retirada.]';
                } else {
                    intentHint = '\n[⛔ ETAPA OBRIGATÓRIA: O cliente escolheu um BOLO mas você AINDA NÃO perguntou se é entrega ou retirada. Pergunte AGORA. Se for bolo, lembre que é APENAS retirada. NÃO pergunte personalização ainda.]';
                }
            }
        }
        // Passo 2: Entrega/retirada discutida, personalização AINDA NÃO perguntada → perguntar TUDO de uma vez
        else if (needsCustom && deliveryAlreadyDiscussed && !personalizacaoAsked) {
            if (isKitFesta) {
                intentHint = `\n[⛔ ETAPA OBRIGATÓRIA: Entrega/retirada já definida. Agora pergunte a PERSONALIZAÇÃO COMPLETA numa mensagem só:\n- MASSA do bolo: Branca ou Chocolate?\n- RECHEIO: Ninho, Beijinho, Chocolate, Chocolate com Côco, Ninho com Côco ou Ninho com Chocolate?\n- SABORES dos mini salgados (até ${maxSabores} tipos): Enroladinho de Salsicha, Coxinha, Quibe, Bolinha de Carne, Bolinha de Queijo, Cazulo de Queijo com Presunto?\nNÃO avance para data/horário/pagamento.]`;
            } else {
                intentHint = '\n[⛔ ETAPA OBRIGATÓRIA: Entrega/retirada já definida. Agora pergunte a PERSONALIZAÇÃO COMPLETA numa mensagem só:\n- MASSA do bolo: Branca ou Chocolate?\n- RECHEIO: Ninho, Beijinho, Chocolate, Chocolate com Côco, Ninho com Côco ou Ninho com Chocolate?\nNÃO avance para data/horário/pagamento.]';
            }
        }
        // Passo 3: Personalização perguntada mas INCOMPLETA → reforçar o que falta
        else if (needsCustom && personalizacaoAsked) {
            const missing = [];
            if (!massaAnswered) missing.push('MASSA (Branca ou Chocolate)');
            if (!recheioAnswered) missing.push('RECHEIO (Ninho, Beijinho, Chocolate, Chocolate com Côco, Ninho com Côco, Ninho com Chocolate)');
            if (isKitFesta && !saboresAnswered) missing.push(`SABORES dos mini salgados (até ${maxSabores} tipos)`);

            if (missing.length > 0) {
                intentHint = `\n[⛔ PERSONALIZAÇÃO INCOMPLETA: O cliente já respondeu parte, mas ainda falta: ${missing.join(', ')}. Confirme o que ele já escolheu e pergunte APENAS o que falta. NÃO avance para data/horário/pagamento até ter TUDO.]`;
            } else {
                // Check if ribbon color was already asked/answered
                const fitaAsked = session.history.some(m => m.role === 'assistant' && /fita|laço|🎀/i.test(m.text));
                const fitaAnswered = session.history.some(m => m.role === 'user' && /verde|azul|rosa|vermelha|tanto faz|qualquer/i.test(m.text)) && fitaAsked;
                if (!fitaAsked && !isKitFesta) {
                    intentHint += '\n[Personalização de massa e recheio completa! Agora pergunte a COR DA FITA/LAÇO do bolo: 🟢 Verde, 🔵 Azul, 🩷 Rosa, 🔴 Vermelha. Só depois siga para data/horário/pagamento.]';
                } else {
                    intentHint += '\n[Personalização completa (massa + recheio' + (isKitFesta ? ' + sabores' : '') + (fitaAnswered ? ' + fita' : '') + '). Siga o ROTEIRO DE PEDIDO: se encomenda pergunte data/horário, depois monte orçamento e pergunte forma de pagamento.]';
                }
            }
        }
    }

    // --- Detecção de confirmação de pedido (order_ready para o ManyChat) ---
    // Só marca como confirmação se: (1) intent é 'confirmacao', (2) há orçamento no histórico,
    // (3) o cliente não está pedindo novos produtos na mesma mensagem
    const hasPendingOrder = session.history.some(m =>
        m.role === 'assistant' && /valor total/i.test(m.text)
    );
    const isOrderConfirmation = intents.includes('confirmacao') && hasPendingOrder && !hasNewProductIntent;
    if (isOrderConfirmation) {
        intentHint = '\n[CONFIRMAÇÃO DE PEDIDO DETECTADA. Verifique se TODOS os dados obrigatórios foram coletados:'
            + '\n✅ Itens + quantidades'
            + '\n✅ Retirada ou entrega'
            + '\n✅ Bairro E Rua E Número (se entrega) — EXIJA ESSA INFORMAÇÃO'
            + '\n✅ Data e horário exatos'
            + '\n✅ Forma de pagamento'
            + '\nSe FALTAR a Rua/Número para entrega, NÃO confirme — pergunte o que falta antes de prosseguir.'
            + '\nSe TODOS os dados estão completos, confirme amigavelmente, resuma tudo, e no FINAL adicione (será removido antes de enviar ao cliente):'
            + '\n---ORDER_JSON---'
            + '\n{"items":"lista itens e qtd","subtotal":"R$ XX,XX","delivery_mode":"entrega ou retirada","neighborhood":"bairro ou vazio","delivery_fee":"R$ X,XX","payment":"forma pagamento","scheduled_date":"DD/MM/AAAA","scheduled_time":"HH:MM","total":"R$ XX,XX","needs_owner_approval":true|false}'
            + '\n---END_ORDER_JSON---'
            + '\nPreencha com dados da conversa. (needs_owner_approval DEVE SER true caso seja agendamento/entrega para Domingo, false caso contrário).]';
    }

    // --- Lógica de handover: 3 mensagens substantivas consecutivas sem intenção clara ---
    // (handover_to_human = true aciona atribuição a atendente no ManyChat)
    let unclearCount = session.unclearCount;
    const isSubstantive = effectiveMessage.trim().length > 10; // msgs curtas tipo "oi" não contam
    if (intents.length === 0 && isSubstantive) {
        unclearCount++;
    } else if (intents.length > 0) {
        unclearCount = 0; // intenção clara reseta o contador
    }

    const HANDOVER_THRESHOLD = 3;

    // Se atingiu o limite: responde com handover e para de tentar calcular
    if (unclearCount >= HANDOVER_THRESHOLD) {
        const handoverReply = 'Acho que fiquei um pouco confuso aqui para entender certinho o que você quer 😅. Vou pedir para alguém do time te atender!\n\n'
            + `Enquanto isso, acesse nosso site:\n${SITE_URL}`;
        // Reseta o contador ao acionar handover para não travar em loop
        await saveSession(user_id, session.history, 0, ownerApprovalNoticeCount);
        return res.status(200).json({
            version: 'v2',
            content: {
                messages: [{ type: 'text', text: handoverReply }],
                actions: [],
                quick_replies: []
            },
            handover_to_human: true,
            order_ready: false,
            order_summary: null
        });
    }

    // Helpers
function getBrazilTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
}

// [CAIXINHA] computeCRC16 e generatePixBrCode foram movidas para ./_lib/payment.js
// (generatePixBrCode importada no topo). Geram o PIX copia-e-cola localmente.

    // Hora atual em Itamaraju-BA (UTC-3). Bahia não tem horário de verão, então é sempre UTC-3.
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'long' });
    // "Amanhã" calculado de forma determinística no fuso de Itamaraju-BA (o dia seguinte começa à meia-noite local).
    const nowBrazilForTomorrow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
    const tomorrowBrazil = new Date(nowBrazilForTomorrow.getTime() + 24 * 60 * 60 * 1000);
    const amanha = tomorrowBrazil.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long' });
    const cleanName = name && /[a-zA-ZÀ-ÿ]{2,}/.test(name) ? name.trim() : '';

    // --- Calculadora: carrega preços reais do cardápio (Supabase) uma única vez por requisição ---
    const priceMap = await fetchProductPriceMap(supabaseAdmin);

    // --- Validação programática de entrega: injeta FATOS verificados para o modelo não inventar ---
    const deliveryFactHint = buildDeliveryFactHint(session.history, effectiveMessage, priceMap);
    if (deliveryFactHint) {
        intentHint += deliveryFactHint;
    }

    // --- Lembrete do Bolo Vulcão Mini / Bolo no Pote (sem personalização, pode entregar) ---
    const boloFactHint = buildBoloFactHint(session.history, effectiveMessage);
    if (boloFactHint) {
        intentHint += boloFactHint;
    }

    // --- Guard Kit Festa / bolo grande (apenas retirada + 1 dia de antecedência) ---
    const kitFactHint = buildKitFactHint(session.history, effectiveMessage);
    if (kitFactHint) {
        intentHint += kitFactHint;
    }

    // --- Guard de pagamento (50% entrada só para total > R$ 50,00) ---
    const paymentFactHint = buildPaymentFactHint(session.history, effectiveMessage, priceMap);
    if (paymentFactHint) {
        intentHint += paymentFactHint;
    }

    const userMessage = `[Hoje é ${now}. Amanhã é ${amanha}]${intentHint}` + (cleanName ? ` Cliente "${cleanName}" disse: ${effectiveMessage}` : ` ${effectiveMessage}`);

    // --- Busca dados reais do Supabase e monta o prompt final ---
    const businessContext = await buildBusinessContext(intents);

    // --- Instrução dinâmica de personalização (PREFIXO do prompt para máxima atenção) ---
    let personalizationPrefix = '';
    if (lastAssistantMsg) {
        const hasKitInHistory = session.history.some(m => {
            if (m.role === 'user') return /kit\s*festa/i.test(m.text);
            // Bot: só conta se menciona tamanho específico (Kit Festa PP/P/G) com preço
            return /kit\s*festa\s*(pp|p\b|g\b)/i.test(m.text) && /R\$\s*\d/i.test(m.text);
        });
        const hasBoloInHistory = session.history.some(m => {
            if (/vulc[aã]o\s*mini|bolo\s*(no|de)\s*pote|pote\s*(de\s*)?bolo/i.test(m.text)) return false;
            if (m.role === 'user') return /\bbolo\b/i.test(m.text);
            // Bot: só conta se menciona tamanho específico (Bolo PP/P/G) com preço
            return /bolo\s*(pp|p\b|g\b)/i.test(m.text) && /R\$\s*\d/i.test(m.text);
        });
        const needsCustomization = hasKitInHistory || hasBoloInHistory;

        if (needsCustomization) {
            const histDeliveryDiscussed = session.history.some(m => m.role === 'assistant' && /retirada|entrega|retirar.*loja|rua palmeiras/i.test(m.text.toLowerCase()));
            const histRecheioAsked = session.history.some(m => m.role === 'assistant' && /recheio.*prefere|recheio.*qual|qual.*recheio/i.test(m.text.toLowerCase()));
            const histSaboresAsked = session.history.some(m => m.role === 'assistant' && /sabor.*salgado|mini\s*salgado.*sabor|escolher.*tipo/i.test(m.text.toLowerCase()));
            const botAlreadyListedKits = session.history.some(m => {
                if (m.role !== 'assistant') return false;
                // Requer menção a produto específico (com tamanho), não genérico
                const hasSpecificProduct = /kit\s*festa\s*(pp|p\b|g\b)|bolo\s*(pp|p\b|g\b|vulc[aã]o)/i.test(m.text);
                if (!hasSpecificProduct) return false;
                return /\bR\$\s*\d/i.test(m.text) || /ótima\s*escolha/i.test(m.text);
            });

            // Verifica o que já foi respondido pelo cliente
            const prefAllUserTexts = session.history.filter(m => m.role === 'user').map(m => m.text.toLowerCase()).join(' ');
            const prefAllBotTexts = session.history.filter(m => m.role === 'assistant').map(m => m.text.toLowerCase()).join(' ');
            const prefPersonalizacaoAsked = session.history.some(m => m.role === 'assistant' && /massa.*bolo|massa.*branca|massa.*chocolate|personalizar.*kit|personalizar.*bolo/i.test(m.text.toLowerCase()));
            const prefMassaOk = /massa\s*(branca|chocolate)|branca|chocolate/i.test(prefAllUserTexts) && prefPersonalizacaoAsked;
            const prefRecheioOk = /(ninho|beijinho|chocolate\s*com|c[oô]co)/i.test(prefAllUserTexts) && (prefPersonalizacaoAsked || /recheio/i.test(prefAllBotTexts));
            const prefSaboresOk = /coxinha|enroladinho|quibe|bolinha|cazulo|sortido|variado/i.test(prefAllUserTexts) && /sabor.*salgado|mini\s*salgado.*sabor|escolher.*tipo/i.test(prefAllBotTexts);
            const prefKitMatch = session.history.map(m => m.text).join(' ').match(/kit\s*festa\s*(pp|p|g)/i);
            const prefKitSize = prefKitMatch ? prefKitMatch[1].toUpperCase() : 'P';
            const prefMaxSab = (prefKitSize === 'G') ? 5 : 3;

            if (!histDeliveryDiscussed && botAlreadyListedKits) {
                // Entrega/retirada ainda não discutida → forçar antes da personalização
                if (hasKitInHistory) {
                    personalizationPrefix = '🚨🚨🚨 INSTRUÇÃO MÁXIMA PRIORIDADE — LEIA ANTES DE TUDO:\nO cliente escolheu um KIT FESTA. Kits são APENAS para RETIRADA na loja (Rua Palmeiras, 105, Novo Prado).\nInforme sobre a retirada PRIMEIRO. NÃO pergunte personalização ainda.\n🚨🚨🚨\n\n';
                } else {
                    personalizationPrefix = '🚨🚨🚨 INSTRUÇÃO MÁXIMA PRIORIDADE — LEIA ANTES DE TUDO:\nO cliente escolheu um BOLO. Você AINDA NÃO perguntou se é entrega ou retirada.\nPergunte AGORA. Bolos são APENAS retirada. NÃO pergunte personalização ainda.\n🚨🚨🚨\n\n';
                }
                console.log('[gemini] 🔵 ETAPA ENTREGA ativada: forçando entrega/retirada antes de personalização');
            } else if (histDeliveryDiscussed && !prefPersonalizacaoAsked && botAlreadyListedKits) {
                // Entrega/retirada já definida → perguntar personalização COMPLETA de uma vez
                if (hasKitInHistory) {
                    personalizationPrefix = `🚨🚨🚨 INSTRUÇÃO MÁXIMA PRIORIDADE — LEIA ANTES DE TUDO:\nEntrega/retirada já definida. Agora pergunte a PERSONALIZAÇÃO COMPLETA numa mensagem só:\n🍰 *Massa do bolo:* Branca ou Chocolate?\n🎂 *Recheio:* Ninho, Beijinho, Chocolate, Chocolate com Côco, Ninho com Côco ou Ninho com Chocolate?\n🥟 *Sabores dos mini salgados (até ${prefMaxSab} tipos):* Enroladinho de Salsicha, Coxinha, Quibe, Bolinha de Carne, Bolinha de Queijo ou Cazulo de Queijo com Presunto?\nNÃO avance para data/horário/pagamento.\n🚨🚨🚨\n\n`;
                } else {
                    personalizationPrefix = '🚨🚨🚨 INSTRUÇÃO MÁXIMA PRIORIDADE — LEIA ANTES DE TUDO:\nEntrega/retirada já definida. Agora pergunte a PERSONALIZAÇÃO COMPLETA numa mensagem só:\n🍰 *Massa do bolo:* Branca ou Chocolate?\n🎂 *Recheio:* Ninho, Beijinho, Chocolate, Chocolate com Côco, Ninho com Côco ou Ninho com Chocolate?\nNÃO avance para data/horário/pagamento.\n🚨🚨🚨\n\n';
                }
                console.log('[gemini] 🔴 ETAPA PERSONALIZAÇÃO ativada: forçando pergunta ALL-IN-ONE');
            } else if (prefPersonalizacaoAsked) {
                // Personalização perguntada → verificar se está completa ou falta algo
                const prefMissing = [];
                if (!prefMassaOk) prefMissing.push('MASSA (Branca ou Chocolate)');
                if (!prefRecheioOk) prefMissing.push('RECHEIO');
                if (hasKitInHistory && !prefSaboresOk) prefMissing.push(`SABORES dos mini salgados (até ${prefMaxSab} tipos)`);
                if (prefMissing.length > 0) {
                    personalizationPrefix = `🚨🚨🚨 INSTRUÇÃO MÁXIMA PRIORIDADE — LEIA ANTES DE TUDO:\nPersonalização INCOMPLETA. Ainda falta: ${prefMissing.join(', ')}.\nConfirme o que o cliente já escolheu e pergunte APENAS o que falta. NÃO avance para data/horário/pagamento.\n🚨🚨🚨\n\n`;
                    console.log(`[gemini] 🟡 PERSONALIZAÇÃO INCOMPLETA: falta ${prefMissing.join(', ')}`);
                }
            }
        }
    }

    // Monta prompt: PERSONALIZAÇÃO (início) + BASE + CONTEXTO + PERSONALIZAÇÃO (fim)
    let fullPrompt = personalizationPrefix + GEMINI_BASE_PROMPT + greetingInstruction + businessContext;
    if (personalizationPrefix) {
        fullPrompt += '\n\n' + personalizationPrefix; // Duplica no fim para efeito primazia-recência
    }

    // Flag: se estamos em etapa de personalização, reduzir temperatura para forçar compliance
    const personalizationMode = personalizationPrefix.length > 0;
    // DEBUG temporário: logar estado de personalização
    console.log(`[gemini] DEBUG: personalizationMode=${personalizationMode}, histLen=${session.history.length}, isNew=${session.isNewSession}, prefixLen=${personalizationPrefix.length}`);

    // Detecção de repetição de mensagem (mesma mensagem que a última do usuário)
    const normalizedAttempt = effectiveMessage.trim().toLowerCase();
    const lastUserMessage2 = [...session.history].reverse().find(m => m.role === 'user');
    const isRepeatedMessage = lastUserMessage2 && lastUserMessage2.text.trim().toLowerCase() === normalizedAttempt;

    if (isRepeatedMessage) {
        fullPrompt += '\n\n[⚠️ ALERTA DE SISTEMA: O cliente repetiu a mesma mensagem. NÃO repita sua última resposta. Mude a abordagem: se já enviou link do cardápio, lembre disso ("Já enviei o link acima!"). Se já perguntou algo, reformule ou pergunte de outra forma. NUNCA dê a mesma resposta duas vezes seguidas.]';
    }

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

    // --- Helper: fetch com timeout garantido ---
    async function timedFetch(url, body, timeoutMs) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                body: JSON.stringify(body)
            });
            clearTimeout(timer);
            return r;
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    const makeUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const makeBody = (maxTokens = 800) => ({
        system_instruction: { parts: [{ text: fullPrompt }] },
        contents: contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature: personalizationMode ? 0.3 : 0.7 }
    });

    // --- Chamada ao Gemini com cascata de 4 modelos (retry em 503/429 + validação de conteúdo) ---
    // Modelos lite (2.5-flash-lite, 3.1-flash-lite): SEM thinking tokens → 2048 basta
    // Modelos flash (2.5-flash, 3-flash): COM thinking tokens (~1000) → 4096 necessário
    // Fallbacks 3/4 estão em infra 3.x (separada), protege contra overload da família 2.5
    // ⚡ Timeouts e retries calibrados para caber no limite de 10s do Vercel Hobby
    const modelsToTry = [
        { name: GEMINI_MODEL, timeout: 4500, tokens: 2048, retries: 1 },           // 2.5-flash-lite (mais barato, estável)
        { name: GEMINI_MODEL_FALLBACK, timeout: 3500, tokens: 2048, retries: 1 },  // 3.1-flash-lite (barato, infra 3.x)
        { name: GEMINI_MODEL_FALLBACK_2, timeout: 4000, tokens: 4096, retries: 1 },// 2.5-flash (workhorse, thinking)
        { name: GEMINI_MODEL_FALLBACK_3, timeout: 3500, tokens: 4096, retries: 1 } // 3-flash (mais capaz, infra 3.x)
    ];
    let overloadDetected = false; // Quando true, pula direto sem retry
    const cascadeStartTime = Date.now();
    const CASCADE_DEADLINE_MS = 8500; // 8.5s — margem de 1.5s para pré/pós processamento dentro do limite de 10s Vercel

    let reply = null;
    let lastError = null;
    for (const model of modelsToTry) {
        // Verifica deadline global antes de tentar cada modelo
        const elapsed = Date.now() - cascadeStartTime;
        const remaining = CASCADE_DEADLINE_MS - elapsed;
        if (remaining < 1500) {
            console.warn(`[gemini] ⏰ Deadline atingido (${remaining}ms restantes de ${CASCADE_DEADLINE_MS}ms), parando cascata após ${elapsed}ms`);
            lastError = (lastError || '') + ' | DEADLINE';
            break;
        }
        // Se já detectou sobrecarga, força 1 tentativa e timeout menor para chegar rápido ao último modelo
        const maxAttempts = overloadDetected ? 1 : (model.retries || 1);
        const baseTimeout = overloadDetected ? Math.min(model.timeout, 3000) : model.timeout;
        const effectiveTimeout = Math.min(baseTimeout, remaining - 500); // Nunca ultrapassa o deadline
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[gemini] Tentando modelo: ${model.name} (tentativa ${attempt}/${maxAttempts}, timeout: ${effectiveTimeout}ms${overloadDetected ? ' ⚡FAST' : ''})`);
                const geminiRes = await timedFetch(makeUrl(model.name), makeBody(model.tokens), effectiveTimeout);
                if (!geminiRes.ok) {
                    const errStatus = geminiRes.status;
                    const errText = await geminiRes.text().catch(() => '');
                    console.warn(`[gemini] Modelo ${model.name} falhou (HTTP ${errStatus}): ${errText.substring(0, 200)}`);
                    lastError = `${model.name}: HTTP ${errStatus}`;
                    // 503 ou 429 = sobrecarga/rate-limit: pula DIRETO para próximo modelo (não adianta retry no mesmo)
                    if (errStatus === 503 || errStatus === 429) {
                        overloadDetected = true;
                        console.log(`[gemini] ${errStatus} (sobrecarga) detectado em ${model.name}, pulando para próximo modelo...`);
                        break; // próximo modelo imediatamente
                    }
                    // Outros erros: retry se ainda tem tentativas
                    if (attempt < maxAttempts) {
                        const waitMs = 500 + (attempt * 300);
                        console.log(`[gemini] Erro ${errStatus}, aguardando ${waitMs}ms para retry...`);
                        await new Promise(r => setTimeout(r, waitMs));
                        continue;
                    }
                    break; // última tentativa → próximo modelo
                }
                // HTTP 200 — parse o JSON e valida conteúdo
                const data = await geminiRes.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text || text.trim().length === 0) {
                    const promptTk = data?.usageMetadata?.promptTokenCount || '?';
                    const totalTk = data?.usageMetadata?.totalTokenCount || '?';
                    const finishReason = data?.candidates?.[0]?.finishReason || 'N/A';
                    console.warn(`[gemini] Modelo ${model.name} retornou conteúdo VAZIO (HTTP 200 sem texto). promptTokens=${promptTk}, totalTokens=${totalTk}, finishReason=${finishReason}`);
                    lastError = `${model.name}: conteúdo vazio`;
                    // Conteúdo vazio com HTTP 200 = overload silencioso do Google
                    // Não adianta retry no mesmo modelo — cascatear imediatamente
                    overloadDetected = true;
                    break; // próximo modelo imediatamente
                }
                // Sucesso! Temos texto válido
                console.log(`[gemini] ✅ Modelo ${model.name} respondeu OK (tentativa ${attempt})`);
                reply = text;
                break; // sai do loop de tentativas
            } catch (e) {
                const reason = e.name === 'AbortError' ? 'TIMEOUT' : e.message;
                console.warn(`[gemini] Modelo ${model.name} falhou (${reason})`);
                lastError = `${model.name}: ${reason}`;
                break; // timeout/erro de rede → próximo modelo direto
            }
        }
        if (reply) break; // sai do loop de modelos se já temos resposta
    }

    if (!reply) {
        const cascadeMs = Date.now() - cascadeStartTime;
        console.error(`[gemini] ❌ TODOS os modelos falharam após ${cascadeMs}ms. Último erro: ${lastError}`);
        return res.status(200).json({
            version: 'v2',
            content: { messages: [{ type: 'text', text: 'Me desculpe, estou com uma dificuldade técnica momentânea 😕 Já vou chamar a Jéssica para te atender!' }], actions: [], quick_replies: [] },
            handover_to_human: true, order_ready: false, order_summary: null
        });
    }

    // --- Limpa tags internas que vazam do modelo (THOUGHT, SYSTEM, etc.) ---
    reply = reply.replace(/\[THOUGHT\][\s\S]*?\[\/THOUGHT\]/gi, '').trim();
    reply = reply.replace(/\[SYSTEM\][\s\S]*?\[(?:USER|ASSISTANT)\]/gi, '').trim();
    reply = reply.replace(/\[USER\].*?\[ASSISTANT\]/gi, '').trim();
    reply = reply.replace(/\[ASSISTANT\]\s*/gi, '').trim();

    // --- Corrige formatação WhatsApp: **texto** → *texto* (modelo usa markdown, WhatsApp usa 1 asterisco) ---
    reply = reply.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // --- Sanitiza vazamento de instruções internas (BUG CRÍTICO) ---
    // Detecta se o modelo ecoou histórico, contexto ou regras internas na resposta
    const leakDetectors = [
        /\[\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}\]\s*(Cliente|Fast)/i,
        /REGRA RÍGIDA:/i,
        /INSTRUÇÃO MÁXIMA PRIORIDADE/i,
        /ETAPA OBRIGATÓRIA:/i,
        /\[FOCO:.*?\]/i,
        /\[Hoje é[^\]]*\]/i,
        /\[ATENÇÃO:.*?\]/i
    ];
    if (leakDetectors.some(p => p.test(reply))) {
        console.warn('[gemini] ⚠️ VAZAMENTO DETECTADO: modelo ecoou instruções internas na resposta. Sanitizando...');
        let sanitized = reply
            .replace(/\[\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}\]\s*(Cliente|Fast)\s*"?[^"]*"?:?\s*/gi, '')
            .replace(/\[Hoje é[^\]]*\]/gi, '')
            .replace(/\[FOCO:[^\]]*\]/gi, '')
            .replace(/\[ATENÇÃO:[^\]]*\]/gi, '')
            .replace(/⛔\s*REGRA RÍGIDA:[^\n]*/gi, '')
            .replace(/🚨+\s*INSTRUÇÃO MÁXIMA PRIORIDADE[^\n]*/gi, '')
            .replace(/⛔\s*ETAPA OBRIGATÓRIA:[^\n]*/gi, '')
            .replace(/🚨{2,}/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (sanitized.length > 10) {
            reply = sanitized;
            console.log(`[gemini] ✅ Vazamento sanitizado, resposta limpa: ${reply.length} chars`);
        } else {
            console.warn('[gemini] ⚠️ Sanitização resultou em texto muito curto, usando fallback');
            reply = 'Olá! Como posso te ajudar? 😊';
        }
    }

    // --- Extrai order_summary do bloco ORDER_JSON (se o Gemini incluiu) ---
    // O bloco é inserido pela IA apenas quando detectamos confirmação de pedido
    const ORDER_JSON_REGEX = /---ORDER_JSON---\s*([\s\S]*?)\s*---END_ORDER_JSON---/;
    const jsonMatch = reply.match(ORDER_JSON_REGEX);
    let orderReady = false;
    let orderSummary = null;
    if (jsonMatch) {
        try {
            orderSummary = JSON.parse(jsonMatch[1].trim());
        } catch (e) {
            // Fallback: JSON inválido, usa texto bruto como resumo
            orderSummary = { raw_summary: jsonMatch[1].trim() };
        }
        orderSummary.client_name = name || 'Não informado';
        orderReady = true;
        // Remove o bloco JSON da resposta visível ao cliente
        reply = reply.replace(ORDER_JSON_REGEX, '').trim();

        // --- CORREÇÃO PROGRAMÁTICA DO TOTAL (a IA erra contas) ---
        // A IA é ruim em aritmética. Quando a calculadora determinística consegue
        // precificar TUDO com segurança (complete=true), o subtotal/total que a IA
        // escreveu é SUBSTITUÍDO pelo valor correto — tanto no ORDER_JSON (cozinha)
        // quanto no texto visível ao cliente. Pagamento em CARTÃO é pulado (tem
        // acréscimo de taxa que esta calculadora não replica).
        try {
            const calc = estimateCartTotal([...session.history, { role: 'user', text: effectiveMessage }], priceMap);
            const isCard = /cart[aã]o|cr[eé]dito|d[eé]bito/i.test(String(orderSummary.payment || ''));
            // A calculadora IGNORA adicionais (sachê, topper, molho) sem marcar incompleto.
            // Se houver esses itens na conversa, PULA a correção para não cobrar a menos.
            const convText = [...session.history.filter(m => m.role === 'user').map(m => m.text), effectiveMessage].join(' ');
            const hasUnpricedExtras = /\b(sach[eê]s?|ketchup|catchup|maionese|topper|molho|adicional|adicionais)\b/i.test(convText);
            if (calc.complete && calc.total > 0 && !isCard && !hasUnpricedExtras) {
                const fmt = (n) => `R$ ${n.toFixed(2).replace('.', ',')}`;
                const onlyNum = (v) => parseBrlNumber(String(v == null ? '' : v).replace(/[^0-9.,]/g, ''));
                const feeNum = onlyNum(orderSummary.delivery_fee) || 0;
                const correctSubtotal = calc.total;
                const correctTotal = calc.total + (isNaN(feeNum) ? 0 : feeNum);
                const aiSubtotal = onlyNum(orderSummary.subtotal);
                const aiTotal = onlyNum(orderSummary.total);
                const TOL = 0.5;
                const subtotalWrong = isNaN(aiSubtotal) || Math.abs(aiSubtotal - correctSubtotal) > TOL;
                const totalWrong = isNaN(aiTotal) || Math.abs(aiTotal - correctTotal) > TOL;
                if (subtotalWrong || totalWrong) {
                    console.warn(`[calc-fix] Total corrigido pela calculadora: subtotal ${orderSummary.subtotal} → ${fmt(correctSubtotal)} | total ${orderSummary.total} → ${fmt(correctTotal)} | calc: ${calc.description}`);
                    // Corrige o texto visível ao cliente (troca o token R$ errado pelo correto).
                    if (!isNaN(aiTotal) && totalWrong) {
                        const oldTotalTok = `R$ ${aiTotal.toFixed(2).replace('.', ',')}`;
                        reply = reply.split(oldTotalTok).join(fmt(correctTotal));
                    }
                    // Só troca o subtotal no texto se for um valor DISTINTO do total (evita dupla troca).
                    if (!isNaN(aiSubtotal) && subtotalWrong && (isNaN(aiTotal) || Math.abs(aiSubtotal - aiTotal) > 0.005)) {
                        const oldSubTok = `R$ ${aiSubtotal.toFixed(2).replace('.', ',')}`;
                        reply = reply.split(oldSubTok).join(fmt(correctSubtotal));
                    }
                    // Corrige o ORDER_JSON enviado para a cozinha/dona.
                    orderSummary.subtotal = fmt(correctSubtotal);
                    orderSummary.total = fmt(correctTotal);
                }
            }
        } catch (e) {
            console.warn('[calc-fix] erro ao corrigir total:', e.message);
        }
    }

    // --- CHECAGEM DE FRASE CORTADA ---
    let cleanEnd = reply.replace(/[.,!?:;\s]*$/, '').trim();
    if (/\b(para|de|em|com|e|o|a|os|as|um|uma|na|no|da|do)$/i.test(cleanEnd)) {
        console.warn(`[gemini] Detected incomplete sentence at the end of reply ("${cleanEnd.split(' ').pop()}"). Re-calling Gemini for completion...`);
        let completeMsg = Array.from(contents);
        completeMsg.push({ role: 'model', parts: [{ text: reply }] });
        completeMsg.push({ role: 'user', parts: [{ text: 'complete a frase anterior de forma objetiva (sem repetir o que já disse)' }] });
        
        try {
            const compRes = await timedFetch(makeUrl(GEMINI_MODEL_FALLBACK), {
                contents: completeMsg,
                generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
            }, 3500);
            if (compRes.ok) {
                const compData = await compRes.json();
                const completionText = compData?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (completionText) {
                    reply += ' ' + completionText.trim();
                }
            }
        } catch (e) {
            console.warn('[gemini] Failed to complete sentence:', e.message);
            reply += '...';
        }
    }

    // --- Incremento owner_approval_notice_count ---
    if (/Jéssica|proprietária|aprovação/i.test(reply) && /domingo/i.test(reply)) {
        ownerApprovalNoticeCount++;
    }

    // --- Link do site REMOVIDO da injeção automática ---
    // O link só é enviado quando o cliente pede (regra no prompt).

    // --- Interceptador de PIX Copia e Cola (PRO-ATIVO) ---
    // Quando [GERAR_PIX:VALOR] é detectado, a resposta INTEIRA vira só o brCode puro
    const gerarPixRegex = /\[GERAR_PIX:([0-9.,]+)?\]/gi;
    let pixInjected = false;
    let pixBrCode = null;
    const pixMatch = reply.match(gerarPixRegex);
    if (pixMatch) {
        // Extrai valor do primeiro match
        const valMatch = pixMatch[0].match(/([0-9.,]+)/i);
        let amt = 0;
        if (valMatch) {
            amt = parseFloat(valMatch[1].replace(',', '.'));
            if (isNaN(amt)) amt = 0;
        }
        // Segurança: prioriza o total calculado deterministicamente sobre o valor da tag (que pode
        // ser um total antigo/errado mencionado antes na conversa)
        const safeAmt = resolvePixFinalAmount(amt, session.history, effectiveMessage, priceMap);
        pixBrCode = generatePixBrCode(safeAmt > 0 ? safeAmt : null);
        pixInjected = true;
        // Substitui a resposta INTEIRA pelo código puro — sem texto nenhum
        reply = pixBrCode;
    }

    // Fallback: se o modelo escreveu o CNPJ como texto (ignorou a tag [GERAR_PIX]), detecta e gera o PIX automaticamente
    if (!pixInjected) {
        const cnpjInText = /63\.160\.686\/0001-06/.test(reply);
        if (cnpjInText) {
            console.warn('[pix] ⚠️ Modelo escreveu CNPJ como texto em vez de usar [GERAR_PIX]. Tentando gerar PIX automaticamente...');
            // Tenta extrair valor do texto (ex: "R$ 95,00", "entrada de R$ 95,00")
            const valorMatch = reply.match(/R\$\s*([0-9]+[.,][0-9]{2})/i);
            let amt = 0;
            if (valorMatch) {
                amt = parseFloat(valorMatch[1].replace(',', '.'));
                if (isNaN(amt)) amt = 0;
            }
            const safeAmt = resolvePixFinalAmount(amt, session.history, effectiveMessage, priceMap);
            pixBrCode = generatePixBrCode(safeAmt > 0 ? safeAmt : null);
            pixInjected = true;
            reply = pixBrCode;
            console.log(`[pix] ✅ PIX gerado via fallback (valor: ${safeAmt > 0 ? 'R$' + safeAmt.toFixed(2) : 'sem valor'})`);
        }
    }

    // Filtra legado caso a IA use a tag anterior [PIX:VALOR]
    if (!pixInjected) {
        const fallbackPixRegex = /\[PIX:([0-9.,]+)?\]/gi;
        const fallbackMatch = reply.match(fallbackPixRegex);
        if (fallbackMatch) {
            const valMatch = fallbackMatch[0].match(/([0-9.,]+)/i);
            let amt = 0;
            if (valMatch) {
                amt = parseFloat(valMatch[1].replace(',', '.'));
                if (isNaN(amt)) amt = 0;
            }
            const safeAmt = resolvePixFinalAmount(amt, session.history, effectiveMessage, priceMap);
            pixBrCode = generatePixBrCode(safeAmt > 0 ? safeAmt : null);
            pixInjected = true;
            reply = pixBrCode;
        }
    }

    // --- Interceptador de Link de Pagamento via Cartão (PRO-ATIVO) ---
    // Quando [GERAR_LINK_CARTAO:VALOR] é detectado, gera link de checkout do Stripe
    const gerarCartaoRegex = /\[GERAR_LINK_CARTAO:([0-9.,]+)\]/gi;
    const cartaoMatch = reply.match(gerarCartaoRegex);
    if (cartaoMatch) {
        // Extrai valor do primeiro match
        const valMatch = cartaoMatch[0].match(/([0-9.,]+)/i);
        let amt = 0;
        if (valMatch) {
            amt = parseFloat(valMatch[1].replace(',', '.'));
            if (isNaN(amt)) amt = 0;
        }

        // Segurança: rejeita valor alucinado pelo modelo (que não bate com a conversa)
        const safeAmt = validateCartaoAmount(amt, session.history, effectiveMessage, priceMap);
        if (safeAmt < 0) {
            // Valor inventado: NÃO gera o link de cobrança. Pede confirmação / oferece Pix.
            reply = reply.replace(gerarCartaoRegex, 'Deixa eu confirmar o valor certinho do seu pedido antes de gerar o link de pagamento, tá bom? 😊 Se preferir, posso te enviar a chave Pix.');
        } else {
            amt = safeAmt;
        }

        if (safeAmt >= 0 && amt > 0 && stripe) {
            // Gera link de checkout do Stripe de forma assíncrona
            // Como estamos em um contexto síncrono, usamos await aqui
            const checkoutLink = await generateStripeCheckoutLink(stripe, amt, name || 'Cliente');
            if (checkoutLink) {
                // Substitui a tag pelo link de checkout
                reply = reply.replace(gerarCartaoRegex, checkoutLink);
                console.log(`[manychat-api] ✅ Stripe checkout link generated for amount: R$ ${amt}`);
            } else {
                // Se falhar, remove a tag e informa erro
                reply = reply.replace(gerarCartaoRegex, '[Erro ao gerar link de pagamento. Tente novamente ou use Pix.]');
                console.error(`[manychat-api] ❌ Failed to generate Stripe checkout link for amount: R$ ${amt}`);
            }
        } else {
            // Se Stripe não configurado ou valor inválido
            reply = reply.replace(gerarCartaoRegex, '[Pagamento via cartão indisponível no momento. Use Pix.]');
        }
    }

    // --- Fallback de SEGURANÇA: modelo escreveu um LINK DE PAGAMENTO FALSO (alucinado) ---
    // Às vezes o modelo ignora a tag [GERAR_LINK_CARTAO:VALOR] e INVENTA uma URL de checkout
    // (ex: https://pagamento.fastsavorys.com/checkout/...), que NÃO funciona. Detectamos qualquer
    // URL de pagamento que NÃO seja do Stripe e a trocamos por um link REAL (se houver valor
    // confiável) ou por uma mensagem segura. Espelha o fallback que já existe para o PIX.
    {
        const urls = reply.match(/https?:\/\/[^\s<>"')]+/gi) || [];
        const fakePayUrl = urls.find(u =>
            !/stripe\.com/i.test(u) &&
            /(pagamento\.|\/checkout\/|\/pay\/|\/pagar|\/cobranca|payment)/i.test(u)
        );
        if (fakePayUrl) {
            console.warn(`[cartao] ⚠️ Modelo gerou link de pagamento FALSO: ${fakePayUrl}. Substituindo por link real/seguro.`);
            // Pega o MAIOR valor R$ citado na resposta (geralmente o total com a taxa de cartão)
            let amt = 0;
            for (const vm of reply.matchAll(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)/gi)) {
                const v = parseBrlNumber(vm[1]);
                if (!isNaN(v) && v > amt) amt = v;
            }
            const safeAmt = validateCartaoAmount(amt, session.history, effectiveMessage, priceMap);
            let realLink = null;
            if (safeAmt > 0 && stripe) {
                realLink = await generateStripeCheckoutLink(stripe, safeAmt, name || 'Cliente');
            }
            if (realLink) {
                reply = reply.replace(fakePayUrl, realLink);
                console.log(`[cartao] ✅ Link falso substituído pelo Stripe real (R$ ${safeAmt}).`);
            } else {
                // Sem valor confiável ou Stripe indisponível: remove o link falso e oferece Pix
                reply = reply.replace(fakePayUrl, '').replace(/\n{3,}/g, '\n\n').trim();
                reply += '\n\nDeixa eu confirmar o valor certinho pra gerar o link de pagamento, tá? 😊 Se preferir, posso te enviar a chave Pix.';
            }
        }
    }

    // --- Monta mensagem para ManyChat ---
    // ManyChat External Request só lê $.content.messages[0].text (gemini_reply)
    const rawMessages = reply.split(/\[SPLIT\]/i).map(t => t.trim()).filter(t => t.length > 0);
    const fullReplyText = rawMessages.join('\n\n');
    const manychatMessages = [{ type: 'text', text: fullReplyText }];

    // --- Salva sessão com histórico atualizado (conversation_state) ---
    // Guarda msg original do usuário (sem enriquecimento) + resposta da IA
    const updatedHistory = [
        ...session.history,
        { role: 'user', text: effectiveMessage },
        { role: 'assistant', text: reply.length > 500 ? reply.substring(0, 500) : reply }
    ];
    const _saveErr = await saveSession(user_id, updatedHistory, unclearCount, ownerApprovalNoticeCount);

    return res.status(200).json({
        version: 'v2',
        content: {
            messages: manychatMessages,
            actions: [],
            quick_replies: []
        },
        handover_to_human: false,
        order_ready: orderReady,       // <-- true quando pedido confirmado pelo cliente
        order_summary: orderSummary    // <-- dados do pedido para enviar à Jéssica via ManyChat
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

// Vercel function config: max 30s timeout, região São Paulo (mais perto de Itamaraju-BA)
module.exports.config = {
    maxDuration: 30,
    regions: ['gru1']
};
