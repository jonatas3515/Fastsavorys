const fs = require('fs');
const url = 'https://fastsavorys.vercel.app/api/manychat-gemini';

async function run() {
  const websiteOrder = `*Pedido Fast Savory's*
*Código:* FAST-0055
*Cliente:* Brenda Da Costa Santos
*Itens do Pedido:*
3x Coxinha de Frango (-R$ 0,30) - R$ 12,60
1x Rissole de Carne (-R$ 0,25) - R$ 4,25
*Total: R$ 30,35*`;

  const r1 = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: websiteOrder, name: 'Brenda', user_id: 'test-site-order-v2'})});
  fs.writeFileSync('site-order.json', await r1.text());

  const noiseMessage = `A automação Fluxo de resposta fechado e funcionando foi acionada
Campo personalizado foi alterado: data_da_proxima_iteração
Olá Iana! Seu pedido FAST-0055 acabou de chegar pra gente!
boa tarde`;

  const r2 = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: noiseMessage, name: 'Iana', user_id: 'test-noise-filter-v2'})});
  fs.writeFileSync('noise-filter.json', await r2.text());
}
run().catch(console.error);
