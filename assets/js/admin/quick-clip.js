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
            const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
              const m = sel.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
              if (m) lastCapturedAffiliateLink = m[0];
            }
            const active = document.activeElement;
            if (active && (active.value || active.innerText)) {
              const val = active.value || active.innerText;
              const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
            const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
            if (m) lastCapturedAffiliateLink = m[0];
          }
          if (e.clipboardData) {
            const text = e.clipboardData.getData('text/plain');
            if (text) {
              const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
              const m = res.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
              const m = text.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
    // 2. MODO INDIVIDUAL: PRODUTOS AVULSOS (AMAZON, SHOPEE, ML, NATURA)
    // ============================================================
    await runSingleProductQuickClip(host, href);

  } catch (e) {
    alert('Erro Quick Clip: ' + e.message);
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
            const m = clipText.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
        const m = val.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
          const m = h.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
          if (m) {
            lastCapturedAffiliateLink = m[0];
            break;
          }
        }
        if (lastCapturedAffiliateLink) break;

        const mText = (modalEl.innerText || '') + ' ' + (modalEl.innerHTML || '');
        const matchText = mText.match(/https?:\/\/(?:mercadolivre\.com\/sec|meli\.la)\/[a-zA-Z0-9_\-\.\/]+/i);
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
      payload.title = (
        document.querySelector('.product-briefing ._44qnta')?.innerText ||
        document.querySelector('.product-briefing h1')?.innerText ||
        document.querySelector('h1')?.innerText ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.title || ''
      ).replace(/\s*\|\s*Shopee.*$/i, '').trim();

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
