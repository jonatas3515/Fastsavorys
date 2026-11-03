/**
 * FastSavory's - Meta WhatsApp Cloud API Official Webhook Handler
 * 
 * Integração direta, oficial e definitiva com a Meta (Facebook) Cloud API.
 * 100% livre de ManyChat, sem emuladores não oficiais.
 * Suporta o modo de coexistência com o aplicativo WhatsApp Business da loja.
 */

const { createClient } = require('@supabase/supabase-js');
const { handleGeminiCore, createMockRes, normalizeBrazilianPhone } = require('../manychat-api');

const supabaseUrl = process.env.SUPABASE_URL || 'https://vqjyjdllapqbqpylshkw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Configuração Meta Cloud API Oficial
const DEFAULT_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '963270203535226';
const DEFAULT_WABA_ID = process.env.WHATSAPP_WABA_ID || '833910726072810';
const DEFAULT_META_TOKEN = (process.env.WHATSAPP_META_TOKEN || process.env.WHATSAPP_TOKEN || 'EAAaPbZAHxyJ8BS5eInKTKAOoDiAcvnkB72Bw0LRhNbNzwZCsOlMaCw2MZBUtm9IeEtAKIOtDobiqEtpW52DjYJZAXZBzcWncjD9esqfSe2W3WZCQB3ZBNuYB6KHN1qJ7GQQPq6ZAd4pMDiHJ9OZAiX05wjWPIRO3c8Mmk3O5kwu51ZCsZCRplkQIZBdJFAv8a7l8W2tWEIA7q0adLHvU').trim();
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'fastsavorys_meta_webhook_2026';

// Número da Jéssica para alertas
const JESSICA_PHONE = (process.env.JESSICA_PERSONAL_PHONE || '5573998621125').replace(/\D/g, '');

/**
 * Busca credenciais atualizadas do Meta WhatsApp no Supabase
 */
async function getActiveMetaCredentials() {
    try {
        if (supabaseAdmin) {
            const { data } = await supabaseAdmin
                .from('fast_store_config')
                .select('whatsapp_meta_config')
                .eq('id', 1)
                .maybeSingle();

            const cfg = data?.whatsapp_meta_config;
            if (cfg?.access_token) {
                return {
                    token: cfg.access_token.trim(),
                    phoneId: cfg.phone_number_id || DEFAULT_PHONE_ID,
                    wabaId: cfg.waba_id || DEFAULT_WABA_ID
                };
            }
        }
    } catch (e) {
        console.warn('[meta-webhook] Falha ao carregar credenciais do Supabase, usando padrão:', e.message);
    }
    return {
        token: DEFAULT_META_TOKEN,
        phoneId: DEFAULT_PHONE_ID,
        wabaId: DEFAULT_WABA_ID
    };
}

/**
 * Envia mensagem de texto oficial via Meta Cloud API
 */
async function sendMetaMessage(phoneNumberId, to, text) {
    const creds = await getActiveMetaCredentials();
    const targetPhoneId = phoneNumberId || creds.phoneId;
    const cleanTo = String(to).replace(/\D/g, '');
    const url = `https://graph.facebook.com/v21.0/${targetPhoneId}/messages`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${creds.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanTo,
                type: 'text',
                text: { body: text }
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error(`[meta-webhook] Falha ao enviar mensagem para ${cleanTo}:`, data);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`[meta-webhook] Erro de rede ao enviar mensagem para ${cleanTo}:`, err.message);
        return false;
    }
}

/**
 * Baixa mídia (áudio, imagem, pdf) do servidor oficial da Meta
 */
