
// ========================================
// REPORT HELPER FUNCTIONS
// ========================================

let currentReportPeriod = 'month';

function getOrdersInPeriod(period) {
    const orders = window.orders || [];
    const now = new Date();
    let startDate;
    let endDate; // Declare endDate here

    switch (period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // End of today
            console.log('[Reports] Filter Today. Start:', startDate, 'End:', endDate);
            break;
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // End of yesterday
            break;
        case 'week':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // End of today
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Start of next month
            break;
        case 'semester':
            startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Start of next month
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear() + 1, 0, 1); // Start of next year
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Start of next month
    }

    // Helper helper for date safety
    const safeDate = (d) => {
        if (!d) return new Date(0);
        return new Date(d);
    };

    return orders.filter(o => {
        const d = safeDate(o.created_at || o.id);
        if (period === 'yesterday') {
            // Special case for exact day match if needed, but 'yesterday' usually implies last 24h or since yesterday 00:00.
            // Let's assume start date inclusive.
            // If strictly 'yesterday' (00:00 to 23:59), logic needs update.
            // Current logic: >= startDate.
            // For 'yesterday', let's stick to >= yesterday 00:00.
            return d >= startDate;
        }
        return d >= startDate;
    });
}

function calculateClientRanking(periodOrders) {
    const validOrders = periodOrders.filter(order => {
        const status = (order.status || '').toLowerCase();
        return status.includes('paid') || status.includes('delivered') || status.includes('confirmed') ||
            status.includes('pago') || status.includes('entregue') || status.includes('pronto') ||
            status === 'preparing' || status === 'out_for_delivery';
    });

    const clientTotals = {};

    validOrders.forEach(order => {
        const key = order.client_phone || order.client_name;
        if (!clientTotals[key]) {
            clientTotals[key] = {
                name: order.client_name,
                phone: order.client_phone,
                total: 0,
                orderCount: 0
            };
        }
        let val = 0;
        const s = (order.status || '').toLowerCase();

        if (['delivered', 'confirmed'].includes(s)) {
            val = parseFloat(order.total || 0);
        } else {
            val = parseFloat(order.amount_paid || 0);
        }

        clientTotals[key].total += val;
        clientTotals[key].orderCount++;
    });

    return Object.values(clientTotals)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
}

function calculateTopProducts(periodOrders) {
    const productCounts = {};

    periodOrders.forEach(order => {
        let items = [];
        try {
            items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        } catch (e) { items = []; }

        items.forEach(item => {
            if (!productCounts[item.name]) {
                productCounts[item.name] = { name: item.name, quantity: 0, revenue: 0 };
            }
            productCounts[item.name].quantity += item.quantity || 1;
            productCounts[item.name].revenue += (item.price || 0) * (item.quantity || 1);
        });
    });

    return Object.values(productCounts)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8);
}

