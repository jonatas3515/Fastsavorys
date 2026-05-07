
const MANYCHAT_API_BASE = 'https://api.manychat.com/fb'; // Not used here but keeping style consistent

/**
 * PrintNode Service
 * Handles interaction with PrintNode API for thermal printing
 */
class PrintNodeService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiBase = 'https://api.printnode.com';
    }

    /**
     * Formats the order into a text receipt for 58mm thermal printers
     * @param {Object} order - The order object from Supabase
     * @returns {String} - Formatted text
     */
    formatReceipt(order) {
        const line = '-'.repeat(32); // 58mm usually fits ~32 chars
        const center = (text) => {
            const pad = Math.max(0, Math.floor((32 - text.length) / 2));
            return ' '.repeat(pad) + text;
        };

        const money = (val) => `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;

        const date = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        let esc = '';

        // Header
        esc += center('FAST SAVORY\'S') + '\n';
        esc += center('Lanchonete') + '\n';
        esc += '\n';
        esc += center('PEDIDO: ' + (order.order_code || '???')) + '\n';
        esc += center(date) + '\n';
        esc += line + '\n';

        // Customer Info
        esc += `Cliente: ${order.client_name || 'Nao informado'}\n`;
        if (order.client_phone) esc += `Tel: ${order.client_phone}\n`;

        // Address or Pickup
        if (order.delivery_type === 'retirada') {
            esc += `>> RETIRADA NO BALCAO <<\n`;
        } else {
            esc += `ENTREGA:\n`;
            if (order.address) {
                // Handle both JSON object or string address
                let addr = order.address;
                if (typeof addr === 'string') {
                    try { addr = JSON.parse(addr); } catch (e) { }
                }

                if (addr && typeof addr === 'object') {
                    if (addr.neighborhood) esc += `Bairro: ${addr.neighborhood}\n`;
                    if (addr.street) esc += `${addr.street}, ${addr.number || 'S/N'}\n`;
                    if (addr.complement) esc += `Comp: ${addr.complement}\n`;
                    if (addr.reference) esc += `Ref: ${addr.reference}\n`;
                } else {
                    esc += `${order.address}\n`;
                }
            }
        }

        // Scheduled Order
        if (order.scheduled_date) {
            esc += line + '\n';
            esc += `>> ENCOMENDA PARA: ${order.scheduled_date} <<\n`;
            // If time is stored separately or in date, ideally print it too
        }

        esc += line + '\n';

        // Items
        if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                esc += `${item.quantity}x ${item.name}\n`;
                // Sub-items/Options if any
                if (item.observacao) esc += `   (Obs: ${item.observacao})\n`;

                // Print options/extras if they exist in item structure
                // Assuming standard fast savorys structure where options might be in name or obs
            });
        }

        esc += line + '\n';

        // Totals
        esc += `Subtotal: `.padEnd(20) + money(order.subtotal) + '\n';
        if (order.delivery_fee > 0) {
            esc += `Taxa Entrega: `.padEnd(20) + money(order.delivery_fee) + '\n';
        }
        if (order.discount > 0) {
            esc += `Desconto: `.padEnd(20) + `-${money(order.discount)}\n`;
        }
        esc += `TOTAL: `.padEnd(20) + money(order.total) + '\n';

        esc += line + '\n';

        // Payment
        esc += `Pagamento: ${order.payment_method}\n`;
        if (order.change_for) {
            esc += `Troco para: ${money(order.change_for)}\n`;
        }

        esc += '\n\n\n.'; // Feed lines
        return esc;
    }

    /**
     * Sends a print job to PrintNode
     * @param {String} printerId - The ID of the printer in PrintNode
     * @param {String} content - The text content to print
     * @returns {Promise<Object>} - API response
     */
    async print(printerId, content) {
        if (!this.apiKey) {
            console.error('[PrintNode] No API Key provided');
            return { success: false, error: 'No API Key' };
        }

        try {
            const response = await fetch(`${this.apiBase}/printjobs`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    printerId: parseInt(printerId),
                    title: 'Pedido Fast Savory',
                    contentType: 'raw_base64',
                    content: Buffer.from(content, 'utf-8').toString('base64'),
                    source: 'FastSavorys Webhook'
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error('[PrintNode] Error:', data);
                return { success: false, error: data.message || 'PrintNode Error' };
            }

            return { success: true, jobId: data };
        } catch (error) {
            console.error('[PrintNode] Exception:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Lists available printers (helper for setup)
     */
    async getPrinters() {
        if (!this.apiKey) return [];
        try {
            const response = await fetch(`${this.apiBase}/printers`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64')
                }
            });
            return await response.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    }
}

module.exports = PrintNodeService;
