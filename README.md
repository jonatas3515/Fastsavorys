# FastSavorys - Delivery e Encomendas

Sistema de pedidos online para a Fast Savory's.

## 🌐 Produção (Vercel)

Projeto configurado para deploy na Vercel com:
- Frontend estático (Tailwind CSS)
- Backend Serverless (`/api` functions)

### Configuração na Vercel

1. **Build & Output Settings**:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `.` (Raiz)

2. **Environment Variables**:
   Configure as seguintes variáveis no painel da Vercel (Project Settings > Environment Variables):

   - `STRIPE_SECRET_KEY`: Chave secreta do Stripe (`sk_...`)
   - `STRIPE_WEBHOOK_SECRET`: Segredo do Webhook de produção (`whsec_...`). Pode ser uma lista separada por vírgulas se houver múltiplos endpoints.
   - `SUPABASE_URL`: URL do projeto Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key (necessária para updates de pagamento)
   - `CHECKOUT_SUCCESS_URL`: URL de sucesso, ex: `https://seu-dominio.vercel.app/pages/fast.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`
   - `CHECKOUT_CANCEL_URL`: URL de cancelamento, ex: `https://seu-dominio.vercel.app/pages/fast.html?checkout=cancel&order_id=`
   - `WHATSAPP_NUMBER` (opcional): Número do WhatsApp para redirecionamento após pagamento. Padrão: `5573999366554`
   - `GEMINI_API_KEY`: Chave de API do Google AI Studio para o assistente virtual
   - `GEMINI_MODEL`: Modelo principal do Gemini (padrão atualizado: `gemini-3.5-flash-lite`)

3. **Stripe Webhook**:
   - Aponte o webhook no dashboard do Stripe para: `https://seu-dominio.vercel.app/api/webhook-stripe`
   - Eventos necessários: `payment_intent.succeeded`, `checkout.session.completed`, `charge.refunded`

## 📁 Estrutura do Projeto

```
Fastsavorys/
├── index.html              # Landing page (redireciona para fast.html)
├── pages/fast.html         # Aplicação principal
├── api/                    # Serverless Functions (Backend Vercel)
│   ├── webhook-stripe.js
│   ├── create-checkout-session.js
│   ├── create-payment-link.js
│   └── ...
├── stripe-server/          # Backend legado (Node Express) - Apenas referência
├── assets/                 # CSS compilado e Imagens
└── vercel.json             # Configuração Vercel (Rewrites, Headers)
```

## 🛠️ Desenvolvimento Local

Para rodar com suporte a API Serverless localmente, use o [Vercel CLI](https://vercel.com/docs/cli):

```bash
# Instalar Vercel CLI
npm i -g vercel

# Rodar projeto localmente (Frontend + API)
vercel dev
```

Se rodar apenas `npm run start`, as APIs `/api/...` não estarão disponíveis.

## 📦 Scripts

- `npm run build`: Compila o CSS do Tailwind (Minificado)
- `npm run dev`: Compila CSS em modo watch
- `npm run preview`: Serve arquivos estáticos (sem API)

---

## 📱 PWA & Service Worker
- **Manifest**: `manifest.json`
- **Service Worker**: Cache-first para assets, Network-first para HTML
