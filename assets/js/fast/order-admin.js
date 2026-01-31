/**
 * Fast Savory's - Order Admin Module
 * Handles order management functions (delete, filter, etc.)
 */

// Variáveis para modal de exclusão de pedidos
let pendingOrderCodesToDelete = [];

// Excluir pedidos por código (FAST-0001, etc) - abre modal de confirmação
window.deleteOrdersByCodes = function () {
    const orderCodesToDeleteInput = document.getElementById('orderCodesToDelete');
    const deleteOrdersResult = document.getElementById('deleteOrdersResult');

    if (!orderCodesToDeleteInput || !deleteOrdersResult) return;

    const inputValue = orderCodesToDeleteInput.value.trim();

    if (!inputValue) {
        deleteOrdersResult.textContent = '⚠️ Digite ao menos um código de pedido.';
        deleteOrdersResult.style.color = '#856404';
        return;
    }

    // Extrai os códigos (separa por vírgula, remove espaços e filtra vazios)
    const codes = inputValue.split(',').map(c => c.trim().toUpperCase()).filter(c => c);

    if (codes.length === 0) {
        deleteOrdersResult.textContent = '⚠️ Nenhum código válido encontrado.';
        deleteOrdersResult.style.color = '#856404';
        return;
    }

    // Armazena códigos e abre modal de confirmação
    pendingOrderCodesToDelete = codes;
    const deleteOrdersModal = document.getElementById('deleteOrdersModal');
    const deleteOrdersModalText = document.getElementById('deleteOrdersModalText');

    deleteOrdersModalText.textContent = `Tem certeza que deseja excluir ${codes.length} pedido(s)?\n\n${codes.join(', ')}`;
    deleteOrdersModal.classList.remove('hidden');
};

// Executa exclusão de pedidos após confirmação no modal
window.executeDeleteOrders = async function () {
    const orderCodesToDeleteInput = document.getElementById('orderCodesToDelete');
    const deleteOrdersResult = document.getElementById('deleteOrdersResult');
    const deleteOrdersModal = document.getElementById('deleteOrdersModal');

    deleteOrdersModal.classList.add('hidden');

    const codes = pendingOrderCodesToDelete;
    if (codes.length === 0) return;

    try {
        deleteOrdersResult.textContent = '⏳ Excluindo...';
        deleteOrdersResult.style.color = '#007bff';

        // Busca todos os pedidos
        const { data: allOrders, error } = await window.supabaseClient
            .from('fast_orders')
            .select('*');

        if (error) throw error;

        // Filtra os pedidos cujo código formatado está na lista
        const ordersToDelete = (allOrders || []).filter(order => {
            const orderCode = order.order_code || (window.formatOrderCode ? window.formatOrderCode(order.order_sequence || order.id) : `FAST-${String(order.order_sequence || order.id).padStart(4, '0')}`);
            return codes.includes(orderCode);
        });

        if (ordersToDelete.length === 0) {
            deleteOrdersResult.textContent = `⚠️ Nenhum pedido encontrado com os códigos informados.`;
            deleteOrdersResult.style.color = '#856404';
            pendingOrderCodesToDelete = [];
            return;
        }

        // Exclui os pedidos encontrados
        const idsToDelete = ordersToDelete.map(o => o.id);

        // First delete related logs (to avoid FK constraint violation)
        await window.supabaseClient
            .from('fast_order_logs')
            .delete()
            .in('order_id', idsToDelete);

        // Then delete orders
        const { error: deleteError } = await window.supabaseClient
            .from('fast_orders')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) throw deleteError;

        deleteOrdersResult.textContent = `✅ ${ordersToDelete.length} pedido(s) excluído(s) com sucesso!`;
        deleteOrdersResult.style.color = '#28a745';

        // Limpa o input e recarrega os pedidos
        orderCodesToDeleteInput.value = '';
        pendingOrderCodesToDelete = [];

        // Limpa cache local
        try { localStorage.removeItem('fastOrders'); } catch (e) { }

        // Recarrega listas
        if (typeof loadOrders === 'function') await loadOrders().catch(function () { });
        if (typeof renderReportsData === 'function') try { renderReportsData(); } catch (e) { }
        if (typeof loadDashboardOrders === 'function') try { loadDashboardOrders(); } catch (e) { }

    } catch (error) {
        console.error('Erro ao excluir pedidos:', error);
        deleteOrdersResult.textContent = `❌ Erro: ${error.message}`;
        deleteOrdersResult.style.color = '#dc3545';
        pendingOrderCodesToDelete = [];
    }
};

// Initialize event listeners when DOM is ready
function initOrderAdminListeners() {
    // Modal cancel button
    document.getElementById('cancelDeleteOrdersModalBtn')?.addEventListener('click', () => {
        document.getElementById('deleteOrdersModal').classList.add('hidden');
        const deleteOrdersResult = document.getElementById('deleteOrdersResult');
        if (deleteOrdersResult) {
            deleteOrdersResult.textContent = '❌ Exclusão cancelada.';
            deleteOrdersResult.style.color = '#dc3545';
        }
        pendingOrderCodesToDelete = [];
    });

    // Modal confirm button
    document.getElementById('confirmDeleteOrdersModalBtn')?.addEventListener('click', window.executeDeleteOrders);

    // Close modal on backdrop click
    document.getElementById('deleteOrdersModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'deleteOrdersModal') {
            e.target.classList.add('hidden');
            pendingOrderCodesToDelete = [];
        }
    });

    // Delete button
    document.getElementById('confirmDeleteOrdersBtn')?.addEventListener('click', window.deleteOrdersByCodes);

    // Order filters
    document.getElementById('ordersFilterDate')?.addEventListener('change', () => {
        if (typeof loadDashboardOrders === 'function') loadDashboardOrders();
    });
    document.getElementById('ordersFilterStatus')?.addEventListener('change', () => {
        if (typeof loadDashboardOrders === 'function') loadDashboardOrders();
    });
    document.getElementById('refreshOrders')?.addEventListener('click', () => {
        if (typeof loadDashboardOrders === 'function') loadDashboardOrders();
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderAdminListeners);
} else {
    initOrderAdminListeners();
}

console.log('[OrderAdmin] Module loaded');
