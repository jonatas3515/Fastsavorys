/**
 * Evolution API Webhook Handler - FastSavory's AI Assistant
 * 
 * Substitui o ManyChat como canal de atendimento:
 * - Recebe mensagens do WhatsApp da lanchonete (instância fast_lanchonete na Oracle VPS)
 * - Processa mensagens de texto, ÁUDIOS, IMAGENS e DOCUMENTOS/PDFs (comprovantes)
 * - Processa mensagens com o Gemini (motor inteligente com regras de cardápio, entrega, sabores, memória e pedidos)
 * - Responde automaticamente pelo WhatsApp via Evolution API (sem delay e sem card gigante de linkPreview)
 * - Permite pausa para atendimento humano quando Jéssica responder no celular
 * - Notifica Jéssica no WhatsApp pessoal quando um novo pedido for finalizado, comprovante enviado ou atendente solicitado
 */

const { handleGeminiCore, createMockRes, normalizeBrazilianPhone } = require('../manychat-api');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqbylshkw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Configuração Evolution API (Oracle Cloud VPS)
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || 'http://136.248.121.245:8080').replace(/\/+$/, '');
const EVOLUTION_API_KEY = (process.env.EVOLUTION_STORE_API_KEY || process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976').trim();
const EVOLUTION_INSTANCE = (process.env.EVOLUTION_STORE_INSTANCE || 'fast_lanchonete').trim();

// Número pessoal da Jéssica para receber notificações de novos pedidos, comprovantes e transbordo
const JESSICA_PHONE = (process.env.JESSICA_PERSONAL_PHONE || '5573998621125').replace(/\D/g, '');
// WhatsApp da lanchonete (canal do bot)
const STORE_PHONE = (process.env.WHATSAPP_NUMBER || '5573999366554').replace(/\D/g, '');

// Cache em memória de pausas humanas (temporário por processo)
const humanPauses = new Map();

// Cache em memória de contatos bloqueados permanentemente (anti-spam / telemarketing)
const blockedContactsCache = new Set();

async function isContactBlocked(phone) {
    if (!phone) return false;
    const clean = phone.replace(/\D/g, '');
    if (blockedContactsCache.has(clean)) return true;
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('fast_client_memory')
                .select('memories')
                .eq('user_id', clean)
                .maybeSingle();

            if (data?.memories?.is_blocked === true) {
                blockedContactsCache.add(clean);
                return true;
            }
        } catch (e) {}
    }
    return false;
}

async function blockContact(phone, reason = 'manual') {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    blockedContactsCache.add(clean);
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('fast_client_memory')
                .select('memories')
                .eq('user_id', clean)
                .maybeSingle();

            const current = (data && typeof data.memories === 'object') ? data.memories : {};
            const updated = {
                ...current,
                is_blocked: true,
                blocked_reason: reason,
                blocked_at: new Date().toISOString()
            };

            await supabaseAdmin
                .from('fast_client_memory')
                .upsert({
                    user_id: clean,
                    memories: updated,
                    last_interaction: new Date().toISOString()
                }, { onConflict: 'user_id' });
        } catch (e) {
            console.error('[blockContact] Erro ao salvar bloqueio:', e.message);
        }
    }
}

async function unblockContact(phone) {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '');
    blockedContactsCache.delete(clean);
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('fast_client_memory')
                .select('memories')
                .eq('user_id', clean)
                .maybeSingle();

            if (data?.memories) {
                const updated = { ...data.memories, is_blocked: false, unblocked_at: new Date().toISOString() };
                await supabaseAdmin
                    .from('fast_client_memory')
                    .update({ memories: updated })
                    .eq('user_id', clean);
            }
        } catch (e) {
            console.error('[unblockContact] Erro ao desmarcar bloqueio:', e.message);
        }
    }
}

