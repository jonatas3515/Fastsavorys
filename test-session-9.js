const fs = require('fs');
const url = 'https://fastsavorys.vercel.app/api/manychat-gemini';

async function runTest2() {
  console.log('Sending fully complete Sunday order to trigger ORDER_JSON...');
  // Provide ALL info so the AI has no choice but to confirm and output order json
  const msg = "Quero 100 mini salgados (sabor frango e queijo). Entrega para domingo às 15h. Meu endereço é Bairro Corujão, Rua das Flores, numero 123. Vou pagar no dinheiro. Pode confirmar o pedido.";
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, name: 'Tester', user_id: 'test-sess9-fully-complete' })
  });
  const data = await res.json();
  fs.writeFileSync('test_order_json_sunday.json', JSON.stringify(data, null, 2));
  console.log('Generated test_order_json_sunday.json');
}

runTest2().catch(console.error);
