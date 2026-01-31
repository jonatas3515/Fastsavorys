/**
 * API: /api/client-address
 * Salva/atualiza endereço do cliente com validação
 * Requer um order_code recente para autorizar a operação (trava leve sem login)
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase Admin Client (service role - bypassa RLS)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

// Janela de tempo para permitir alteração (30 minutos)
const ORDER_WINDOW_MINUTES = 30;

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
        return digits.slice(2);
    }
    return digits;
}

function phonesMatch(phone1, phone2) {
    const p1 = normalizePhone(phone1);
    const p2 = normalizePhone(phone2);
    
    if (p1 === p2) return true;
    
    // Compara últimos 8 dígitos (robustez para formatos diferentes)
    if (p1.length >= 8 && p2.length >= 8) {
        return p1.slice(-8) === p2.slice(-8);
    }
    
    return false;
}

module.exports = async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { phone, order_code, address, action } = req.body || {};

        // Validação básica
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone || normalizedPhone.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Telefone inválido'
            });
        }

        if (!order_code) {
            return res.status(400).json({
                success: false,
                error: 'Código do pedido é obrigatório para autorizar alteração'
            });
        }

        if (!address || !address.street || !address.number || !address.neighborhood) {
            return res.status(400).json({
                success: false,
                error: 'Endereço incompleto (rua, número e bairro são obrigatórios)'
            });
        }

        // Busca o pedido para validar autorização
        const { data: order, error: orderError } = await supabaseAdmin
            .from('fast_orders')
            .select('id, client_phone, created_at')
            .eq('order_code', order_code.toUpperCase())
            .single();

        if (orderError || !order) {
            return res.status(403).json({
                success: false,
                error: 'Pedido não encontrado ou código inválido'
            });
        }

        // Valida se o telefone bate com o do pedido
        if (!phonesMatch(order.client_phone, normalizedPhone)) {
            return res.status(403).json({
                success: false,
                error: 'Telefone não corresponde ao pedido'
            });
        }

        // Valida janela de tempo (pedido deve ser recente)
        const orderDate = new Date(order.created_at);
        const now = new Date();
        const diffMinutes = (now - orderDate) / (1000 * 60);

        if (diffMinutes > ORDER_WINDOW_MINUTES) {
            return res.status(403).json({
                success: false,
                error: `Alteração de endereço só é permitida até ${ORDER_WINDOW_MINUTES} minutos após o pedido`
            });
        }

        // Busca cliente existente
        let { data: client, error: clientError } = await supabaseAdmin
            .from('fast_clients')
            .select('id, name, phone, addresses')
            .eq('phone', normalizedPhone)
            .single();

        if (clientError && clientError.code !== 'PGRST116') {
            console.error('[client-address] Erro ao buscar cliente:', clientError);
            return res.status(500).json({
                success: false,
                error: 'Erro ao buscar cliente'
            });
        }

        // Prepara o novo endereço
        const newAddress = {
            id: Date.now(),
            street: address.street.trim(),
            number: address.number.trim(),
            neighborhood: address.neighborhood.trim(),
            reference: (address.reference || '').trim(),
            label: address.label || 'Casa',
            created_at: new Date().toISOString()
        };

        if (client) {
            // Cliente existe - adiciona/atualiza endereço
            let addresses = client.addresses || [];
            
            // Verifica se já existe endereço similar (mesmo rua+número+bairro)
            const existingIndex = addresses.findIndex(a => 
                a.street?.toLowerCase() === newAddress.street.toLowerCase() &&
                a.number === newAddress.number &&
                a.neighborhood?.toLowerCase() === newAddress.neighborhood.toLowerCase()
            );

            if (existingIndex >= 0) {
                // Atualiza endereço existente
                addresses[existingIndex] = { ...addresses[existingIndex], ...newAddress };
            } else {
                // Adiciona novo endereço
                addresses.push(newAddress);
            }

            const { error: updateError } = await supabaseAdmin
                .from('fast_clients')
                .update({ addresses, updated_at: new Date().toISOString() })
                .eq('id', client.id);

            if (updateError) {
                console.error('[client-address] Erro ao atualizar:', updateError);
                return res.status(500).json({
                    success: false,
                    error: 'Erro ao salvar endereço'
                });
            }

            return res.status(200).json({
                success: true,
                message: existingIndex >= 0 ? 'Endereço atualizado' : 'Endereço adicionado',
                address: newAddress
            });

        } else {
            // Cliente não existe - cria novo com o endereço
            const { error: insertError } = await supabaseAdmin
                .from('fast_clients')
                .insert({
                    phone: normalizedPhone,
                    name: '', // Será preenchido no checkout
                    addresses: [newAddress],
                    created_at: new Date().toISOString()
                });

            if (insertError) {
                console.error('[client-address] Erro ao criar cliente:', insertError);
                return res.status(500).json({
                    success: false,
                    error: 'Erro ao criar cliente'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Cliente e endereço criados',
                address: newAddress
            });
        }

    } catch (err) {
        console.error('[client-address] Erro:', err);
        return res.status(500).json({
            success: false,
            error: 'Erro interno'
        });
    }
};
