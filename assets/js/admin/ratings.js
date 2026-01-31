/**
 * RATINGS MODULE - Fast Savory's Admin
 * Manages customer ratings and testimonials
 */

const RatingsModule = {
    // Cache
    ratings: [],
    filter: 'all', // all, pending, published, archived

    // Init
    initAdminPanel: async function () {
        console.log('[Ratings] Inicializando painel de avaliações...');
        this.renderFilterButtons();
        await this.loadRatings();
    },

    setFilter: function (filter) {
        this.filter = filter;
        this.renderFilterButtons(); // Update active state
        this.renderRatings();
    },

    renderFilterButtons: function () {
        // Get or create toolbar INSIDE the ratings panel only
        let toolbar = document.getElementById('ratingsToolbar');

        // Only create if we're in the ratings panel context
        const ratingsPanel = document.getElementById('ratingsPanelFast');
        if (!ratingsPanel) return; // Don't create toolbar if panel doesn't exist

        if (!toolbar) {
            // Find the header in the ratings panel to insert after
            const header = ratingsPanel.querySelector('h2');
            if (header) {
                toolbar = document.createElement('div');
                toolbar.id = 'ratingsToolbar';
                toolbar.className = 'flex gap-2 mb-4';
                // Insert after the header, within the ratings panel
                header.insertAdjacentElement('afterend', toolbar);
            }
        }

        if (toolbar) {
            const filters = [
                { id: 'all', label: 'Todas', icon: '' },
                { id: 'pending', label: 'Pendentes', icon: '⏳' },
                { id: 'published', label: 'Publicadas', icon: '✅' },
                { id: 'archived', label: 'Arquivadas', icon: '📦' }
            ];

            toolbar.innerHTML = filters.map(f => {
                const active = this.filter === f.id;
                const baseClass = "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1";
                const activeClass = "bg-rose-600 text-white border-rose-600";
                const inactiveClass = "bg-white text-gray-600 border-gray-200 hover:bg-gray-50";
                return `<button onclick="RatingsModule.setFilter('${f.id}')" class="${baseClass} ${active ? activeClass : inactiveClass}">
                    ${f.icon} ${f.label}
                 </button>`;
            }).join('');
        }
    },

    // Load Ratings
    loadRatings: async function () {
        const listBody = document.getElementById('ratingsList');
        if (!listBody) return;

        listBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">Carregando avaliações...</td></tr>';

        try {
            const { data, error } = await window.supabaseClient
                .from('fast_ratings')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.ratings = data || [];
            this.renderRatings();

        } catch (e) {
            console.error('[Ratings] Erro ao carregar:', e);
            listBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-500">Erro ao carregar avaliações.</td></tr>';
        }
    },

    // Render Ratings
    renderRatings: function () {
        const listBody = document.getElementById('ratingsList');
        if (!listBody) return;

        let filtered = this.ratings;
        if (this.filter === 'pending') {
            filtered = this.ratings.filter(r => !r.approved && r.approved !== true); // Null or false
        } else if (this.filter === 'published') {
            filtered = this.ratings.filter(r => r.approved === true);
        } else if (this.filter === 'archived') {
            // Check if archived column exists in data, otherwise assume none
            // Use 'archived' property if it exists
            filtered = this.ratings.filter(r => r.archived === true);
        } else {
            // All: Exclude archived usually? Or show all?
            // Usually 'All' shows everything except archived? Or everything?
            // Let's show everything for now.
            filtered = this.ratings.filter(r => r.archived !== true);
        }

        if (filtered.length === 0) {
            listBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">Nenhuma avaliação encontrada.</td></tr>';
            return;
        }

        listBody.innerHTML = filtered.map(r => {
            const date = new Date(r.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const stars = '⭐'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
            const statusBadge = r.approved
                ? '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Publicado</span>'
                : '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Pendente</span>';

            return `
            <tr class="hover:bg-gray-50 border-b last:border-0 transition-colors">
                <td class="p-4 text-sm text-gray-600">${date}</td>
                <td class="p-4">
                    <div class="font-medium text-gray-800">${r.client_name || 'Cliente'}</div>
                    <div class="text-xs text-gray-500">${r.phone || '-'}</div>
                    <div class="text-[10px] text-gray-400 font-mono mt-1">Ref: ${r.order_code || '-'}</div>
                </td>
                <td class="p-4 text-yellow-500 text-sm tracking-wide" title="${r.rating} estrelas">${stars}</td>
                <td class="p-4 text-sm text-gray-700 italic max-w-xs truncate" title="${r.comment || ''}">
                    ${r.comment ? `"${r.comment}"` : '<span class="text-gray-400">- Sem comentário -</span>'}
                </td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-right space-x-2">
                    <button onclick="RatingsModule.toggleApproval(${r.id}, ${!r.approved})" 
                        class="p-1 rounded hover:bg-gray-100 transition-colors ${r.approved ? 'text-orange-500' : 'text-green-600'}" 
                        title="${r.approved ? 'Ocultar do site' : 'Aprovar para o site'}">
                        ${r.approved ? '👁️‍🗨️' : '✅'}
                    </button>
                    <button onclick="RatingsModule.deleteRating(${r.id})" 
                        class="p-1 rounded hover:bg-gray-100 text-red-500 hover:text-red-700 transition-colors" 
                        title="Excluir avaliação">
                        🗑️
                    </button>
                </td>
            </tr>
            `;
        }).join('');
    },


    // Actions
    toggleApproval: async function (id, newStatus) {
        try {
            const { error } = await window.supabaseClient
                .from('fast_ratings')
                .update({ approved: newStatus })
                .eq('id', id);

            if (error) throw error;

            showToast(newStatus ? 'Avaliação aprovada!' : 'Avaliação ocultada.');
            await this.loadRatings(); // Reload to refresh list

        } catch (e) {
            console.error('[Ratings] Erro ao atualizar status:', e);
            showToast('Erro ao atualizar status.', 'error');
        }
    },

    deleteRating: async function (id) {
        if (!confirm('Tem certeza que deseja excluir esta avaliação?')) return;

        try {
            const { error } = await window.supabaseClient
                .from('fast_ratings')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Avaliação excluída.');
            await this.loadRatings();

        } catch (e) {
            console.error('[Ratings] Erro ao excluir:', e);
            showToast('Erro ao excluir avaliação.', 'error');
        }
    }
};

// Global Export
window.RatingsModule = RatingsModule;