// Filtro assertivo de Telemarketing, Notificações Corporativas, Bancos, Operadoras e Robôs
function isTelemarketingOrBot(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.toLowerCase().trim();
    if (t.length < 5) return false;

    // 1. Códigos de segurança / Tokens / 2FA / OTP (ex: Bancos, Apps)
    if (/(código|codigo)\s+(de\s+)?(segurança|seguranca|verificação|verificacao|acesso|confirmação|confirmacao|ativação)/i.test(t) && /\b\d{4,8}\b/.test(t)) {
        return 'codigo_autenticacao';
    }
    if (/\b\d{4,8}\b/.test(t) && /(não compartilhe|nao compartilhe|este código é pessoal|este codigo e pessoal)/i.test(t)) {
        return 'codigo_autenticacao';
    }

    // 2. Rodapés de mensagens em massa / Opt-out
    if (/\b(responda|digite|envie)\s+(sair|stop|cancelar|não|nao)\s+(para|se não quiser|caso não queira)/i.test(t)) {
        return 'opt_out_footer';
    }
    if (/(caso não queira mais receber|para não receber mais|para cancelar o recebimento)/i.test(t)) {
        return 'opt_out_footer';
    }

    // 3. Ofertas de Empréstimo, Financiamento, Bancos, Cartões, FGTS
    if (/(empréstimo|emprestimo|crédito|credito)\s+(consignado|pré-aprovado|pre-aprovado|pessoal|fácil|facil)/i.test(t)) {
        return 'oferta_financeira';
    }
    if (/(antecipe|antecipação|saque)\s+(do\s+)?(aniversário|aniversario\s+)?fgts/i.test(t)) {
        return 'oferta_fgts';
    }
    if (/(liberamos|temos|oportunidade de)\s+(um\s+)?(limite|crédito|credito|capital de giro|empréstimo|emprestimo)/i.test(t)) {
        return 'oferta_credito';
    }
    if (/(portabilidade|refinanciamento)\s+de\s+(crédito|credito|salário|salario|benefício|beneficio|inss)/i.test(t)) {
        return 'portabilidade_financeira';
    }
    if (/(aumento|upgrade)\s+de\s+limite\s+(do\s+seu\s+cartão|da\s+sua\s+conta)/i.test(t)) {
        return 'aumento_limite';
    }

    // 4. Operadoras de Telefonia (Vivo, Claro, Tim, etc.)
    if (/(aqui é da|sou da|somos da|atendimento)\s+(vivo|claro|tim|oi|embratel)/i.test(t)) {
        return 'operadora_telefonia';
    }
    if (/(fatura|segunda via|plano|recarga|débito em aberto)\s+(da\s+sua\s+linha|vivo|claro|tim)/i.test(t)) {
        return 'operadora_fatura';
    }

    // 5. Clínicas, Laboratórios e Consultas Médicas
    if (/(lembrete|confirmação|confirmacao)\s+de\s+(consulta|exame|atendimento médico|sessão)/i.test(t)) {
        return 'lembrete_consulta';
    }
    if (/(digite|responda)\s+1\s+para\s+confirmar\s+(a\s+sua\s+consulta|o\s+seu\s+exame|o\s+seu\s+agendamento)/i.test(t)) {
        return 'confirmacao_consulta';
    }
    if (/(seu laudo|resultado de exame|prontuário)\s+(está disponível|ja está pronto|está pronto)/i.test(t)) {
        return 'resultado_exame';
    }

    // 6. URAs / Menus robóticos com dígitos rígidos
    if (/(digite|responda)\s+1\s+para\s+[^,.\n]+,\s*(digite|responda)?\s*2\s+para/i.test(t)) {
        return 'menu_ura_numerico';
    }
    if (/(responda com o número|escolha uma das opções|selecione a opção desejada):\s*(\n\s*1\s*[-–.]|\n\s*\[1\])/i.test(t)) {
        return 'menu_ura_numerico';
    }

    // 7. Pesquisas de Satisfação / NPS
    if (/(escala de 0 a 10|de 0 a 10|qual a probabilidade de você recomendar|pesquisa de satisfação)/i.test(t)) {
        return 'pesquisa_satisfacao';
    }

    return false;
}

async function isHumanPaused(phone) {
    const expiresAt = humanPauses.get(phone);
    if (expiresAt && Date.now() < expiresAt) {
        return true;
    }
    if (supabaseAdmin) {
        try {
            const { data } = await supabaseAdmin
                .from('fast_bot_events')
                .select('created_at, details')
                .eq('client_phone', phone)
                .eq('event_type', 'human_takeover')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data?.details?.pause_until) {
                const dbExpires = new Date(data.details.pause_until).getTime();
                if (Date.now() < dbExpires) {
                    humanPauses.set(phone, dbExpires);
                    return true;
                }
            }
        } catch (e) {}
    }
    return false;
}

