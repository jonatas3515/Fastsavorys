
// ========================================
// ORDER DASHBOARD MANAGEMENT
// ========================================

const STATUS_LABELS = {
    'pending': { emoji: '📋', label: 'Recebido', color: 'blue' },
    'accepted': { emoji: '✅', label: 'Aceito', color: 'purple' },
    'preparing': { emoji: '👨‍🍳', label: 'Em Preparo', color: 'yellow' },
    'confirmed': { emoji: '✅', label: 'Pronto', color: 'green' },
    'delivered': { emoji: '✅', label: 'Entregue', color: 'gray' },
    'cancelled': { emoji: '❌', label: 'Cancelado', color: 'red' }
};

const PAYMENT_STATUS_LABELS = {
    'pending': { emoji: '⏳', label: 'Pendente', color: 'gray' },
    'awaiting_payment': { emoji: '⏳', label: 'Aguardando Pgto', color: 'yellow' },
    'paid_partial': { emoji: '💰', label: 'Entrada Paga (50%)', color: 'orange' },
    'paid_full': { emoji: '✅', label: 'Pago Total', color: 'green' },
    'cash': { emoji: '💵', label: 'Dinheiro', color: 'green' },
    'pix': { emoji: '💳', label: 'PIX', color: 'green' }
};

window.pendingStatusUpdate = null;
window.pendingMsgUpdateData = null;

async function loadDashboardOrders(forceRefresh = false) {
    const dateFilter = document.getElementById('ordersFilterDate')?.value || 'all'; // Default to all
    const statusFilter = document.getElementById('ordersFilterStatus')?.value || 'all';

    try {
        // Fetch ALL orders to support Reports & History
        let query = window.supabaseClient
            .from('fast_orders')
            .select('*')
            .order('created_at', { ascending: false });

        const { data: allOrders, error } = await query;
        if (error) throw error;

        // Store globally for Reports
        window.orders = allOrders || [];

        // --- Filter for Dashboard View (Kanban/List) ---
        const now = new Date();
        let startDate = null, endDate = null;

        if (dateFilter === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        } else if (dateFilter === 'yesterday') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (dateFilter === 'week') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        } else if (dateFilter === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        }

        // Helper for date checks
        const checkDate = (dateStr) => {
            if (!startDate || !endDate) return true; // 'all'
            const d = new Date(dateStr);
            return d >= startDate && d < endDate;
        };

        // Apply Filters (Date + Status)
        const dashboardOrders = window.orders.filter(o => {
            // Date Filter
            if (!checkDate(o.created_at)) return false;

            // Status Filter
            if (statusFilter !== 'all') {
                if (statusFilter === 'pending') {
                    return ['pending', 'accepted', 'awaiting_payment'].includes(o.status);
                } else if (statusFilter === 'ready') {
                    return o.status === 'confirmed';
                } else if (statusFilter === 'delivery') {
                    return o.status === 'out_for_delivery';
                } else if (statusFilter === 'completed') {
                    return ['delivered', 'cancelled'].includes(o.status);
                } else {
                    return o.status === statusFilter;
                }
            }
            return true;
        });

        updateOrderStats(dashboardOrders);
        updateKPIsDashboard(dashboardOrders, dateFilter); // Update Dashboard KPIs with filtered view

        // Render Dashboard
        renderDashboardOrders(dashboardOrders);

        // Render Reports (Uses window.orders - Global Data)
        if (typeof renderReportsData === 'function') {
            renderReportsData();
        }

        // Start Realtime if not already
        subscribeToOrders();

    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
        showToast('Erro ao carregar pedidos: ' + (error.message || 'Erro desconhecido'), 'error');

        // Diagnostic: Check if RLS is blocking
        try {
            if (window.supabaseClient) {
                const { count, error: countError } = await window.supabaseClient
                    .from('fast_orders')
                    .select('*', { count: 'exact', head: true });

                if (countError) {
                    console.error('[Orders] RLS Check Failed:', countError);
                    showToast('⚠️ Erro de permissão (RLS) detectado.', 'error');
                } else {
                    console.log(`[Orders] Total DB Count: ${count}`);
                }
            }
        } catch (e) { console.warn('Diagnostic check failed', e); }
    }
}

// Force Refresh Helper
window.forceRefreshOrders = function () {
    console.log('Forcing refresh...');
    loadDashboardOrders(true);
};

