/**
 * Evolution API Webhook Handler - FastSavory's AI Assistant
 * 
 * Substitui o ManyChat como canal de atendimento:
 * - Recebe mensagens do WhatsApp da lanchonete (instância fast_lanchonete na Oracle VPS)
 * - Processa mensagens de texto e ÁUDIOS (transcrição direta via Gemini)
 * - Processa mensagens com o Gemini (motor inteligente com regras de cardápio, entrega, sabores, memória e pedidos)
 * - Responde automaticamente pelo WhatsApp via Evolution API (sem delay e sem card gigante de linkPreview)
 * - Permite pausa para atendimento humano quando Jéssica responder no celular
 * - Notifica Jéssica no WhatsApp pessoal quando um novo pedido for finalizado ou atendente solicitado
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

// Número da Jéssica para receber notificações de novos pedidos e transbordo
const JESSICA_PHONE = (process.env.WHATSAPP_NUMBER || '5573999366554').replace(/\D/g, '');

// Cache em memória de pausas humanas (temporário por processo)
const humanPauses = new Map();

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

// Busca o arquivo base64 de um áudio/mídia na Evolution API caso não venha no webhook
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

// Transcreve áudio diretamente usando o Gemini 2.5 Flash Multimodal
async function transcribeAudioWithGemini(base64Data) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !base64Data) return null;

    // Limpa prefixo data:audio/...;base64, se existir
    const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inline_data: {
                                mime_type: 'audio/ogg',
                                data: rawBase64
                            }
                        },
                        {
                            text: 'Transcreva o áudio acima em texto, em português do Brasil. Retorne APENAS o que a pessoa disse, sem introduções ou explicações.'
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 512
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`[evolution-webhook] Gemini transcription error ${response.status}:`, errText.substring(0, 200));
            return null;
        }

        const data = await response.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return candidateText ? candidateText.trim() : null;
    } catch (err) {
        console.error('[evolution-webhook] Exceção na transcrição de áudio:', err.message);
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
        const fromMe = Boolean(key.fromMe);
        const messageId = key.id;

        // Ignora grupos e transmissões
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('@broadcast') || remoteJid.includes('status@broadcast')) {
            return res.status(200).json({ success: true, ignored: 'group_or_broadcast' });
        }

        const clientPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        if (!clientPhone) {
            return res.status(200).json({ success: true, ignored: 'no_phone' });
        }

        // Se a mensagem partiu do próprio WhatsApp da Lanchonete (Jéssica falando no celular):
        if (fromMe) {
            if (clientPhone !== JESSICA_PHONE) {
                console.log(`[evolution-webhook] 👤 Jéssica interagiu com ${clientPhone}. Ativando pausa humana de 45 min.`);
                await setHumanPause(clientPhone, 45);
            }
            return res.status(200).json({ success: true, action: 'human_takeover_recorded' });
        }

        // Verifica se a conversa está pausada para atendimento humano
        if (await isHumanPaused(clientPhone)) {
            console.log(`[evolution-webhook] ⏸️ Conversa com ${clientPhone} em pausa humana ativa. IA silenciada.`);
            return res.status(200).json({ success: true, ignored: 'human_paused' });
        }

        // Extrai dados da mensagem
        const msg = data.message || {};
        let messageText = msg.conversation ||
                          msg.extendedTextMessage?.text ||
                          msg.imageMessage?.caption ||
                          msg.videoMessage?.caption ||
                          '';

        const clientName = data.pushName || 'Cliente';

        // Comando manual de destravamento/pausa pelo cliente (ex: #ia ou #voltar)
        if (/^#?(voltar|chamar\s*ia|ativar\s*ia)$/i.test(messageText.trim())) {
            humanPauses.delete(clientPhone);
            await sendWhatsAppMessage(clientPhone, 'Olá! O assistente virtual da FastSavory\'s foi reativado. Como posso te ajudar? 😊');
            return res.status(200).json({ success: true, action: 'ai_reactivated' });
        }

        // PROCESSAMENTO DE ÁUDIO (se recebido)
        if (msg.audioMessage) {
            console.log(`[evolution-webhook] 🎤 Áudio recebido de ${clientName} (${clientPhone}), buscando base64...`);
            let audioBase64 = data.base64 || (data.message && data.message.base64);
            if (!audioBase64) {
                audioBase64 = await getMediaBase64FromEvolution(messageId);
            }

            if (audioBase64) {
                console.log(`[evolution-webhook] 🎤 Transcrevendo áudio com Gemini 2.5 Flash...`);
                const transcribed = await transcribeAudioWithGemini(audioBase64);
                if (transcribed && transcribed.length > 0) {
                    console.log(`[evolution-webhook] 🎤 ✅ Áudio transcrito com sucesso: "${transcribed}"`);
                    messageText = transcribed;
                } else {
                    console.warn(`[evolution-webhook] 🎤 Falha ao transcrever áudio.`);
                }
            }

            if (!messageText || messageText.trim().length === 0) {
                await sendWhatsAppMessage(clientPhone, 'Recebi seu áudio! 🎤 Mas o som não ficou muito nítido aqui pra mim. Você poderia me escrever em texto ou mandar outro áudio? 😊');
                return res.status(200).json({ success: true, replied: 'audio_fallback_requested' });
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
            console.log(`[evolution-webhook] 🤖 Enviando resposta da IA para ${clientPhone}...`);
            await sendWhatsAppMessage(clientPhone, replyText);
        }

        // Se cliente solicitou atendente humano
        if (handover) {
            console.log(`[evolution-webhook] 🚨 Atendimento humano solicitado por ${clientPhone}.`);
            await setHumanPause(clientPhone, 60);
            if (JESSICA_PHONE) {
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
