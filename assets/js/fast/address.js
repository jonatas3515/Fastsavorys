/**
 * Fast Savory's - Address Module
 * Handles neighborhood normalization, delivery aliases, and address management.
 */

// ========================================
// NEIGHBORHOOD NORMALIZATION
// ========================================
window.normalizeNeighborhood = function (name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[^a-z0-9 ]/g, '')
        .trim();
};

// Aliases de bairro (mapeamento para cálculo de taxa)
window.deliveryAliases = {};

window.getCanonicalNeighborhood = function (name) {
    const normalized = window.normalizeNeighborhood(name);
    for (const [canonical, aliases] of Object.entries(window.deliveryAliases)) {
        if (aliases.some(alias => window.normalizeNeighborhood(alias) === normalized)) {
            return canonical;
        }
    }
    return name; // retorna original se não encontrar alias
};

// Telefone atual do cliente (para favoritos/histórico) - Moved from global scope
// We can use a getter/setter or just leave it as is if it's used globally
// window.currentClientPhone = localStorage.getItem('fastLastPhone') || ''; 
// Better to manage this in CustomerModule or a StateService.

// ========================================
// ADDRESS SERVICE
// ========================================
window.AddressService = {
    load: function (phone) {
        if (!phone) return [];
        const phoneDigits = phone.replace(/\D/g, '');

        // Try to find client in global clients list first
        const client = (window.clients || []).find(c => {
            const cPhone = (c.phone || '').replace(/\D/g, '');
            return cPhone === phoneDigits;
        });

        if (client && client.addresses) {
            return client.addresses;
        }

        // Fallback or explicit check?
        // In the original code, it seemed to rely on `clients` global.
        return [];
    },

    save: function (phone, address) {
        // This functionality is largely handled by saveClients() and CustomerModule
        // But we can add specific logic here if needed.
    }
};

// Expose helper for UI
window.renderSavedAddresses = function (phone) {
    const select = document.getElementById('savedAddressSelect');
    if (!select) return;

    // Use AddressService to get addresses
    const addresses = window.AddressService.load(phone);

    select.innerHTML = '<option value="">Selecione um endereço...</option>';

    if (addresses.length === 0) {
        document.getElementById('savedAddressSection')?.classList.add('hidden');
        document.getElementById('noAddressSection')?.classList.remove('hidden');
        return;
    }

    addresses.forEach((addr, idx) => {
        const label = addr.label || 'Endereço';
        const text = `${label} – ${addr.street}, ${addr.number} – ${addr.neighborhood}`;
        const opt = document.createElement('option');
        opt.value = idx.toString();
        opt.textContent = text;
        select.appendChild(opt);
    });

    document.getElementById('savedAddressSection')?.classList.remove('hidden');
    document.getElementById('noAddressSection')?.classList.add('hidden');
};

window.fillAddressFromSaved = function (phone, index) {
    const addresses = window.AddressService.load(phone);
    const addr = addresses[index];
    if (!addr) return;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    setVal('street', addr.street);
    setVal('number', addr.number);
    setVal('neighborhood', addr.neighborhood);
    setVal('reference', addr.reference);

    if (addr.label) {
        const labelSelect = document.getElementById('addressLabel');
        if (labelSelect) labelSelect.value = addr.label;
    }
};