function updateOrderStats(orders) {
    const counts = {
        pending: 0, preparing: 0, confirmed: 0,
        delivered: 0, cancelled: 0
    };

    orders.forEach(o => {
        if (counts[o.status] !== undefined) counts[o.status]++;
    });

    if (document.getElementById('ordersCountNew')) document.getElementById('ordersCountNew').textContent = counts.pending;
    if (document.getElementById('ordersCountPreparing')) document.getElementById('ordersCountPreparing').textContent = counts.preparing;
    if (document.getElementById('ordersCountReady')) document.getElementById('ordersCountReady').textContent = counts.confirmed;
    if (document.getElementById('ordersCountDelivery')) document.getElementById('ordersCountDelivery').textContent = 0; // Assuming delivery logic separate or merged
    if (document.getElementById('ordersCountDelivered')) document.getElementById('ordersCountDelivered').textContent = counts.delivered;
    if (document.getElementById('ordersCountCanceled')) document.getElementById('ordersCountCanceled').textContent = counts.cancelled;
}

function updateKPIsDashboard(orders, dateFilter) {
    try {
        const paidOrders = orders.filter(o =>
            o.status === 'delivered' ||
            o.payment_status === 'paid' ||
            o.payment_status === 'paid_full'
        );

        const validOrders = orders.filter(o => o.status !== 'cancelled');

        const faturamento = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        if (document.getElementById('kpiFaturamento')) document.getElementById('kpiFaturamento').textContent = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;

        if (document.getElementById('kpiTotalPedidos')) document.getElementById('kpiTotalPedidos').textContent = orders.length;

        const ticketMedio = validOrders.length > 0 ? faturamento / validOrders.length : 0;
        if (document.getElementById('kpiTicketMedio')) document.getElementById('kpiTicketMedio').textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;

        const maiorPedido = validOrders.length > 0 ? Math.max(...validOrders.map(o => o.total || 0)) : 0;
        if (document.getElementById('kpiMaiorPedido')) document.getElementById('kpiMaiorPedido').textContent = `R$ ${maiorPedido.toFixed(2).replace('.', ',')}`;

        const periodLabels = {
            today: 'hoje',
            yesterday: 'ontem',
            week: 'na semana',
            month: 'no mês',
            all: 'total'
        };
        const periodLabel = periodLabels[dateFilter] || 'no período';
        if (document.getElementById('kpiFaturamentoLabel')) {
            document.getElementById('kpiFaturamentoLabel').textContent = periodLabel;
        }
        if (document.getElementById('kpiPedidosLabel')) {
            document.getElementById('kpiPedidosLabel').textContent = periodLabel;
        }
    } catch (e) {
        console.warn('[KPIs] Erro ao atualizar dashboard:', e);
    }
}

// ========================================
// RENDERIZADOR DE PEDIDOS (KANBAN + LISTA)
// ========================================

