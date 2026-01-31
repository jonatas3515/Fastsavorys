
// ===========================================
// REPORT HELPER FUNCTIONS (Restored & Overrides)
// ===========================================

function updateReportPeriod(period) {
    if (['month', 'semester', 'year'].includes(period)) {
        currentReportPeriod = period;
        updatePeriodButtons();
        renderReportsData();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Admin] Inicializando dashboard...');

    // Attach Report Period Listeners
    const periodMonth = document.getElementById('reportPeriodMonth');
    const periodSemester = document.getElementById('reportPeriodSemester');
    const periodYear = document.getElementById('reportPeriodYear');

    if (periodMonth) periodMonth.onclick = () => updateReportPeriod('month');
    if (periodSemester) periodSemester.onclick = () => updateReportPeriod('semester');
    if (periodYear) periodYear.onclick = () => updateReportPeriod('year');

    // Wait for Supabase to be ready (if using global instance that might load async)
    let attempts = 0;
    while (!window.supabaseClient && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    if (window.supabaseClient) {
        // Initial Data Load
        // 'today' is the default view for the operational dashboard, 
        // but loadDashboardOrders now fetches ALL data for reports in the background.
        loadDashboardOrders('today');
    } else {
        console.error('Supabase client not found after waiting.');
        showToast('Erro ao conectar com o banco de dados.', 'error');
    }
});
