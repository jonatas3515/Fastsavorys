# FastSavorys - Delivery e Encomendas

Sistema de pedidos online para a Fast Savory's.

## 🌐 Produção

https://fastsavorys.netlify.app/pages/fast.html

## 📁 Estrutura do Projeto

```
Fastsavorys/
├── index.html              # Landing page (redireciona para fast.html)
├── pages/fast.html         # Aplicação principal
├── manifest.json           # PWA manifest
├── service-worker.js       # Service Worker (cache + offline)
├── assets/
│   ├── css/styles.css      # Tailwind CSS compilado
│   └── img/                # Ícones e logos
└── package.json            # Scripts de build
```

## 🚀 Deploy (Netlify)

### Arquivos essenciais para produção:
- `index.html`
- `pages/fast.html`
- `manifest.json`
- `service-worker.js`
- `assets/` (CSS + imagens)

### Após alterações no Service Worker:

> ⚠️ **Sempre incrementar o CACHE_NAME** para forçar atualização nos clientes:
> 
> ```javascript
> // service-worker.js
> const CACHE_NAME = 'fastsavorys-v5'; // Incrementar: v4 → v5 → v6...
> ```

## 🛠️ Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento
npm run serve
# ou
npx serve . -l 3000

# Build CSS (Tailwind)
npm run build
```

## 📱 PWA & Service Worker

- **Manifest**: `manifest.json` com `start_url: "/pages/fast.html"`
- **Service Worker**: 
  - Network-first para HTML
  - Cache-first para assets
  - Fallback inteligente para iOS (evita tela branca)
- **Registro**: Em `index.html` e `pages/fast.html`

## 🐛 Debug iOS

Handlers de erro globais em `fast.html` para capturar problemas:
- `window.onerror` → `[GLOBAL ERROR]`
- `unhandledrejection` → `[PROMISE ERROR]`

## 📦 Android (Capacitor)

```bash
npm run android:sync    # Sincronizar web → Android
npm run android:open    # Abrir Android Studio
```
