/**
 * FastSavory's - Google Calendar Integration
 * Sincroniza agendamentos futuros (encomendas do site e do robô WhatsApp) diretamente no Google Agenda.
 * Utiliza Conta de Serviço (Service Account) com assinatura nativa RSA-SHA256 (sem dependências externas pesadas).
 */

const crypto = require('crypto');

// Variáveis de ambiente configuráveis na Vercel:
// GOOGLE_SERVICE_ACCOUNT_EMAIL ou GOOGLE_CLIENT_EMAIL
// GOOGLE_PRIVATE_KEY (chave RSA privada do Google)
// GOOGLE_CALENDAR_ID (ID da agenda, ex: 'primary' ou email@gmail.com)

let cachedToken = null;
let tokenExpiresAt = 0;

function getServiceAccountCredentials() {
  let email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '';
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  // Suporte a JSON completo colado em GOOGLE_SERVICE_ACCOUNT_KEY
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      if (parsed.client_email) email = parsed.client_email;
      if (parsed.private_key) privateKey = parsed.private_key;
    } catch (e) {
      console.warn('[Google Calendar] Erro ao parsear GOOGLE_SERVICE_ACCOUNT_KEY JSON:', e.message);
    }
  }

  // Normaliza quebras de linha da chave privada (quando salva como \n em env var)
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return { email, privateKey, calendarId };
}

function base64UrlEncode(strOrBuffer) {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Gera Access Token OAuth2 usando Conta de Serviço via JWT nativo
 */
async function getGoogleAccessToken() {
  const { email, privateKey } = getServiceAccountCredentials();

  if (!email || !privateKey) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  // Reutiliza token em cache se ainda válido (com margem de 60 segundos)
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const claimSet = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  signer.end();

  const signature = signer.sign(privateKey);
  const jwt = `${signatureInput}.${base64UrlEncode(signature)}`;

  const bodyParams = new URLSearchParams();
  bodyParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  bodyParams.append('assertion', jwt);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: bodyParams.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao autenticar no Google OAuth2 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600);
  return cachedToken;
}

/**
 * Formata descrição completa para o evento do Google Agenda
 */
function formatEventDescription(order) {
  const lines = [];

  lines.push('🥟 *ENCOMENDA FASTSAVORY\'S*');
  if (order.order_code) lines.push(`🔖 Código do Pedido: ${order.order_code}`);
  lines.push('');

  lines.push(`👤 Cliente: ${order.client_name || 'Não informado'}`);
  if (order.client_phone) {
    const cleanPhone = String(order.client_phone).replace(/\D/g, '');
    lines.push(`📱 WhatsApp: ${order.client_phone} (https://wa.me/55${cleanPhone})`);
  }
  lines.push('');

  lines.push('📋 ITENS DA ENCOMENDA:');
  if (Array.isArray(order.items)) {
    order.items.forEach(it => {
      const q = it.quantity || 1;
      const n = it.name || 'Item';
      const obs = it.note ? `\n   ↳ Obs/Sabores: ${it.note}` : '';
      lines.push(`• ${q}x ${n}${obs}`);
    });
  } else if (typeof order.items === 'string') {
    lines.push(`• ${order.items}`);
  }
  lines.push('');

  const totalStr = typeof order.total === 'number'
    ? `R$ ${order.total.toFixed(2).replace('.', ',')}`
    : (order.total || 'A combinar');
  lines.push(`💰 Total: ${totalStr}`);
  lines.push(`💳 Pagamento: ${(order.payment_method || 'A combinar').toUpperCase()}`);
  lines.push(`🛵 Tipo: ${(order.delivery_type || 'entrega').toUpperCase()}`);

  if (order.address) {
    if (typeof order.address === 'object') {
      const { street, number, neighborhood, reference } = order.address;
      lines.push('');
      lines.push('📍 ENDEREÇO DE ENTREGA:');
      lines.push(`${street || ''}, ${number || 'S/N'}${neighborhood ? ' - ' + neighborhood : ''}`);
      if (reference) lines.push(`Ponto de ref: ${reference}`);
    } else if (typeof order.address === 'string') {
      lines.push('');
      lines.push(`📍 Endereço: ${order.address}`);
    }
  }

  if (order.notes) {
    lines.push('');
    lines.push(`📝 Observações adicionais: ${order.notes}`);
  }

  return lines.join('\n');
}

/**
 * Cria evento no Google Calendar para pedidos com data futura (scheduled_date)
 */
async function syncOrderToGoogleCalendar(order) {
  try {
    if (!order) return { success: false, skipped: true, reason: 'no_order' };

    // Só sincroniza se tiver data de agendamento (scheduled_date)
    const scheduledDate = order.scheduled_date;
    if (!scheduledDate) {
      return { success: false, skipped: true, reason: 'not_scheduled_order' };
    }

    const { calendarId } = getServiceAccountCredentials();
    const token = await getGoogleAccessToken();

    if (!token) {
      console.log('[Google Calendar] ℹ️ Conta de serviço não configurada nas variáveis de ambiente. Sincronização ignorada.');
      return { success: false, skipped: true, reason: 'credentials_missing' };
    }

    // Normalização de Horário (Padrão: Fuso de Brasília / América/Bahia - UTC-3)
    // scheduled_date costuma ser "YYYY-MM-DD"
    const scheduledTime = order.scheduled_time || '14:00';
    const [h, m] = scheduledTime.includes(':') ? scheduledTime.split(':') : [14, 0];

    const cleanHour = String(parseInt(h, 10) || 14).padStart(2, '0');
    const cleanMinute = String(parseInt(m, 10) || 0).padStart(2, '0');

    // Horário de início e fim (1 hora de duração padrão)
    const endHour = String((parseInt(cleanHour, 10) + 1) % 24).padStart(2, '0');

    const startDateTime = `${scheduledDate}T${cleanHour}:${cleanMinute}:00-03:00`;
    const endDateTime = `${scheduledDate}T${endHour}:${cleanMinute}:00-03:00`;

    const summary = `🥟 Encomenda: ${order.client_name || 'Cliente'} (${order.order_code || '#' + (order.id || '')})`;
    const description = formatEventDescription(order);

    const eventPayload = {
      summary,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Bahia'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Bahia'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 180 }, // Alerta 3 horas antes para preparar a cozinha
          { method: 'popup', minutes: 60 }   // Alerta 1 hora antes para entrega/fritura
        ]
      },
      colorId: '5' // Amarelo/Dourado no Google Agenda (destaque visual)
    };

    const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const response = await fetch(calendarUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Google Calendar] ⚠️ Erro ao criar evento (${response.status}):`, errText);
      return { success: false, status: response.status, error: errText };
    }

    const createdEvent = await response.json();
    console.log(`[Google Calendar] ✅ Encomenda agendada no Google Calendar com sucesso! Event ID: ${createdEvent.id} para ${startDateTime}`);

    return {
      success: true,
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
      start: startDateTime
    };

  } catch (err) {
    console.error('[Google Calendar] ❌ Erro inesperado ao sincronizar com Google Agenda:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  syncOrderToGoogleCalendar,
  getGoogleAccessToken,
  getServiceAccountCredentials
};
