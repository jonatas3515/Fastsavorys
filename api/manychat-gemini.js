/**
 * ManyChat ↔ Gemini Integration
 * POST /api/manychat-gemini
 *
 * Recebe mensagem do ManyChat (webhook), chama Gemini e devolve a resposta.
 * Nenhuma dependência extra — usa fetch nativo do Node 18+.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

const SYSTEM_PROMPT = `Você é a atendente virtual da FastSavory's, uma lanchonete de delivery.
Seja simpática, objetiva e responda sempre em português brasileiro.
Se não souber a resposta, peça para o cliente aguardar que um atendente humano vai ajudar.
Nunca invente informações sobre cardápio, preços ou horários — se não tiver certeza, diga que vai confirmar.`;

module.exports = async function handler(req, res) {
    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[manychat-gemini] GEMINI_API_KEY não configurada');
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
        // ManyChat envia o texto do usuário no campo "message" (configurável no External Request)
        const { message, name } = req.body || {};

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Campo "message" vazio ou ausente' });
        }

        const userMessage = name
            ? `Cliente "${name}" disse: ${message}`
            : message;

        // Chamada à API REST do Gemini
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                contents: [
                    { role: 'user', parts: [{ text: userMessage }] }
                ],
                generationConfig: {
                    maxOutputTokens: 300,
                    temperature: 0.7
                }
            })
        });

        if (!geminiRes.ok) {
            const errBody = await geminiRes.text();
            console.error('[manychat-gemini] Gemini API error:', geminiRes.status, errBody);
            return res.status(502).json({ error: 'Gemini API error', details: errBody });
        }

        const data = await geminiRes.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
            || 'Desculpe, não consegui gerar uma resposta agora. Um atendente vai te ajudar!';

        // Resposta no formato que o ManyChat External Request espera
        // O campo "reply" será mapeado para um Custom Field no ManyChat
        return res.status(200).json({
            version: 'v2',
            content: {
                messages: [
                    {
                        type: 'text',
                        text: reply
                    }
                ],
                actions: [],
                quick_replies: []
            }
        });
    } catch (err) {
        console.error('[manychat-gemini] Erro inesperado:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
