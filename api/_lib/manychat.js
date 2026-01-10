/**
 * ManyChat Integration Service
 * 
 * Provides functions to interact with ManyChat WhatsApp API for order notifications.
 * Designed for Jéssica's notifications only (single user for now).
 * 
 * REQUIRED ENVIRONMENT VARIABLES (configure in Vercel Dashboard):
 * - MANYCHAT_API_KEY: ManyChat API key
 * - MANYCHAT_USER_ID_JESSICA: Jéssica's WhatsApp user ID in ManyChat
 * - MANYCHAT_FLOW_ID_NOVO_PEDIDO: Flow ID to trigger for new orders
 * - MANYCHAT_FIELD_ID_ORDER_NUMBER: Custom field ID for order number
 * - MANYCHAT_FIELD_ID_ORDER_TOTAL: Custom field ID for order total
 * - MANYCHAT_FIELD_ID_ORDER_DESCRIPTION: Custom field ID for order description
 * - MANYCHAT_FIELD_ID_ORDER_DATE: Custom field ID for order date
 * - MANYCHAT_FIELD_ID_ORDER_DELIVERY_METHOD: Custom field ID for delivery method
 * 
 * ARCHITECTURE NOTES:
 * - This module is 100% additive - does not affect existing order/WhatsApp/payment flows
 * - All functions handle errors internally and never throw exceptions
 * - If any required config is missing, operations are skipped with console.warn
 * 
 * FUTURE EXTENSIBILITY:
 * - To support multi-store, add store_id to config and load from Supabase
 * - To add more custom fields, just add new MANYCHAT_FIELD_ID_* env vars
 */

const MANYCHAT_API_BASE = 'https://api.manychat.com/fb';

/**
 * Configuration loaded from environment variables
 * All values may be undefined if not configured
 */
const MANYCHAT_CONFIG = {
    apiKey: process.env.MANYCHAT_API_KEY,
    userIdJessica: process.env.MANYCHAT_USER_ID_JESSICA,
    flowIdNovoPedido: process.env.MANYCHAT_FLOW_ID_NOVO_PEDIDO,
    fieldIds: {
        orderNumber: process.env.MANYCHAT_FIELD_ID_ORDER_NUMBER,
        orderTotal: process.env.MANYCHAT_FIELD_ID_ORDER_TOTAL,
        orderDescription: process.env.MANYCHAT_FIELD_ID_ORDER_DESCRIPTION,
        orderDate: process.env.MANYCHAT_FIELD_ID_ORDER_DATE,
        orderDeliveryMethod: process.env.MANYCHAT_FIELD_ID_ORDER_DELIVERY_METHOD,
        clientFirstName: process.env.MANYCHAT_FIELD_ID_CLIENT_FIRST_NAME,
        paymentMethod: process.env.MANYCHAT_FIELD_ID_PAYMENT_METHOD,
        clientPhone: process.env.MANYCHAT_FIELD_ID_CLIENT_PHONE,
    }
};

/**
 * Checks if the minimum required configuration is present
 * @returns {boolean} true if API key and user ID are configured
 */
function isConfigured() {
    return !!(MANYCHAT_CONFIG.apiKey && MANYCHAT_CONFIG.userIdJessica);
}

/**
 * Logs a warning about missing configuration
 * @param {string} message - Warning message
 */
function logConfigWarning(message) {
    console.warn(`[ManyChat] ⚠️ ${message}`);
}

