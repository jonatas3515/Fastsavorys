/**
 * FastSavory's Quick Clip Turbo (Universal In-Browser Extension / Bookmarklet)
 * Suporta:
 * 1. Mineração em LOTE no Hub de Afiliados do Mercado Livre (afiliados/hub) com captura OBRIGATÓRIA de links /sec/ ou meli.la oficiais.
 * 2. Mineração individual em 1-Clique na Amazon, Shopee, Mercado Livre (PDP), Natura e Avon.
 * Proteção total: NUNCA salva produtos do Mercado Livre com links comuns sem comissão!
 */
(async function () {
  // Variável global de captura de link de afiliado oficial
  let lastCapturedAffiliateLink = null;

  // 1. Intercepta navigator.clipboard.writeText para capturar links copiados pelo modal do ML
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      if (!window._fastClipWriteHooked) {
        window._fastClipWriteHooked = true;
        const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async function (text) {
          if (typeof text === 'string') {
            const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m) {
              lastCapturedAffiliateLink = m[0];
              console.log('[Quick Clip Hook] Link capturado via clipboard.writeText:', m[0]);
            }
          }
          try {
            return await origWriteText(text);
          } catch (e) {
            return Promise.resolve();
          }
        };
      }
    }
  } catch (e) {}

  // 2. Intercepta document.execCommand('copy') (caso o ML use hidden textarea + execCommand)
  try {
    if (!window._fastExecCmdHooked && document.execCommand) {
      window._fastExecCmdHooked = true;
      const origExec = document.execCommand.bind(document);
      document.execCommand = function (command) {
        if (command === 'copy') {
          try {
            const sel = window.getSelection ? window.getSelection().toString() : '';
            if (sel) {
              const m = sel.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) lastCapturedAffiliateLink = m[0];
            }
            const active = document.activeElement;
            if (active && (active.value || active.innerText)) {
              const val = active.value || active.innerText;
              const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) lastCapturedAffiliateLink = m[0];
            }
          } catch (err) {}
        }
        return origExec.apply(document, arguments);
      };
    }
  } catch (e) {}

  // 3. Intercepta evento de 'copy' no document
  try {
    if (!window._fastCopyEventHooked) {
      window._fastCopyEventHooked = true;
      document.addEventListener('copy', function (e) {
        try {
          const active = document.activeElement;
          if (active && (active.value || active.innerText)) {
            const val = active.value || active.innerText;
            const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m) lastCapturedAffiliateLink = m[0];
          }
          if (e.clipboardData) {
            const text = e.clipboardData.getData('text/plain');
            if (text) {
              const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) {
                lastCapturedAffiliateLink = m[0];
                console.log('[Quick Clip Hook] Link capturado via copy event:', m[0]);
              }
            }
          }
        } catch (err) {}
      }, true);
    }
  } catch (e) {}

  // 4. Intercepta XMLHttpRequest (usado pelo Axios no Mercado Livre)
  try {
    if (!window._fastXHRHooked && window.XMLHttpRequest) {
      window._fastXHRHooked = true;
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function () {
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
          try {
            const res = this.responseText;
            if (res) {
              const m = res.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) {
                lastCapturedAffiliateLink = m[0];
                console.log('[Quick Clip Hook] Link capturado via XMLHttpRequest:', m[0]);
              }
            }
          } catch (e) {}
        });
        return origSend.apply(this, arguments);
      };
    }
  } catch (e) {}

  // 5. Intercepta window.fetch para capturar respostas de APIs do Mercado Livre
  try {
    if (!window._fastFetchHooked && window.fetch) {
      window._fastFetchHooked = true;
      const origFetch = window.fetch;
      window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
          const clone = res.clone();
          clone.text().then(text => {
            if (text) {
              const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) {
                lastCapturedAffiliateLink = m[0];
                console.log('[Quick Clip Hook] Link capturado via fetch API:', m[0]);
              }
            }
          }).catch(() => {});
        } catch (err) {}
        return res;
      };
    }
  } catch (e) {}

  try {
    const host = window.location.hostname;
    const href = window.location.href;

    // ============================================================
    // 1. MODO LOTE: HUB DE AFILIADOS MERCADO LIVRE OU OFERTAS
    // ============================================================
    const isML = host.includes('mercadolivre') || host.includes('mercadolibre');
    const isMLProduct = isML && (
      document.querySelector('h1.ui-pdp-title, .ui-pdp-title, .ui-pdp-price') !== null ||
      /\/MLB-|\/p\/MLB|\/up\/MLB|produto\.mercadolivre/i.test(href)
    );
    const isMLHubOrOffers = isML && !isMLProduct && (
      href.includes('/afiliados') || href.includes('/ofertas') || href.includes('/hub') || href.includes('is_affiliate=true') ||
      document.querySelector('.poly-card, .andes-card') !== null
    );

    if (isML && isMLHubOrOffers && !isMLProduct) {
      runMLHubBatchMiner();
      return;
    }

    // ============================================================
    // 1.5. MODO LOTE: AMAZON (MAIS VENDIDOS, OFERTAS DO DIA, CATEGORIAS, BUSCA)
    // ============================================================
    const isAmazon = host.includes('amazon');
    const isAmazonProduct = isAmazon && (
      document.getElementById('productTitle') !== null ||
      document.getElementById('dp') !== null ||
      /\/dp\/[A-Z0-9]{10}/i.test(href) ||
      /\/gp\/product\/[A-Z0-9]{10}/i.test(href)
    );
    const isAmazonListing = isAmazon && !isAmazonProduct && (
      href.includes('/bestsellers') ||
      href.includes('/deals') ||
      href.includes('/goldbox') ||
      href.includes('/gp/') ||
      href.includes('/s?') ||
      href.includes('/s/') ||
      document.querySelector('#gridItemRoot, .zg-grid-general-faceout, .s-result-item[data-asin]') !== null
    );

    if (isAmazon && isAmazonListing && !isAmazonProduct) {
      runAmazonBatchMiner();
      return;
    }

    // ============================================================
    // 1.8. MODO LOTE: PORTAL DE AFILIADOS SHOPEE (OFERTAS DE PRODUTO)
    // ============================================================
    const isShopee = host.includes('shopee');
    const isShopeeAffiliate = isShopee && (
      host.includes('affiliate.shopee') ||
      href.includes('/offer/') ||
      href.includes('product_offer') ||
      href.includes('affiliate') ||
      document.querySelector('[class*="product_offer"], [class*="product-offer"], [class*="offer-card"]') !== null
    );

    if (isShopee && isShopeeAffiliate) {
      runShopeeBatchMiner();
      return;
    }

    // ============================================================
    // 2. MODO INDIVIDUAL: PRODUTOS AVULSOS (AMAZON, SHOPEE, ML, NATURA)
    // ============================================================
    await runSingleProductQuickClip(host, href);

  } catch (e) {
    alert('Erro Quick Clip: ' + e.message);
  }

  // ------------------------------------------------------------
  // FUNÇÃO AUXILIAR AMAZON: EXTRAI LINK CURTO OFICIAL amzn.to DO SITESTRIPE
  // ------------------------------------------------------------
  async function extractAmazonSiteStripeLink() {
    lastCapturedAffiliateLink = null;

    // 1. Procura o botão "Obter link" na barra SiteStripe
    const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'));
    const getLinkBtn = allButtons.find(el => {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toLowerCase();
      return (t === 'obter link' || t === 'get link' || id.includes('amzn-ss-text-link') || cls.includes('amzn-ss-text-link')) &&
             !el.closest('#fastsavorys-hub-drawer');
    });

    if (!getLinkBtn) {
      console.log('[Quick Clip Amazon] Barra SiteStripe "Obter link" não detectada.');
      return null;
    }

    try {
      getLinkBtn.click();
    } catch(e) {
      console.warn('[Quick Clip Amazon] Erro ao clicar em Obter link:', e);
    }

    // Aguarda o modal/popover do SiteStripe abrir
    await new Promise(r => setTimeout(r, 450));

    const maxWait = 3500;
    const start = Date.now();
    let copyAttempts = 0;

    while (Date.now() - start < maxWait) {
      if (lastCapturedAffiliateLink && lastCapturedAffiliateLink.includes('amzn.to')) break;

      // Clica no botão "Copiar link de associado" ou "Copiar link"
      if (copyAttempts === 0 || (Date.now() - start > 1000 && copyAttempts < 3)) {
        const modalEls = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popover"], [id*="popover"], [id*="sitestripe"], div'));
        for (const m of modalEls) {
          const btns = Array.from(m.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
          const copyBtn = btns.find(b => {
            const bt = (b.innerText || b.value || b.textContent || '').trim().toLowerCase();
            return (bt.includes('copiar link de associado') || bt.includes('copiar link') || bt.includes('copy link')) &&
                   !b.closest('#fastsavorys-hub-drawer');
          });
          if (copyBtn) {
            try {
              copyBtn.click();
              copyAttempts++;
            } catch(e) {}
            break;
          }
        }
      }

      if (lastCapturedAffiliateLink && lastCapturedAffiliateLink.includes('amzn.to')) break;

      // Lê navigator.clipboard se permitido
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText && clipText.includes('amzn.to')) {
            const m = clipText.match(/https?:\/\/amzn\.to\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m) {
              lastCapturedAffiliateLink = m[0];
              break;
            }
          }
        } catch(e) {}
      }

      // Procura em inputs e textareas do popover
      const allInputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const inp of allInputs) {
        const val = (inp.value || inp.getAttribute('value') || '').trim();
        const m = val.match(/https?:\/\/amzn\.to\/[a-zA-Z0-9_\-\.\/]+/i);
        if (m) {
          lastCapturedAffiliateLink = m[0];
          break;
        }
      }

      if (lastCapturedAffiliateLink && lastCapturedAffiliateLink.includes('amzn.to')) break;

      await new Promise(r => setTimeout(r, 200));
    }

    const finalShortLink = lastCapturedAffiliateLink;

    // Fecha o modal do SiteStripe
    try {
      const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="Fechar"], [class*="close"], [id*="close"], .a-button-close, [role="button"][aria-label*="close" i]');
      if (closeBtn) closeBtn.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    } catch(e) {}

    return finalShortLink;
  }

  // ------------------------------------------------------------
  // FUNÇÃO: MINERAÇÃO EM LOTE NA AMAZON (MAIS VENDIDOS, OFERTAS, CATEGORIAS)
  // ------------------------------------------------------------
  function runAmazonBatchMiner() {
    const existingDrawer = document.getElementById('fastsavorys-hub-drawer');
    if (existingDrawer) {
      existingDrawer.style.display = existingDrawer.style.display === 'none' ? 'block' : 'none';
      return;
    }

    const drawer = document.createElement('div');
    drawer.id = 'fastsavorys-hub-drawer';
    drawer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 440px;
      max-width: 95vw;
      max-height: 85vh;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 999999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    drawer.innerHTML = `
      <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 14px 18px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">📦</span>
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px;">FastSavory's Amazon Miner</h3>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">Mais Vendidos & Ofertas com Tag jonatas00a3-20</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="fast-item-count" style="background: #f59e0b; color: #000; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;">0</span>
          <button id="fast-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
        </div>
      </div>

      <div style="padding: 10px 18px; background: rgba(245, 158, 11, 0.1); border-bottom: 1px solid #f59e0b; font-size: 11px; color: #fde68a; line-height: 1.4;">
        🛡️ <strong>Rastreamento Ativo:</strong> Todos os produtos serão importados com seu código oficial <strong>jonatas00a3-20</strong> e comissão garantida!
      </div>

      <div id="fast-items-list" style="flex: 1; overflow-y: auto; padding: 12px 18px; display: flex; flex-direction: column; gap: 10px; max-height: 45vh;">
        <!-- Itens inseridos dinamicamente -->
      </div>

      <div id="fast-progress-bar-container" style="display: none; padding: 10px 18px; background: #1e293b; border-top: 1px solid #334155;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
          <span id="fast-progress-label">Salvando...</span>
          <span id="fast-progress-pct">0%</span>
        </div>
        <div style="width: 100%; height: 6px; background: #334155; border-radius: 999px; overflow: hidden;">
          <div id="fast-progress-bar" style="width: 0%; height: 100%; background: #f59e0b; transition: width 0.2s;"></div>
        </div>
      </div>

      <div style="padding: 14px 18px; background: #0f172a; border-top: 1px solid #334155; display: flex; gap: 10px;">
        <button id="fast-rescan-btn" style="flex: 1; background: #334155; color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s;">
          🔄 Re-escanear
        </button>
        <button id="fast-import-btn" style="flex: 2; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
          <span>🚀 Salvar Selecionados</span>
        </button>
      </div>
    `;

    document.body.appendChild(drawer);
    document.getElementById('fast-close-btn').onclick = () => drawer.remove();

    function scanAmazonCards() {
      const listEl = document.getElementById('fast-items-list');
      const countEl = document.getElementById('fast-item-count');
      listEl.innerHTML = '';

      const rawCards = Array.from(document.querySelectorAll(
        '#gridItemRoot, .zg-grid-general-faceout, [id^="p13n-asin-index-"], div[data-asin]:not([data-asin=""]), .s-result-item[data-asin]:not([data-asin=""])'
      ));

      const parsedItems = [];
      const seenAsins = new Set();

      rawCards.forEach((c) => {
        let asin = c.getAttribute('data-asin') || '';
        if (!asin) {
          const lk = c.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]');
          if (lk && lk.href) {
            const m = lk.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
            if (m) asin = m[1];
          }
        }
        if (!asin || seenAsins.has(asin)) return;

        const titleEl = c.querySelector('.p13n-sc-truncate-desktop-type2, [class*="p13n-sc-css-line-clamp"], h2, .a-size-medium, .a-size-base-plus, a[href*="/dp/"] span, [class*="title"]');
        const title = (titleEl?.innerText || titleEl?.textContent || '').trim();
        if (!title || title.length < 4) return;

        const imgEl = c.querySelector('img.a-dynamic-image, img.s-image, img[data-a-hires], img[src*="media-amazon.com"], img');
        const img = imgEl?.getAttribute('data-old-hires') || imgEl?.getAttribute('data-a-hires') || imgEl?.src || '';

        let price = '';
        const priceEl = c.querySelector('.p13n-sc-price, .a-price .a-offscreen, .a-price, [class*="price"]');
        if (priceEl) {
          const off = priceEl.querySelector?.('.a-offscreen')?.innerText?.trim() || priceEl.innerText?.trim() || '';
          const matchPrice = off.match(/R\$\s*[0-9.,]+/i);
          if (matchPrice) {
            price = matchPrice[0].replace(/\s+/g, ' ');
          } else {
            const whole = c.querySelector('.a-price-whole')?.innerText?.replace(/[^\d]/g, '');
            const frac = c.querySelector('.a-price-fraction')?.innerText?.replace(/[^\d]/g, '');
            if (whole) price = `R$ ${whole},${frac || '00'}`;
          }
        }
        if (!price) return;

        let origPrice = '';
        const origEl = c.querySelector('.a-text-price .a-offscreen, .basisPrice .a-offscreen, [class*="strike"], del');
        if (origEl) {
          const mOrig = (origEl.innerText || '').match(/R\$\s*[0-9.,]+/i);
          if (mOrig) origPrice = mOrig[0].replace(/\s+/g, ' ');
        }

        let discountTag = '';
        const savEl = c.querySelector('[class*="savingsPercentage"], .badge-percent-off, [class*="badge"]');
        if (savEl && savEl.innerText.includes('%')) {
          discountTag = savEl.innerText.replace('-', '').trim() + ' OFF';
        }

        const rankEl = c.querySelector('.zg-badge-text, .zg-bdg-text, [class*="badge-text"], [class*="rank"]');
        const rank = rankEl?.innerText?.trim() || '';

        const isPrime = Boolean(c.querySelector('.a-icon-prime, [aria-label*="Prime"], [class*="prime"]'));

        seenAsins.add(asin);
        const affiliateUrl = `https://www.amazon.com.br/dp/${asin}?tag=jonatas00a3-20&linkCode=sl2`;

        parsedItems.push({
          asin,
          title,
          price,
          origPrice,
          discountTag,
          image: img,
          affiliateUrl,
          isPrime,
          rank
        });
      });

      countEl.innerText = parsedItems.length;

      if (parsedItems.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 25px 10px; color: #94a3b8; font-size: 13px;">
            <p style="margin: 0 0 6px;">Nenhum produto identificado nesta seção.</p>
            <p style="margin: 0; font-size: 11px;">Role um pouco a página para baixo para carregar os produtos e clique em Re-escanear.</p>
          </div>
        `;
        return;
      }

      parsedItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.style.cssText = `
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        `;

        row.innerHTML = `
          <input type="checkbox" id="fast-item-${idx}" checked style="width: 16px; height: 16px; cursor: pointer; accent-color: #f59e0b;">
          <img src="${item.image || 'https://via.placeholder.com/50'}" style="width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: #fff; padding: 2px;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 2px;">
              ${item.rank ? `<span style="background: #334155; color: #f59e0b; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px;">${item.rank}</span>` : ''}
              ${item.isPrime ? `<span style="background: #0284c7; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">PRIME</span>` : ''}
              ${item.discountTag ? `<span style="background: #dc2626; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">${item.discountTag}</span>` : ''}
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.title}">
              ${item.title}
            </div>
            <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <span style="color: #f59e0b; font-weight: 700;">${item.price}</span>
              ${item.origPrice ? `<span style="text-decoration: line-through; opacity: 0.7;">${item.origPrice}</span>` : ''}
            </div>
          </div>
        `;
        listEl.appendChild(row);
      });

      window._fastAmazonParsedItems = parsedItems;
    }

    scanAmazonCards();
    document.getElementById('fast-rescan-btn').onclick = scanAmazonCards;

    document.getElementById('fast-import-btn').onclick = async () => {
      const parsedItems = window._fastAmazonParsedItems || [];
      const selected = [];
      parsedItems.forEach((item, idx) => {
        const chk = document.getElementById(`fast-item-${idx}`);
        if (chk && chk.checked) selected.push(item);
      });

      if (selected.length === 0) {
        alert('Selecione pelo menos 1 produto para salvar no site!');
        return;
      }

      const importBtn = document.getElementById('fast-import-btn');
      const progressContainer = document.getElementById('fast-progress-bar-container');
      const progressBar = document.getElementById('fast-progress-bar');
      const progressLabel = document.getElementById('fast-progress-label');
      const progressPct = document.getElementById('fast-progress-pct');

      importBtn.disabled = true;
      importBtn.style.opacity = '0.5';
      progressContainer.style.display = 'block';

      try {
        const payloadItems = selected.map(item => ({
          platform: 'amazon',
          title: item.title,
          image_url: item.image,
          price_display: item.price,
          original_price: item.origPrice || null,
          discount_tag: item.discountTag || null,
          affiliate_url: item.affiliateUrl,
          url: item.affiliateUrl,
          is_prime: item.isPrime
        }));

        progressBar.style.width = '70%';
        progressPct.innerText = '70%';
        progressLabel.innerText = `Enviando ${payloadItems.length} produtos para o site...`;

        const res = await fetch('https://fastsavorys.vercel.app/api/check-affiliate-links?action=quick-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payloadItems })
        });
        const data = await res.json();

        progressBar.style.width = '100%';
        progressPct.innerText = '100%';

        if (data.success) {
          progressLabel.innerText = `🎉 Concluído! ${data.inserted_count || payloadItems.length} produtos salvos!`;
          progressLabel.style.color = '#10b981';
          alert(`🎉 Sucesso FastSavory's!

✅ ${data.inserted_count || 0} novas ofertas da Amazon salvas com seu código de afiliado!
${data.duplicate_count > 0 ? `ℹ️ ${data.duplicate_count} já estavam cadastradas.` : ''}`);
        } else {
          throw new Error(data.error || 'Erro ao salvar produtos');
        }
      } catch (err) {
        progressLabel.innerText = `❌ Erro: ${err.message}`;
        progressLabel.style.color = '#f43f5e';
        alert(`❌ Erro ao enviar para FastSavory's: ${err.message}`);
      } finally {
        importBtn.disabled = false;
        importBtn.style.opacity = '1';
      }
    };
  }

  // ------------------------------------------------------------
  // FUNÇÃO AUXILIAR: EXTRAÇÃO ROBUSTA DE LINK OFICIAL SHOPEE (s.shopee.com.br)
  // ------------------------------------------------------------
  async function extractShopeeShareLink(shareBtn, leafBtn, previousUrl) {
    if (!shareBtn && !leafBtn) return null;

    lastCapturedAffiliateLink = null;

    // 1. Limpa inputs de modais anteriores da Shopee para nunca reaproveitar link antigo
    const existingModals = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"], div')).filter(d => {
      if (d.closest('#fastsavorys-hub-drawer')) return false;
      const t = d.innerText || '';
      return t.includes('Link de Oferta de Produto') || (t.includes('copie o link') && t.includes('Copiar Link'));
    });
    existingModals.forEach(m => {
      Array.from(m.querySelectorAll('input, textarea')).forEach(inp => {
        inp.value = '';
        inp.setAttribute('value', '');
      });
    });

    const targetEl = shareBtn || leafBtn;

    // 2. Rolagem suave até o produto na página (igual ao Mercado Livre)
    try {
      targetEl.scrollIntoView && targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {}

    // 3. Bloqueia temporariamente window.open para impedir abertura de abas durante o clique
    const origWindowOpen = window.open;
    window.open = function (...args) {
      console.log('[Quick Clip Shopee] window.open bloqueado durante extração:', args[0]);
      return null;
    };

    // 4. Identifica o elemento oficial de clique do botão
    const realBtn = (targetEl.tagName === 'BUTTON' || targetEl.getAttribute('role') === 'button')
      ? targetEl
      : (targetEl.closest('button, [role="button"]') || targetEl);

    // 5. Neutraliza temporariamente qualquer tag <a> pai para que o card não abra link
    const neutralizedLinks = [];
    let p = realBtn.parentElement;
    while (p && p !== document.body) {
      if (p.tagName === 'A') {
        neutralizedLinks.push({
          el: p,
          target: p.getAttribute('target'),
          href: p.getAttribute('href')
        });
        p.removeAttribute('target');
        p.setAttribute('href', 'javascript:void(0)');
      }
      p = p.parentElement;
    }

    try {
      const mouseOpts = { bubbles: true, cancelable: true, view: window, composed: true };

      // Se temos o nó folha com o texto "Obter link" (span), clica nele primeiro
      if (leafBtn) {
        leafBtn.focus && leafBtn.focus();
        leafBtn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
        leafBtn.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        leafBtn.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
        leafBtn.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        leafBtn.dispatchEvent(new MouseEvent('click', mouseOpts));
        if (typeof leafBtn.click === 'function') leafBtn.click();
      }

      // Clica no botão oficial
      realBtn.focus && realBtn.focus();
      realBtn.dispatchEvent(new PointerEvent('pointerdown', mouseOpts));
      realBtn.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
      realBtn.dispatchEvent(new PointerEvent('pointerup', mouseOpts));
      realBtn.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
      realBtn.dispatchEvent(new MouseEvent('click', mouseOpts));
      if (typeof realBtn.click === 'function') {
        realBtn.click();
      }
    } catch (e) {
      console.warn('[Quick Clip Shopee] Erro ao clicar no botão Obter link:', e);
    }

    // Aguarda o modal pequeno "Link de Oferta de Produto" abrir na tela
    await new Promise(r => setTimeout(r, 600));

    const maxWait = 4500;
    const start = Date.now();
    let copyClicked = false;
    let newAffiliateLink = null;

    while (Date.now() - start < maxWait) {
      // 1. Procura o botão "Copiar Link" dentro do modal da Shopee e clica nele
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'));
      const copyBtn = allButtons.find(b => {
        if (b.closest('#fastsavorys-hub-drawer')) return false;
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        return t === 'copiar link' || t === 'copiar' || t === 'copy link' || t.includes('copiar link');
      });

      if (copyBtn && !copyClicked) {
        copyClicked = true;
        try {
          copyBtn.focus && copyBtn.focus();
          const opts = { bubbles: true, cancelable: true, view: window, composed: true };
          copyBtn.dispatchEvent(new PointerEvent('pointerdown', opts));
          copyBtn.dispatchEvent(new MouseEvent('mousedown', opts));
          copyBtn.dispatchEvent(new PointerEvent('pointerup', opts));
          copyBtn.dispatchEvent(new MouseEvent('mouseup', opts));
          copyBtn.dispatchEvent(new MouseEvent('click', opts));
          if (typeof copyBtn.click === 'function') copyBtn.click();
        } catch(e) {}
      }

      // 2. Lê do interceptador global ou clipboard
      if (lastCapturedAffiliateLink && lastCapturedAffiliateLink !== previousUrl) {
        newAffiliateLink = lastCapturedAffiliateLink;
        break;
      }

      // 3. Lê inputs de texto dentro do modal
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const inp of inputs) {
        const val = (inp.value || inp.getAttribute('value') || inp.innerText || '').trim();
        const m = val.match(/https?:\/\/(?:s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
        if (m && m[0] !== previousUrl) {
          newAffiliateLink = m[0];
          break;
        }
      }
      if (newAffiliateLink) break;

      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText) {
            const m = clipText.match(/https?:\/\/(?:s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m && m[0] !== previousUrl) {
              newAffiliateLink = m[0];
              break;
            }
          }
        } catch (e) {}
      }

      await new Promise(r => setTimeout(r, 180));
    }

    // Fecha o modal da Shopee (NUNCA tocar no #fastsavorys-hub-drawer!)
    try {
      const shopeeModal = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"], div')).find(d => {
        if (d.closest('#fastsavorys-hub-drawer')) return false;
        const t = d.innerText || '';
        return t.includes('Link de Oferta de Produto') || (t.includes('copie o link') && t.includes('Copiar Link'));
      });

      if (shopeeModal) {
        const closeBtn = Array.from(shopeeModal.querySelectorAll('button, span, i, svg, [role="button"]')).find(el => {
          if (el.closest('#fastsavorys-hub-drawer')) return false; // NUNCA TOCAR NO PAINEL FASTSAVORYS!
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const cls = (el.className || '').toString().toLowerCase();
          const txt = (el.innerText || '').trim();
          return aria.includes('close') || aria.includes('fechar') || cls.includes('close') || txt === '✕' || txt === '×';
        });
        if (closeBtn) closeBtn.click();

        // Limpa os campos do modal fechado para não vazar link para o próximo item
        Array.from(shopeeModal.querySelectorAll('input, textarea')).forEach(inp => {
          inp.value = '';
          inp.setAttribute('value', '');
        });
      }

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {}

    // Restaura window.open e links pais do card
    window.open = origWindowOpen;
    neutralizedLinks.forEach(item => {
      if (item.target) item.el.setAttribute('target', item.target); else item.el.removeAttribute('target');
      if (item.href) item.el.setAttribute('href', item.href); else item.el.removeAttribute('href');
    });

    return newAffiliateLink;
  }

  // ------------------------------------------------------------
  // FUNÇÃO: MINERAÇÃO EM LOTE NO PORTAL DE AFILIADOS DA SHOPEE
  // ------------------------------------------------------------
  function runShopeeBatchMiner() {
    const existingDrawer = document.getElementById('fastsavorys-hub-drawer');
    if (existingDrawer) {
      existingDrawer.style.display = existingDrawer.style.display === 'none' ? 'block' : 'none';
      return;
    }

    const drawer = document.createElement('div');
    drawer.id = 'fastsavorys-hub-drawer';
    drawer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 440px;
      max-width: 95vw;
      max-height: 85vh;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #ee4d2d;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(238, 77, 45, 0.2);
      z-index: 999999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    drawer.innerHTML = `
      <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 14px 18px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🧡</span>
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px;">FastSavory's Shopee Miner</h3>
            <p style="margin: 0; font-size: 11px; color: #fb923c;">Portal de Afiliados Shopee (Comissão 100%)</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="fast-item-count" style="background: #ee4d2d; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;">0</span>
          <button id="fast-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
        </div>
      </div>

      <div style="padding: 10px 18px; background: rgba(238, 77, 45, 0.1); border-bottom: 1px solid rgba(238, 77, 45, 0.3); font-size: 11px; color: #fed7aa; line-height: 1.4;">
        🛡️ <strong>Proteção de Afiliado Ativa:</strong> O script abre o modal e captura automaticamente o link encurtado oficial <strong>s.shopee.com.br</strong> com sua comissão garantida.
      </div>

      <div id="fast-items-list" style="flex: 1; overflow-y: auto; padding: 12px 18px; display: flex; flex-direction: column; gap: 10px; max-height: 45vh;">
        <!-- Itens inseridos dinamicamente -->
      </div>

      <div id="fast-progress-bar-container" style="display: none; padding: 12px 18px; background: #1e293b; border-top: 1px solid #334155;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
          <span id="fast-progress-label">Iniciando captura...</span>
          <span id="fast-progress-pct">0%</span>
        </div>
        <div style="width: 100%; height: 6px; background: #334155; border-radius: 999px; overflow: hidden;">
          <div id="fast-progress-bar" style="width: 0%; height: 100%; background: #ee4d2d; transition: width 0.2s;"></div>
        </div>
      </div>

      <div style="padding: 14px 18px; background: #0f172a; border-top: 1px solid #334155; display: flex; gap: 10px;">
        <button id="fast-rescan-btn" style="flex: 1; background: #334155; color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s;">
          🔄 Re-escanear
        </button>
        <button id="fast-import-btn" style="flex: 2; background: linear-gradient(135deg, #ee4d2d, #ea580c); color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
          <span>🚀 Salvar no Site</span>
        </button>
      </div>
    `;

    document.body.appendChild(drawer);
    document.getElementById('fast-close-btn').onclick = () => drawer.remove();

    function scanShopeeCards() {
      const listEl = document.getElementById('fast-items-list');
      const countEl = document.getElementById('fast-item-count');
      listEl.innerHTML = '';

      // 1. Localiza os elementos folha com texto "Obter link" (garante pegar o botão e não wrappers)
      const allLeafs = Array.from(document.querySelectorAll('*')).filter(el => {
        if (el.closest('#fastsavorys-hub-drawer')) return false;
        if (el.children.length > 0) return false;
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        return (t === 'obter link' || t === 'get link') && !t.includes('massa');
      });

      const parsedItems = [];
      const seenTitles = new Set();
      const seenContainers = new Set();

      allLeafs.forEach((leaf) => {
        const realBtn = leaf.closest('button, [role="button"], a') || leaf.parentElement || leaf;
        const container = leaf.closest('[class*="card"], [class*="item"], [class*="product"], [class*="col"], [class*="offer"]') ||
                          realBtn.closest('[class*="card"], [class*="item"], [class*="product"], [class*="col"], [class*="offer"]') ||
                          leaf.parentElement?.parentElement?.parentElement?.parentElement ||
                          leaf.parentElement?.parentElement?.parentElement;
        if (!container || seenContainers.has(container)) return;
        seenContainers.add(container);

        const imgEl = container.querySelector('img[src*="susercontent.com"], img[src^="http"]') || container.querySelector('img');
        const image_url = imgEl ? (imgEl.src || imgEl.getAttribute('src') || '') : '';

        // Título
        let title = '';
        const titleEl = container.querySelector('[class*="title"], [class*="name"], h2, h3, h4, a[title]');
        if (titleEl) title = (titleEl.innerText || titleEl.getAttribute('title') || '').trim();
        if (!title) {
          const texts = Array.from(container.querySelectorAll('div, span, p, a'));
          for (const el of texts) {
            const t = (el.innerText || '').trim();
            if (t.length >= 15 && t.length <= 250 &&
                !t.includes('R$') &&
                !/obter link|vendas|comiss[aã]o|taxa/i.test(t)) {
              title = t;
              break;
            }
          }
        }
        if (!title || seenTitles.has(title.toLowerCase())) return;
        seenTitles.add(title.toLowerCase());

        // Preço
        let price_display = '';
        const priceMatches = container.innerText.match(/R\$\s*([0-9]+(?:\.[0-9]{3})*(?:,[0-9]{2})?|[0-9]+,[0-9]{2})/i);
        if (priceMatches) {
          price_display = 'R$ ' + priceMatches[1].trim();
        }

        // Desconto
        let discount_tag = '';
        const discMatch = container.innerText.match(/([0-9]{1,2}%\s*OFF)/i);
        if (discMatch) {
          discount_tag = discMatch[1].toUpperCase();
        }

        // Preço Original
        let original_price = '';
        const origEl = container.querySelector('s, del, [style*="line-through"]');
        if (origEl) {
          const oMatch = (origEl.innerText || '').match(/R\$\s*([0-9.,]+)/i);
          if (oMatch) original_price = 'R$ ' + oMatch[1].trim();
        }
        if (!original_price && price_display && discount_tag) {
          const pct = parseInt(discount_tag.replace(/[^\d]/g, ''), 10);
          const pNum = parseFloat(price_display.replace(/[^\d,]/g, '').replace(',', '.'));
          if (pct > 0 && pct < 100 && pNum > 0) {
            const origNum = pNum / (1 - pct / 100);
            original_price = 'R$ ' + origNum.toFixed(2).replace('.', ',');
          }
        }

        // Tag
        let badge_tag = null;
        const cText = container.innerText.toLowerCase();
        if (cText.includes('indicado')) badge_tag = 'Indicado';
        else if (cText.includes('oficial')) badge_tag = 'Oficial';
        else if (cText.includes('comissão extra') || cText.includes('comissao extra')) badge_tag = 'Comissão Extra';

        if (title && price_display) {
          parsedItems.push({
            id: parsedItems.length,
            container,
            shareBtn: realBtn,
            leafBtn: leaf,
            title,
            image_url,
            price_display,
            original_price,
            discount_tag,
            badge_tag
          });
        }
      });

      countEl.innerText = parsedItems.length;

      if (parsedItems.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 30px 10px; color: #94a3b8; font-size: 13px;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #e2e8f0;">Nenhum produto detectado nesta tela da Shopee.</p>
            <p style="margin: 0; font-size: 11px;">Role a página para carregar as ofertas de produtos e clique em <strong>Re-escanear</strong>.</p>
          </div>
        `;
        return [];
      }

      parsedItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.id = `fast-row-${index}`;
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1e293b;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #334155;
          font-size: 12px;
        `;
        row.innerHTML = `
          <input type="checkbox" class="fast-item-check" data-index="${index}" checked style="accent-color: #ee4d2d; width: 15px; height: 15px;">
          <img src="${item.image_url || 'https://via.placeholder.com/40'}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; background: #fff;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">${item.title}</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <span style="color: #fb923c; font-weight: 700;">${item.price_display}</span>
              ${item.original_price ? `<span style="color: #64748b; text-decoration: line-through; font-size: 10px;">${item.original_price}</span>` : ''}
              ${item.discount_tag ? `<span style="background: #eab308; color: #000; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">${item.discount_tag}</span>` : ''}
              ${item.badge_tag ? `<span style="background: #f97316; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">${item.badge_tag}</span>` : ''}
            </div>
          </div>
          <span class="fast-item-status" style="font-size: 11px; color: #94a3b8;">Pronto</span>
        `;
        listEl.appendChild(row);
      });

      return parsedItems;
    }

    let currentItems = scanShopeeCards();

    document.getElementById('fast-rescan-btn').onclick = () => {
      currentItems = scanShopeeCards();
    };

    // BOTÃO SALVAR NO SITE
    document.getElementById('fast-import-btn').onclick = async () => {
      const checkboxes = Array.from(document.querySelectorAll('.fast-item-check:checked'));
      if (checkboxes.length === 0) {
        alert('Selecione ao menos um produto da lista!');
        return;
      }

      const progressContainer = document.getElementById('fast-progress-bar-container');
      const progressBar = document.getElementById('fast-progress-bar');
      const progressLabel = document.getElementById('fast-progress-label');
      const progressPct = document.getElementById('fast-progress-pct');
      const importBtn = document.getElementById('fast-import-btn');

      importBtn.disabled = true;
      importBtn.style.opacity = '0.5';
      progressContainer.style.display = 'block';

      const itemsToUpload = [];
      let skippedNoAffiliate = 0;
      let lastExtractedUrl = null;

      for (let i = 0; i < checkboxes.length; i++) {
        const idx = parseInt(checkboxes[i].getAttribute('data-index'), 10);
        const item = currentItems[idx];
        const rowEl = document.getElementById(`fast-row-${idx}`);
        const statusEl = rowEl?.querySelector('.fast-item-status');

        const pct = Math.round(((i + 1) / checkboxes.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressPct.innerText = `${pct}%`;
        progressLabel.innerText = `Gerando link Shopee ${i + 1}/${checkboxes.length}: ${(item.title || '').substring(0, 20)}...`;

        if (statusEl) {
          statusEl.innerText = 'Obtendo link...';
          statusEl.style.color = '#fb923c';
        }
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        let affiliateUrl = null;
        if (item.shareBtn || item.leafBtn) {
          affiliateUrl = await extractShopeeShareLink(item.shareBtn, item.leafBtn, lastExtractedUrl);
          if (affiliateUrl) lastExtractedUrl = affiliateUrl;
          await new Promise(r => setTimeout(r, 300));
        }

        const isOfficial = Boolean(affiliateUrl && (affiliateUrl.includes('s.shopee.com.br') || affiliateUrl.includes('shope.ee')));

        if (!isOfficial) {
          if (statusEl) {
            statusEl.innerText = '❌ Sem Link';
            statusEl.style.color = '#ef4444';
          }
          skippedNoAffiliate++;
          console.warn(`[Quick Clip Shopee] Produto "${item.title}" ignorado pois não gerou link oficial s.shopee.com.br.`);
          continue;
        }

        if (statusEl) {
          statusEl.innerText = `${affiliateUrl.replace(/^https?:\/\//i, '')} ✅`;
          statusEl.style.color = '#10b981';
          statusEl.style.fontWeight = 'bold';
        }

        itemsToUpload.push({
          platform: 'shopee',
          title: item.title,
          url: affiliateUrl,
          affiliate_url: affiliateUrl,
          image_url: item.image_url,
          price_display: item.price_display,
          original_price: item.original_price,
          discount_tag: item.discount_tag,
          badge_tag: item.badge_tag
        });
      }

      if (itemsToUpload.length === 0) {
        progressContainer.style.display = 'none';
        importBtn.disabled = false;
        importBtn.style.opacity = '1';
        alert(
          '⚠️ NENHUM PRODUTO SALVO!\n\n' +
          'Nenhum dos itens selecionados conseguiu gerar o link oficial de afiliado da Shopee (s.shopee.com.br).\n\n' +
          'Certifique-se de que você está logado na sua conta no Portal de Afiliados Shopee!'
        );
        return;
      }

      progressLabel.innerText = `Enviando ${itemsToUpload.length} produtos para o FastSavory's...`;

      try {
        const res = await fetch('https://fastsavorys.vercel.app/api/check-affiliate-links?action=quick-save-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToUpload })
        });
        const data = await res.json();

        if (data.success) {
          progressLabel.innerText = `🎉 Concluído! +${data.inserted_count || itemsToUpload.length} salvos no site com comissão!`;
          progressLabel.style.color = '#10b981';

          let alertMsg = `🎉 Sucesso FastSavory's!\n\n✅ ${data.inserted_count || 0} novas ofertas cadastradas com link oficial da Shopee!`;
          if (data.duplicate_count > 0) alertMsg += `\nℹ️ ${data.duplicate_count} já estavam no catálogo.`;
          if (skippedNoAffiliate > 0) alertMsg += `\n⚠️ ${skippedNoAffiliate} itens foram ignorados por falta de link s.shopee.com.br.`;
          alertMsg += '\n\nTodos os links inseridos agora contêm seu rastreamento de afiliado oficial!';
          alert(alertMsg);
        } else {
          throw new Error(data.error || 'Erro ao salvar produtos');
        }
      } catch (err) {
        progressLabel.innerText = `❌ Erro: ${err.message}`;
        progressLabel.style.color = '#f43f5e';
        alert(`❌ Erro ao enviar para FastSavory's: ${err.message}`);
      } finally {
        importBtn.disabled = false;
        importBtn.style.opacity = '1';
      }
    };
  }

  // ------------------------------------------------------------
  // FUNÇÃO AUXILIAR: CLICA NO BOTÃO "COPIAR LINK" NO MODAL DO MERCADO LIVRE
  // ------------------------------------------------------------
  function clickCopyLinkInModal() {
    const modal = document.querySelector('.andes-modal, [role="dialog"], [class*="modal-content"], [class*="modal"], [class*="sheet"]') || document.body;

    function simulateClick(el) {
      if (!el) return;
      try {
        el.scrollIntoView && el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        el.focus && el.focus();
        const opts = { bubbles: true, cancelable: true, view: window, composed: true };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click && el.click();
      } catch (err) {
        try { el.click(); } catch (e) {}
      }
    }

    // 1. Procura em todos os elementos com texto normalizado (espaços e quebras de linha removidos)
    const all = Array.from(modal.querySelectorAll('*'));
    for (const el of all) {
      const raw = (el.innerText || el.textContent || '');
      const norm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
      
      // Contém 'copiar' e 'link', e NÃO contém 'id' ou 'informa' e tamanho menor que 35 caracteres
      if (norm.includes('copiar') && norm.includes('link') && !norm.includes('id') && !norm.includes('informa') && norm.length <= 35) {
        console.log('[Quick Clip] Match botão "Copiar link":', el, norm);
        const btn = el.closest('button, [role="button"], a');
        if (btn) simulateClick(btn);
        simulateClick(el);
        if (el.parentElement) simulateClick(el.parentElement);
        return true;
      }
    }

    // 2. Procura por aria-label ou title
    for (const el of all) {
      const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      if (aria.includes('copiar link') || (aria.includes('copiar') && aria.includes('link'))) {
        console.log('[Quick Clip] Match por aria-label "copiar link":', el);
        simulateClick(el);
        return true;
      }
    }

    // 3. Estratégia dos 4 botões de ação:
    // No modal "Compartilhe para ganhar dinheiro", o 1º botão de ação é sempre "Copiar link"
    const actionButtons = Array.from(modal.querySelectorAll('button, [role="button"]')).filter(b => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const cls = (b.className || '').toLowerCase();
      return !aria.includes('fechar') && !aria.includes('close') && !cls.includes('close');
    });

    if (actionButtons.length >= 1) {
      console.log('[Quick Clip] Clicando no 1º botão de ação do modal (fallback posicional):', actionButtons[0]);
      simulateClick(actionButtons[0]);
      return true;
    }

    return false;
  }

  // ------------------------------------------------------------
  // FUNÇÃO AUXILIAR: EXTRAÇÃO ROBUSTA DE LINK OFICIAL /sec/ OU meli.la
  // ------------------------------------------------------------
  async function extractMLShareLink(shareBtn) {
    if (!shareBtn) return null;

    lastCapturedAffiliateLink = null;

    try {
      shareBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 150));
      shareBtn.click();
    } catch (e) {
      console.warn('[Quick Clip] Erro ao clicar no botão compartilhar:', e);
    }

    // Aguarda o modal abrir na tela
    await new Promise(r => setTimeout(r, 450));

    const maxWait = 4500;
    const start = Date.now();
    let copyAttempts = 0;

    while (Date.now() - start < maxWait) {
      if (lastCapturedAffiliateLink) break;

      // Clica no botão "Copiar link" dentro do modal
      if (copyAttempts === 0 || (Date.now() - start > 1000 && copyAttempts < 4)) {
        if (clickCopyLinkInModal()) {
          copyAttempts++;
        }
      }

      if (lastCapturedAffiliateLink) break;

      // Lê navigator.clipboard se disponível
      if (navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText();
          if (clipText) {
            const m = clipText.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m) {
              lastCapturedAffiliateLink = m[0];
              break;
            }
          }
        } catch (e) {}
      }

      if (lastCapturedAffiliateLink) break;

      // Procura em todos os inputs e textareas do modal ou da página
      const allInputs = Array.from(document.querySelectorAll('.andes-modal input, .andes-modal textarea, [role="dialog"] input, [class*="modal"] input, input, textarea'));
      for (const inp of allInputs) {
        const val = (inp.value || inp.getAttribute('value') || '').trim();
        const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
        if (m) {
          lastCapturedAffiliateLink = m[0];
          break;
        }
      }
      if (lastCapturedAffiliateLink) break;

      // Procura em links <a> ou innerText do modal
      const modalEl = document.querySelector('.andes-modal, [role="dialog"], [class*="modal-content"], [class*="modal"]');
      if (modalEl) {
        const links = Array.from(modalEl.querySelectorAll('a'));
        for (const l of links) {
          const h = (l.href || '').trim();
          const m = h.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
          if (m) {
            lastCapturedAffiliateLink = m[0];
            break;
          }
        }
        if (lastCapturedAffiliateLink) break;

        const mText = (modalEl.innerText || '') + ' ' + (modalEl.innerHTML || '');
        const matchText = mText.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la|amzn\.to|s\.shopee\.com\.br|shope\.ee)\/[a-zA-Z0-9_\-\.\/]+/i);
        if (matchText) {
          lastCapturedAffiliateLink = matchText[0];
          break;
        }
      }

      await new Promise(r => setTimeout(r, 180));
    }

    const finalUrl = lastCapturedAffiliateLink;

    // Fecha o modal
    try {
      const closeBtn = document.querySelector('.andes-modal__close-button, [aria-label*="Fechar" i], [aria-label*="Close" i], [data-testid="modal-close-button"], [class*="close-button"]');
      if (closeBtn) closeBtn.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {}

    return finalUrl;
  }

  // ------------------------------------------------------------
  // FUNÇÃO: MINERAÇÃO EM LOTE NO HUB DE AFILIADOS DO MERCADO LIVRE
  // ------------------------------------------------------------
  function runMLHubBatchMiner() {
    const existingDrawer = document.getElementById('fastsavorys-hub-drawer');
    if (existingDrawer) {
      existingDrawer.style.display = existingDrawer.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Cria Painel Flutuante na tela do usuário
    const drawer = document.createElement('div');
    drawer.id = 'fastsavorys-hub-drawer';
    drawer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 440px;
      max-width: 95vw;
      max-height: 85vh;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 999999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    drawer.innerHTML = `
      <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 14px 18px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">⚡</span>
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px;">FastSavory's Hub Miner (Comissão 100%)</h3>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">Central de Afiliados Mercado Livre</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="fast-item-count" style="background: #3b82f6; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;">0</span>
          <button id="fast-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
        </div>
      </div>

      <div style="padding: 10px 18px; background: rgba(16, 185, 129, 0.1); border-bottom: 1px solid #10b981; font-size: 11px; color: #a7f3d0; line-height: 1.4;">
        🛡️ <strong>Proteção de Afiliado Ativa:</strong> O script aguarda a geração do link oficial <strong>meli.la</strong> de cada produto para garantir 100% de comissão. Produtos sem link oficial são bloqueados automaticamente.
      </div>

      <div id="fast-items-list" style="flex: 1; overflow-y: auto; padding: 12px 18px; display: flex; flex-direction: column; gap: 10px; max-height: 45vh;">
        <!-- Itens inseridos dinamicamente -->
      </div>

      <div id="fast-progress-bar-container" style="display: none; padding: 10px 18px; background: #1e293b; border-top: 1px solid #334155;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
          <span id="fast-progress-label">Processando...</span>
          <span id="fast-progress-pct">0%</span>
        </div>
        <div style="width: 100%; height: 6px; background: #334155; border-radius: 999px; overflow: hidden;">
          <div id="fast-progress-bar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.2s;"></div>
        </div>
      </div>

      <div style="padding: 14px 18px; background: #0f172a; border-top: 1px solid #334155; display: flex; gap: 10px;">
        <button id="fast-rescan-btn" style="flex: 1; background: #334155; color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s;">
          🔄 Re-escanear
        </button>
        <button id="fast-import-btn" style="flex: 2; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
          <span>🚀 Salvar no Site</span>
        </button>
      </div>
    `;

    document.body.appendChild(drawer);

    document.getElementById('fast-close-btn').onclick = () => drawer.remove();

    function scanCards() {
      const listEl = document.getElementById('fast-items-list');
      const countEl = document.getElementById('fast-item-count');
      listEl.innerHTML = '';

      const allButtons = Array.from(document.querySelectorAll('button, a'));
      const shareButtons = allButtons.filter(b => (b.innerText || '').trim().toLowerCase() === 'compartilhar');

      let rawCards = [];
      if (shareButtons.length > 0) {
        shareButtons.forEach(btn => {
          const c = btn.closest('.andes-card') ||
                    btn.closest('[class*="card"]') ||
                    btn.closest('[class*="poly"]') ||
                    btn.parentElement?.parentElement ||
                    btn.parentElement;
          if (c && !rawCards.some(rc => rc.container === c)) {
            rawCards.push({ container: c, shareBtn: btn });
          }
        });
      } else {
        const polyCards = Array.from(document.querySelectorAll('.poly-card, .ui-search-result, .andes-card, [class*="product-card"]'));
        polyCards.forEach(c => {
          if (c.innerText && c.innerText.includes('R$')) {
            rawCards.push({ container: c, shareBtn: c.querySelector('button') });
          }
        });
      }

      const parsedItems = [];
      rawCards.forEach((rc, idx) => {
        const c = rc.container;

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
        if (!title) {
          const paragraphs = Array.from(c.querySelectorAll('p, span, div'));
          for (const p of paragraphs) {
            const t = (p.innerText || '').trim();
            if (t.length > 20 && !t.includes('Compartilhar') && !t.includes('R$') && !t.includes('GANHOS')) {
              title = t;
              break;
            }
          }
        }

        const linkEl = c.querySelector('a[href*="mercadolivre.com"], a[href*="MLB"], a[href*="/p/"]') || c.querySelector('a');
        let product_url = linkEl ? linkEl.href : '';

        let original_price = '';
        const origEl = c.querySelector('s, del, [class*="original"], [style*="line-through"], .andes-money-amount--previous');
        if (origEl) {
          const frac = origEl.querySelector('.andes-money-amount__fraction')?.innerText?.replace(/[^\d.]/g, '').trim();
          const cents = origEl.querySelector('.andes-money-amount__cents')?.innerText?.replace(/[^\d]/g, '').trim();
          if (frac) {
            original_price = 'R$ ' + frac + (cents ? ',' + cents : ',00');
          } else {
            const m = (origEl.innerText || '').match(/R\$\s*[0-9]+(?:\.[0-9]{3})*(?:,[0-9]{2})?/i);
            if (m) original_price = m[0].replace(/\s+/g, ' ');
          }
        }

        let price_display = '';
        const currentPriceEl = c.querySelector('.poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount, [class*="price__current"] .andes-money-amount') ||
                               Array.from(c.querySelectorAll('.andes-money-amount')).find(el => {
                                 return !el.closest('s, del, [class*="original"], [style*="line-through"], [class*="installment"], [class*="installments"]') &&
                                        !/em\s+\d+x|\d+x\s+de/i.test(el.parentElement?.innerText || '');
                               });

        if (currentPriceEl) {
          const frac = currentPriceEl.querySelector('.andes-money-amount__fraction')?.innerText?.replace(/[^\d.]/g, '').trim();
          const cents = currentPriceEl.querySelector('.andes-money-amount__cents')?.innerText?.replace(/[^\d]/g, '').trim();
          if (frac) {
            price_display = 'R$ ' + frac + (cents ? ',' + cents : ',00');
          }
        }

        if (!price_display) {
          const cleanCardText = (c.innerText || '')
            .replace(/(?:GANHOS\s+EXTRAS|COMISS[ÃO]O)[\s\S]*$/gi, '')
            .replace(/(?:\d{1,2}x|em\s+\d{1,2}x\s+de)\s+R\$\s*[0-9.,]+/gi, '');
          const rawMatches = cleanCardText.match(/R\$\s*[0-9]+(?:\.[0-9]{3})*(?:,[0-9]{2})?/g) || [];
          if (rawMatches.length > 0) {
            if (rawMatches.length >= 2 && original_price) {
              price_display = rawMatches[1].replace(/\s+/g, ' ');
            } else {
              price_display = rawMatches[0].replace(/\s+/g, ' ');
            }
          }
        }

        let discount_tag = '';
        const discMatch = (c.innerText || '').match(/([0-9]{1,2}%\s*OFF)/i);
        if (discMatch) {
          discount_tag = discMatch[1].toUpperCase();
        }

        const comMatch = (c.innerText || '').match(/(?:GANHOS EXTRAS|COMISS[ÃO]O)\s*([0-9%]+)/i);
        const commission_tag = comMatch ? comMatch[0] : '';

        if (title && price_display) {
          parsedItems.push({
            id: idx,
            container: c,
            shareBtn: rc.shareBtn,
            title,
            image_url,
            product_url,
            price_display,
            original_price,
            discount_tag,
            commission_tag
          });
        }
      });

      // Trava de Segurança Anti-Rate Limit do Mercado Livre:
      // O Mercado Livre bloqueia temporariamente a geração de meli.la ao atingir ~30 requisições seguidas.
      // Limitamos o lote a 28 itens no máximo para garantir 100% de sucesso sem nenhum erro.
      const MAX_SAFE_BATCH = 28;
      const finalItems = parsedItems.slice(0, MAX_SAFE_BATCH);

      countEl.innerText = finalItems.length;

      if (finalItems.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 30px 10px; color: #94a3b8; font-size: 13px;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #e2e8f0;">Nenhum produto detectado nesta visualização.</p>
            <p style="margin: 0; font-size: 11px;">Role a página do Mercado Livre para baixo para carregar os produtos e clique em <strong>Re-escanear</strong>.</p>
          </div>
        `;
        return [];
      }

      finalItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.id = `fast-row-${index}`;
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1e293b;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid #334155;
          font-size: 12px;
        `;
        row.innerHTML = `
          <input type="checkbox" class="fast-item-check" data-index="${index}" checked style="accent-color: #3b82f6; width: 15px; height: 15px;">
          <img src="${item.image_url || 'https://via.placeholder.com/40'}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; background: #fff;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">${item.title}</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <span style="color: #38bdf8; font-weight: 700;">${item.price_display}</span>
              ${item.original_price ? `<span style="color: #64748b; text-decoration: line-through; font-size: 10px;">${item.original_price}</span>` : ''}
              ${item.discount_tag ? `<span style="background: #10b981; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">${item.discount_tag}</span>` : ''}
              ${item.commission_tag ? `<span style="background: #8b5cf6; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px;">${item.commission_tag}</span>` : ''}
            </div>
          </div>
          <span class="fast-item-status" style="font-size: 11px; color: #94a3b8;">Pronto</span>
        `;
        listEl.appendChild(row);
      });

      return finalItems;
    }

    let currentItems = scanCards();

    document.getElementById('fast-rescan-btn').onclick = () => {
      currentItems = scanCards();
    };

    // BOTÃO SALVAR NO SITE (PROCESSAMENTO COM CAPTURA OBRIGATÓRIA DE LINK DE AFILIADO)
    document.getElementById('fast-import-btn').onclick = async () => {
      const checkboxes = Array.from(document.querySelectorAll('.fast-item-check:checked'));
      if (checkboxes.length === 0) {
        alert('Selecione ao menos um produto da lista!');
        return;
      }

      const progressContainer = document.getElementById('fast-progress-bar-container');
      const progressBar = document.getElementById('fast-progress-bar');
      const progressLabel = document.getElementById('fast-progress-label');
      const progressPct = document.getElementById('fast-progress-pct');
      const importBtn = document.getElementById('fast-import-btn');

      importBtn.disabled = true;
      importBtn.style.opacity = '0.5';
      progressContainer.style.display = 'block';

      const itemsToUpload = [];
      let skippedNoAffiliate = 0;

      for (let i = 0; i < checkboxes.length; i++) {
        const idx = parseInt(checkboxes[i].getAttribute('data-index'), 10);
        const item = currentItems[idx];
        const rowEl = document.getElementById(`fast-row-${idx}`);
        const statusEl = rowEl?.querySelector('.fast-item-status');

        const pct = Math.round(((i + 1) / checkboxes.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressPct.innerText = `${pct}%`;
        progressLabel.innerText = `Gerando link de afiliado ${i + 1}/${checkboxes.length}: ${(item.title || '').substring(0, 20)}...`;

        if (statusEl) {
          statusEl.innerText = 'Gerando meli.la...';
          statusEl.style.color = '#38bdf8';
        }

        // Tenta capturar o link oficial meli.la ou /sec/
        let affiliateUrl = null;
        if (item.shareBtn) {
          affiliateUrl = await extractMLShareLink(item.shareBtn);
          await new Promise(r => setTimeout(r, 250));
        }

        const isOfficialAffiliate = Boolean(affiliateUrl && (affiliateUrl.includes('/sec/') || affiliateUrl.includes('meli.la')));

        if (!isOfficialAffiliate) {
          if (statusEl) {
            statusEl.innerText = '❌ Sem Link de Afiliado';
            statusEl.style.color = '#ef4444';
          }
          skippedNoAffiliate++;
          console.warn(`[Quick Clip] Produto "${item.title}" ignorado pois não gerou link oficial meli.la.`);
          continue; // NUNCA SALVAR PRODUTO DO ML SEM O LINK OFICIAL DE AFILIADO!
        }

        if (statusEl) {
          statusEl.innerText = `${affiliateUrl.replace(/^https?:\/\//i, '')} ✅`;
          statusEl.style.color = '#10b981';
          statusEl.style.fontWeight = 'bold';
        }

        itemsToUpload.push({
          platform: 'mercadolivre',
          title: item.title,
          url: affiliateUrl,
          affiliate_url: affiliateUrl,
          image_url: item.image_url,
          price_display: item.price_display,
          original_price: item.original_price,
          discount_tag: item.discount_tag,
          badge_tag: item.commission_tag ? 'Comissão Extra' : null
        });
      }

      if (itemsToUpload.length === 0) {
        progressContainer.style.display = 'none';
        importBtn.disabled = false;
        importBtn.style.opacity = '1';
        alert(
          '⚠️ NENHUM PRODUTO SALVO!\n\n' +
          'Nenhum dos itens selecionados conseguiu gerar o link oficial de afiliado (meli.la) pelo Mercado Livre.\n\n' +
          '💡 Dica: Certifique-se de que você está logado na sua conta de Afiliado do Mercado Livre antes de minerar!'
        );
        return;
      }

      progressLabel.innerText = `Enviando ${itemsToUpload.length} produtos para o FastSavory's...`;

      try {
        const res = await fetch('https://fastsavorys.vercel.app/api/check-affiliate-links?action=quick-save-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToUpload })
        });
        const data = await res.json();

        if (data.success) {
          progressLabel.innerText = `🎉 Concluído! +${data.inserted_count || itemsToUpload.length} salvos no site com comissão!`;
          progressLabel.style.color = '#10b981';
          
          let alertMsg = `🎉 Sucesso FastSavory's!\n\n✅ ${data.inserted_count || 0} novas ofertas cadastradas com link oficial de comissão!`;
          if (data.duplicate_count > 0) alertMsg += `\nℹ️ ${data.duplicate_count} já estavam no catálogo.`;
          if (skippedNoAffiliate > 0) alertMsg += `\n⚠️ ${skippedNoAffiliate} itens foram ignorados por falta de link meli.la.`;
          alertMsg += '\n\nTodos os links inseridos agora contêm seu rastreamento de afiliado oficial!';
          alert(alertMsg);
        } else {
          throw new Error(data.error || 'Erro ao salvar produtos');
        }
      } catch (err) {
        progressLabel.innerText = `❌ Erro: ${err.message}`;
        progressLabel.style.color = '#f43f5e';
        alert(`❌ Erro ao enviar para FastSavory's: ${err.message}`);
      } finally {
        importBtn.disabled = false;
        importBtn.style.opacity = '1';
      }
    };
  }

  // ------------------------------------------------------------
  // FUNÇÃO: SALVAMENTO RÁPIDO INDIVIDUAL (AMAZON, SHOPEE, ML PDP)
  // ------------------------------------------------------------
  async function runSingleProductQuickClip(host, href) {
    let payload = {
      platform: 'unknown',
      url: href,
      title: '',
      image_url: '',
      price_display: '',
      original_price: '',
      discount_tag: '',
      is_prime: false,
      is_imported: false
    };

    if (host.includes('amazon')) {
      payload.platform = 'amazon';
      payload.title = (document.getElementById('productTitle')?.innerText || document.title || '').trim();
      const img = document.getElementById('landingImage') ||
                  document.querySelector('#imgTagWrapperId img') ||
                  document.querySelector('#main-image-container img') ||
                  document.querySelector('.a-dynamic-image');
      payload.image_url = img?.src || img?.getAttribute('data-old-hires') || '';

      const priceEl = document.querySelector('#corePriceDisplay_desktop_feature_div .priceToPay, #corePrice_desktop .priceToPay, #apex_desktop .priceToPay, .priceToPay, #corePriceDisplay_desktop_feature_div .a-price, #corePrice_desktop .a-price, .a-price:not(.a-text-price)') ||
                      document.querySelector('.a-price:not(.apex-priceperunit-value):not([class*="priceperunit"]):not(.a-text-price)');
      const off = priceEl?.querySelector('.a-offscreen')?.innerText?.trim();
      if (off && /R\$/i.test(off)) {
        payload.price_display = off.replace(/\s+/g, ' ');
      } else {
        const pw = priceEl?.querySelector('.a-price-whole')?.innerText?.replace(/[\r\n\t]/g, '').replace(/[^\d.]/g, '').trim();
        const pf = priceEl?.querySelector('.a-price-fraction')?.innerText?.replace(/[^\d]/g, '').trim();
        if (pw) {
          payload.price_display = 'R$ ' + pw + (pf ? ',' + pf : ',00');
        }
      }
      const basis = document.querySelector('.basisPrice .a-offscreen, #corePriceDisplay_desktop_feature_div .apex-basisprice-value .a-offscreen, .apex-basisprice-offscreen-label, #corePrice_desktop .apex-basisprice-value .a-offscreen')?.innerText?.trim();
      if (basis) payload.original_price = basis;
      const sav = document.querySelector('#corePriceDisplay_desktop_feature_div .savingsPercentage, .savingsPercentage, .reinventPriceSavingsPercentageMargin')?.innerText?.trim();
      if (sav) payload.discount_tag = sav.replace('-', '').trim() + ' OFF';
      payload.is_prime = Boolean(document.querySelector('.a-icon-prime,#prime-accordion,[id*="prime"],.badge_delivery_prime,[aria-label*="Prime"]') || /frete grátis com o prime/i.test(document.querySelector('#deliveryBlockMessage')?.innerText || ''));
      payload.is_imported = Boolean(document.querySelector('#exports_desktop_qualified_buybox, #agsk-detail-bullets, #amazonGlobal_feature_div') || document.querySelector('#merchant-info, #deliveryBlockMessage')?.innerText?.match(/fora do brasil|amazon global store|estados unidos/i));

      // Extração automática do link curto oficial amzn.to do SiteStripe
      const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/i) || href.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      const asin = asinMatch ? asinMatch[1] : '';

      const toastSearching = document.createElement('div');
      toastSearching.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999999;background:#f59e0b;color:#000;padding:14px 20px;border-radius:12px;font-family:sans-serif;font-weight:bold;font-size:13px;box-shadow:0 10px 25px rgba(0,0,0,0.3);';
      toastSearching.innerText = '⚡ Obtendo link curto oficial amzn.to...';
      document.body.appendChild(toastSearching);

      const amznShort = await extractAmazonSiteStripeLink();
      toastSearching.remove();

      if (amznShort) {
        payload.url = amznShort;
        payload.affiliate_url = amznShort;
        console.log('[Quick Clip Amazon] Link curto amzn.to capturado com sucesso:', amznShort);
      } else if (asin) {
        payload.url = `https://www.amazon.com.br/dp/${asin}?tag=jonatas00a3-20&linkCode=sl2`;
        payload.affiliate_url = payload.url;
        console.log('[Quick Clip Amazon] Usando link canônico com tag:', payload.url);
      }

    } else if (host.includes('mercadolivre') || host.includes('mercadolibre')) {
      payload.platform = 'mercadolivre';
      payload.title = (document.querySelector('h1.ui-pdp-title, h1')?.innerText || document.title || '').trim();
      const img = document.querySelector('.ui-pdp-gallery__figure img, .ui-pdp-image, img.ui-pdp-image, img[data-zoom], .andes-carousel-snapped__slide img');
      payload.image_url = img?.src || '';

      const frac = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction, .ui-pdp-price .andes-money-amount__fraction, .andes-money-amount--cents-superscript .andes-money-amount__fraction')?.innerText?.replace(/[^\d.]/g, '').trim();
      const cents = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__cents, .ui-pdp-price .andes-money-amount__cents')?.innerText?.replace(/[^\d]/g, '').trim();
      if (frac) {
        payload.price_display = 'R$ ' + frac + (cents ? ',' + cents : ',00');
      }
      const origFrac = document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction')?.innerText?.replace(/[^\d.]/g, '').trim();
      if (origFrac) {
        const origCents = document.querySelector('.ui-pdp-price__original-value .andes-money-amount__cents')?.innerText?.replace(/[^\d]/g, '').trim();
        payload.original_price = 'R$ ' + origFrac + (origCents ? ',' + origCents : ',00');
      }
      const disc = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__discount, .ui-pdp-price .andes-money-amount__discount')?.innerText?.trim();
      if (disc) payload.discount_tag = disc + ' OFF';
      payload.is_imported = Boolean(document.querySelector('.ui-pdp-buybox, #shipping-summary, .ui-pdp-promotions-pill, .ui-pdp-seller__header')?.innerText?.match(/compra\s+internacional|vendedor\s+internacional/i));

      // VERIFICAÇÃO RIGOROSA DO LINK DE AFILIADO NO MERCADO LIVRE:
      let isOfficialAffiliate = href.includes('/sec/') || href.includes('meli.la');

      if (!isOfficialAffiliate) {
        // Tenta achar botão compartilhar da página ou da barra de afiliados
        const shareBtn = Array.from(document.querySelectorAll('button, a')).find(b => {
          const t = (b.innerText || '').toLowerCase();
          return (t.includes('compartilhar') || t.includes('link de afiliado') || t.includes('copiar link')) &&
                 !b.closest('#fastsavorys-hub-drawer');
        });

        if (shareBtn) {
          const toastSearching = document.createElement('div');
          toastSearching.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999999;background:#3b82f6;color:#fff;padding:14px 20px;border-radius:12px;font-family:sans-serif;font-weight:bold;font-size:13px;box-shadow:0 10px 25px rgba(0,0,0,0.3);';
          toastSearching.innerText = '⚡ Obtendo seu link oficial meli.la...';
          document.body.appendChild(toastSearching);

          const generatedLink = await extractMLShareLink(shareBtn);
          toastSearching.remove();

          if (generatedLink) {
            payload.url = generatedLink;
            payload.affiliate_url = generatedLink;
            isOfficialAffiliate = true;
          }
        }
      }

      if (!isOfficialAffiliate) {
        alert(
          '⚠️ ATENÇÃO: Link de Afiliado do Mercado Livre NÃO Detectado!\n\n' +
          'No Mercado Livre, a sua comissão só é creditada se o produto for cadastrado com o link oficial (meli.la ou mercadolivre.com/sec/).\n\n' +
          '💡 Como cadastrar ganhando comissão:\n' +
          '1. Abra o Hub de Afiliados: mercadolivre.com.br/afiliados/hub\n' +
          '2. Lá você clica no Quick Clip e captura os produtos em lote com link oficial 100% garantido!\n' +
          '3. Se estiver em uma página avulsa, gere o link pelo botão "Compartilhar e ganhar" antes de clipar.\n\n' +
          'O produto NÃO foi salvo para proteger as suas comissões!'
        );
        return;
      }

    } else if (host.includes('shopee')) {
      payload.platform = 'shopee';

      // 1. Tenta extrair dados ricos via microdata / JSON-LD (à prova de mudanças de CSS da Shopee)
      try {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
          const j = JSON.parse(s.innerText || '{}');
          if (j.name && !payload.title) payload.title = j.name;
          if (j.image && !payload.image_url) {
            payload.image_url = Array.isArray(j.image) ? j.image[0] : j.image;
          }
          if (j.offers?.price && !payload.price_display) {
            payload.price_display = 'R$ ' + parseFloat(j.offers.price).toFixed(2).replace('.', ',');
          }
        }
      } catch (e) {}

      if (!payload.title) {
        payload.title = (
          document.querySelector('.product-briefing ._44qnta')?.innerText ||
          document.querySelector('.product-briefing h1')?.innerText ||
          document.querySelector('h1')?.innerText ||
          document.querySelector('meta[property="og:title"]')?.content ||
          document.title || ''
        ).replace(/\s*\|\s*Shopee.*$/i, '').trim();
      } else {
        payload.title = payload.title.replace(/\s*\|\s*Shopee.*$/i, '').trim();
      }

      const img = document.querySelector('.product-briefing img') ||
                  document.querySelector('._39-Y7e img') ||
                  document.querySelector('.image-carousel img') ||
                  document.querySelector('img[src*="down-br.img.susercontent.com"], img[src*="susercontent.com"]');
      payload.image_url = img?.src || document.querySelector('meta[property="og:image"]')?.content || '';

      const priceCandidates = Array.from(document.querySelectorAll('.product-briefing div, .product-briefing span, .product-briefing p, [class*="flash-sale"] span, [class*="price"] span, span, div'));
      const foundPriceEl = priceCandidates.find(el => {
        const t = (el.innerText || '').trim();
        return /^R\$\s*[0-9.,]+$/i.test(t) && !el.closest('del, s, [style*="line-through"]');
      }) || document.querySelector('.product-briefing .pqTWkA, .product-briefing ._3n5z6N, .product-briefing ._2Sh71d, .product-briefing [class*="price"]');

      if (foundPriceEl) {
        const pMatch = (foundPriceEl.innerText || '').match(/R\$\s*[0-9.,]+/i);
        if (pMatch) payload.price_display = pMatch[0].replace(/\s+/g, ' ');
      }

      const origEl = document.querySelector('.product-briefing ._1G_B1p, .product-briefing [style*="line-through"], .product-briefing del, .product-briefing s');
      if (origEl) {
        const oMatch = (origEl.innerText || '').match(/R\$\s*[0-9.,]+/i);
        if (oMatch) payload.original_price = oMatch[0].replace(/\s+/g, ' ');
      }

      const discEl = document.querySelector('.product-briefing [class*="discount"], .product-briefing ._10uUv7');
      if (discEl && discEl.innerText.includes('OFF')) {
        payload.discount_tag = discEl.innerText.trim();
      }
      payload.is_imported = Boolean(document.querySelector('.product-briefing, [class*="shop-detail"]')?.innerText?.match(/vendedor internacional|envio do exterior/i));

    } else if (host.includes('natura') || host.includes('avon')) {
      payload.platform = host.includes('avon') ? 'avon' : 'natura';
      payload.title = (document.querySelector('h1')?.innerText || document.querySelector('meta[property="og:title"]')?.content || document.title || '').replace(/\s*\|\s*(Natura|Avon).*$/i, '').trim();
      payload.image_url = document.querySelector('meta[property="og:image"]')?.content || document.querySelector('img[src*="natura"], img[src*="avon"]')?.src || '';
      const priceMeta = document.querySelector('meta[property="product:price:amount"]')?.content;
      if (priceMeta) {
        payload.price_display = 'R$ ' + parseFloat(priceMeta).toFixed(2).replace('.', ',');
      } else {
        const pEl = Array.from(document.querySelectorAll('span, p, div')).find(e => /^R\$\s*[0-9.,]+$/.test(e.innerText.trim()));
        if (pEl) payload.price_display = pEl.innerText.trim();
      }
    } else {
      alert('⚠️ Use este botão em uma página de produto da Amazon, Mercado Livre, Shopee ou Natura!');
      return;
    }

    if (!payload.title) {
      alert('⚠️ Não foi possível identificar o título do produto.');
      return;
    }

    if (payload.price_display) {
      payload.price_display = payload.price_display.replace(/,+/g, ',');
    }
    if (payload.original_price) {
      payload.original_price = payload.original_price.replace(/,+/g, ',');
      const prN = parseFloat(payload.price_display.replace(/[^\d]/g, '') || 0);
      const orN = parseFloat(payload.original_price.replace(/[^\d]/g, '') || 0);
      if (orN <= prN) {
        payload.original_price = '';
      }
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999999;background:#6366f1;color:#fff;padding:16px 22px;border-radius:12px;font-family:sans-serif;font-weight:bold;font-size:14px;box-shadow:0 10px 25px rgba(0,0,0,0.3);';
    toast.innerText = '⚡ Enviando para FastSavory\'s Achadinhos...';
    document.body.appendChild(toast);

    fetch('https://fastsavorys.vercel.app/api/check-affiliate-links?action=quick-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          toast.style.background = '#10b981';
          toast.innerHTML = '🎉 Salvo com Sucesso no Site!<br><span style="font-size:11px;font-weight:normal;">' + (payload.title.substring(0, 40)) + '...</span>';
          setTimeout(() => toast.remove(), 3500);
        } else {
          toast.style.background = '#e11d48';
          toast.innerText = '❌ ' + (data.error || 'Erro ao salvar');
          setTimeout(() => toast.remove(), 4000);
        }
      })
      .catch(e => {
        toast.style.background = '#e11d48';
        toast.innerText = '❌ Erro de conexão: ' + e.message;
        setTimeout(() => toast.remove(), 4000);
      });
  }
})();
