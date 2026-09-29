/**
 * FastSavory's 1-Clique Quick Clip (Universal In-Browser Extension / Bookmarklet Script)
 * Always dynamically served so browser bookmarks never get outdated.
 */
(function () {
  try {
    const host = window.location.hostname;
    let payload = {
      platform: 'unknown',
      url: window.location.href,
      title: '',
      image_url: '',
      price_display: '',
      original_price: '',
      discount_tag: ''
    };

    if (host.includes('amazon')) {
      payload.platform = 'amazon';
      payload.title = (document.getElementById('productTitle')?.innerText || document.title || '').trim();
      const img = document.getElementById('landingImage') ||
                  document.querySelector('#imgTagWrapperId img') ||
                  document.querySelector('#main-image-container img') ||
                  document.querySelector('.a-dynamic-image');
      payload.image_url = img?.src || img?.getAttribute('data-old-hires') || '';

      const pw = document.querySelector('.a-price .a-price-whole')?.innerText?.replace(/[\r\n\t]/g, '').trim();
      const pf = document.querySelector('.a-price .a-price-fraction')?.innerText?.trim();
      if (pw) {
        payload.price_display = 'R$ ' + pw + (pf ? ',' + pf : ',00');
      }
      const basis = document.querySelector('.basisPrice .a-offscreen, .a-text-price .a-offscreen, .apex-basisprice-value .a-offscreen')?.innerText?.trim();
      if (basis) payload.original_price = basis;
      const sav = document.querySelector('.savingsPercentage, .reinventPriceSavingsPercentageMargin')?.innerText?.trim();
      if (sav) payload.discount_tag = sav.replace('-', '').trim() + ' OFF';

    } else if (host.includes('mercadolivre') || host.includes('mercadolibre')) {
      payload.platform = 'mercadolivre';
      payload.title = (document.querySelector('h1.ui-pdp-title')?.innerText || document.title || '').trim();
      const img = document.querySelector('.ui-pdp-gallery__figure img, .ui-pdp-image, img.ui-pdp-image');
      payload.image_url = img?.src || '';

      const frac = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction')?.innerText?.trim();
      const cents = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__cents')?.innerText?.trim();
      if (frac) {
        payload.price_display = 'R$ ' + frac + (cents ? ',' + cents : ',00');
      }
      const origFrac = document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction')?.innerText?.trim();
      if (origFrac) {
        const origCents = document.querySelector('.ui-pdp-price__original-value .andes-money-amount__cents')?.innerText?.trim();
        payload.original_price = 'R$ ' + origFrac + (origCents ? ',' + origCents : ',00');
      }
      const disc = document.querySelector('.ui-pdp-price__second-line .andes-money-amount__discount')?.innerText?.trim();
      if (disc) payload.discount_tag = disc + ' OFF';

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
                  document.querySelector('img[src*="down-br.img.susercontent.com"]');
      payload.image_url = img?.src || document.querySelector('meta[property="og:image"]')?.content || '';

      // Shopee Price extraction: handles Flash Sale (Ofertas Relâmpago), Pix, standard PDP price
      const priceCandidates = Array.from(document.querySelectorAll('.product-briefing div, .product-briefing span, .product-briefing p, [class*="flash-sale"] span, [class*="price"] span'));
      const foundPriceEl = priceCandidates.find(el => {
        const t = (el.innerText || '').trim();
        return /^R\$\s*[0-9.,]+$/i.test(t);
      }) || document.querySelector('.product-briefing .pqTWkA, .product-briefing ._3n5z6N, .product-briefing ._2Sh71d, .product-briefing [class*="price"]');

      if (foundPriceEl) {
        const pMatch = (foundPriceEl.innerText || '').match(/R\$\s*[0-9.,]+/i);
        if (pMatch) payload.price_display = pMatch[0].replace(/\s+/g, ' ');
      }

      // Shopee Original Strike-through price
      const origEl = document.querySelector('.product-briefing ._1G_B1p, .product-briefing [style*="line-through"], .product-briefing del, .product-briefing s');
      if (origEl) {
        const oMatch = (origEl.innerText || '').match(/R\$\s*[0-9.,]+/i);
        if (oMatch) payload.original_price = oMatch[0].replace(/\s+/g, ' ');
      }

      // Shopee Discount tag
      const discEl = document.querySelector('.product-briefing [class*="discount"], .product-briefing ._10uUv7');
      if (discEl && discEl.innerText.includes('OFF')) {
        payload.discount_tag = discEl.innerText.trim();
      }

    } else {
      alert('⚠️ Use este botão em uma página de produto da Amazon, Mercado Livre ou Shopee!');
      return;
    }

    if (!payload.title) {
      alert('⚠️ Não foi possível identificar o título do produto na página.');
      return;
    }

    // Floating Toast Notification
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

  } catch (e) {
    alert('Erro Quick Clip: ' + e.message);
  }
})();