async function downloadMetaMedia(mediaId) {
    if (!mediaId) return null;
    try {
        const creds = await getActiveMetaCredentials();
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${creds.token}` }
        });
        const metaData = await metaRes.json();
        if (!metaData.url) return null;

        const fileRes = await fetch(metaData.url, {
            headers: { 'Authorization': `Bearer ${creds.token}` }
        });
        const arrayBuf = await fileRes.arrayBuffer();
        return {
            base64: Buffer.from(arrayBuf).toString('base64'),
            mimeType: metaData.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream'
        };
    } catch (e) {
        console.error(`[meta-webhook] Erro ao baixar mídia ${mediaId}:`, e.message);
        return null;
    }
}

/**
 * Analisa qualquer mídia (áudio, imagem ou PDF) usando o Gemini 2.5 Flash Multimodal
 */
async function analyzeMultimodalWithGemini(base64Data, mimeType, prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !base64Data) return null;

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
                                mime_type: mimeType,
                                data: rawBase64
                            }
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error(`[meta-webhook] Gemini multimodal error ${response.status}:`, errText.substring(0, 200));
            return null;
        }

        const data = await response.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return candidateText ? candidateText.trim() : null;
    } catch (err) {
        console.error('[meta-webhook] Exceção multimodal:', err.message);
        return null;
    }
}

/**
 * Handler Principal do Webhook
 */
module.exports = async (req, res) => {
    // 1. GET - Validação do Webhook pela Meta
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('[meta-webhook] ✅ Webhook validado com sucesso pela Meta!');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(challenge);
        }

        console.warn('[meta-webhook] ❌ Falha na validação do webhook:', { mode, tokenExpected: VERIFY_TOKEN, tokenReceived: token });
        return res.status(403).json({ error: 'Token de verificação inválido' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body || {};

    // 2. Filtra eventos de atualização de status (entregue, lido, etc.)
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
        return res.status(200).json({ success: true, ignored: 'no_value' });
    }

    if (value.statuses && !value.messages) {
        return res.status(200).json({ success: true, ignored: 'status_update' });
    }

    const messages = value.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(200).json({ success: true, ignored: 'no_messages' });
    }

    const msg = messages[0];
    const senderPhone = msg.from;
    const phoneNumberId = value.metadata?.phone_number_id || DEFAULT_PHONE_ID;
    const clientName = value.contacts?.[0]?.profile?.name || 'Cliente';

    try {
        let messageText = '';

        if (msg.type === 'text') {
            messageText = msg.text?.body || '';
        } else if (msg.type === 'interactive') {
            messageText = msg.interactive?.button_reply?.title ||
                          msg.interactive?.list_reply?.title ||
                          msg.interactive?.button_reply?.id || '';
        } else if (msg.type === 'button') {
            messageText = msg.button?.text || '';
        } else if (msg.type === 'audio') {
            console.log(`[meta-webhook] 🎤 Áudio recebido de ${clientName} (${senderPhone}), baixando da Meta...`);
            const audioData = await downloadMetaMedia(msg.audio?.id);
            if (audioData) {
                const transcribed = await analyzeMultimodalWithGemini(
                    audioData.base64,
                    audioData.mimeType,
                    'Transcreva exatamente o que foi dito neste áudio em português do Brasil. Retorne apenas o texto transcrito, sem introduções.'
                );
                if (transcribed) {
                    console.log(`[meta-webhook] 🎤 ✅ Áudio transcrito: "${transcribed}"`);
                    messageText = transcribed;
                }
            }
        } else if (msg.type === 'image') {
            console.log(`[meta-webhook] 🖼️ Imagem recebida de ${clientName} (${senderPhone}), baixando da Meta...`);
            const imgData = await downloadMetaMedia(msg.image?.id);
            const caption = msg.image?.caption || '';
            if (imgData) {
                const analysis = await analyzeMultimodalWithGemini(
                    imgData.base64,
                    imgData.mimeType || 'image/jpeg',
                    'Analise esta imagem com atenção. Se for comprovante de pagamento Pix, transferência ou recibo, extraia os dados (Valor, Pagador, Recebedor, Data/Hora). Se for outro assunto, descreva.'
                );
                if (analysis) {
                    messageText = `${caption ? caption + '\n\n' : ''}[IMAGEM ENVIADA]:\n${analysis}`;
                }
            }
            if (!messageText) messageText = caption || '[Cliente enviou uma imagem]';
        } else if (msg.type === 'document') {
            messageText = msg.document?.caption || `[Cliente enviou documento: ${msg.document?.filename || 'arquivo'}]`;
        }

        if (!messageText || messageText.trim().length === 0) {
            return res.status(200).json({ success: true, ignored: 'empty_text' });
        }

        console.log(`[meta-webhook] 📩 Mensagem de ${clientName} (${senderPhone}): "${messageText.substring(0, 60)}"`);

        // Executa o motor Gemini completo do FastSavory's
        const mockReq = {
            body: {
                message: messageText,
                name: clientName,
                user_id: senderPhone,
                phone: senderPhone
            }
        };

        const mockRes = createMockRes();
        await handleGeminiCore(mockReq, mockRes);

        const result = mockRes._body || {};
        const replyText = result.content?.messages?.[0]?.text;
        const orderReady = result.order_ready === 1 || Boolean(result.order_ready);
        const handover = result.handover_to_human === 1;

        if (replyText) {
            console.log(`[meta-webhook] 🤖 Enviando resposta oficial da IA para ${senderPhone}...`);
            await sendMetaMessage(phoneNumberId, senderPhone, replyText);
        }

        // Notifica Jéssica se for comprovante
        const isReceipt = /COMPROVANTE DE PAGAMENTO/i.test(messageText) || /Comprovante recebido/i.test(replyText || '');
        if (isReceipt && JESSICA_PHONE && senderPhone !== JESSICA_PHONE) {
            console.log(`[meta-webhook] 💸 Comprovante recebido de ${clientName}! Notificando Jéssica...`);
            await sendMetaMessage(
                phoneNumberId,
                JESSICA_PHONE,
                `🔔 *COMPROVANTE DE PAGAMENTO RECEBIDO!* 💸\n\n👤 *Cliente:* ${clientName}\n📱 *WhatsApp:* https://wa.me/${senderPhone}\n\n${messageText}`
            );
        }

        // Notifica Jéssica se pedido foi finalizado
        if (orderReady && JESSICA_PHONE && senderPhone !== JESSICA_PHONE) {
            console.log(`[meta-webhook] 🎉 Pedido finalizado para ${senderPhone}! Notificando Jéssica...`);
            await sendMetaMessage(
                phoneNumberId,
                JESSICA_PHONE,
                `🎉 *NOVO PEDIDO CONFIRMADO NO WHATSAPP!* 🥟\n\n👤 *Cliente:* ${clientName}\n📱 *WhatsApp:* https://wa.me/${senderPhone}\n\n${replyText}`
            );
        }

        return res.status(200).json({
            success: true,
            replied: Boolean(replyText),
            order_ready: orderReady,
            handover: handover
        });
    } catch (err) {
        console.error('[meta-webhook] Erro geral no processamento:', err);
        return res.status(200).json({ success: false, error: err.message });
    }
};

module.exports.sendMetaMessage = sendMetaMessage;