async function setHumanPause(phone, minutes = 45) {
    const pauseUntil = Date.now() + minutes * 60 * 1000;
    humanPauses.set(phone, pauseUntil);
    if (supabaseAdmin) {
        try {
            await supabaseAdmin.from('fast_bot_events').insert([{
                manychat_user_id: phone,
                client_phone: phone,
                event_type: 'human_takeover',
                details: { pause_until: new Date(pauseUntil).toISOString(), minutes }
            }]);
        } catch (e) {}
    }
}

// Envia mensagem pelo WhatsApp via Evolution API de forma rápida e sem preview gigante
async function sendWhatsAppMessage(recipientPhone, text) {
    const endpoint = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({
                number: cleanPhone,
                text: text,
                delay: 0,
                linkPreview: false
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error(`[evolution-webhook] Falha ao enviar mensagem para ${cleanPhone}:`, data);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`[evolution-webhook] Erro de rede ao enviar mensagem para ${cleanPhone}:`, err.message);
        return false;
    }
}

// Busca o arquivo base64 de uma mídia (áudio, imagem ou PDF) na Evolution API
async function getMediaBase64FromEvolution(messageId) {
    if (!messageId) return null;
    const endpoint = `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_KEY
            },
            body: JSON.stringify({
                message: {
                    key: {
                        id: messageId
                    }
                },
                convertToMp4: false
            })
        });
        if (!response.ok) {
            console.warn(`[evolution-webhook] getBase64FromMediaMessage HTTP ${response.status}`);
            return null;
        }
        const data = await response.json().catch(() => ({}));
        return data.base64 || null;
    } catch (err) {
        console.error('[evolution-webhook] Erro ao buscar base64 da Evolution:', err.message);
        return null;
    }
}

// Analisa qualquer mídia (áudio, imagem ou PDF) usando o Gemini 3.5 Flash-Lite Multimodal
async function analyzeMultimodalWithGemini(base64Data, mimeType, prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !base64Data) return null;

    const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: rawBase64
                            }
                        },
                        {
                            text: prompt
                        }
                    ]
                }],
                generationConfig: {
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`[evolution-webhook] Gemini multimodal error ${response.status}:`, errText.substring(0, 200));
            return null;
        }

        const data = await response.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return candidateText ? candidateText.trim() : null;
    } catch (err) {
        console.error('[evolution-webhook] Exceção multimodal:', err.message);
        return null;
    }
}

async function notifyJessica(orderSummary, clientPhone, clientName) {
    if (!JESSICA_PHONE) return;

    let msg = `🔔 *NOVO PEDIDO RECEBIDO!* 🔔\n\n`;
    msg += `👤 *Cliente:* ${orderSummary.client_name || clientName || 'Não informado'}\n`;
    msg += `📱 *WhatsApp:* https://wa.me/${clientPhone}\n`;
    if (orderSummary.delivery_mode) {
        msg += `🛵 *Tipo:* *${String(orderSummary.delivery_mode).toUpperCase()}*\n`;
    }
    if (orderSummary.address) {
        msg += `📍 *Endereço:* ${orderSummary.address}${orderSummary.neighborhood ? ` (${orderSummary.neighborhood})` : ''}\n`;
    }
    if (orderSummary.scheduled_date) {
        msg += `📅 *Agendado para:* *${orderSummary.scheduled_date}* às *${orderSummary.scheduled_time || 'A combinar'}*\n`;
    }
    msg += `\n📦 *Itens do Pedido:*\n${orderSummary.items || 'Consulte na conversa'}\n\n`;
    if (orderSummary.subtotal) msg += `Subtotal: ${orderSummary.subtotal}\n`;
    if (orderSummary.delivery_fee) msg += `Taxa de Entrega: ${orderSummary.delivery_fee}\n`;
    msg += `💰 *Total:* *${orderSummary.total || 'A calcular'}* (${orderSummary.payment || 'A combinar'})\n`;

    if (orderSummary.needs_owner_approval) {
        msg += `\n⚠️ *ATENÇÃO:* Pedido para domingo/feriado. Requer sua confirmação manual com o cliente!`;
    }

    await sendWhatsAppMessage(JESSICA_PHONE, msg);
}

function unwrapMessage(rawMsg) {
    if (!rawMsg) return {};
    let m = rawMsg;
    while (m) {
        if (m.ephemeralMessage?.message) {
            m = m.ephemeralMessage.message;
            continue;
        }
        if (m.viewOnceMessage?.message) {
            m = m.viewOnceMessage.message;
            continue;
        }
        if (m.viewOnceMessageV2?.message) {
            m = m.viewOnceMessageV2.message;
            continue;
        }
        if (m.documentWithCaptionMessage?.message) {
            m = m.documentWithCaptionMessage.message;
            continue;
        }
        break;
    }
    return m;
}

