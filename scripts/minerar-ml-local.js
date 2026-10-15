/**
 * FastSavory's - Minerador Local de Ofertas do Mercado Livre (Opção 2)
 * 
 * Conecta diretamente ao Google Chrome local (com IP residencial brasileiro e login ativo)
 * através do Chrome DevTools Protocol (CDP nativo no Node.js v22+).
 * 
 * 100% à prova de bloqueios da Akamai/WAF e gera os links /sec/ oficiais do ML.
 */

const http = require('http');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ML_HUB_URL = 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user';
const API_BATCH_URL = 'https://fastsavorys.vercel.app/api/check-affiliate-links?action=quick-save-batch';

console.log('\n=============================================================');
console.log('⚡ FASTSAVORY\'S - MINERADOR LOCAL MERCADO LIVRE');
console.log('=============================================================\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getMLTab() {
  try {
    const tabs = await fetchJson('http://localhost:9222/json');
    return tabs.find(t => t.url && (t.url.includes('mercadolivre.com') || t.url.includes('mercadolibre.com')));
  } catch (e) {
    return null;
  }
}

async function executeInTab(wsUrl, scriptExpression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression: scriptExpression,
          returnByValue: true,
          awaitPromise: true
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const res = JSON.parse(event.data);
        if (res.id === id) {
          ws.close();
          if (res.result && res.result.result) {
            resolve(res.result.result.value);
          } else {
            resolve(null);
          }
        }
      } catch (err) {
        reject(err);
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };
  });
}