function updatePeriodButtons() {
    const buttons = {
        'reportPeriodMonth': 'month',
        'reportPeriodSemester': 'semester',
        'reportPeriodYear': 'year'
    };
    Object.entries(buttons).forEach(([id, period]) => {
        const btn = document.getElementById(id);
        if (btn) {
            if (currentReportPeriod === period) {
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                btn.classList.add('bg-rose-600', 'text-white');
            } else {
                btn.classList.remove('bg-rose-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            }
        }
    });
}

function calculateNeighborhoodStats(orders) {
    const stats = {};
    orders.forEach(o => {
        if (!o.address || !o.address.neighborhood) return;
        const n = o.address.neighborhood;
        if (!stats[n]) stats[n] = 0;
        stats[n]++;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
}


function renderReportsData() {
    console.log('[Reports] Updating reports data...');
    if (typeof updatePeriodButtons === 'function') updatePeriodButtons();

    // Ensure orders exist
    const orders = window.orders || [];

    // Get orders filtered by the current global period
    const periodOrders = getOrdersInPeriod(currentReportPeriod);

    // --- Update KPI Cards (Summary) ---
    // Filter paid/valid orders for revenue stats
    // Logic: 
    // - If Delivered/Confirmed: Use 'total' (assuming full payment received upon delivery)
    // - If Scheduled/Pending/Preparing: Use 'amount_paid' (partial or full advance)

    // We filter orders that contribute to revenue (either delivered or have some payment)
    const paidOrders = periodOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        const paid = parseFloat(o.amount_paid || 0);
        return ['delivered', 'confirmed'].includes(s) || paid > 0 || (o.payment_status && o.payment_status.includes('paid'));
    });

    const totalRevenue = paidOrders.reduce((sum, o) => {
        const s = (o.status || '').toLowerCase();
        if (['delivered', 'confirmed'].includes(s)) {
            return sum + parseFloat(o.total || 0);
        } else {
            return sum + parseFloat(o.amount_paid || 0);
        }
    }, 0);

    const totalOrders = periodOrders.length;
    const avgOrder = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
    const uniqueClients = new Set(periodOrders.map(o => o.client_phone || o.client_name)).size;

    // Update Summary Cards
    if (document.getElementById('totalRevenueCard')) document.getElementById('totalRevenueCard').textContent = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
    if (document.getElementById('totalOrdersCard')) document.getElementById('totalOrdersCard').textContent = totalOrders;
    if (document.getElementById('avgOrderCard')) document.getElementById('avgOrderCard').textContent = `R$ ${avgOrder.toFixed(2).replace('.', ',')}`;
    if (document.getElementById('uniqueClientsCard')) document.getElementById('uniqueClientsCard').textContent = uniqueClients;

    // Legacy support & Dashboard Widgets
    // These should ALWAYS show TODAY's data, regardless of the selected period for the main report
    const ordersToday = getOrdersInPeriod('today');
    const paidOrdersToday = ordersToday.filter(o => {
        const s = (o.status || '').toLowerCase();
        const paid = parseFloat(o.amount_paid || 0);
        return ['delivered', 'confirmed'].includes(s) || paid > 0 || (o.payment_status && o.payment_status.includes('paid'));
    });
    const revenueToday = paidOrdersToday.reduce((sum, o) => {
        const s = (o.status || '').toLowerCase();
        if (['delivered', 'confirmed'].includes(s)) {
            return sum + parseFloat(o.total || 0);
        } else {
            return sum + parseFloat(o.amount_paid || 0);
        }
    }, 0);

    // Update "Sales Today" specific elements (Dashboard/Sidebar/TopCards)
    // Update KPIs (existing logic)
    if (document.getElementById('reportSalesToday')) document.getElementById('reportSalesToday').textContent = `R$ ${ordersToday.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0).toFixed(2).replace('.', ',')}`;
    if (document.getElementById('reportOrdersToday')) document.getElementById('reportOrdersToday').textContent = ordersToday.length;

    // Calculate period stats
    let totalSales = 0;
    let totalOrdersForPeriod = periodOrders.length; // Renamed to avoid conflict with 'totalOrders' above

    periodOrders.forEach(o => {
        totalSales += (parseFloat(o.total) || 0);
    });

    const avgTicket = totalOrdersForPeriod > 0 ? totalSales / totalOrdersForPeriod : 0;

    // Update Cards
    if (document.getElementById('reportSalesMonth')) document.getElementById('reportSalesMonth').textContent = `R$ ${totalSales.toFixed(2).replace('.', ',')}`;
    if (document.getElementById('reportTicketAvg')) document.getElementById('reportTicketAvg').textContent = `R$ ${avgTicket.toFixed(2).replace('.', ',')}`;

    // --- Render Sub-Reports ---
    const ranking = calculateClientRanking(periodOrders);
    const rankingList = document.getElementById('clientRankingList');
    if (rankingList) {
        if (ranking.length > 0) {
            rankingList.innerHTML = ranking.map((c, i) => `
            <div class="flex items-center justify-between p-2 ${i < 3 ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border'} rounded-lg">
                <div class="flex items-center gap-3">
                <span class="text-lg font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-600'}">${i + 1}º</span>
                <div>
                    <p class="font-medium text-gray-800 text-sm">${c.name}</p>
                    <p class="text-xs text-gray-500">${c.orderCount} pedidos</p>
                </div>
                </div>
                <span class="font-bold text-green-600">R$ ${c.total.toFixed(2).replace('.', ',')}</span>
            </div>
            `).join('');
        } else {
            rankingList.innerHTML = `<div class="text-center py-8 text-gray-500"><p class="text-4xl mb-2">🔄 </p><p>Nenhum pedido no período.</p></div>`;
        }
    }

    // --- Order History ---
    const historyList = document.getElementById('orderHistoryList');
    if (historyList) {
        if (periodOrders.length > 0) {
            const formatDate = (d) => {
                const date = new Date(d);
                return isNaN(date.getTime()) ? 'Data inv.' : date.toLocaleDateString('pt-BR');
            };

            historyList.innerHTML = periodOrders.slice(0, 20).map(o => {
                const date = formatDate(o.created_at || o.id);
                let itemsCount = 0;
                try {
                    const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
                    itemsCount = items.length;
                } catch (e) { }

                return `
                <div class="p-2 bg-white border rounded-lg">
                    <div class="flex justify-between items-start">
                    <div>
                        <p class="font-medium text-gray-800 text-sm">${o.client_name || 'Cliente'}</p>
                        <p class="text-xs text-gray-500">${date} | ${itemsCount} itens</p>
                    </div>
                    <span class="font-bold text-green-600 text-sm">R$ ${parseFloat(o.total || 0).toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = `<div class="text-center py-8 text-gray-500"><p class="text-4xl mb-2">📦 </p><p>Nenhum pedido no período.</p></div>`;
        }
    }

    // --- Top Products ---
    const topProductsList = document.getElementById('topProductsList');
    if (topProductsList) {
        const topProducts = calculateTopProducts(periodOrders);
        if (topProducts.length > 0) {
            topProductsList.innerHTML = topProducts.map((p, i) => `
            <div class="flex items-center justify-between p-2 border-b last:border-0 border-gray-100">
                <div class="flex items-center gap-3">
                    <span class="text-sm font-bold text-gray-500 w-6 text-center">${i + 1}</span>
                    <span class="text-sm text-gray-700 truncate max-w-[150px]">${p.name}</span>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold text-gray-800">${p.quantity} un.</p>
                    <p class="text-[10px] text-gray-500">R$ ${p.revenue.toFixed(2).replace('.', ',')}</p>
                </div>
            </div>
            `).join('');
        } else {
            topProductsList.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">Sem dados</div>';
        }
    }

    // Update Neighborhood Chart
    if (typeof renderNeighborhoodChart === 'function') {
        renderNeighborhoodChart(periodOrders);
    }
}

function calculateNeighborhoodStats(orders) {
    const stats = {};

    orders.forEach(order => {
        if (!order.address) return;

        let neighborhood = null;
        if (typeof order.address === 'string') {
            try {
                const addr = JSON.parse(order.address);
                neighborhood = addr.neighborhood || addr.bairro;
            } catch (e) { }
        } else {
            neighborhood = order.address.neighborhood || order.address.bairro;
        }

        if (!neighborhood) return;

        // Normalize neighborhood name
        const n = neighborhood.trim();
        const key = n.toLowerCase();

        if (!stats[key]) {
            stats[key] = {
                name: n,
                count: 0,
                total: 0
            };
        }

        stats[key].count++;
        stats[key].total += parseFloat(order.total) || 0;
    });

    // Convert to array and sort by count (desc)
    return Object.values(stats)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Take top 5
}

function renderNeighborhoodChart(orders) {
    const container = document.getElementById('neighborhoodChartContainer');
    // Fallback to old ID if new one missing
    const target = container || document.getElementById('chartsContainer');

    if (!target) return;

    const stats = calculateNeighborhoodStats(orders);

    if (stats.length === 0) {
        target.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                <span class="text-2xl mb-2">🔄 </span>
                <p>Nenhum pedido com entrega no período.</p>
            </div>
        `;
        return;
    }

    const maxCount = Math.max(...stats.map(s => s.count));

    const html = `
        <div class="w-full">
            <div class="space-y-4">
                ${stats.map((s, i) => {
        const percentage = (s.count / maxCount) * 100;
        const colors = ['bg-rose-500', 'bg-rose-400', 'bg-rose-300', 'bg-pink-400', 'bg-pink-300'];
        const color = colors[Math.min(i, colors.length - 1)];

        return `
                    <div class="flex items-center gap-3">
                        <div class="w-24 text-right text-sm font-medium text-gray-700 truncate capitalize" title="${s.name}">${s.name}</div>
                        <div class="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                            <div class="${color} h-full rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
                            <span class="absolute inset-0 flex items-center justify-center text-xs font-bold ${percentage > 50 ? 'text-white' : 'text-gray-700'}">
                                ${s.count} pedidos
                            </span>
                        </div>
                        <div class="w-20 text-right text-xs text-green-600 font-bold">
                            R$ ${s.total.toFixed(2).replace('.', ',')}
                        </div>
                    </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    target.innerHTML = html;
    if (target.id === 'chartsContainer') {
        target.classList.remove('flex', 'items-center', 'justify-center', 'text-gray-400');
    }
}

// Expose globals
window.renderReportsData = renderReportsData;
window.currentReportPeriod = currentReportPeriod; // expose for onclicks if needed, or wrap setter
window.setReportPeriod = function (p) {
    currentReportPeriod = p;
    renderReportsData();
};
window.renderNeighborhoodChart = renderNeighborhoodChart; // expose for onclicks if needed, or wrap setter