function createOrderCardHtml(order) {
    const status = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
    const time = new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    // Data e horário de entrega/retirada
    let deliveryDateTimeHtml = '';
    if (order.order_date || order.scheduled_date) {
        const dateStr = order.order_date || order.scheduled_date;
        const timeStr = order.order_time || order.scheduled_time || '';
        const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        deliveryDateTimeHtml = `<div class="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded mb-1 border border-amber-200">📅 ${order.delivery_type === 'entrega' ? 'Entrega' : 'Retirada'}: <strong>${dateFormatted}</strong>${timeStr ? ` às <strong>${timeStr}</strong>` : ''}</div>`;
    }

    // Items Summary
    const items = order.items || [];
    let itemsHtml = items.map(i => {
        let details = '';
        if (i.cake_mass || i.massa) details += `<div class="text-[10px] text-gray-500 pl-4 border-l-2 border-gray-100 mt-0.5">👨‍🍳 ${i.cake_mass || i.massa}</div>`;
        if (i.filling || i.recheio) details += `<div class="text-[10px] text-gray-500 pl-4 border-l-2 border-gray-100 mt-0.5">👨‍🍳 ${i.filling || i.recheio}</div>`;
        if (i.flavors) details += `<div class="text-[10px] text-gray-500 pl-4 border-l-2 border-gray-100 mt-0.5">🍽️ ${i.flavors}</div>`;
        const obs = i.note || i.observations || '';
        if (obs) details += `<div class="text-[10px] text-gray-500 pl-4 border-l-2 border-gray-100 mt-0.5">🔄 ${obs}</div>`;
        if (i.extras) details += `<div class="text-[10px] text-gray-500 pl-4 border-l-2 border-gray-100 mt-0.5">➕ ${i.extras}</div>`;

        return `<div class="text-sm mb-1 pb-1 last:mb-0 border-b border-dashed border-gray-100 last:border-0">
            <strong>${i.quantity}x</strong> ${i.name}
            ${details}
        </div>`;
    }).join('');
    if (itemsHtml.length === 0) itemsHtml = '<span class="text-xs text-gray-400">Sem itens detalhados</span>';

    const isCardPayment = order.payment_method?.startsWith('cartao') || order.payment_method === 'card_stripe';
    // const paymentStatus = PAYMENT_STATUS_LABELS[order.payment_status] || PAYMENT_STATUS_LABELS.pending;

    // Actions based on status
    let actionButtons = '';
    const needsAcceptance = isCardPayment && order.status === 'pending' && !order.payment_link && order.payment_status !== 'paid_full';

    if (needsAcceptance) {
        actionButtons = `<button onclick="acceptCardOrder(${order.id})" class="w-full mt-2 bg-purple-600 hover:bg-purple-700 text-white py-1 rounded text-xs font-medium">✨ Aceitar & Link</button>`;
    } else if (order.status === 'pending' || order.status === 'accepted') {
        actionButtons = `<button onclick="updateOrderStatus(${order.id}, 'preparing')" class="w-full mt-2 bg-yellow-500 hover:bg-yellow-600 text-white py-1 rounded text-xs font-medium">👨‍🍳 Preparar</button>`;
    } else if (order.status === 'preparing') {
        actionButtons = `<button onclick="updateOrderStatus(${order.id}, 'confirmed')" class="w-full mt-2 bg-green-500 hover:bg-green-600 text-white py-1 rounded text-xs font-medium">✅ Pronto</button>`;
    } else if (order.status === 'confirmed') {
        if (order.delivery_type === 'entrega') {
            actionButtons = `<button onclick="updateOrderStatus(${order.id}, 'out_for_delivery')" class="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white py-1 rounded text-xs font-medium">🚚 Saiu p/ Entrega</button>`;
        } else {
            actionButtons = `<button onclick="updateOrderStatus(${order.id}, 'delivered')" class="w-full mt-2 bg-gray-500 hover:bg-gray-600 text-white py-1 rounded text-xs font-medium">🏁 Entregue (Retirada)</button>`;
        }
    } else if (order.status === 'out_for_delivery') {
        actionButtons = `<button onclick="updateOrderStatus(${order.id}, 'delivered')" class="w-full mt-2 bg-gray-500 hover:bg-gray-600 text-white py-1 rounded text-xs font-medium">🏁 Entregue</button>`;
    }

    return `
    <div class="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative group">
        <div class="flex justify-between items-start mb-2">
            <div>
                <span class="font-bold text-gray-800">#${order.order_code || formatOrderCode(order.id)}</span>
                <span class="text-xs text-gray-500 block">${time}</span>
            </div>
            <span class="text-xs px-2 py-0.5 rounded bg-${status.color}-100 text-${status.color}-800 font-medium">${status.emoji}</span>
        </div>
        
        <div class="mb-2 space-y-0.5 border-l-2 border-rose-100 pl-2">
            ${itemsHtml}
        </div>
        
        ${order.coupon_code ? `<div class="text-[10px] bg-purple-50 text-purple-700 px-2 py-1 rounded mb-1 border border-purple-200">🎟️ Cupom: <strong>${order.coupon_code}</strong> ${order.coupon_discount ? `(-R$ ${Number(order.coupon_discount).toFixed(2).replace('.', ',')})` : ''}</div>` : ''}
        
        ${deliveryDateTimeHtml}
        
        <div class="flex justify-between items-end border-t border-gray-100 pt-2 mt-2">
            <div>
                <div class="text-xs font-medium text-gray-800">${order.client_name || 'Cliente'}</div>
                <div class="text-xs text-gray-500">${order.delivery_type === 'entrega' ? '🚚 Entrega' : '👨‍🍳 Retirada'}</div>
            </div>
            <div class="text-right">
                <div class="font-bold text-rose-600 text-sm">R$ ${(order.total || 0).toFixed(2).replace('.', ',')}</div>
                <div class="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                    ${isCardPayment ? '💳 Cartão' : '💵 Dinheiro/PIX'}
                    ${(order.status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'paid_full') ? `<button onclick="updatePaymentStatusManual(${order.id}, 'paid_full')" class="ml-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded px-1" title="Marcar como Pago" onclick="event.stopPropagation()">💰</button>` : (order.status === 'cancelled' ? '❌' : '✅')}
                </div>
            </div>
        </div>
        
        ${actionButtons}
        
        <button onclick="prepareOrderUpdate(${order.id})" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-600 transition-all" title="Gerenciar Status / Mensagem">
            ✏️
        </button>
    </div>
    `;
}

