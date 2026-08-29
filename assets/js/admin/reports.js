// ========================================
// REPORTS & METRICS MODULE (ADMIN)
// ========================================

let currentReportPeriod = 'month';

// Safe money parser
function parseMoney(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'string') {
        const cleaned = val.replace(/[^\d.,-]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

// Safe date parser
function safeDate(d) {
    if (!d) return new Date(0);
    const date = new Date(d);
    return isNaN(date.getTime()) ? new Date(0) : date;
}

// Check if order is active/completed (exclude cancelled)
function isOrderValid(order) {
    if (!order) return false;
    const status = (order.status || '').toLowerCase().trim();
    return status !== 'cancelled' && status !== 'cancelado' && status !== 'canceled';
}

// Neighborhood normalizer with unifications requested
function normalizeNeighborhoodName(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    let n = rawName.trim().toLowerCase();

    // Remove accents
    n = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Check if it's store pickup
    if (n === 'retirada' || n === 'retirados' || n === 'balcao' || n === 'retirar na loja' || n === 'buscar na loja') {
        return 'Retirados';
    }

    // Regra Cidade Baixa: "centro cidade baixa", "cidade baixa", "cidade baixa centro"
    if (n.includes('cidade baixa') || n.includes('centro cidade baixa')) {
        return 'Cidade Baixa';
    }

    // Regra Centro: "cidade alta", "centro cidade alta", "centro", "acentro cidade alta"
    if (n.includes('cidade alta') || n === 'centro' || n === 'acentro' || n.includes('centro') || n.includes('acentro')) {
        return 'Centro';
    }

    // Outros bairros: Capitaliza as palavras
    return rawName.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Robust extractor for neighborhood or pickup
function getNeighborhoodOrPickup(order) {
    if (!order) return null;

    const deliveryType = (order.delivery_type || order.delivery_mode || '').toLowerCase().trim();
    if (deliveryType === 'retirada' || deliveryType === 'balcao' || deliveryType === 'pickup') {
        return 'Retirados';
    }

    let n = null;
    if (order.neighborhood && typeof order.neighborhood === 'string') {
        n = order.neighborhood;
    } else if (order.address) {
        if (typeof order.address === 'object') {
            n = order.address.neighborhood || order.address.bairro;
        } else if (typeof order.address === 'string') {
            const raw = order.address.trim();
            if (raw.startsWith('{') && raw.endsWith('}')) {
                try {
                    const parsed = JSON.parse(raw);
                    n = parsed.neighborhood || parsed.bairro;
                } catch (e) { }
            }
            if (!n) {
                if (raw.toLowerCase().includes('retirada') || raw.toLowerCase().includes('balcao')) {
                    return 'Retirados';
                }
                const parts = raw.split('-');
                if (parts.length > 1) {
                    n = parts[parts.length - 1].trim();
                } else {
                    const commaParts = raw.split(',');
                    if (commaParts.length > 2) {
                        n = commaParts[2].trim();
                    }
                }
            }
        }
    }

    if (!n && order.details) {
        try {
            const det = typeof order.details === 'string' ? JSON.parse(order.details) : order.details;
            if (det.delivery_mode === 'retirada' || det.delivery_type === 'retirada') {
                return 'Retirados';
            }
            n = det.neighborhood || det.bairro;
        } catch (e) { }
    }

    if (!n) {
        if (!order.address || order.address === '' || order.address === '{}') {
            return 'Retirados';
        }
        return null;
    }

    return normalizeNeighborhoodName(n);
}

function getOrdersInPeriod(period) {
    const orders = window.orders || [];
    const now = new Date();
    let startDate;
    let endDate;

    switch (period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
        case 'semester':
            startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear() + 1, 0, 1);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    return orders.filter(o => {
        const d = safeDate(o.created_at || o.id);
        return d >= startDate && d < endDate;
    });
}

function calculateClientRanking(periodOrders) {
    const validOrders = (periodOrders || []).filter(isOrderValid);
    const clientTotals = {};

    validOrders.forEach(order => {
        const phone = (order.client_phone || '').replace(/\D/g, '');
        const name = (order.client_name || '').trim();
        const key = phone || name || `order-${order.id}`;

        if (!clientTotals[key]) {
            clientTotals[key] = {
                name: name || 'Cliente',
                phone: phone,
                total: 0,
                orderCount: 0
            };
        }

        if (name && name.length > (clientTotals[key].name || '').length) {
            clientTotals[key].name = name;
        }

        clientTotals[key].total += parseMoney(order.total);
        clientTotals[key].orderCount++;
    });

    return Object.values(clientTotals)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);
}

function calculateTopProducts(periodOrders) {
    const productCounts = {};
    const validOrders = (periodOrders || []).filter(isOrderValid);

    validOrders.forEach(order => {
        let items = [];
        try {
            items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
        } catch (e) { items = []; }

        if (!Array.isArray(items)) return;

        items.forEach(item => {
            if (!item || !item.name) return;
            const name = item.name.trim();
            const qty = parseInt(item.quantity, 10) || 1;
            const price = parseMoney(item.price || item.unit_price || 0);
            const revenue = (item.total ? parseMoney(item.total) : (price * qty));

            if (!productCounts[name]) {
                productCounts[name] = { name: name, quantity: 0, revenue: 0 };
            }
            productCounts[name].quantity += qty;
            productCounts[name].revenue += revenue;
        });
    });

    return Object.values(productCounts)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8);
}

function calculateNeighborhoodStats(orders) {
    const stats = {};
    const validOrders = (orders || []).filter(isOrderValid);

    let pickupStats = null;

    validOrders.forEach(order => {
        const name = getNeighborhoodOrPickup(order);
        if (!name) return;

        if (name === 'Retirados') {
            if (!pickupStats) {
                pickupStats = {
                    name: 'Retirados',
                    isPickup: true,
                    count: 0,
                    total: 0
                };
            }
            pickupStats.count++;
            pickupStats.total += parseMoney(order.total);
            return;
        }

        const key = name.toLowerCase();
        if (!stats[key]) {
            stats[key] = {
                name: name,
                isPickup: false,
                count: 0,
                total: 0
            };
        }

        stats[key].count++;
        stats[key].total += parseMoney(order.total);
    });

    const neighborhoodList = Object.values(stats).sort((a, b) => b.count - a.count);

    // Retirados sempre no topo acima dos bairros
    if (pickupStats) {
        return [pickupStats, ...neighborhoodList];
    }
    return neighborhoodList;
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

function renderOrderHistoryList(orders) {
    const historyList = document.getElementById('orderHistoryList');
    if (!historyList) return;

    const searchTerm = (document.getElementById('orderSearchClient')?.value || '').toLowerCase().trim();
    let displayOrders = orders || [];

    if (searchTerm) {
        displayOrders = displayOrders.filter(o => {
            const name = (o.client_name || '').toLowerCase();
            const phone = (o.client_phone || '').toLowerCase();
            const code = (o.order_code || '').toLowerCase();
            return name.includes(searchTerm) || phone.includes(searchTerm) || code.includes(searchTerm);
        });
    }

    if (displayOrders.length > 0) {
        const formatDate = (d) => {
            const date = new Date(d);
            return isNaN(date.getTime()) ? 'Data inv.' : date.toLocaleDateString('pt-BR');
        };

        historyList.innerHTML = displayOrders.slice(0, 50).map(o => {
            const date = formatDate(o.created_at || o.id);
            let itemsCount = 0;
            try {
                const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
                itemsCount = items.length;
            } catch (e) { }

            const isCancelled = (o.status || '').toLowerCase().includes('cancel');

            return `
            <div class="p-2.5 bg-white border ${isCancelled ? 'border-red-200 bg-red-50/50' : 'border-gray-100'} rounded-lg hover:shadow-sm transition-shadow">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-medium text-gray-800 text-sm flex items-center gap-1.5">
                            ${o.client_name || 'Cliente'}
                            ${isCancelled ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">Cancelado</span>' : ''}
                        </p>
                        <p class="text-xs text-gray-500 mt-0.5">${date} | ${itemsCount} ${itemsCount === 1 ? 'item' : 'itens'}${o.order_code ? ` | <span class="font-mono text-gray-600">${o.order_code}</span>` : ''}</p>
                    </div>
                    <span class="font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-green-600'} text-sm">R$ ${parseMoney(o.total).toFixed(2).replace('.', ',')}</span>
                </div>
            </div>
            `;
        }).join('');
    } else {
        historyList.innerHTML = `<div class="text-center py-8 text-gray-500"><p class="text-4xl mb-2">📦</p><p class="text-sm">${searchTerm ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum pedido no período.'}</p></div>`;
    }
}

function renderNeighborhoodChart(orders) {
    const container = document.getElementById('neighborhoodChartContainer') || document.getElementById('chartsContainer');
    if (!container) return;

    const stats = calculateNeighborhoodStats(orders);

    if (stats.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                <span class="text-2xl mb-2">🔄</span>
                <p class="text-sm">Nenhum pedido no período.</p>
            </div>
        `;
        return;
    }

    const maxCount = Math.max(...stats.map(s => s.count), 1);
    const topStats = stats.slice(0, 12);

    const html = `
        <div class="w-full space-y-3 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
            ${topStats.map((s, i) => {
                const percentage = Math.round((s.count / maxCount) * 100);
                
                let color = 'bg-rose-500';
                let labelPrefix = '';
                if (s.isPickup) {
                    color = 'bg-amber-500';
                    labelPrefix = '🛍️ ';
                } else {
                    const colors = ['bg-rose-500', 'bg-rose-400', 'bg-rose-300', 'bg-pink-400', 'bg-pink-300'];
                    const colorIdx = stats[0]?.isPickup ? (i - 1) : i;
                    color = colors[Math.min(Math.max(0, colorIdx), colors.length - 1)];
                }

                return `
                <div class="flex items-center gap-3 ${s.isPickup ? 'bg-amber-50/70 p-2 rounded-lg border border-amber-200' : ''}">
                    <div class="w-28 text-right text-sm font-medium text-gray-700 truncate ${s.isPickup ? 'font-bold text-amber-900' : 'capitalize'}" title="${s.name}">
                        ${labelPrefix}${s.name}
                    </div>
                    <div class="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                        <div class="${color} h-full rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
                        <span class="absolute inset-0 flex items-center justify-center text-xs font-bold ${percentage > 50 ? 'text-white' : 'text-gray-700'}">
                            ${s.count} ${s.count === 1 ? 'pedido' : 'pedidos'}
                        </span>
                    </div>
                    <div class="w-24 text-right text-xs text-green-600 font-bold">
                        R$ ${s.total.toFixed(2).replace('.', ',')}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;

    container.innerHTML = html;
}

function renderReportsData() {
    console.log('[Reports] Updating reports data...');
    if (typeof updatePeriodButtons === 'function') updatePeriodButtons();

    // Ensure orders exist
    const orders = window.orders || [];

    // Get orders filtered by current global period (Month, Semester, Year)
    const periodOrders = getOrdersInPeriod(currentReportPeriod);
    const validPeriodOrders = periodOrders.filter(isOrderValid);

    // 1. Period KPIs
    const totalSales = validPeriodOrders.reduce((sum, o) => sum + parseMoney(o.total), 0);
    const totalOrders = validPeriodOrders.length;
    const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

    if (document.getElementById('reportSalesMonth')) {
        document.getElementById('reportSalesMonth').textContent = `R$ ${totalSales.toFixed(2).replace('.', ',')}`;
    }
    if (document.getElementById('reportTicketAvg')) {
        document.getElementById('reportTicketAvg').textContent = `R$ ${avgTicket.toFixed(2).replace('.', ',')}`;
    }

    // 2. Today's KPIs
    const ordersToday = getOrdersInPeriod('today');
    const validOrdersToday = ordersToday.filter(isOrderValid);
    const salesToday = validOrdersToday.reduce((sum, o) => sum + parseMoney(o.total), 0);

    if (document.getElementById('reportSalesToday')) {
        document.getElementById('reportSalesToday').textContent = `R$ ${salesToday.toFixed(2).replace('.', ',')}`;
    }
    if (document.getElementById('reportOrdersToday')) {
        document.getElementById('reportOrdersToday').textContent = validOrdersToday.length;
    }

    // 3. Top Products (based on current general period)
    const topProductsList = document.getElementById('topProductsList');
    if (topProductsList) {
        const topProducts = calculateTopProducts(periodOrders);
        if (topProducts.length > 0) {
            topProductsList.innerHTML = topProducts.map((p, i) => `
            <div class="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-100 shadow-sm">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold w-6 h-6 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">${i + 1}</span>
                    <span class="text-sm font-medium text-gray-800 truncate max-w-[140px]" title="${p.name}">${p.name}</span>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold text-gray-800">${p.quantity} un.</p>
                    <p class="text-[10px] text-green-600 font-semibold">R$ ${p.revenue.toFixed(2).replace('.', ',')}</p>
                </div>
            </div>
            `).join('');
        } else {
            topProductsList.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm col-span-full">Sem dados no período</div>';
        }
    }

    // 4. Order History (respects search input)
    renderOrderHistoryList(periodOrders);

    // 5. Update Client Ranking & Neighborhood Chart using their dedicated filters
    if (typeof window.updateClientRanking === 'function') {
        window.updateClientRanking();
    }
    if (typeof window.updateNeighborhoodChart === 'function') {
        window.updateNeighborhoodChart();
    }
}

// ========================================
// FILTER HELPERS
// ========================================

const MONTH_MAP = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function filterOrdersByYearAndPeriod(orders, year, period) {
    return (orders || []).filter(o => {
        const d = safeDate(o.created_at || o.id);
        if (isNaN(d.getTime())) return false;

        if (year !== 'all' && d.getFullYear() !== parseInt(year, 10)) return false;

        if (period === 'all') return true;
        if (period === '1') return d.getMonth() < 6; // 1º Semestre (Jan-Jun)
        if (period === '2') return d.getMonth() >= 6; // 2º Semestre (Jul-Dez)
        if (MONTH_MAP[period] !== undefined) return d.getMonth() === MONTH_MAP[period];
        return true;
    });
}

// ========================================
// CLIENT RANKING WITH FILTERS
// ========================================

window.updateClientRanking = function () {
    const yearSelect = document.getElementById('rankingFilterYear');
    const periodSelect = document.getElementById('rankingFilterPeriod');
    const rankingList = document.getElementById('clientRankingList');

    if (!rankingList) return;

    const year = yearSelect?.value || new Date().getFullYear().toString();
    const period = periodSelect?.value || 'all';

    const orders = window.orders || [];
    const filteredOrders = filterOrdersByYearAndPeriod(orders, year, period);
    const ranking = calculateClientRanking(filteredOrders);

    if (ranking.length > 0) {
        rankingList.innerHTML = ranking.map((c, i) => `
        <div class="flex items-center justify-between p-2.5 ${i < 3 ? 'bg-amber-50/70 border border-amber-200/80 shadow-sm' : 'bg-white border border-gray-100'} rounded-lg">
            <div class="flex items-center gap-3">
                <span class="text-base font-extrabold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-500'}">${i + 1}º</span>
                <div>
                    <p class="font-semibold text-gray-800 text-sm">${c.name}</p>
                    <p class="text-xs text-gray-500">${c.orderCount} ${c.orderCount === 1 ? 'pedido' : 'pedidos'}</p>
                </div>
            </div>
            <span class="font-bold text-green-600 text-sm">R$ ${c.total.toFixed(2).replace('.', ',')}</span>
        </div>
        `).join('');
    } else {
        rankingList.innerHTML = `<div class="text-center py-8 text-gray-500"><p class="text-4xl mb-2">🔄</p><p class="text-sm">Nenhum pedido no período selecionado.</p></div>`;
    }
};

// ========================================
// NEIGHBORHOOD CHART WITH FILTERS
// ========================================

window.updateNeighborhoodChart = function () {
    const yearSelect = document.getElementById('neighborhoodFilterYear');
    const periodSelect = document.getElementById('neighborhoodFilterPeriod');

    const year = yearSelect?.value || new Date().getFullYear().toString();
    const period = periodSelect?.value || 'all';

    const orders = window.orders || [];
    const filteredOrders = filterOrdersByYearAndPeriod(orders, year, period);

    renderNeighborhoodChart(filteredOrders);
};

// Add event listeners for filters & search
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('rankingFilterYear')?.addEventListener('change', window.updateClientRanking);
    document.getElementById('rankingFilterPeriod')?.addEventListener('change', window.updateClientRanking);
    document.getElementById('neighborhoodFilterYear')?.addEventListener('change', window.updateNeighborhoodChart);
    document.getElementById('neighborhoodFilterPeriod')?.addEventListener('change', window.updateNeighborhoodChart);
    document.getElementById('orderSearchClient')?.addEventListener('input', function () {
        const periodOrders = getOrdersInPeriod(currentReportPeriod);
        renderOrderHistoryList(periodOrders);
    });
});

// Expose globals
window.renderReportsData = renderReportsData;
window.currentReportPeriod = currentReportPeriod;
window.setReportPeriod = function (p) {
    currentReportPeriod = p;
    renderReportsData();
};
window.renderNeighborhoodChart = renderNeighborhoodChart;
window.filterOrdersByYearAndPeriod = filterOrdersByYearAndPeriod;
window.calculateTopProducts = calculateTopProducts;
window.calculateNeighborhoodStats = calculateNeighborhoodStats;
window.calculateClientRanking = calculateClientRanking;
