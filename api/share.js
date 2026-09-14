/**
 * Dynamic OpenGraph share endpoint for FastSavory's products.
 * Returns rich Open Graph / Twitter Card meta tags for WhatsApp, Telegram, Facebook,
 * then instantly forwards visitors to the store catalog (/pages/fast.html).
 */
module.exports = (req, res) => {
    const { title, price, img, desc, id } = req.query;

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'fastsavorys.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    let imageUrl = img ? decodeURIComponent(img) : `${baseUrl}/assets/img/fast-logo.png`;
    if (imageUrl.startsWith('/')) {
        imageUrl = `${baseUrl}${imageUrl}`;
    } else if (imageUrl.startsWith('../')) {
        imageUrl = `${baseUrl}/${imageUrl.replace(/^(\.\.\/)+/, '')}`;
    }

    const productTitle = title ? decodeURIComponent(title) : "Fast Savory's | Delivery";
    const productPrice = price ? decodeURIComponent(price) : "";
    const productDesc = desc ? decodeURIComponent(desc) : "Salgados, Mini-Salgados, Bolos & Kits Festa";

    const displayTitle = `${productTitle}${productPrice ? ` • ${productPrice}` : ''} | Fast Savory's`;
    const displayDesc = `${productDesc} • Peça online com entrega rápida em Itamaraju!`;
    const targetUrl = `${baseUrl}/pages/fast.html${id ? `?product=${encodeURIComponent(id)}` : ''}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(displayTitle)}</title>

    <!-- Open Graph / WhatsApp / Facebook / Telegram -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(targetUrl)}">
    <meta property="og:title" content="${escapeHtml(displayTitle)}">
    <meta property="og:description" content="${escapeHtml(displayDesc)}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="600">
    <meta property="og:image:height" content="600">
    <meta property="og:image:alt" content="${escapeHtml(productTitle)}">
    <meta property="og:site_name" content="Fast Savory's">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(displayTitle)}">
    <meta name="twitter:description" content="${escapeHtml(displayDesc)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

    <!-- Instant Redirection -->
    <meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; background-color: #fff1f2; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #881337; text-align: center;">
    <div>
        <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 8px;">🥟 Redirecionando para o cardápio Fast Savory's...</p>
        <p style="font-size: 0.9rem; color: #9f1239;">Aguarde um instante.</p>
        <a href="${escapeHtml(targetUrl)}" style="display: inline-block; margin-top: 12px; background: #e11d48; color: #fff; padding: 10px 20px; border-radius: 9999px; text-decoration: none; font-weight: bold;">Ver Cardápio Completo</a>
    </div>
    <script>
        window.location.replace("${escapeJs(targetUrl)}");
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(html);
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