function createOrderRowHtml(order) {
    const status = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
    const date = new Date(order.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const paymentStatus = PAYMENT_STATUS_LABELS[order.payment_status] || PAYMENT_STATUS_LABELS.pending;

    let actionsHtml = `
        <button onclick="prepareOrderUpdate(${order.id})" class="text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1 rounded text-sm font-medium transition-colors">
            Gerenciar
        </button>
    `;

    if (order.payment_link) {
        const link = order.payment_link.replace(/'/g, "\\'");
        const phone = (order.client_phone || '').replace(/'/g, "\\'");

        actionsHtml = `
            <div class="flex flex-col items-end gap-1">
                <button onclick="resendPaymentLink('${order.id}', '${link}', '${phone}')" 
                    class="text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded text-xs font-medium transition-colors border border-purple-200 flex items-center gap-1">
                    🔄 Link
                </button>
                ${actionsHtml}
            </div>
        `;
    }

    return `
    <tr class="hover:bg-gray-50 border-b last:border-0 hover:bg-gray-50 transition-colors">
        <td class="p-4 font-medium text-gray-800">
            ${order.order_code || formatOrderCode(order.id)}
            ${order.scheduled_date ? '<span class="ml-2 text-xs bg-orange-100 text-orange-800 px-1 rounded">📅</span>' : ''}
        </td>
        <td class="p-4">
            <div class="text-sm font-medium text-gray-800">${order.client_name || '-'}</div>
            <div class="text-xs text-gray-500">${order.client_phone || '-'}</div>
        </td>
        <td class="p-4 font-bold text-gray-700">R$ ${(order.total || 0).toFixed(2).replace('.', ',')}</td>
        <td class="p-4">
            <span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-${paymentStatus.color}-100 text-${paymentStatus.color}-800">
                ${paymentStatus.emoji} ${paymentStatus.label}
            </span>
            ${(order.status !== 'cancelled' && order.payment_status !== 'paid' && order.payment_status !== 'paid_full') ? `<button onclick="updatePaymentStatusManual(${order.id}, 'paid_full')" class="ml-2 text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded hover:bg-green-100" title="Marcar Pago">💰 Pago</button>` : ''}
        </td>
        <td class="p-4">
            <span class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-${status.color}-100 text-${status.color}-800">
                ${status.emoji} ${status.label}
            </span>
        </td>
        <td class="p-4 text-xs text-gray-600">${date}</td>
        <td class="p-4 text-right">
            ${actionsHtml}
        </td>
    </tr>
    `;
}

function renderDashboardOrders(orders) {
    // Kanban Columns
    const cols = {
        payment: document.getElementById('col-payment-pending'),
        pending: document.getElementById('col-pending'),
        preparing: document.getElementById('col-preparing'),
        ready: document.getElementById('col-ready'),
        completed: document.getElementById('col-completed')
    };

    // Counts
    const counts = { payment: 0, received: 0, preparing: 0, delivery: 0, completed: 0 };

    // Clear Columns
    Object.values(cols).forEach(col => { if (col) col.innerHTML = ''; });

    // List Body
    const listBody = document.getElementById('ordersListTableBody');
    if (listBody) listBody.innerHTML = '';

    if (!orders || orders.length === 0) {
        if (listBody) listBody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500">Nenhum pedido encontrado.</td></tr>';
        return;
    }

    orders.forEach(order => {
        // Determine Kanban Column
        let targetCol = null;
        const s = order.status;
        const p = order.payment_status;
        const isCard = order.payment_method?.startsWith('cartao') || order.payment_method === 'card_stripe';

        if (s === 'pending' || s === 'awaiting_payment') {
            if (isCard && p !== 'paid_full' && p !== 'paid') {
                targetCol = cols.payment;
                counts.payment++;
            } else {
                targetCol = cols.pending;
                counts.received++;
            }
        } else if (s === 'accepted') {
            targetCol = cols.pending;
            counts.received++;
        } else if (s === 'preparing') {
            targetCol = cols.preparing;
            counts.preparing++;
        } else if (s === 'confirmed' || s === 'out_for_delivery') {
            targetCol = cols.ready;
            counts.delivery++;
        } else if (s === 'delivered' || s === 'cancelled') {
            targetCol = cols.completed;
            counts.completed++;
        }

        // Render Kanban Card
        if (targetCol) {
            targetCol.innerHTML += createOrderCardHtml(order);
        }

        // Render List Row
        if (listBody) {
            listBody.innerHTML += createOrderRowHtml(order);
        }
    });

    // Update Counts Labels (IDs from HTML)
    if (document.getElementById('count-payment')) document.getElementById('count-payment').textContent = counts.payment;
    if (document.getElementById('count-received')) document.getElementById('count-received').textContent = counts.received;
    if (document.getElementById('count-preparing')) document.getElementById('count-preparing').textContent = counts.preparing;
    if (document.getElementById('count-delivery')) document.getElementById('count-delivery').textContent = counts.delivery;
    if (document.getElementById('count-completed')) document.getElementById('count-completed').textContent = counts.completed;
}

// Temporary stubs if needed, but better to implement
// ========================================
// STATUS UPDATES & ACTIONS
// ========================================

async function updateOrderStatus(orderId, newStatus) {
    try {
        const { data: order } = await window.supabaseClient
            .from('fast_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (!order) {
            showToast('Pedido não encontrado.', 'error');
            return;
        }

        const statusesQueNaoDevemSerAlterados = ['preparing', 'confirmed', 'out_for_delivery', 'delivered'];
        if (order.scheduled_date && statusesQueNaoDevemSerAlterados.includes(newStatus)) {
            const { isFuture } = checkFutureDeliveryDate(order.scheduled_date);
            if (isFuture) {
                showFutureDateWarning(orderId, order.scheduled_date, newStatus);
                return;
            }
        }

        await executeStatusUpdate(orderId, newStatus, order);
    } catch (error) {
        console.error('Erro ao verificar pedido:', error);
        showToast('Erro ao verificar pedido.', 'error');
    }
}

async function executeStatusUpdate(orderId, newStatus, orderData = null) {
    try {
        let order = orderData;
        if (!order) {
            const { data } = await window.supabaseClient
                .from('fast_orders')
                .select('*')
                .eq('id', orderId)
                .single();
            order = data;
        }

        const oldStatus = order?.status || 'unknown';

        if (newStatus === 'delivered') {
            if (order && (String(order.payment_method).startsWith('cartao') || order.payment_method === 'card_stripe')) {
                if (order.payment_status !== 'paid_full') {
                    if (!confirm('⚠️ Pagamento em cartão não está completo! Deseja marcar como entregue mesmo assim?')) {
                        return;
                    }
                }
            }
        }

        // Se marcar como entregue, também marcar como pago (lógica: se entregou, recebeu)
        const updatePayload = { status: newStatus };
        if (newStatus === 'delivered') {
            updatePayload.payment_status = 'paid_full';
            updatePayload.delivered_at = new Date().toISOString();
        }

        const { error } = await window.supabaseClient
            .from('fast_orders')
            .update(updatePayload)
            .eq('id', orderId);

        if (error) throw error;

        const orderCode = order?.order_code || formatOrderCode(order?.order_sequence || order?.id);
        await logOrderChange(orderId, orderCode, oldStatus, newStatus);

        if (newStatus === 'delivered' && order && order.client_phone) {
            // Optional: Auto-send WhatsApp rating link
            // const ratingLink = buildRatingLink(orderCode, order.client_phone);
            // ... (Logic preserved from backup if needed, but keeping it simple for now)
        }

        loadDashboardOrders();
        showToast(`Status atualizado para ${newStatus}`, 'success');

    } catch (e) {
        console.error('[OrderLog] Erro ao atualizar status:', e);
        showToast('Erro ao atualizar status: ' + e.message, 'error');
    }
}

// ========================================
// HELPERS
// ========================================

function checkFutureDeliveryDate(scheduledDate) {
    if (!scheduledDate) return { isFuture: false, formattedDate: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduled = new Date(scheduledDate + 'T00:00:00');
    scheduled.setHours(0, 0, 0, 0);
    const isFuture = scheduled > today;
    const parts = scheduledDate.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : scheduledDate;
    return { isFuture, formattedDate };
}

function showFutureDateWarning(orderId, scheduledDate, newStatus) {
    hideFutureDateWarning();
    const { formattedDate } = checkFutureDeliveryDate(scheduledDate);
    const warningId = `futureDateWarning_${orderId}`;
    const warningHtml = `
    <div id="${warningId}" class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onclick="if(event.target===this) hideFutureDateWarning();">
      <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border-l-4 border-orange-500" onclick="event.stopPropagation();">
        <div class="flex items-start gap-3 mb-4">
          <span class="text-3xl">⚠️ </span>
          <div>
            <h4 class="font-bold text-gray-800 text-lg">Pedido com Data Futura</h4>
            <p class="text-gray-600 mt-2">Este pedido <strong>não é para hoje</strong> (${formattedDate}).</p>
            <p class="text-gray-600 mt-2">Deseja mudar o status mesmo assim?</p>
          </div>
        </div>
        <div class="flex gap-3 justify-end">
          <button onclick="hideFutureDateWarning()" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg">Cancelar</button>
          <button onclick="confirmStatusUpdate(${orderId}, '${newStatus}')" class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg">Confirmar</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', warningHtml);
}

window.hideFutureDateWarning = function () {
    document.querySelectorAll('[id^="futureDateWarning_"]').forEach(el => el.remove());
};

window.confirmStatusUpdate = async function (orderId, newStatus) {
    hideFutureDateWarning();
    await executeStatusUpdate(orderId, newStatus);
};

async function logOrderChange(orderId, orderCode, oldStatus, newStatus, notes = '') {
    try {
        const currentUser = sessionStorage.getItem('fastAdmin') || 'Sistema';
        const logEntry = {
            order_id: orderId,
            order_code: orderCode,
            old_status: oldStatus,
            new_status: newStatus,
            changed_by: currentUser,
            changed_at: new Date().toISOString(),
            notes: notes
        };
        await window.supabaseClient.from('fast_order_logs').insert(logEntry);
    } catch (e) {
        console.warn('Supabase log error', e);
    }
}

function formatOrderCode(seqOrId) {
    return `PED-${String(seqOrId).padStart(4, '0')}`;
}

function buildRatingLink(orderCode, phone) {
    const baseUrl = window.location.origin + '/pages/fast.html'; // Adjust as needed
    return `${baseUrl}?rating=${orderCode}&phone=${phone}`;
}

function normalizePhoneDigits(phone) {
    return phone.replace(/\D/g, '');
}

async function archiveOldOrders(daysOld = 90) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        const cutoffISO = cutoffDate.toISOString();

        const { data: oldOrders, error: fetchError } = await window.supabaseClient
            .from('fast_orders')
            .select('id, created_at, status')
            .in('status', ['delivered', 'cancelled'])
            .lt('created_at', cutoffISO);

        if (fetchError) throw fetchError;

        if (!oldOrders || oldOrders.length === 0) {
            console.log('[Archive] Nenhum pedido antigo para arquivar');
            return { archived: 0 };
        }

        const orderIds = oldOrders.map(o => o.id);
        const { error: updateError } = await window.supabaseClient
            .from('fast_orders')
            .update({ archived: true })
            .in('id', orderIds);

        if (updateError) throw updateError;

        return { archived: oldOrders.length };
    } catch (e) {
        console.error('[Archive] Erro ao arquivar pedidos:', e);
        return { archived: 0, error: e.message };
    }
}

async function checkAutoArchive() {
    const lastArchive = localStorage.getItem('fastLastAutoArchive');
    const today = new Date().toDateString();

    if (lastArchive !== today) {
        console.log('[Archive] Verificando pedidos...');
        const result = await archiveOldOrders(90);
        localStorage.setItem('fastLastAutoArchive', today);
    }
}

// ========================================
// BULK ACTIONS (Restored)
// ========================================

let pendingOrderCodes = [];

function deleteOrdersByCodes() {
    const input = document.getElementById('orderCodesToDelete');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    pendingOrderCodes = val.split(',').map(c => c.trim().toUpperCase()).filter(c => c);

    if (pendingOrderCodes.length > 0) {
        const modalText = document.getElementById('deleteOrdersModalText');
        const modal = document.getElementById('deleteOrdersModal');
        if (modalText) modalText.textContent = `Excluir ${pendingOrderCodes.length} pedidos?`;
        if (modal) modal.classList.remove('hidden');
    }
}

async function executeDeleteOrders() {
    const modal = document.getElementById('deleteOrdersModal');
    if (modal) modal.classList.add('hidden');

    const res = document.getElementById('deleteOrdersResult');
    if (res) {
        res.textContent = '⏳ Excluindo...';
        res.style.color = '#007bff';
    }

    const codes = pendingOrderCodes;
    if (codes.length === 0) return;

    try {
        const { data: allOrders, error } = await window.supabaseClient.from('fast_orders').select('*');
        if (error) throw error;

        // Use global formatOrderCode if available, else simplified
        const fmt = window.formatOrderCode || ((id) => `PED-${String(id).padStart(4, '0')}`);

        const ordersToDelete = (allOrders || []).filter(order => {
            const orderCode = order.order_code || fmt(order.order_sequence || order.id);
            return codes.includes(orderCode);
        });

        if (ordersToDelete.length === 0) {
            if (res) {
                res.textContent = '⚠️ Nenhum pedido encontrado.';
                res.style.color = '#856404';
            }
            return;
        }

        const ids = ordersToDelete.map(o => o.id);

        // Delete logs first
        await window.supabaseClient.from('fast_order_logs').delete().in('order_id', ids);

        // Delete orders
        const { error: delError } = await window.supabaseClient.from('fast_orders').delete().in('id', ids);
        if (delError) throw delError;

        if (res) {
            res.textContent = `✅ ${ordersToDelete.length} pedidos excluídos!`;
            res.style.color = '#28a745';
        }

        const input = document.getElementById('orderCodesToDelete');
        if (input) input.value = '';
        pendingOrderCodes = [];

        // Refresh Lists
        loadDashboardOrders();
        // Also refresh reports if function available
        if (typeof renderReportsData === 'function') renderReportsData();

    } catch (e) {
        console.error(e);
        if (res) {
            res.textContent = `❌ Erro: ${e.message}`;
            res.style.color = '#dc3545';
        }
    }
}

// ========================================
// VIEW SWITCHING
// ========================================

window.currentOrderView = 'kanban';

function switchOrderView(view) {
    window.currentOrderView = view;

    const kanbanView = document.getElementById('ordersKanbanView');
    const listView = document.getElementById('ordersListView');
    const btnKanban = document.getElementById('viewModeKanban');
    const btnList = document.getElementById('viewModeList');

    if (view === 'kanban') {
        if (kanbanView) kanbanView.classList.remove('hidden');
        if (listView) listView.classList.add('hidden');

        if (btnKanban) {
            btnKanban.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
            btnKanban.classList.remove('text-gray-600', 'hover:text-gray-900');
        }
        if (btnList) {
            btnList.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
            btnList.classList.add('text-gray-600', 'hover:text-gray-900');
        }
    } else {
        if (kanbanView) kanbanView.classList.add('hidden');
        if (listView) listView.classList.remove('hidden');

        if (btnList) {
            btnList.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
            btnList.classList.remove('text-gray-600', 'hover:text-gray-900');
        }
        if (btnKanban) {
            btnKanban.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
            btnKanban.classList.add('text-gray-600', 'hover:text-gray-900');
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // View Switchers
    document.getElementById('viewModeKanban')?.addEventListener('click', () => switchOrderView('kanban'));
    document.getElementById('viewModeList')?.addEventListener('click', () => switchOrderView('list'));

    // Delete Button (shows confirmation modal first)
    document.getElementById('confirmDeleteOrdersBtn')?.addEventListener('click', deleteOrdersByCodes);

    // Modal confirm button (does actual delete)
    document.getElementById('confirmDeleteOrdersModalBtn')?.addEventListener('click', executeDeleteOrders);

    // Modal cancel button
    document.getElementById('cancelDeleteOrdersModalBtn')?.addEventListener('click', () => {
        const modal = document.getElementById('deleteOrdersModal');
        if (modal) modal.classList.add('hidden');
        pendingOrderCodes = [];
    });

    // Filter Dropdowns - reload orders on change
    document.getElementById('ordersFilterDate')?.addEventListener('change', () => loadDashboardOrders());
    document.getElementById('ordersFilterStatus')?.addEventListener('change', () => loadDashboardOrders());

    // Initial Render call if needed (Core usually calls loadDashboardOrders)
});
// Subscription
function subscribeToOrders() {
    if (!window.supabaseClient) return;
    try {
        window.supabaseClient
            .channel('public:fast_orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fast_orders' }, payload => {
                console.log('[Orders] Realtime Update:', payload);
                loadDashboardOrders();
                if (payload.eventType === 'INSERT') showToast('🔔 Novo pedido recebido!', 'success');
            })
            .subscribe();
    } catch (e) {
        console.error('Erro ao subscrever pedidos:', e);
    }
}

// ========================================
// PAYMENT MODAL (Inline)
// ========================================

function showPaymentModal(orderId, total, currentStatus) {
    // Remove existing if any
    const existing = document.getElementById('paymentModal');
    if (existing) existing.remove();

    const html = `
    <div id="paymentModal" class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up">
            <div class="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 class="font-bold text-gray-800">Atualizar Pagamento</h3>
                <button onclick="closePaymentModal()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div class="p-6">
                <p class="text-sm text-gray-600 mb-4">Selecione o novo status para o pedido <strong>#${orderId}</strong></p>
                
                <div class="space-y-3">
                    <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50 transition-colors group">
                        <input type="radio" name="paymentStatus" value="paid_full" class="w-5 h-5 text-green-600" checked onchange="togglePartialInput(false)">
                        <div>
                            <span class="block font-bold text-gray-800 group-hover:text-green-700">Pago Total</span>
                            <span class="text-xs text-gray-500">Valor integral recebido (R$ ${total.toFixed(2)})</span>
                        </div>
                    </label>

                    <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-orange-50 transition-colors group">
                        <input type="radio" name="paymentStatus" value="paid_partial" class="w-5 h-5 text-orange-500" onchange="togglePartialInput(true)">
                        <div class="flex-1">
                            <span class="block font-bold text-gray-800 group-hover:text-orange-700">Parcial / Entrada</span>
                            <div id="partialInputContainer" class="hidden mt-2">
                                <label class="text-xs text-gray-500 block mb-1">Valor Recebido:</label>
                                <div class="relative">
                                    <span class="absolute left-2 top-1.5 text-gray-400 text-sm">R$</span>
                                    <input type="number" id="partialAmountInput" class="w-full pl-8 pr-2 py-1 border rounded text-sm focus:ring-2 focus:ring-orange-200 outline-none" placeholder="0,00" step="0.01">
                                </div>
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button onclick="closePaymentModal()" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancelar</button>
                <button onclick="confirmPaymentUpdate(${orderId}, ${total})" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm shadow-md hover:shadow-lg transition-all">Confirmar</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    // Focus logic
    setTimeout(() => {
        const modal = document.getElementById('paymentModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closePaymentModal();
            });
        }
    }, 10);
}

window.togglePartialInput = function (show) {
    const container = document.getElementById('partialInputContainer');
    if (container) {
        if (show) {
            container.classList.remove('hidden');
            const input = document.getElementById('partialAmountInput');
            if (input) input.focus();
        } else {
            container.classList.add('hidden');
        }
    }
};

window.closePaymentModal = function () {
    const el = document.getElementById('paymentModal');
    if (el) el.remove();
};

window.confirmPaymentUpdate = async function (orderId, total) {
    const radios = document.getElementsByName('paymentStatus');
    let selected = 'paid_full';
    for (const r of radios) { if (r.checked) selected = r.value; }

    let amountPaid = 0;

    if (selected === 'paid_full') {
        amountPaid = total;
    } else {
        const input = document.getElementById('partialAmountInput');
        const val = parseFloat(input?.value);
        if (isNaN(val) || val <= 0) {
            showToast('Digite um valor válido para pagamento parcial.', 'error');
            return; // Don't close modal
        }
        amountPaid = val;
        // Logic: if amount >= total, switch to paid_full automatically?
        if (amountPaid >= total) selected = 'paid_full';
    }

    closePaymentModal();

    // Proceed with update
    try {
        const { error } = await window.supabaseClient
            .from('fast_orders')
            .update({
                payment_status: selected,
                amount_paid: amountPaid
            })
            .eq('id', orderId);

        if (error) throw error;

        showToast('Pagamento atualizado!', 'success');
        loadDashboardOrders();
        await logOrderChange(orderId, 'PED-' + orderId, 'payment_update', selected, `Pago: R$ ${amountPaid}`);

    } catch (e) {
        console.error('Erro ao atualizar pagamento:', e);
        showToast('Erro ao salvar.', 'error');
    }
};

window.updatePaymentStatusManual = async function (id, currentStatus) {
    // Fetch total first to ensure accuracy
    try {
        const { data: order } = await window.supabaseClient.from('fast_orders').select('total').eq('id', id).single();
        if (order) {
            showPaymentModal(id, order.total || 0, currentStatus);
        }
    } catch (e) {
        console.error(e);
        showToast('Erro ao abrir pagamento.', 'error');
    }
};

// ========================================
// STATUS MODAL (Inline - replaces prompt)
// ========================================

function showStatusModal(orderId) {
    const existing = document.getElementById('statusModal');
    if (existing) existing.remove();

    const html = `
    <div id="statusModal" class="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up">
            <div class="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 class="font-bold text-gray-800">Alterar Status do Pedido</h3>
                <button onclick="closeStatusModal()" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div class="p-4 space-y-2">
                <button onclick="confirmStatusChange(${orderId}, 'pending')" class="w-full text-left p-3 rounded-lg hover:bg-blue-50 border border-gray-200 flex items-center gap-2"><span>📋</span> Pendente/Recebido</button>
                <button onclick="confirmStatusChange(${orderId}, 'preparing')" class="w-full text-left p-3 rounded-lg hover:bg-yellow-50 border border-gray-200 flex items-center gap-2"><span>👨‍🍳</span> Em Preparo</button>
                <button onclick="confirmStatusChange(${orderId}, 'confirmed')" class="w-full text-left p-3 rounded-lg hover:bg-green-50 border border-gray-200 flex items-center gap-2"><span>✅</span> Pronto</button>
                <button onclick="confirmStatusChange(${orderId}, 'out_for_delivery')" class="w-full text-left p-3 rounded-lg hover:bg-orange-50 border border-gray-200 flex items-center gap-2"><span>🚚</span> Saiu p/ Entrega</button>
                <button onclick="confirmStatusChange(${orderId}, 'delivered')" class="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 flex items-center gap-2"><span>🏁</span> Entregue</button>
                <button onclick="confirmStatusChange(${orderId}, 'cancelled')" class="w-full text-left p-3 rounded-lg hover:bg-red-50 border border-red-200 text-red-700 flex items-center gap-2"><span>❌</span> Cancelado</button>
            </div>
            
            <div class="bg-gray-50 px-6 py-3 border-t border-gray-100 text-right">
                <button onclick="closeStatusModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">Cancelar</button>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    setTimeout(() => {
        const modal = document.getElementById('statusModal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeStatusModal(); });
    }, 10);
}

window.closeStatusModal = function () {
    const el = document.getElementById('statusModal');
    if (el) el.remove();
};

window.confirmStatusChange = async function (orderId, newStatus) {
    closeStatusModal();
    await updateOrderStatus(orderId, newStatus);
};

window.prepareOrderUpdate = function (orderId) {
    showStatusModal(orderId);
};

// Global Exports
window.loadDashboardOrders = loadDashboardOrders;
window.updateOrderStatus = updateOrderStatus;
window.checkAutoArchive = checkAutoArchive;
window.deleteOrdersByCodes = deleteOrdersByCodes;
window.executeDeleteOrders = executeDeleteOrders;
window.hideFutureDateWarning = hideFutureDateWarning;
window.confirmStatusUpdate = confirmStatusUpdate;
window.subscribeToOrders = subscribeToOrders;

// Run auto-archive check on load
setTimeout(checkAutoArchive, 10000);
