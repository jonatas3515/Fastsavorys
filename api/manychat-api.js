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
const GEMINI_BASE_PROMPT = `Você é o Fast, atendente virtual da FastSavory's, lanchonete de delivery em Itamaraju-BA.
Use SOMENTE os dados do CONTEXTO DE NEGÓCIO abaixo. Nunca invente preços, produtos ou regras.

REGRAS DE ATENDIMENTO:
1. Português do Brasil, tom simpático de lanchonete de bairro.
2. Se o produto não estiver no CARDÁPIO COMPLETO do contexto, ou estiver na lista PRODUTOS INDISPONÍVEIS, diga que não temos no momento.
3. DIA FECHADO (domingo/feriado): responda NORMALMENTE preços, cardápio, taxas e regras. Apenas NÃO aceite entrega/retirada para HOJE. Incentive encomenda para segunda a sábado.
4. Se o cliente pedir para FALAR COM ATENDENTE/HUMANO: responda APENAS "Claro, vou chamar um atendente para te ajudar. Só um instante!" e PARE. Não explique mais nada.
5. Se não souber, diga: "Pode conferir no nosso site ou me perguntar de outra forma."
6. Pergunta fora do tema: redirecione gentilmente.

ESTILO DE RESPOSTA (MUITO IMPORTANTE):
- Seja OBJETIVA e CURTA: no máximo 3-5 blocos curtos por resposta.
- Envie apenas UMA resposta por mensagem do cliente. Nunca envie múltiplas respostas para a mesma pergunta.
- NÃO repita horário de funcionamento em toda mensagem. Só mencione horário completo na PRIMEIRA resposta da sessão ou quando o cliente perguntar diretamente.
- NÃO repita blocos inteiros de texto que já apareceram no histórico da conversa.
- Vá DIRETO AO PONTO: se o cliente perguntou preço, responda o preço. Se pediu cardápio, liste. Se quer agendar, siga o roteiro.

FORMATO DE LISTA (para WhatsApp — usar SEMPRE ao listar produtos):
Use um item por linha com bullet simples. Exemplo:
• Coxinha de Frango – R$ 4,50
• Enroladinho de Salsicha – R$ 4,00
• Bolo G – serve 20 pessoas – R$ 145,00
Para recheios/massas/sabores, também um por linha:
• Ninho
• Beijinho
• Chocolate

FORMATO DE ORÇAMENTO (quando o cliente pedir itens com quantidades):
📋 *Produtos:* itens e quantidades.
💰 *Valor unitário:* preço de cada item.
🛵 *Entrega:* entrega (bairro + taxa) ou retirada na loja.
🏷️ *Descontos:* promoções que se apliquem.
🧮 *Valor total aproximado:* soma + taxa. Deixe claro que é aproximado.
Se pergunta simples (sem quantidades), NÃO use orçamento — responda natural em 2-4 frases.

REGRA DE BOLO PARA HOJE / ANIVERSÁRIO HOJE:
- Se o cliente disser que quer bolo para HOJE ou que o aniversário é HOJE: informe que bolos precisam de 1 dia de antecedência e NÃO podem ser feitos para hoje.
- NÃO insista em vender bolo para amanhã como solução do aniversário de hoje. Apenas diga que para futuros pedidos de bolo, pode encomendar pelo site.
- Se o cliente quiser continuar pedindo OUTRA COISA (salgados, bebidas, mini salgados), siga normalmente com esses itens.

DIFERENCIAÇÃO COXINHA NORMAL vs MINI (IMPORTANTE):
- Se o cliente pedir coxinhas (ou salgados) com quantidade (ex: "30 coxinha", "20 salgados") e NÃO especificar se é mini ou tradicional, SEMPRE pergunte:
  "Você prefere coxinha tradicional (unidade) ou mini coxinha?"
- Só prossiga com preço/combo DEPOIS que o cliente confirmar qual tipo.

MINI SALGADOS — REGRA DE PACOTES (CRÍTICO):
- Mini salgados são vendidos em pacotes com preço fixo cadastrado no cardápio (categoria "mini").
- Os pacotes estão no CONTEXTO DE NEGÓCIO como "Mini-Salgados 20", "Mini-Salgados 30", etc.
- Se o cliente pedir uma quantidade que corresponda a um pacote, use SEMPRE o preço do pacote.
- NUNCA multiplique preço unitário × quantidade quando existir pacote cadastrado para aquela quantidade.
- Preço unitário (R$ 1,00 a R$ 1,25) é APENAS para quantidades que não têm pacote cadastrado.

COMBOS (REGRA CRÍTICA — NÃO RECALCULAR):
- Combos têm PREÇO FIXO. NUNCA recalcule o preço de um combo somando itens individuais.
- Use EXATAMENTE o preço que aparece no CONTEXTO DE NEGÓCIO para cada combo.
- Quando o cliente pedir mini salgados em quantidades compatíveis com combos (10, 20, 30, 50, 100 un), SEMPRE ofereça o combo como opção principal, explicando que sai mais barato que por unidade.
- Se a quantidade não bater com nenhum combo (ex: 3, 5 unidades), aí sim use o preço unitário.

REGRAS DE ENTREGA (siga à risca):
- SALGADOS, MINI SALGADOS, BEBIDAS, COMBOS e BOLO VULCÃO MINI podem ser ENTREGUES (14h–18h, dias de funcionamento).
- BOLOS (exceto vulcão mini), KITS FESTA: apenas RETIRADA na loja.
- As taxas de entrega por bairro estão no CONTEXTO DE NEGÓCIO abaixo. Use SOMENTE esses valores.
- Se o bairro do cliente NÃO estiver na lista, aplique a taxa padrão indicada no contexto.
- Bairro com taxa R$ 0,00: entrega GRÁTIS.
- Entrega via MOTOTÁXI.
- NUNCA diga "só fazemos retirada" quando o pedido for de salgados/bebidas.
- Valor mínimo global para entrega: R$ 15,00 (sem contar a taxa de entrega).
- Cada bairro pode ter valor mínimo próprio — consulte a tabela de taxas no CONTEXTO DE NEGÓCIO.
- Se o valor do pedido (sem taxa) não atingir o mínimo do bairro, informe o cliente e peça para aumentar o pedido.

REGRAS DE RETIRADA NA LOJA (pedidos futuros — data diferente de hoje):
- Disponível das 7h às 18h, segunda a sábado.
- Faixa 7h–11h: pedido mínimo R$ 35,00 (sem bolos).
- Faixa 11h–14h: pedido mínimo R$ 25,00.
- Faixa 14h–18h: sem mínimo extra além do mínimo global de R$ 8,00.

REGRA DE DOMINGO:
- Se a DATA DE ENTREGA ou RETIRADA cair num domingo: pedido mínimo R$ 39,00.
- Se hoje é domingo mas o pedido é para outro dia da semana: sem restrição extra de valor mínimo.

ROTEIRO DE AGENDAMENTO (seguir por etapas, uma pergunta por vez):
Quando o cliente quiser agendar/encomendar para outra data:
1. Confirme o que quer (itens e quantidades). Se coxinha/salgado, pergunte se é tradicional ou mini.
2. Pergunte: retirada ou entrega?
3. Se entrega → pergunte bairro e aplique taxa. Se retirada → informe regras de mínimo por horário.
4. Pergunte DATA e HORÁRIO EXATOS desejados (dentro das regras). NÃO assuma "amanhã" sem hora.
5. Valide se o valor atinge o mínimo para a faixa de horário escolhida. Se não, avise.
6. Pergunte forma de pagamento (pix, cartão, dinheiro).
7. Monte o orçamento no formato acima.
8. Pergunte: "Posso registrar esse pedido para agendamento?"
NÃO pule etapas. Faça UMA pergunta por vez.

CHECKLIST OBRIGATÓRIO ANTES DE CONFIRMAR PEDIDO:
Antes de considerar o pedido "pronto para confirmar", TODOS esses dados devem estar coletados:
✅ Itens + quantidades
✅ Retirada ou entrega
✅ Bairro (se entrega)
✅ Data e horário exatos
✅ Forma de pagamento
Se FALTAR qualquer um, pergunte antes de prosseguir. NÃO confirme pedido incompleto.

CONTINUAÇÃO DE PEDIDO:
Se há pedido parcial no histórico, NÃO refaça do zero. Atualize apenas o que mudou e mostre resumo completo.

CONFIRMAÇÃO DE PEDIDO:
Quando o cliente confirmar (ex: "sim", "pode", "fecha"), confirme amigavelmente e resuma o pedido.

CONVITE AO SITE (no final de cada resposta — frase CURTA, link em LINHA SEPARADA):
Veja cardápio e promoções:
https://fastsavorys.vercel.app/pages/fast.html
Sempre coloque o link COMPLETO com https:// e em uma linha separada para ficar clicável no WhatsApp/iOS.`;

