// ============================================================================
// CAIXINHA: PAGAMENTO (módulo isolado)
// ============================================================================
// Funções utilitárias/determinísticas de pagamento:
//   - PIX "copia e cola" (BR Code EMV + CRC16) — gerado localmente, sem dependência externa.
//   - Link de checkout do Stripe (cartão) — recebe a instância `stripe` por parâmetro.
//
// A orquestração (os interceptadores que trocam a resposta da IA pelas tags
// [GERAR_PIX:...] / [GERAR_LINK_CARTAO:...]) permanece no handler principal,
// pois depende do contexto da requisição (reply, sessão, etc.). Aqui ficam só
// os geradores puros, fáceis de testar e reutilizar.
//
// A validação de VALOR (anti-alucinação) vive em ./pricing.js
// (validatePixAmount / validateCartaoAmount).
// ============================================================================

// ==========================================
// PIX — BR Code (EMV) + CRC16-CCITT
// ==========================================
// CRC16-CCITT (polinômio 0x1021, init 0xFFFF) — exigido no final do payload PIX.
function computeCRC16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    crc = crc & 0xFFFF;
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Gera o "PIX copia e cola" (BR Code estático). Se `amount` > 0, inclui o valor no payload;
// caso contrário gera um PIX SEM valor (o cliente digita). Dados do recebedor são fixos (loja).
function generatePixBrCode(amount = null) {
    // Chave PIX (CNPJ sem pontuação): 63.160.686/0001-06 -> 63160686000106 (14 dígitos)
    const key = "63160686000106";
    let payload = "000201";
    // Merchant Account Information
    const mai = "0014br.gov.bcb.pix01" + key.length.toString().padStart(2, '0') + key;
    payload += "26" + mai.length.toString().padStart(2, '0') + mai;
    // Merchant Category Code
    payload += "52040000";
    // Transaction Currency (986 = BRL)
    payload += "5303986";
    // Transaction Amount (opcional)
    if (amount && Number(amount) > 0) {
        const amtStr = Number(amount).toFixed(2);
        payload += "54" + amtStr.length.toString().padStart(2, '0') + amtStr;
    }
    // Country Code
    payload += "5802BR";
    // Merchant Name
    const name = "JESSICA RODRIGUES DOS SANTOS".substring(0, 25);
    payload += "59" + name.length.toString().padStart(2, '0') + name;
    // Merchant City
    const city = "Itamaraju";
    payload += "60" + city.length.toString().padStart(2, '0') + city;
    // Additional Data Field Template
    const txid = "***";
    const adft = "05" + txid.length.toString().padStart(2, '0') + txid;
    payload += "62" + adft.length.toString().padStart(2, '0') + adft;
    // CRC16
    payload += "6304";
    const crc = computeCRC16(payload);
    return payload + crc;
}

// ==========================================
// CARTÃO — Stripe Checkout
// ==========================================
// Cria uma sessão de checkout do Stripe e retorna a URL. A instância `stripe` é passada
// por parâmetro (o handler é dono da inicialização). Retorna null em caso de erro / sem stripe.
async function generateStripeCheckoutLink(stripe, amount, customerName = 'Cliente') {
    if (!stripe) {
        console.error('[payment] Stripe not configured');
        return null;
    }

    try {
        const successUrl = process.env.CHECKOUT_SUCCESS_URL ||
            `https://fastsavorys.vercel.app/pages/fast.html?payment=success`;
        const cancelUrl = process.env.CHECKOUT_CANCEL_URL ||
            `https://fastsavorys.vercel.app/pages/fast.html?payment=cancel`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: `Pedido Fast Savory's`,
                        description: `Pedido para ${customerName}`
                    },
                    unit_amount: Math.round(amount * 100) // Stripe usa centavos
                },
                quantity: 1
            }],
            metadata: {
                source: 'manychat_bot',
                customer_name: customerName
            }
        });

        console.log(`[payment] ✅ Stripe checkout session created: ${session.id}`);
        return session.url;
    } catch (err) {
        console.error('[payment] Stripe checkout error:', err.message);
        return null;
    }
}

module.exports = {
    computeCRC16,
    generatePixBrCode,
    generateStripeCheckoutLink,
};
