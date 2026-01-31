/**
 * Fast Savory's - Ratings Module
 * Gerencia o sistema de avaliações (depoimentos)
 */

window.RatingsModule = {

    currentOrderId: null,
    currentPhone: null,

    // ========================================
    // LOGIC
    // ========================================

    submit: async function (data) {
        // data: { orderCode, phone, clientName, rating, comment }
        if (!data.phone || !data.rating) return { success: false, error: 'Dados incompletos' };

        const phoneDigits = data.phone.replace(/\D/g, '');

        try {
            // 1. Check if already rated (Idempotency)
            // Querying fast_ratings by order_code is tricky if order_code is not stored there directly?
            // fast_ratings columns: id, client_name, client_phone, rating, comment, order_id (maybe?), approved, archived, created_at

            // Let's assume we insert new rating.
            // If we have orderId from context
            const payload = {
                client_name: data.clientName,
                client_phone: phoneDigits,
                rating: data.rating,
                comment: data.comment,
                created_at: new Date().toISOString(),
                approved: false // Pending approval
            };

            // If we have order_id available (stored in currentOrderId), add it
            if (this.currentOrderId) {
                payload.order_id = this.currentOrderId;
            }

            const { data: saved, error } = await window.supabaseClient
                .from('fast_ratings')
                .insert([payload])
                .select()
                .single();

            if (error) throw error;

            // UPDATE ORDER RATING STATUS
            // If we have currentOrderId (real ID) or we need to find it by code
            if (this.currentOrderId) {
                await window.supabaseClient
                    .from('fast_orders')
                    .update({
                        rating: data.rating,
                        rating_comment: data.comment
                    })
                    .eq('id', this.currentOrderId);
            }

            return { success: true, data: saved };

        } catch (e) {
            console.error('[Ratings] Submission error:', e);
            return { success: false, error: e.message };
        }
    },

    loadOrderHelper: async function (orderCode, phone) {
        if (!orderCode || !phone) return null;
        const code = String(orderCode).toUpperCase().trim();
        const p = phone.replace(/\D/g, '');

        try {
            const { data, error } = await window.supabaseClient
                .from('fast_orders')
                .select('*')
                .eq('client_phone', p)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            // Find Match
            const found = (data || []).find(o =>
                o.order_code === code ||
                (window.formatOrderCode && window.formatOrderCode(o.order_sequence || o.id) === code)
            );

            return found || null;
        } catch (e) {
            console.warn('[Ratings] Load order error:', e);
            return null;
        }
    },

    // ========================================
    // UI HANDLERS
    // ========================================

    openModal: async function (orderCode, phone) {
        const modal = document.getElementById('ratingModal');
        if (!modal) return;

        // Reset State
        this.resetForm();
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Set Message "Searching..."
        this.setFeedback('Buscando pedido...', 'info');

        // Fetch Order
        const order = await this.loadOrderHelper(orderCode, phone);

        if (!order) {
            this.setFeedback('Pedido não encontrado. Verifique o link ou se o pedido existe.', 'error');
            return;
        }

        this.currentOrderId = order.id;
        this.currentPhone = phone;

        // Populate Modal
        document.getElementById('ratingOrderCode').textContent = order.order_code || (window.formatOrderCode ? window.formatOrderCode(order.order_sequence || order.id) : orderCode);
        document.getElementById('ratingClientName').value = order.client_name || '';

        // Check if already rated (in order data)
        if (order.rating > 0) {
            // Show "Already Rated" view
            this.showAlreadyRated(order.rating, order.rating_comment);
        } else {
            this.setFeedback('', 'neutral'); // Clear loading
        }
    },

    closeModal: function () {
        document.getElementById('ratingModal')?.classList.add('hidden');
        document.body.style.overflow = '';

        // Clear URL params (clean URL)
        const url = new URL(window.location);
        url.searchParams.delete('rate');
        url.searchParams.delete('phone');
        window.history.replaceState({}, '', url);
    },

    submitForm: async function () {
        // Collect Data
        const rating = parseInt(document.getElementById('ratingValue').value || 0);
        const comment = document.getElementById('ratingComment').value.trim();
        const name = document.getElementById('ratingClientName').value.trim();

        if (rating < 1 || comment.length < 10) {
            alert('Por favor, dê uma nota e escreva um comentário com pelo menos 10 caracteres.');
            return;
        }

        const btn = document.getElementById('submitRatingBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

        const result = await this.submit({
            orderCode: document.getElementById('ratingOrderCode').textContent,
            phone: this.currentPhone,
            clientName: name,
            rating: rating,
            comment: comment
        });

        if (result.success) {
            document.getElementById('ratingForm').classList.add('hidden');
            document.getElementById('ratingThankYou').classList.remove('hidden');
        } else {
            this.setFeedback('Erro ao enviar avaliação. Tente novamente.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Enviar Avaliação'; }
        }
    },

    // Helpers
    resetForm: function () {
        document.getElementById('ratingForm').classList.remove('hidden');
        document.getElementById('ratingThankYou').classList.add('hidden');
        document.getElementById('ratingAlreadyDone').classList.add('hidden');
        document.getElementById('ratingValue').value = '0';
        document.getElementById('ratingComment').value = '';
        document.getElementById('ratingCharCount').textContent = '0';
        this.updateStars(0);
        this.currentOrderId = null;
        this.currentPhone = null;
        const btn = document.getElementById('submitRatingBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviar Avaliação'; }
    },

    showAlreadyRated: function (rating, comment) {
        document.getElementById('ratingForm').classList.add('hidden');
        const doneDiv = document.getElementById('ratingAlreadyDone');
        doneDiv.classList.remove('hidden');

        // Populate existing (needs HTML structure support)
        // Assuming simple text display
        const display = doneDiv.querySelector('.existing-rating-display');
        if (display) {
            display.textContent = `Nota: ${rating} | "${comment || ''}"`;
        }
    },

    setFeedback: function (text, type) {
        const box = document.getElementById('ratingMessage');
        if (!box) return;

        if (!text) {
            box.classList.add('hidden');
            return;
        }

        box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
        box.textContent = text;

        if (type === 'error') box.classList.add('bg-red-100', 'text-red-700');
        else if (type === 'success') box.classList.add('bg-green-100', 'text-green-700');
        else box.classList.add('bg-blue-100', 'text-blue-700');
    },

    updateStars: function (count) {
        document.querySelectorAll('#starRating .star-btn').forEach((btn, index) => {
            if (index < count) {
                btn.classList.add('text-yellow-400');
                btn.classList.remove('text-gray-300');
            } else {
                btn.classList.add('text-gray-300');
                btn.classList.remove('text-yellow-400');
            }
        });
    },

    validate: function () {
        const rating = parseInt(document.getElementById('ratingValue').value || 0);
        const comment = document.getElementById('ratingComment').value.trim();
        const name = document.getElementById('ratingClientName').value.trim();
        const btn = document.getElementById('submitRatingBtn');

        if (btn) {
            btn.disabled = !(rating >= 1 && comment.length >= 10 && name.length > 2);
        }
    },

    // Compatibility with services.js global aliases
    initPublicRatings: function () {
        // Public ratings are handled by loadTestimonials in fast.html
        // This is a no-op for compatibility
        console.log('[RatingsModule] initPublicRatings called (no-op)');
    },

    initAdminPanel: async function () {
        // Admin panel initialization - can be extended
        console.log('[RatingsModule] initAdminPanel - not implemented in public module');
    }
};

// Global Expose
window.openRatingModal = (code, phone) => window.RatingsModule.openModal(code, phone);
window.closeRatingModal = () => window.RatingsModule.closeModal();
window.submitRating = () => window.RatingsModule.submitForm(); // OLD NAME MAPPED
window.updateStarDisplay = (n) => window.RatingsModule.updateStars(n); // For onclick in HTML

// Event Listeners (Run on script load)
document.addEventListener('DOMContentLoaded', () => {
    // Stars
    document.querySelectorAll('#starRating .star-btn').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            const r = i + 1;
            document.getElementById('ratingValue').value = r;
            window.RatingsModule.updateStars(r);
            window.RatingsModule.validate();
        });
    });

    // Inputs
    document.getElementById('ratingComment')?.addEventListener('input', (e) => {
        document.getElementById('ratingCharCount').textContent = e.target.value.length;
        window.RatingsModule.validate();
    });

    document.getElementById('ratingClientName')?.addEventListener('input', () => window.RatingsModule.validate());

    // Check URL
    setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const rateCode = params.get('rate');
        const phone = params.get('phone');
        if (rateCode && phone) {
            window.RatingsModule.openModal(rateCode, phone);
        }
    }, 1200);
});
