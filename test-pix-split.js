const fs = require('fs');
const url = 'https://fastsavorys.vercel.app/api/manychat-gemini';

async function run() {
  const t1Msg = "Quero\n1 coxinha\nE mais 1\nrissole de carne";
  const r1 = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: t1Msg, name: 'User', user_id: 'test-multiline-1'})});
  const data1 = await r1.json();
  fs.writeFileSync('test1-multiline.json', JSON.stringify(data1, null, 2));
  
  const t2Msg = "E cadê a chave pix pra pagar 45 reais?";
  const r2 = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: t2Msg, name: 'User', user_id: 'test-pix-5'})});
  const data2 = await r2.json();
  fs.writeFileSync('test2-pix.json', JSON.stringify(data2, null, 2));

  const t3Msg = "";
  const r3 = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: t3Msg, audio_url: 'http://test.ogg', name: 'User', user_id: 'test-audio-1'})});
  const data3 = await r3.json();
  fs.writeFileSync('test3-audio.json', JSON.stringify(data3, null, 2));

  console.log("Tests 1 to 3 generated successfully.");
}
run().catch(console.error);
