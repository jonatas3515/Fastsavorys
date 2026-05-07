require('dotenv').config();

// INJEÇÃO DE VARIÁVEIS PARA TESTE LOCAL (Ids fornecidos pelo usuário)
// Estas variáveis são definidas aqui para fins de teste local e podem sobrescrever valores do .env
process.env.MANYCHAT_FLOW_ID_SCHEDULED_ORDER = process.env.MANYCHAT_FLOW_ID_SCHEDULED_ORDER || 'content20260217191735';
process.env.MANYCHAT_FIELD_ID_SCHEDULED_CLIENT_NAME = process.env.MANYCHAT_FIELD_ID_SCHEDULED_CLIENT_NAME || '14285656';
process.env.MANYCHAT_FIELD_ID_SCHEDULED_DATE = process.env.MANYCHAT_FIELD_ID_SCHEDULED_DATE || '14285661';
process.env.MANYCHAT_FIELD_ID_SCHEDULED_TIME = process.env.MANYCHAT_FIELD_ID_SCHEDULED_TIME || '14285663';
process.env.MANYCHAT_FIELD_ID_SCHEDULED_ITEMS = process.env.MANYCHAT_FIELD_ID_SCHEDULED_ITEMS || '14285667';

const { createClient } = require('@supabase/supabase-js');
const handler = require('../api/cron/notify-scheduled-orders');

async function testCron() {
    console.log('🚀 Iniciando teste do Cron Job de Encomendas Agendadas...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Erro: Credenciais do Supabase não encontradas.');
        console.error('Certifique-se de que o arquivo .env está configurado.');
        return;
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 1. Calcular "Amanhã" para criar um pedido de teste
    const now = new Date();
    // UTC-3 logic from the main file
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const nowBrasilia = new Date(utc - (3 * 60 * 60 * 1000));
    const tomorrow = new Date(nowBrasilia);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Format YYYY-MM-DD
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${y}-${m}-${d}`;

    console.log(`📅 Data de teste (Amanhã): ${tomorrowStr}`);

    // 2. Criar pedido fictício
    const dummyOrder = {
        id: Date.now(),
        client_name: 'Teste Cron Automático',
        client_phone: '5511999999999',
        items: [{ name: 'Bolo de Teste', quantity: 1, price: 50.00, note: 'Teste automatizado' }],
        subtotal: 50.00,
        total: 50.00,
        payment_method: 'pix',
        delivery_type: 'entrega',
        scheduled_date: tomorrowStr,
        scheduled_time: '14:30',
        status: 'pending',
        created_at: new Date().toISOString()
    };

    console.log('📝 Criando pedido fictício no Supabase...');
    const { error: insertError } = await supabase
        .from('fast_orders')
        .insert(dummyOrder);

    if (insertError) {
        console.error('❌ Erro ao criar pedido:', insertError);
        return;
    }

    console.log('✅ Pedido criado com sucesso.');

    // 3. Executar o Handler do Cron
    console.log('⚡ Executando o handler do cron...');

    // Mock response object
    const res = {
        status: (code) => ({
            json: (data) => {
                console.log(`\n📬 Resposta do Handler [Status ${code}]:`);
                console.log(JSON.stringify(data, null, 2));
                return data;
            }
        })
    };

    // Mock request object
    const req = {};

    try {
        await handler(req, res);
    } catch (err) {
        console.error('❌ Erro na execução do handler:', err);
    }

    // 4. Limpeza (Opcional - comentar se quiser ver o pedido no banco)
    console.log('\n🧹 Limpando pedido de teste...');
    const { error: deleteError } = await supabase
        .from('fast_orders')
        .delete()
        .eq('id', dummyOrder.id);

    if (deleteError) console.error('⚠️ Erro ao deletar pedido:', deleteError);
    else console.log('✅ Pedido de teste removido.');

    console.log('🏁 Teste finalizado.');
}

testCron();
