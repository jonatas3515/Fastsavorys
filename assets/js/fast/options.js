/**
 * Fast Savory's - Product Options Module (Public)
 * Handles loading and retrieving product options (flavors, fillings, etc.)
 * Read-Only version for Public Store.
 */

window.ProductOptionsModule = {
    options: {
        cakeMass: [],
        filling: [],
        salgados: [],
        miniSalgadosFlavors: [],
        comboSalgados: []
    },
    loaded: false,
    defaults: {
        cakeMass: [
            { name: 'Massa Branca', visible: true, sort_order: 1 },
            { name: 'Massa de Chocolate', visible: true, sort_order: 2 }
        ],
        filling: [
            { name: 'Ninho', visible: true, sort_order: 1 },
            { name: 'Beijinho', visible: true, sort_order: 2 },
            { name: 'Chocolate', visible: true, sort_order: 3 },
            { name: 'Chocolate com Côco', visible: true, sort_order: 4 },
            { name: 'Ninho com Côco', visible: true, sort_order: 5 },
            { name: 'Ninho com Chocolate', visible: true, sort_order: 6 }
        ],
        salgados: [
            { name: 'Coxinha', visible: true, sort_order: 1 },
            { name: 'Bolinha de Carne', visible: true, sort_order: 2 },
            { name: 'Cazulo de Presunto e Queijo', visible: true, sort_order: 3 },
            { name: 'Quibe', visible: true, sort_order: 4 },
            { name: 'Bolinha de Queijo', visible: true, sort_order: 5 },
            { name: 'Enroladinho de Salsicha', visible: true, sort_order: 6 }
        ],
        miniSalgadosFlavors: [
            { name: 'Coxinha', visible: true, sort_order: 1 },
            { name: 'Enroladinho', visible: true, sort_order: 2 },
            { name: 'Quibe', visible: true, sort_order: 3 },
            { name: 'Bolinha de Carne', visible: true, sort_order: 4 },
            { name: 'Bolinha de Queijo', visible: true, sort_order: 5 },
            { name: 'Risole de Carne', visible: true, sort_order: 6 },
            { name: 'Risole de Queijo', visible: true, sort_order: 7 },
            { name: 'Rissole de Queijo e Presunto', visible: true, sort_order: 8 }
        ],
        comboSalgados: [
            { name: 'Coxinha', visible: true, sort_order: 1 },
            { name: 'Enroladinho', visible: true, sort_order: 2 },
            { name: 'Rissole de Queijo e Presunto', visible: true, sort_order: 3 },
            { name: 'Rissole de Carne', visible: true, sort_order: 4 }
        ]
    },

    load: async function () {
        try {
            console.log('[ProductOptions] Carregando opções do Supabase...');
            const { data, error } = await window.supabaseClient
                .from('fast_product_options')
                .select('*')
                .order('sort_order', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                this.options = { cakeMass: [], filling: [], salgados: [], miniSalgadosFlavors: [], comboSalgados: [] };
                data.forEach(opt => {
                    if (this.options[opt.type]) {
                        this.options[opt.type].push(opt);
                    }
                });
                // Always load comboSalgados from defaults (not stored in DB)
                this.options.comboSalgados = JSON.parse(JSON.stringify(this.defaults.comboSalgados));
                this.options.comboSalgados.forEach((o, i) => o.id = -(i + 400));
                console.log('[ProductOptions] Opções carregadas:', Object.keys(this.options).map(k => `${k}: ${this.options[k].length}`).join(', '));
            } else {
                console.log('[ProductOptions] Tabela vazia, usando padrões...');
                this.options = JSON.parse(JSON.stringify(this.defaults));
                // Add fake IDs for defaults to avoid errors
                this.options.cakeMass.forEach((o, i) => o.id = -(i + 1));
                this.options.filling.forEach((o, i) => o.id = -(i + 100));
                this.options.salgados.forEach((o, i) => o.id = -(i + 200));
                this.options.miniSalgadosFlavors.forEach((o, i) => o.id = -(i + 300));
                this.options.comboSalgados.forEach((o, i) => o.id = -(i + 400));
            }
            localStorage.setItem('fastProductOptions', JSON.stringify(this.options));
            this.loaded = true;
            return this.options;
        } catch (e) {
            console.warn('[ProductOptions] Erro ao carregar do Supabase, usando cache local:', e);
            const cached = localStorage.getItem('fastProductOptions');
            if (cached) {
                this.options = JSON.parse(cached);
            } else {
                this.options = JSON.parse(JSON.stringify(this.defaults));
                this.options.cakeMass.forEach((o, i) => o.id = -(i + 1));
                this.options.filling.forEach((o, i) => o.id = -(i + 100));
                this.options.salgados.forEach((o, i) => o.id = -(i + 200));
                this.options.miniSalgadosFlavors.forEach((o, i) => o.id = -(i + 300));
                this.options.comboSalgados.forEach((o, i) => o.id = -(i + 400));
            }
            this.loaded = true;
            return this.options;
        }
    },

    getVisible: function (type) {
        return (this.options[type] || []).filter(o => o.visible);
    },

    getAll: function (type) {
        return this.options[type] || [];
    }
};