// Instrução extra para NOVA SESSÃO (primeira msg em 3h)
const GREETING_NEW_SESSION = `
INSTRUÇÃO DE SAUDAÇÃO: PRIMEIRA mensagem do cliente nesta conversa.
Apresente-se: "Olá, [nome]! Eu sou o Fast, atendente virtual da FastSavory's! 😊 Vou te ajudar com preços, cardápio, agendamentos e entregas."
Se souber o nome do cliente, use-o. Nesta PRIMEIRA resposta pode mencionar horário brevemente. Nas próximas, NÃO repita horário nem apresentação.`;

// Instrução extra para SESSÃO EM ANDAMENTO (já falou há menos de 3h)
const GREETING_CONTINUE_SESSION = `
INSTRUÇÃO: Conversa em andamento. NÃO repita saudação, NÃO repita horário de funcionamento, NÃO repita link do site se já mencionou.
Vá DIRETO ao ponto. No máximo "Perfeito!", "Claro!" antes de responder.`;

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
    // Handover direto: cliente pede para falar com humano/atendente
    if (/falar\s*(com)?\s*(atendente|algu[eé]m|humano|pessoa|gente)|atendente|atendimento\s*humano/i.test(m)) intents.push('handover_direto');
    // Confirmação de pedido (sim/pode/ok — verificado no handler se há orçamento pendente)
    if (/^(sim|pode|confirmo|confirma|fecha|é isso|tá bom|ta bom|pode ser|isso mesmo|manda|certo|confirmar|fechar)\b/i.test(m.trim()) || /confirm|fecha(r)?\s*(o\s*)?pedido/i.test(m)) intents.push('confirmacao');
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
            // Produtos (todos, incluindo indisponíveis para informar ao modelo)
            supabaseAdmin.from('fast_products')
                .select('name, description, price, category, emoji, requires_preorder, is_encomenda, block_massa, block_recheio, visible')
                .order('category').order('name'),
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
            const unavailable = [];
            for (const p of productsRes.data) {
                if (p.visible === false || p.visible === null) {
                    unavailable.push(p.name);
                    continue;
                }
                if (!grouped[p.category]) grouped[p.category] = [];
                grouped[p.category].push(p);
            }
            // Ordem desejada das categorias
            const catOrder = ['salgados', 'mini', 'combos', 'bolos', 'kits', 'bebidas', 'adicionais'];
            const catLabels = { salgados: 'SALGADOS', mini: 'MINI SALGADOS (CENTO/50 UN)', combos: '⚠️ COMBOS — PREÇO FIXO OBRIGATÓRIO — USE EXATAMENTE O PREÇO ABAIXO, NUNCA INVENTE', bolos: 'BOLOS', kits: 'KITS FESTA', bebidas: 'BEBIDAS', adicionais: 'ADICIONAIS' };
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
                    if (item.requires_preorder || item.is_encomenda) line += ' [ENCOMENDA - 1 dia antecedência]';
                    if (cat === 'bolos' || cat === 'kits') {
                        if (!item.block_massa) line += ' [escolhe massa]';
                        if (!item.block_recheio) line += ' [escolhe recheio]';
                    }
                    ctx += line;
                }
            }
            if (grouped['combos']?.length) {
                ctx += '\n  ⛔ ATENÇÃO: Os preços dos combos acima são ABSOLUTOS. Não some itens, não estime, não use memória de treinamento — use APENAS os valores listados aqui.';
            }
            if (unavailable.length > 0) {
                ctx += `\n\n[PRODUTOS INDISPONÍVEIS NO MOMENTO — não ofereça, diga que não temos]: ${unavailable.join(', ')}`;
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
            ctx += '\n  ⚠️ Promoções NÃO se aplicam a combos. Combos já têm preço fixo próprio — use o preço do combo direto, sem somar itens nem aplicar descontos.';
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
            const defaultFee = configRes.data?.default_delivery_fee ?? 8;
            ctx += `\n  ⚠️ Bairro NÃO listado acima: taxa padrão R$ ${Number(defaultFee).toFixed(2)} (via mototáxi).`;
            ctx += '\n  Entrega via mototáxi — valores podem variar em domingos/feriados.';
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
        ctx += '\n  - Bolos e Kits Festa: ENCOMENDA com 1 dia de antecedência. Apenas RETIRADA na loja.';
        ctx += '\n  - Bolo Vulcão Mini: exceção — pode ser ENTREGUE junto com salgados/bebidas.';
        ctx += '\n  - Salgados, mini salgados, bebidas, combos: podem ser pedidos para o MESMO DIA.';
        ctx += '\n    • ENTREGA: 14h–18h, bairros listados, com taxa.';
        ctx += '\n    • RETIRADA: 7h–18h na loja.';
        ctx += '\n\nVALOR MÍNIMO POR FAIXA DE HORÁRIO (retirada):';
        if (configRes.data) {
            const c = configRes.data;
            const minNormal = c.min_order_pickup || 8;
            const minOff = c.min_order_pickup_offhours || 15;
            const minMorning = c.morning_rule_min_value || 25;
            ctx += `\n  • 7h–11h (sem bolo): mínimo R$ ${Number(minMorning).toFixed(2)}`;
            ctx += `\n  • 11h–14h: mínimo R$ ${Number(minOff).toFixed(2)}`;
            ctx += `\n  • 14h–18h: mínimo R$ ${Number(minNormal).toFixed(2)}`;
        }
        ctx += '\n\n  - Encomenda/agendamento pelo site:\n    https://fastsavorys.vercel.app/pages/fast.html';
        ctx += '\n  - No site: cupons de desconto, promoções de aniversário e fidelidade.';

        // ============ HORÁRIOS DE FUNCIONAMENTO ============
        if (hoursRes.data?.length) {
            ctx += '\n\nHORÁRIO DE FUNCIONAMENTO:';
            for (const h of hoursRes.data) {
                ctx += h.is_open
                    ? `\n  ${h.day_name}: ${h.open_time} às ${h.close_time}`
                    : `\n  ${h.day_name}: FECHADO`;
            }
        }

        // ============ SITUAÇÃO DE HOJE (domingo / feriado / fechamento admin) ============
        // Identifica se hoje é dia de não-funcionamento e instrui a IA a NÃO bloquear info
        const baFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', weekday: 'long' });
        const todayWeekday = baFormatter.format(new Date()).toLowerCase();
        const todayHours = hoursRes.data?.find(h => h.day_name.toLowerCase() === todayWeekday);
        const closedByAdmin = storeStatusRes.data?.is_closed;
        const closedBySchedule = todayHours && !todayHours.is_open;
        if (closedByAdmin || closedBySchedule) {
            ctx += '\n\nSITUAÇÃO DE HOJE:';
            if (closedByAdmin) {
                ctx += '\n  A loja está FECHADA hoje por decisão da administração.';
            } else {
                ctx += `\n  Hoje é ${todayWeekday} e a loja NÃO funciona neste dia.`;
            }
            ctx += '\n  ⚠️ NÃO aceite pedidos de entrega/retirada para HOJE.';
            ctx += '\n  ✅ MAS responda NORMALMENTE preços, cardápio, taxas, opções e regras.';
            ctx += '\n  ✅ Incentive o cliente a encomendar para segunda a sábado pelo site.';
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

    // --- Tratamento de mensagem vazia ou muito curta (ex: áudio não transcrito) ---
    const SITE_URL = 'https://fastsavorys.vercel.app/pages/fast.html';
    if (!message || !message.trim() || message.trim().length < 2) {
        const audioReply = 'Não consigo ouvir seu áudio aqui, mas posso te ajudar se você escrever em texto o que precisa! 😊'
            + `\n\nVeja nosso cardápio:\n${SITE_URL}`;
        return res.status(200).json({
            version: 'v2',
            content: { messages: [{ type: 'text', text: audioReply }], actions: [], quick_replies: [] },
            handover_to_human: false, order_ready: false, order_summary: null
        });
    }

    // --- Carrega sessão: histórico de conversa e contador de msgs sem intenção ---
    const session = await loadSession(user_id);
    const greetingInstruction = session.isNewSession ? GREETING_NEW_SESSION : GREETING_CONTINUE_SESSION;

    // --- Detecção de intenção ---
    const intents = detectIntent(message);

    // --- Handover direto: cliente pediu explicitamente para falar com atendente ---
    if (intents.includes('handover_direto')) {
        const handoverDirectReply = 'Claro, vou chamar um atendente para te ajudar. Só um instante, por favor! 😊';
        await saveSession(user_id, [
            ...session.history,
            { role: 'user', text: message },
            { role: 'assistant', text: handoverDirectReply }
        ], 0);
        return res.status(200).json({
            version: 'v2',
            content: { messages: [{ type: 'text', text: handoverDirectReply }], actions: [], quick_replies: [] },
            handover_to_human: true, order_ready: false, order_summary: null
        });
    }
    let intentHint = '';
    // Detecta se msg contém quantidade + salgado/coxinha sem especificar mini
    const hasSalgadoQty = /\d+\s*(coxinha|salgado|kibe|risole|pastel|empada|bolinha)/i.test(message);
    const specifiedMini = /mini/i.test(message);
    const specifiedGrande = /grande|tradicional|normal|unidade/i.test(message);

    if (intents.includes('bolos') || intents.includes('opcoes_bolo')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre BOLOS. Priorize informações de bolos, massas e recheios.]';
    } else if (intents.includes('bebidas')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre BEBIDAS.]';
    } else if (intents.includes('agendamento')) {
        intentHint = '\n[FOCO: AGENDAMENTO/ENCOMENDA. Siga o ROTEIRO DE AGENDAMENTO por etapas. SEMPRE pergunte DATA e HORÁRIO EXATOS.]';
    } else if (intents.includes('mini')) {
        intentHint = '\n[FOCO: MINI SALGADOS. Se a quantidade bater com combo do cardápio (20, 30, 50, 100un), OFEREÇA O COMBO — é mais vantajoso que preço unitário.]';
    } else if (intents.includes('promocoes')) {
        intentHint = '\n[FOCO: O cliente perguntou sobre PROMOÇÕES.]';
    } else if (intents.includes('entrega')) {
        intentHint = '\n[FOCO: ENTREGA/BAIRRO. Se bairro não estiver na tabela, use a taxa padrão indicada no contexto. Se há pedido em andamento, atualize com bairro e mostre orçamento.]';
    }
    // Dica extra: salgado com quantidade mas sem especificar mini/grande
    if (hasSalgadoQty && !specifiedMini && !specifiedGrande && intents.includes('salgados')) {
        intentHint += '\n[ATENÇÃO: O cliente pediu salgados com quantidade mas NÃO especificou se é tradicional ou mini. PERGUNTE antes de dar preço.]';
    }
    // Dica extra: mini com quantidade compatível com combo
    if (specifiedMini && hasSalgadoQty) {
        intentHint += '\n[ATENÇÃO: Cliente pediu MINI com quantidade. Verifique se existe COMBO correspondente no cardápio e ofereça-o.]';
    }

    // --- Detecção de confirmação de pedido (order_ready para o ManyChat) ---
    // Só marca como confirmação se: (1) intent é 'confirmacao', (2) há orçamento no histórico,
    // (3) o cliente não está pedindo novos produtos na mesma mensagem
    const hasPendingOrder = session.history.some(m =>
        m.role === 'assistant' && /valor total/i.test(m.text)
    );
    const newProductIntents = ['bolos', 'opcoes_bolo', 'bebidas', 'salgados', 'mini', 'pedido', 'cardapio', 'agendamento'];
    const hasNewProductIntent = intents.some(i => newProductIntents.includes(i));
    const isOrderConfirmation = intents.includes('confirmacao') && hasPendingOrder && !hasNewProductIntent;
    if (isOrderConfirmation) {
        intentHint = '\n[CONFIRMAÇÃO DE PEDIDO DETECTADA. Verifique se TODOS os dados obrigatórios foram coletados:'
            + '\n✅ Itens + quantidades'
            + '\n✅ Retirada ou entrega'
            + '\n✅ Bairro (se entrega)'
            + '\n✅ Data e horário exatos'
            + '\n✅ Forma de pagamento'
            + '\nSe FALTAR algum dado, NÃO confirme — pergunte o que falta.'
            + '\nSe TODOS os dados estão completos, confirme amigavelmente, resuma tudo, e no FINAL adicione (será removido antes de enviar ao cliente):'
            + '\n---ORDER_JSON---'
            + '\n{"items":"lista itens e qtd","subtotal":"R$ XX,XX","delivery_mode":"entrega ou retirada","neighborhood":"bairro ou vazio","delivery_fee":"R$ X,XX","payment":"forma pagamento","scheduled_date":"DD/MM/AAAA","scheduled_time":"HH:MM","total":"R$ XX,XX"}'
            + '\n---END_ORDER_JSON---'
            + '\nPreencha com dados da conversa.]';
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

    // Se atingiu o limite: responde com handover e para de tentar calcular
    if (unclearCount >= HANDOVER_THRESHOLD) {
        const handoverReply = 'Acho que fiquei um pouco confuso aqui para entender certinho o que você quer 😅. Vou pedir para alguém do time te atender!\n\n'
            + `Enquanto isso, acesse nosso site:\n${SITE_URL}`;
        // Reseta o contador ao acionar handover para não travar em loop
        await saveSession(user_id, session.history, 0);
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
    }

    // --- Convite ao site: garante que aparece no final de toda resposta ---
    if (!reply.includes('fastsavorys.vercel.app')) {
        reply += `\n\nVeja cardápio e promoções:\n${SITE_URL}`;
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
