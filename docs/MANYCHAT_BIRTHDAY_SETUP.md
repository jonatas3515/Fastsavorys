# Configuração da Automação de Aniversário - ManyChat + WhatsApp

Este guia documenta o passo a passo para configurar a automação de mensagens de aniversário via ManyChat integrado com WhatsApp.

---

## 📋 Visão Geral

A automação envia automaticamente uma mensagem de parabéns com desconto para clientes no dia do aniversário (ou no dia seguinte, caso o aniversário caia em domingo).

### Regras do Desconto de Aniversário
- **10%** de desconto para pedidos **≥ R$ 50**
- **5%** de desconto para pedidos **< R$ 50**
- Válido **apenas 1x por ano** por cliente
- Válido no **dia do aniversário + até 6 dias depois** (para agendamento)
- **NÃO acumula** com: promoções de produtos, cupons ou desconto fidelidade
- Desconto aplicado **apenas sobre produtos** (não inclui taxa de entrega/cartão)

---

## 🔧 Pré-requisitos

1. Conta ManyChat com canal **WhatsApp** configurado
2. Conta Vercel com projeto FastSavory's deployado
3. Banco de dados Supabase com tabelas configuradas
4. Template WhatsApp aprovado pela Meta

---

## 📱 Etapa 1: Criar Campo Customizado no ManyChat

1. Acesse **Settings** → **Custom Fields**
2. Clique em **+ New Custom Field**
3. Configure:
   - **Name:** `bday_valid_until`
   - **Type:** `Text`
   - **Description:** `Data de validade do desconto de aniversário (formato: DD/MM/YYYY)`
4. Salve e **anote o Field ID** (será algo como `12345678`)

> ⚠️ O Field ID é necessário para a variável de ambiente `MANYCHAT_FIELD_ID_BDAY_VALID_UNTIL`

---

## 📝 Etapa 2: Criar Template WhatsApp

Templates WhatsApp são obrigatórios para enviar mensagens proativas (fora da janela de 24h).

### 2.1 Acessar Templates
1. No ManyChat, vá para **Settings** → **WhatsApp** → **Message Templates**
2. Clique em **Create Template**

### 2.2 Configurar o Template
- **Template Name:** `birthday_discount` (nome interno)
- **Category:** `Marketing`
- **Language:** `Portuguese (BR)`

### 2.3 Conteúdo do Template

```
🎂 Feliz Aniversário, {{1}}! 🎉

A Fast Savory's deseja um dia especial para você!

Como presente, preparamos um desconto exclusivo:
✨ *10% OFF* em pedidos a partir de R$ 50
✨ *5% OFF* em pedidos abaixo de R$ 50

📅 Válido até: {{2}}

Faça seu pedido pelo nosso cardápio digital e aproveite! 🥟

⚠️ Desconto válido apenas para você, não acumulativo com outras promoções.
```

### 2.4 Variáveis do Template
| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `{{1}}` | Nome do cliente | Maria |
| `{{2}}` | Data de validade | 31/01/2026 |

### 2.5 Submeter para Aprovação
1. Clique em **Submit for Review**
2. Aguarde aprovação da Meta (geralmente 24-48h)
3. Status deve mudar para **Approved** ✅

---

## 🔄 Etapa 3: Criar Flow no ManyChat

### 3.1 Criar Novo Flow
1. Vá para **Automation** → **Flows**
2. Clique em **+ New Flow**
3. Nome: `Aniversário - Desconto do Dia`
4. Escolha **Start from Scratch**

### 3.2 Configurar Trigger
1. Adicione um trigger **External Request**
2. Isso permite que a API Vercel dispare o flow

### 3.3 Adicionar Ação de Mensagem
1. Arraste um bloco **Send Message**
2. Selecione **WhatsApp**
3. Escolha o template `birthday_discount` aprovado
4. Mapeie as variáveis:
   - `{{1}}` → `{{first_name}}` (campo do ManyChat)
   - `{{2}}` → `{{bday_valid_until}}` (campo customizado criado na Etapa 1)

### 3.4 Publicar o Flow
1. Clique em **Publish**
2. **Anote o Flow ID** da URL (será algo como `content20250126123456_abc123`)

> O Flow ID está na URL quando você edita o flow: `https://manychat.com/fb123456789/automation/flows/content20250126123456_abc123`

---

## ⚙️ Etapa 4: Configurar Variáveis de Ambiente no Vercel

Acesse **Vercel Dashboard** → **Project Settings** → **Environment Variables**

Adicione as seguintes variáveis:

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `MANYCHAT_API_KEY` | API Key do ManyChat | `1234567:abcdefghij...` |
| `MANYCHAT_FLOW_ID_BIRTHDAY` | ID do flow de aniversário | `content20250126123456_abc123` |
| `MANYCHAT_FIELD_ID_BDAY_VALID_UNTIL` | ID do campo customizado | `12345678` |