async function main() {
  console.log('[1/4] Verificando conexão com o Google Chrome...');

  let tab = await getMLTab();

  if (!tab) {
    console.log('[Info] Chrome com porta de depuração não encontrado.');
    console.log('[Info] Iniciando Chrome com a Central de Afiliados do Mercado Livre...');

    if (fs.existsSync(CHROME_PATH)) {
      spawn(CHROME_PATH, [
        `--remote-debugging-port=9222`,
        `--user-data-dir=${path.join(process.env.TEMP || 'C:\\Temp', 'chrome_fastsavorys_profile')}`,
        ML_HUB_URL
      ], { detached: true, stdio: 'ignore' }).unref();

      console.log('⏳ Aguardando Chrome inicializar (5 segundos)...');
      await sleep(5000);
      tab = await getMLTab();
    } else {
      console.log('⚠️ Chrome não encontrado no caminho padrão.');
    }
  }

  if (!tab) {
    console.log('\n-------------------------------------------------------------');
    console.log('💡 DICA DE USO FÁCIL:');
    console.log('Para usar o modo automático via terminal, feche seu Chrome e abra com:');
    console.log(`chrome.exe --remote-debugging-port=9222 "${ML_HUB_URL}"`);
    console.log('\nOU USE A OPÇÃO 1 (BOOKMARKLET):');
    console.log('Basta abrir a página de afiliados e clicar no botão "⚡ FastSavory\'s Quick Clip"');
    console.log('no seu favoritos do navegador! Ele já faz tudo com 1 clique na própria página!');
    console.log('-------------------------------------------------------------\n');
    process.exit(0);
  }

  console.log(`[2/4] Conectado à aba do Mercado Livre: ${tab.title}`);
  console.log('[3/4] Extraindo produtos e obtendo links de afiliados oficiais (/sec/)...');

  // Script injetado na aba do Mercado Livre para minerar
  const minerScript = `
    (async function() {
      const shareButtons = Array.from(document.querySelectorAll('button, a')).filter(b => (b.innerText || '').trim().toLowerCase() === 'compartilhar');
      const results = [];
      const cards = [];

      shareButtons.forEach(btn => {
        const c = btn.closest('.andes-card') || btn.closest('[class*="card"]') || btn.parentElement?.parentElement;
        if (c && !cards.some(rc => rc.container === c)) {
          cards.push({ container: c, shareBtn: btn });
        }
      });

      for (let i = 0; i < Math.min(cards.length, 15); i++) {
        const { container: c, shareBtn: btn } = cards[i];

        const imgEl = c.querySelector('img[src^="http"], img[data-src^="http"]');
        const image_url = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

        const titleEl = c.querySelector('h2, h3, h4, [class*="title"], a[title]');
        let title = (titleEl ? (titleEl.innerText || titleEl.getAttribute('title')) : '').trim();
        if (!title) {
          const links = Array.from(c.querySelectorAll('a'));
          for (const l of links) {
            const t = (l.innerText || '').trim();
            if (t.length > 15 && !t.includes('Compartilhar') && !t.includes('R$')) {
              title = t;
              break;
            }
          }
        }

        const priceMatches = (c.innerText || '').match(/R\\$\\s*[0-9]+(?:\\.[0-9]{3})*(?:,[0-9]{2})?/g) || [];
        const price_display = priceMatches.length > 0 ? priceMatches[priceMatches.length - 1].replace(/\\s+/g, ' ') : '';

        const origEl = c.querySelector('s, del, [class*="original"], [style*="line-through"]');
        let original_price = '';
        if (origEl) {
          const m = (origEl.innerText || '').match(/R\\$\\s*[0-9.,]+/i);
          if (m) original_price = m[0].replace(/\\s+/g, ' ');
        } else if (priceMatches.length > 1) {
          original_price = priceMatches[0].replace(/\\s+/g, ' ');
        }

        const discMatch = (c.innerText || '').match(/([0-9]{1,2}%\\s*OFF)/i);
        const discount_tag = discMatch ? discMatch[1].toUpperCase() : '';

        let affiliateUrl = (c.querySelector('a[href*="mercadolivre.com"], a[href*="MLB"]') || c.querySelector('a'))?.href || '';

        // Auto-clique Compartilhar
        if (btn) {
          try {
            btn.click();
            await new Promise(r => setTimeout(r, 450));
            const secMatch = (document.body.innerText || '').match(/https?:\\/\\/(?:mercadolivre\\.com\\/sec|meli\\.la)\\/[a-zA-Z0-9_-]+/i);
            const inputLink = document.querySelector('input[value*="/sec/"], input[value*="meli.la"], .andes-modal input');
            if (inputLink && inputLink.value) {
              affiliateUrl = inputLink.value.trim();
            } else if (secMatch) {
              affiliateUrl = secMatch[0].trim();
            }
            const closeBtn = document.querySelector('.andes-modal__close-button, [aria-label*="Fechar" i], [aria-label*="Close" i]');
            if (closeBtn) closeBtn.click();
            else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            await new Promise(r => setTimeout(r, 150));
          } catch(e) {}
        }

        if (title && price_display && affiliateUrl) {
          results.push({
            platform: 'mercadolivre',
            title,
            image_url,
            url: affiliateUrl,
            affiliate_url: affiliateUrl,
            price_display,
            original_price,
            discount_tag
          });
        }
      }

      return results;
    })();
  `;

  const extracted = await executeInTab(tab.webSocketDebuggerUrl, minerScript);

  if (!extracted || extracted.length === 0) {
    console.log('⚠️ Nenhum produto encontrado. Role a página do Mercado Livre e tente novamente.');
    process.exit(0);
  }

  console.log(`✅ ${extracted.length} ofertas mineradas com sucesso!`);
  extracted.forEach((p, i) => {
    console.log(`   ${i + 1}. [${p.discount_tag || 'OFF'}] ${p.title.substring(0, 45)}... -> ${p.price_display} (${p.affiliate_url})`);
  });

  console.log(`\n[4/4] Enviando produtos para a API FastSavory's...`);

  try {
    const postRes = await fetch(API_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: extracted })
    });
    const result = await postRes.json();

    if (result.success) {
      console.log('\n🎉 SUCESSO TOTAL!');
      console.log(`   Novos produtos cadastrados: ${result.inserted_count || 0}`);
      console.log(`   Duplicados ignorados: ${result.duplicates_skipped || 0}`);
      console.log('   Os produtos já estão ativos e visíveis no site da FastSavory\'s!');
    } else {
      console.error('❌ Erro na API:', result.error);
    }
  } catch (apiErr) {
    console.error('❌ Erro de conexão com a API FastSavory\'s:', apiErr.message);
  }
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err);
});