/**
 * Makes an authenticated request to ManyChat API
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {string} method - HTTP method
 * @param {object} body - Request body
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function manychatRequest(endpoint, method, body) {
    if (!MANYCHAT_CONFIG.apiKey) {
        return { success: false, error: 'MANYCHAT_API_KEY not configured' };
    }

    try {
        const response = await fetch(`${MANYCHAT_API_BASE}${endpoint}`, {
            method,
            headers: {
                'Authorization': `Bearer ${MANYCHAT_CONFIG.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[ManyChat] API Error:', response.status, data);
            return {
                success: false,
                error: data?.message || data?.error || `HTTP ${response.status}`
            };
        }

        return { success: true, data };
    } catch (err) {
        console.error('[ManyChat] Request failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Updates multiple custom fields for a ManyChat user
 * @param {string} userId - ManyChat user ID (subscriber_id)
 * @param {Array<{field_id: number, field_value: string}>} fields - Fields to update
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function updateCustomFields(userId, fields) {
    if (!userId) {
        logConfigWarning('No user ID provided for updateCustomFields');
        return { success: false, error: 'No user ID' };
    }

    if (!fields || fields.length === 0) {
        logConfigWarning('No fields provided for updateCustomFields');
        return { success: false, error: 'No fields' };
    }

    // Filter out fields with missing field_id (not configured)
    const validFields = fields.filter(f => f.field_id);

    if (validFields.length === 0) {
        logConfigWarning('No valid field IDs configured, skipping updateCustomFields');
        return { success: false, error: 'No valid field IDs' };
    }

    console.log(`[ManyChat] Updating ${validFields.length} custom fields for user ${userId}`);

    const result = await manychatRequest('/subscriber/setCustomFields', 'POST', {
        subscriber_id: userId,
        fields: validFields
    });

    if (result.success) {
        console.log('[ManyChat] ✅ Custom fields updated successfully');
    }

    return result;
}

/**
 * Sends a flow to a ManyChat user
 * @param {string} userId - ManyChat user ID (subscriber_id)
 * @param {string} flowId - Flow namespace (flow ID)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendFlowToUser(userId, flowId) {
    if (!userId) {
        logConfigWarning('No user ID provided for sendFlowToUser');
        return { success: false, error: 'No user ID' };
    }

    if (!flowId) {
        logConfigWarning('No flow ID provided for sendFlowToUser');
        return { success: false, error: 'No flow ID' };
    }

    console.log(`[ManyChat] Sending flow ${flowId} to user ${userId}`);

    const result = await manychatRequest('/sending/sendFlow', 'POST', {
        subscriber_id: userId,
        flow_ns: flowId
    });

    if (result.success) {
        console.log('[ManyChat] ✅ Flow sent successfully');
    }

    return result;
}

/**
 * Formats order items for ManyChat description field with WhatsApp-style formatting
 * Includes item notes/observations in italic format
 * @param {Array} items - Order items array
 * @returns {string} Formatted description (single line, WhatsApp compatible)
 */