module.exports = async (req, res) => {
    // 1. Healthcheck / GET
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'online',
            service: 'FastSavory Evolution AI Webhook',
            instance: EVOLUTION_INSTANCE,
            timestamp: new Date().toISOString()
        });
    }

    // EVOLUTION API PAUSADA PARA TESTES E TRANSIÇÃO DEFINITIVA PARA META CLOUD API OFICIAL
    const EVOLUTION_PAUSED = true;
    if (EVOLUTION_PAUSED) {
        console.log('[evolution-webhook] ⏸️ Evolution API temporariamente pausada para testes da Meta Cloud API.');
        return res.status(200).json({ success: true, paused: true, message: 'Evolution API webhook is paused' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const payload = req.body || {};
        const event = String(payload.event || payload.type || '').toLowerCase();

        // Só processamos eventos de mensagens recebidas
        if (event && !event.includes('messages.upsert') && !event.includes('message')) {
            return res.status(200).json({ success: true, ignored: `event_${event}` });
        }

        const data = Array.isArray(payload.data) ? payload.data[0] : (payload.data || payload);
        const key = data?.key || {};
        const remoteJid = key.remoteJid || '';
        const remoteJidAlt = key.remoteJidAlt || '';
        const fromMe = Boolean(key.fromMe);
        const messageId = key.id;

        // Ignora grupos e transmissões
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('@broadcast') || remoteJid.includes('status@broadcast')) {
            return res.status(200).json({ success: true, ignored: 'group_or_broadcast' });
        }

        // Determina o número real de WhatsApp do cliente (lid vs s.whatsapp.net)
        let clientPhone = '';
        if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
            clientPhone = remoteJidAlt.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        } else if (remoteJid.includes('@s.whatsapp.net')) {
            clientPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        } else {
            clientPhone = remoteJid.replace('@lid', '').replace(/\D/g, '');
        }

        if (!clientPhone) {
            return res.status(200).json({ success: true, ignored: 'no_phone' });
        }

        // Destinatário para envio na Evolution API (prioriza número limpo do WhatsApp)
        const targetRecipient = (clientPhone && clientPhone.length >= 10 && clientPhone.length <= 13)
            ? clientPhone
            : (remoteJid || clientPhone);

        // Extrai dados da mensagem desempacotando visualização única ou efêmera
        const msg = unwrapMessage(data.message);
        let messageText = msg.conversation ||
                          msg.extendedTextMessage?.text ||
                          msg.imageMessage?.caption ||
                          msg.videoMessage?.caption ||
                          msg.documentMessage?.caption ||
                          '';

        const clientName = data.pushName || 'Cliente';

        // Se a mensagem partiu do próprio WhatsApp da Lanchonete (Jéssica falando no celular):
        if (fromMe) {
            if (clientPhone === JESSICA_PHONE) {
                return res.status(200).json({ success: true, ignored: 'self_notification_to_owner' });
            }

            // Comandos rápidos de controle manual direto na conversa do contato:
            const trimmedMsg = messageText.trim();
            if (/^#?(bloquear|block|spam|ignorar)$/i.test(trimmedMsg)) {
                console.log(`[evolution-webhook] 🚫 Jéssica bloqueou o número ${clientPhone} para sempre.`);
                await blockContact(clientPhone, 'Bloqueado manualmente no WhatsApp por Jéssica');
                return res.status(200).json({ success: true, action: 'contact_blocked_permanently' });
            }
            if (/^#?(desbloquear|unblock)$/i.test(trimmedMsg)) {
                console.log(`[evolution-webhook] 🟢 Jéssica desbloqueou o número ${clientPhone}.`);
                await unblockContact(clientPhone);
                return res.status(200).json({ success: true, action: 'contact_unblocked' });
            }

            console.log(`[evolution-webhook] 👤 Jéssica interagiu com ${clientPhone}. Ativando pausa humana de 45 min.`);
            await setHumanPause(clientPhone, 45);
            return res.status(200).json({ success: true, action: 'human_takeover_recorded' });
        }

        // Comandos remotos enviados pelo WhatsApp pessoal da Jéssica (ex: #bloquear 73999998888)
        if (clientPhone === JESSICA_PHONE) {
            const rawCmd = messageText.trim();
            const blockMatch = rawCmd.match(/^#?(bloquear|block|spam|ignorar)\s+(\d{10,13})/i);
            if (blockMatch) {
                const targetNum = blockMatch[2];
                await blockContact(targetNum, 'Bloqueado por comando remoto da Jéssica');
                await sendWhatsAppMessage(JESSICA_PHONE, `🚫 *CONTATO BLOQUEADO!* O número *${targetNum}* foi bloqueado para sempre no assistente virtual.`);
                return res.status(200).json({ success: true, action: 'remote_block_success' });
            }
            const unblockMatch = rawCmd.match(/^#?(desbloquear|unblock)\s+(\d{10,13})/i);
            if (unblockMatch) {
                const targetNum = unblockMatch[2];
                await unblockContact(targetNum);
                await sendWhatsAppMessage(JESSICA_PHONE, `🟢 *CONTATO DESBLOQUEADO!* O número *${targetNum}* foi reativado para atendimento normal.`);
                return res.status(200).json({ success: true, action: 'remote_unblock_success' });
            }
        }

        // 1. VERIFICAÇÃO DE BLOQUEIO PERMANENTE (Anti-spam / Telemarketing / Manual)
        if (await isContactBlocked(clientPhone)) {
            console.log(`[evolution-webhook] 🚫 Contato ${clientPhone} está BLOQUEADO PERMANENTEMENTE. Ignorando mensagem.`);
            return res.status(200).json({ success: true, ignored: 'contact_blocked_permanently' });
        }

        // 2. FILTRO AUTOMÁTICO DE TELEMARKETING, BANCOS, OPERADORAS E ROBÔS (Zero custo / Zero IA)
        const telemarketingType = isTelemarketingOrBot(messageText);
        if (telemarketingType) {
            console.log(`[evolution-webhook] 🛑 Telemarketing/Robô detectado (${telemarketingType}) de ${clientPhone}: "${messageText.substring(0, 70)}". Bloqueando contato e silenciando IA.`);
            await blockContact(clientPhone, `Telemarketing automático detectado: ${telemarketingType}`);
            return res.status(200).json({ success: true, ignored: 'telemarketing_blocked', type: telemarketingType });
        }

        // Verifica se a conversa está pausada para atendimento humano
        if (await isHumanPaused(clientPhone)) {
            console.log(`[evolution-webhook] ⏸️ Conversa com ${clientPhone} em pausa humana ativa. IA silenciada.`);
            return res.status(200).json({ success: true, ignored: 'human_paused' });
        }

        // Comando manual de destravamento/pausa pelo cliente (ex: #ia ou #voltar)
        if (/^#?(voltar|chamar\s*ia|ativar\s*ia)$/i.test(messageText.trim())) {
            humanPauses.delete(clientPhone);
            await sendWhatsAppMessage(targetRecipient, 'Olá! O assistente virtual da FastSavory\'s foi reativado. Como posso te ajudar? 😊');
            return res.status(200).json({ success: true, action: 'ai_reactivated' });
        }

        // 1. PROCESSAMENTO DE ÁUDIO
        if (msg.audioMessage) {
            console.log(`[evolution-webhook] 🎤 Áudio recebido de ${clientName} (${clientPhone}), buscando base64...`);
            let audioBase64 = data.base64 || (data.message && data.message.base64);
            if (!audioBase64) {
                audioBase64 = await getMediaBase64FromEvolution(messageId);
            }

            if (audioBase64) {
                console.log(`[evolution-webhook] 🎤 Transcrevendo áudio com Gemini 3.5 Flash-Lite...`);
                const transcribed = await analyzeMultimodalWithGemini(
                    audioBase64,
                    'audio/ogg',
                    'Transcreva o áudio acima em texto, em português do Brasil. Retorne APENAS o que a pessoa disse, sem introduções ou explicações.'
                );
                if (transcribed && transcribed.length > 0) {
                    console.log(`[evolution-webhook] 🎤 ✅ Áudio transcrito com sucesso: "${transcribed}"`);
                    messageText = transcribed;
                } else {
                    console.warn(`[evolution-webhook] 🎤 Falha ao transcrever áudio.`);
                }
            }

            if (!messageText || messageText.trim().length === 0) {
                await sendWhatsAppMessage(targetRecipient, 'Recebi seu áudio! 🎤 Mas o som não ficou muito nítido aqui pra mim. Você poderia me escrever em texto ou mandar outro áudio? 😊');
                return res.status(200).json({ success: true, replied: 'audio_fallback_requested' });
            }
        }

        // 2. PROCESSAMENTO DE DOCUMENTO / PDF (ex: comprovantes de PicPay, Nubank, Banco)
        const docMsg = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;
        if (docMsg) {
            const fileName = docMsg.fileName || 'documento.pdf';
            const mimeType = docMsg.mimetype || 'application/pdf';
            console.log(`[evolution-webhook] 📄 Documento recebido de ${clientName} (${clientPhone}): "${fileName}" (${mimeType})`);

            let docBase64 = data.base64 || (data.message && data.message.base64);
            if (!docBase64) {
                docBase64 = await getMediaBase64FromEvolution(messageId);
            }

            if (docBase64) {
                console.log(`[evolution-webhook] 📄 Analisando documento com Gemini 3.5 Flash-Lite...`);
                const pdfPrompt = `Analise este documento com cuidado.
Se contiver QUALQUER sinal de comprovante de pagamento, Pix, transferência bancária ou recibo:
Retorne no formato exato:
COMPROVANTE DE PAGAMENTO
- Tipo: (Pix / Transferência / etc.)
- Valor: R$ XX,XX
- Data e hora: DD/MM/AAAA às HH:MM
- Pagador (quem enviou): nome completo
- Recebedor (favorecido): nome completo
- Instituição: banco ou fintech (PicPay, Nubank, Itaú, etc.)
- ID da transação: se visível

Se for outro documento, resuma o conteúdo principal.`;

                const analyzedDoc = await analyzeMultimodalWithGemini(docBase64, 'application/pdf', pdfPrompt);
                if (analyzedDoc) {
                    console.log(`[evolution-webhook] 📄 ✅ Documento analisado: "${analyzedDoc.substring(0, 100)}"`);
                    messageText = `[ARQUIVO PDF ENVIADO: ${fileName}]\n${analyzedDoc}`;
                }
            }

            if (!messageText || messageText.trim().length === 0) {
                messageText = `[Cliente enviou arquivo PDF: ${fileName}]`;
            }
        }

        // 3. PROCESSAMENTO DE IMAGEM (foto ou print de tela de comprovante)
        const imgMsg = msg.imageMessage;
        if (imgMsg && (!messageText || messageText.trim().length === 0 || imgMsg.caption)) {
            console.log(`[evolution-webhook] 🖼️ Imagem recebida de ${clientName} (${clientPhone}), buscando base64...`);
            let imgBase64 = data.base64 || (data.message && data.message.base64);
            if (!imgBase64) {
                imgBase64 = await getMediaBase64FromEvolution(messageId);
            }

            if (imgBase64) {
                console.log(`[evolution-webhook] 🖼️ Analisando imagem com Gemini 3.5 Flash-Lite...`);
                const imgPrompt = `Analise esta imagem com cuidado.
Se contiver QUALQUER sinal de comprovante de pagamento, Pix, transferência bancária, recibo ou print de app de banco:
Retorne no formato exato:
COMPROVANTE DE PAGAMENTO
- Tipo: (Pix / Transferência / etc.)
- Valor: R$ XX,XX
- Data e hora: DD/MM/AAAA às HH:MM
- Pagador (quem enviou): nome completo
- Recebedor (favorecido): nome completo
- Instituição: banco ou fintech (PicPay, Nubank, Itaú, etc.)
- ID da transação: se visível

Se for foto de comida, cardápio ou outro assunto, descreva brevemente.`;

                const analyzedImg = await analyzeMultimodalWithGemini(imgBase64, imgMsg.mimetype || 'image/jpeg', imgPrompt);
                if (analyzedImg) {
                    console.log(`[evolution-webhook] 🖼️ ✅ Imagem analisada: "${analyzedImg.substring(0, 100)}"`);
                    const existingCaption = messageText ? `Legenda do cliente: "${messageText}"\n\n` : '';
                    messageText = `${existingCaption}[IMAGEM ENVIADA]:\n${analyzedImg}`;
                }
            }
        }

        if (!messageText || messageText.trim().length === 0) {
            return res.status(200).json({ success: true, ignored: 'empty_message' });
        }

        // Se for mensagem encaminhada pelo cardápio online do site
        const isSiteOrder = /Pedido Fast Savory|Código:.*#|Itens do Pedido:/i.test(messageText);
        if (isSiteOrder && JESSICA_PHONE && clientPhone !== JESSICA_PHONE) {
            console.log(`[evolution-webhook] 🌐 Pedido do SITE recebido de ${clientName} (${clientPhone})! Notificando Jéssica...`);
            await sendWhatsAppMessage(
                JESSICA_PHONE,
                `🔔 *NOVO PEDIDO FEITO NO SITE!* 🌐\n\n👤 *Cliente:* ${clientName}\n📱 *WhatsApp:* https://wa.me/${clientPhone}\n\n${messageText}`
            );
        }

        console.log(`[evolution-webhook] 📩 Mensagem de ${clientName} (${clientPhone}): "${messageText.substring(0, 60)}"`);

        // Executa o motor Gemini reutilizando toda a lógica de negócio do FastSavory's
        const mockReq = {
            body: {
                message: messageText,
                name: clientName,
                user_id: clientPhone,
                phone: clientPhone
            }
        };

        const mockRes = createMockRes();
        await handleGeminiCore(mockReq, mockRes);

        const result = mockRes._body || {};
        const replyText = result.content?.messages?.[0]?.text;
        const orderReady = result.order_ready === 1 || Boolean(result.order_ready);
        const orderSummary = result.order_summary || {};
        const handover = result.handover_to_human === 1;

        if (replyText) {
            console.log(`[evolution-webhook] 🤖 Enviando resposta da IA para ${targetRecipient}...`);
            await sendWhatsAppMessage(targetRecipient, replyText);
        }

        // Se for comprovante de pagamento recebido, notifica Jéssica no WhatsApp pessoal
        const isReceipt = /COMPROVANTE DE PAGAMENTO/i.test(messageText) || /Comprovante recebido/i.test(replyText || '');
        if (isReceipt && JESSICA_PHONE && clientPhone !== JESSICA_PHONE) {
            console.log(`[evolution-webhook] 💸 Comprovante recebido de ${clientName} (${clientPhone})! Notificando Jéssica...`);
            await sendWhatsAppMessage(
                JESSICA_PHONE,
                `🔔 *COMPROVANTE DE PAGAMENTO RECEBIDO!* 💸\n\n👤 *Cliente:* ${clientName}\n📱 *WhatsApp:* https://wa.me/${clientPhone}\n\n${messageText}\n\n💬 *Conversa:* https://wa.me/${clientPhone}`
            );
        }

        // Se cliente solicitou atendente humano
        if (handover) {
            console.log(`[evolution-webhook] 🚨 Atendimento humano solicitado por ${clientPhone}.`);
            await setHumanPause(clientPhone, 60);
            if (JESSICA_PHONE && !isReceipt) {
                await sendWhatsAppMessage(
                    JESSICA_PHONE,
                    `⚠️ *ATENDIMENTO HUMANO SOLICITADO*\n\nO cliente *${clientName}* (${clientPhone}) solicitou falar com uma atendente.\nA IA foi pausada nesta conversa por 1 hora.\n💬 Conversa: https://wa.me/${clientPhone}`
                );
            }
        }

        // Se um pedido foi finalizado pela IA
        if (orderReady) {
            console.log(`[evolution-webhook] 🎉 Pedido finalizado para ${clientPhone}! Notificando Jéssica...`);
            await notifyJessica(orderSummary, clientPhone, clientName);

            // Sincroniza com Google Calendar se houver data agendada
            if (orderSummary.scheduled_date) {
                try {
                    const { syncOrderToGoogleCalendar } = require('./google-calendar');
                    if (typeof syncOrderToGoogleCalendar === 'function') {
                        syncOrderToGoogleCalendar({
                            ...orderSummary,
                            client_name: orderSummary.client_name || clientName,
                            client_phone: clientPhone
                        }).catch(e => console.warn('[evolution-webhook] GCal sync warn:', e.message));
                    }
                } catch (gcalErr) {}
            }
        }

        return res.status(200).json({
            success: true,
            replied: Boolean(replyText),
            order_ready: orderReady,
            handover: handover
        });

    } catch (err) {
        console.error('[evolution-webhook] Erro geral:', err);
        return res.status(200).json({ success: false, error: err.message });
    }
};

module.exports.config = {
    maxDuration: 30,
    regions: ['gru1']
};
