# CONFIGURAÇÃO MANYCHAT - ENCOMENDAS AGENDADAS

Para que a notificação de Encomendas Agendadas funcione, você precisa criar um novo **Fluxo (Flow)** e novos **Campos do Usuário (User Fields)** no Manychat.

## 1. Criar Campos do Usuário (User Fields)

No Manychat, vá em **Settings > Fields > User Fields** e crie os seguintes campos:

| Nome Sugerido (Pode ser qualquer um) | Tipo (Type) | Descrição |
| :--- | :--- | :--- |
| **Scheduled Client Name** | Text | Nome do cliente da encomenda |
| **Scheduled Date** | Date ou Text | Data da entrega (ex: 24/02/2026) |
| **Scheduled Time** | Text | Horário da entrega (ex: 18:30) |
| **Scheduled Items** | Text | Resumo dos itens do pedido |

> 📝 **Anote o ID** de cada campo criado. O ID é um número (ex: `1234567`) que você pode encontrar na URL quando clica para editar o campo, ou inspecionando o elemento.

## 2. Criar o Fluxo (Flow)

Crie um novo fluxo chamado **"Notificação Encomenda Agendada"**.

1.  **Gatilho (Trigger)**: Não precisa de gatilho específico, ele será acionado via API.
2.  **Ação Inicial**:
    *   Adicione um bloco de conteúdo (WhatsApp).
    *   No texto da mensagem, use as variáveis que você criou acima.
    *   Exemplo de mensagem:
        > "Olá Jéssica! 📅
        >
        > Tem uma encomenda agendada para **AMANHÃ** ({Scheduled Date}).
        >
        > **Cliente:** {Scheduled Client Name}
        > **Horário:** {Scheduled Time}
        >
        > **Pedido:**
        > {Scheduled Items}
        >
        > Fique ligada! 😉"

3.  **Publicar**: Publique o fluxo e copie o **Flow ID** da URL (ex: `content20240217123456`).

## 3. Configurar Variáveis de Ambiente (Vercel)

Após criar os campos e o fluxo, você precisa adicionar os IDs nas variáveis de ambiente do projeto na Vercel (ou no arquivo `.env` local para teste):

| Variável de Ambiente | O que colocar |
| :--- | :--- |
| `MANYCHAT_FLOW_ID_SCHEDULED_ORDER` | O ID do Fluxo "Notificação Encomenda Agendada" |
| `MANYCHAT_FIELD_ID_SCHEDULED_CLIENT_NAME` | O ID do campo Nome do Cliente |
| `MANYCHAT_FIELD_ID_SCHEDULED_DATE` | O ID do campo Data |
| `MANYCHAT_FIELD_ID_SCHEDULED_TIME` | O ID do campo Horário |
| `MANYCHAT_FIELD_ID_SCHEDULED_ITEMS` | O ID do campo Itens |

---

### Exemplo de JSON (Payload)

Para sua referência, o sistema enviará os dados internamente neste formato para a função do Manychat:

```json
{
  "subscriber_id": "MANYCHAT_USER_ID_JESSICA",
  "fields": [
    { "field_id": 111111, "field_value": "João Silva" },       // Client Name
    { "field_id": 222222, "field_value": "24/02/2026" },       // Date
    { "field_id": 333333, "field_value": "18:00" },            // Time
    { "field_id": 444444, "field_value": "2x Bolo Vulcão" }    // Items
  ]
}
```