function formatOrderDescription(items) {
    if (!items || !Array.isArray(items)) return 'Sem itens';

    return items.map(item => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        const price = item.price ? `R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : '';
        const note = item.note ? ` _${item.note}_` : '';

        // Format: "2x Coxinha (R$ 10,00) _observação_"
        let itemStr = `${qty}x ${name}`;
        if (price) itemStr += ` (${price})`;
        if (note) itemStr += note;

        return itemStr;
    }).join(' • ');
}

/**
 * Formats delivery date/time for ManyChat
 * Uses scheduled_date for encomendas, otherwise shows "Hoje" or "Agora"
 * @param {object} order - Order data
 * @returns {string} Formatted delivery date string
 */
function formatDeliveryDate(order) {
    try {
        // If it's an encomenda (scheduled order), use scheduled_date
        if (order.scheduled_date) {
            // Parse YYYY-MM-DD format
            const parts = order.scheduled_date.split('-');
            if (parts.length === 3) {
                const dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                // Include scheduled time if available
                if (order.scheduled_time) {
                    return `${dateStr} às ${order.scheduled_time}`;
                }
                return `${dateStr} (Encomenda)`;
            }
            return order.scheduled_date;
        }

        // For immediate orders, show "Hoje" with current time estimate
        return 'Hoje - o mais breve possível';
    } catch {
        return 'A confirmar';
    }
}

/**
 * Formats payment method with details for ManyChat
 * Includes payment type and when/where payment happens
 * @param {object} order - Order data
 * @returns {string} Formatted payment info
 */
function formatPaymentInfo(order) {
    const paymentMap = {
        'dinheiro': '💵 Dinheiro',
        'cartao1x': '💳 Cartão',
        'pix': '📱 PIX'
    };

    const method = paymentMap[order.payment_method] || order.payment_method || 'Não informado';
    const isDelivery = order.delivery_type === 'entrega';
    const location = isDelivery ? 'na entrega' : 'na retirada';

    return `${method} (${location})`;
}

/**
 * Extracts first name from full name
 * @param {string} fullName - Full client name
 * @returns {string} First name only
 */
function getFirstName(fullName) {
    if (!fullName) return 'Cliente';
    const firstName = fullName.trim().split(/\s+/)[0];
    return firstName || 'Cliente';
}

/**
 * Formats phone number for display
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone
 */
function formatPhone(phone) {
    if (!phone) return 'Não informado';
    // Clean phone - keep only digits
    const digits = phone.replace(/\D/g, '');
    // Format as (XX) XXXXX-XXXX if 11 digits
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    // Format as (XX) XXXX-XXXX if 10 digits
    if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return phone;
}

/**
 * Main function: Notifies ManyChat of a new order
 * 
 * This function:
 * 1. Validates required configuration exists
 * 2. Updates custom fields with order data
 * 3. Triggers the "Novo Pedido" flow
 * 4. Handles ALL errors gracefully - never throws
 * 
 * @param {object} order - Order data from saveOrderToSupabase
 * @param {string} order.order_code - Formatted order code (e.g., "FAST-0001")
 * @param {number} order.total - Order total
 * @param {Array} order.items - Order items
 * @param {string} order.delivery_type - "entrega" or "retirada"
 * @param {string} order.scheduled_date - Optional scheduled date for encomendas
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function notifyNewOrder(order) {
    console.log('[ManyChat] 📦 Processing new order notification...');

    // Step 1: Check minimum required configuration
    if (!isConfigured()) {
        logConfigWarning('ManyChat not configured (missing API key or user ID). Skipping notification.');
        return { success: false, error: 'Not configured' };
    }

    if (!order) {
        logConfigWarning('No order data provided. Skipping notification.');
        return { success: false, error: 'No order data' };
    }

    const userId = MANYCHAT_CONFIG.userIdJessica;
    const flowId = MANYCHAT_CONFIG.flowIdNovoPedido;
    const fieldIds = MANYCHAT_CONFIG.fieldIds;

    try {
        // Step 2: Prepare custom fields data
        const fields = [];

        if (fieldIds.orderNumber) {
            fields.push({
                field_id: parseInt(fieldIds.orderNumber, 10),
                field_value: String(order.order_code || order.id || 'N/A')
            });
        }

        if (fieldIds.orderTotal) {
            const total = order.total ? `R$ ${Number(order.total).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
            fields.push({
                field_id: parseInt(fieldIds.orderTotal, 10),
                field_value: total
            });
        }

        if (fieldIds.orderDescription) {
            fields.push({
                field_id: parseInt(fieldIds.orderDescription, 10),
                field_value: formatOrderDescription(order.items)
            });
        }

        if (fieldIds.orderDate) {
            fields.push({
                field_id: parseInt(fieldIds.orderDate, 10),
                field_value: formatDeliveryDate(order)
            });
        }

        if (fieldIds.orderDeliveryMethod) {
            const method = order.delivery_type === 'entrega' ? '🚚 Entrega' : '🏪 Retirada';
            fields.push({
                field_id: parseInt(fieldIds.orderDeliveryMethod, 10),
                field_value: method
            });
        }

        // NEW: Client first name
        if (fieldIds.clientFirstName) {
            fields.push({
                field_id: parseInt(fieldIds.clientFirstName, 10),
                field_value: getFirstName(order.client_name)
            });
        }

        // NEW: Payment method with details
        if (fieldIds.paymentMethod) {
            fields.push({
                field_id: parseInt(fieldIds.paymentMethod, 10),
                field_value: formatPaymentInfo(order)
            });
        }

        // NEW: Client phone
        if (fieldIds.clientPhone) {
            fields.push({
                field_id: parseInt(fieldIds.clientPhone, 10),
                field_value: formatPhone(order.client_phone)
            });
        }

        // Step 3: Update custom fields (if any are configured)
        if (fields.length > 0) {
            const fieldsResult = await updateCustomFields(userId, fields);
            if (!fieldsResult.success) {
                console.warn('[ManyChat] Custom fields update failed:', fieldsResult.error);
                // Continue anyway to try sending the flow
            }
        } else {
            logConfigWarning('No custom field IDs configured. Skipping fields update.');
        }

        // Step 4: Send the flow (if configured)
        if (flowId) {
            const flowResult = await sendFlowToUser(userId, flowId);
            if (!flowResult.success) {
                console.warn('[ManyChat] Flow send failed:', flowResult.error);
                return { success: false, error: flowResult.error };
            }
        } else {
            logConfigWarning('MANYCHAT_FLOW_ID_NOVO_PEDIDO not configured. Skipping flow trigger.');
        }

        console.log(`[ManyChat] ✅ Notification completed for order ${order.order_code || order.id}`);
        return { success: true };

    } catch (err) {
        // Catch-all: NEVER let an error escape this function
        console.error('[ManyChat] ❌ Unexpected error in notifyNewOrder:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    MANYCHAT_CONFIG,
    isConfigured,
    updateCustomFields,
    sendFlowToUser,
    notifyNewOrder
};