### Como obter a API Key do ManyChat:
1. Vá para **Settings** → **API**
2. Clique em **Create API Key**
3. Copie a key gerada

---

## 🗄️ Etapa 5: Verificar Banco de Dados (Supabase)

Certifique-se de que as seguintes tabelas existem:

### Tabela `fast_clients`
```sql
-- Colunas necessárias:
- phone (text) -- telefone do cliente
- birthdate (date) -- data de nascimento (YYYY-MM-DD)
- manychat_id (text) -- ID do subscriber no ManyChat
```

### Tabela `fast_birthday_message_log`
```sql
CREATE TABLE IF NOT EXISTS fast_birthday_message_log (
  id SERIAL PRIMARY KEY,
  client_phone TEXT NOT NULL,
  message_year INTEGER NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  manychat_response JSONB,
  UNIQUE(client_phone, message_year)
);
```

### Tabela `fast_birthday_discount_usage`
```sql
CREATE TABLE IF NOT EXISTS fast_birthday_discount_usage (
  id SERIAL PRIMARY KEY,
  client_phone TEXT NOT NULL,
  usage_year INTEGER NOT NULL,
  order_id TEXT,
  discount_applied NUMERIC(10,2),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_phone, usage_year)
);
```

---

## 🕐 Etapa 6: Verificar Cron Job (Vercel)

O arquivo `vercel.json` já deve conter a configuração do cron:

```json
{
  "crons": [
    {
      "path": "/api/birthday-broadcast",
      "schedule": "0 12 * * *"
    }
  ]
}
```

**Horário:** 12:00 UTC = **09:00 horário de Brasília**

---

## 🧪 Etapa 7: Testar a Automação

### 7.1 Teste Local (Dry Run)

```bash
# Instalar Vercel CLI (se necessário)
npm i -g vercel

# Rodar servidor local
vercel dev

# Testar endpoint (modo dry run - NÃO envia mensagens)
curl "http://localhost:3000/api/birthday-broadcast?dry_run=true"
```

### 7.2 Testar com Data Simulada

```bash
# Simular que hoje é dia 15/03 (para testar clientes com aniversário nessa data)
curl "http://localhost:3000/api/birthday-broadcast?dry_run=true&simulate_date=2026-03-15"
```

### 7.3 Testar com Telefone Específico

```bash
# Processar apenas um cliente específico (para teste)
curl "http://localhost:3000/api/birthday-broadcast?dry_run=true&only_phone=73999348552"
```

### 7.4 Verificar Logs

Após deploy, verifique os logs em:
- **Vercel Dashboard** → **Logs** (filtrar por `/api/birthday-broadcast`)

---

## 🔍 Troubleshooting

### Mensagem não enviada
1. Verificar se `manychat_id` está preenchido para o cliente
2. Verificar se template está aprovado
3. Verificar logs do endpoint em Vercel

### Desconto não aplicado no checkout
1. Verificar se `birthdate` está no formato `YYYY-MM-DD`
2. Verificar se cliente não usou o desconto este ano (tabela `fast_birthday_discount_usage`)
3. Verificar se há produtos em promoção no carrinho (descontos não acumulam)

### Erro 401 no ManyChat
- API Key inválida ou expirada
- Regenerar em Settings → API

### Erro "Template not found"
- Template ainda não aprovado ou nome incorreto
- Verificar nome exato do template no ManyChat

---

## 📊 Monitoramento

### Logs da Automação
Os logs são salvos na tabela `fast_birthday_message_log`:

```sql
SELECT * FROM fast_birthday_message_log 
ORDER BY sent_at DESC 
LIMIT 20;
```

### Uso de Descontos
```sql
SELECT * FROM fast_birthday_discount_usage 
WHERE usage_year = 2026
ORDER BY used_at DESC;
```

---

## 📅 Resumo das Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service Role Key do Supabase |
| `MANYCHAT_API_KEY` | ✅ | API Key do ManyChat |
| `MANYCHAT_FLOW_ID_BIRTHDAY` | ✅ | ID do flow de aniversário |
| `MANYCHAT_FIELD_ID_BDAY_VALID_UNTIL` | ✅ | ID do campo customizado |

---

## ✅ Checklist Final

- [ ] Campo customizado `bday_valid_until` criado no ManyChat
- [ ] Template WhatsApp criado e aprovado
- [ ] Flow "Aniversário - Desconto do Dia" criado e publicado
- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] Tabelas de log criadas no Supabase
- [ ] Cron job configurado no vercel.json
- [ ] Teste dry_run executado com sucesso
- [ ] Deploy realizado no Vercel

---

*Documentação criada em 26/01/2026 - FastSavory's*
