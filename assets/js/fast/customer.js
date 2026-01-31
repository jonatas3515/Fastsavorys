/**
 * Fast Savory's - Customer Module
 * Handles client search, address management, and terms acceptance.
 */

window.CustomerModule = {

    currentClient: null,

    // ===================================
    // INITIALIZATION
    // ===================================
    init: function () {
        // Phone Input Listener (Mask + Search)
        const phoneInput = document.getElementById('customerPhone');
        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                this.handlePhoneInput(e);
            });
            // Also trigger search if value already exists (e.g., from cache)
            if (phoneInput.value) {
                this.searchClient(null, phoneInput.value);
            }
        }

        // Name Input Listener (Auto-Capitalize)
        const nameInput = document.getElementById('customerName');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                const words = e.target.value.toLowerCase().split(' ');
                for (let i = 0; i < words.length; i++) {
                    words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
                }
                // Only update if actually changed to avoid cursor jumping
                const newValue = words.join(' ');
                if (newValue !== e.target.value) {
                    // Simple capitalization can be annoying while typing, 
                    // maybe just let CSS handle it or do it on blur?
                    // Leaving as is for now to match original behavior if any, 
                    // or just trust user.
                    // The original didn't seem to enforce this strictly on input.
                }
            });
            // Search by name is less reliable, usually we rely on phone.
        }
    },

    // ===================================
    // CLIENT SEARCH
    // ===================================
    handlePhoneInput: function (e) {
        if (!window.formatPhoneMask) return;

        const cursorPos = e.target.selectionStart;
        const oldValue = e.target.value;
        const newValue = window.formatPhoneMask(oldValue);

        if (newValue !== oldValue) {
            e.target.value = newValue;
            const diff = newValue.length - oldValue.length;
            const newCursorPos = Math.max(0, cursorPos + diff);
            e.target.setSelectionRange(newCursorPos, newCursorPos);
        }

        const phone = e.target.value.replace(/\D/g, '');
        if (phone.length === 11) {
            this.searchClient(null, phone);
        } else {
            // Reset if phone is incomplete
            this.resetClientState();
        }
    },

    searchClient: function (name, phone) {
        // Normaliza telefone: mantém apenas dígitos
        const normalizedPhone = (phone || '').replace(/\D/g, '');

        // Sem telefone válido (11 dígitos), não há busca automática
        if (normalizedPhone.length !== 11) {
            return null;
        }

        // Busca primeiro no cache local (window.clients)
        const cachedClient = window.clients.find(c => c.phone === normalizedPhone);

        if (cachedClient) {
            this.fillClientData(cachedClient);
            return cachedClient;
        }

        // Se não encontrou no cache, busca via API segura
        this.searchClientFromAPI(normalizedPhone);
        return null; // Retorna null agora, será preenchido async
    },

    searchClientFromAPI: async function (normalizedPhone) {
        try {
            const response = await fetch(`/api/client-profile?phone=${normalizedPhone}`);
            const result = await response.json();

            if (result.success && result.found && result.client) {
                const client = result.client;
                
                // Adiciona ao cache local
                const existingIndex = window.clients.findIndex(c => c.phone === normalizedPhone);
                if (existingIndex >= 0) {
                    window.clients[existingIndex] = { ...window.clients[existingIndex], ...client };
                } else {
                    window.clients.push(client);
                }
                
                // Atualiza localStorage como backup
                try {
                    localStorage.setItem('fastClients', JSON.stringify(window.clients));
                } catch (e) { }

                this.fillClientData(client);
                console.log('[CustomerModule] Cliente encontrado via API');
            } else {
                // Novo cliente
                this.handleNewClient();
            }
        } catch (err) {
            console.warn('[CustomerModule] Erro ao buscar cliente via API:', err);
            // Fallback: trata como novo cliente
            this.handleNewClient();
        }
    },

    fillClientData: function (client) {
        this.currentClient = client;

        // Fill Name
        const nameInput = document.getElementById('customerName');
        if (nameInput) {
            nameInput.value = client.name || '';
            // Make readonly or just formatted? 
            // Usually we allow editing, but auto-fill is good.
        }

        // Show Address Section if available
        this.showClientAddressConfirmation(client);

        // Hide Terms Checkbox (Existing clients already accepted)
        const termsContainer = document.getElementById('termsContainer');
        if (termsContainer) {
            termsContainer.classList.add('hidden');
            const checkbox = document.getElementById('acceptTermsCheckbox');
            if (checkbox) checkbox.checked = true;
        }

        // Helper to checkout module if exists
        // (CheckoutModule might listen to changes or we update global var)
        window.currentSelectedClient = client;

        // Check for birthday
        if (client.birthdate) {
            // Maybe show a badge? "Aniversariante: DD/MM"
        }
    },

    handleNewClient: function () {
        this.currentClient = null;
        window.currentSelectedClient = null;

        // Reset Name (or keep what user typed?)
        // Better to NOT clear name if user typed it first, but usually phone comes first.
        // document.getElementById('customerName').value = ''; 

        // Show Terms
        const termsContainer = document.getElementById('termsContainer');
        if (termsContainer) {
            termsContainer.classList.remove('hidden');
            const checkbox = document.getElementById('acceptTermsCheckbox');
            if (checkbox) checkbox.checked = false;
        }

        // Hide Saved Addresses
        const savedAddressSection = document.getElementById('savedAddressSection');
        if (savedAddressSection) savedAddressSection.classList.add('hidden');

        const noAddressSection = document.getElementById('noAddressSection');
        if (noAddressSection) noAddressSection.classList.remove('hidden');
    },

    resetClientState: function () {
        this.currentClient = null;
        window.currentSelectedClient = null;

        const savedAddressSection = document.getElementById('savedAddressSection');
        if (savedAddressSection) savedAddressSection.classList.add('hidden');

        const noAddressSection = document.getElementById('noAddressSection');
        // Don't show "No Address" warning if phone is just empty, only if we searched and found nothing?
        // Actually fine to keep hidden until full search.
        if (noAddressSection) noAddressSection.classList.add('hidden');
    },

    // ===================================
    // ADDRESS MANAGEMENT
    // ===================================

    // This logic was previously inline in fast.html
    showClientAddressConfirmation: function (client) {
        const savedAddressSection = document.getElementById('savedAddressSection');
        const noAddressSection = document.getElementById('noAddressSection');
        const savedAddressText = document.getElementById('savedAddressText');

        if (!savedAddressSection || !noAddressSection || !savedAddressText) return;

        const hasAddresses = client && Array.isArray(client.addresses) && client.addresses.length > 0;

        if (hasAddresses) {
            const addr = client.addresses[0];
            const street = addr.street || '';
            const number = addr.number || '';
            const neighborhood = addr.neighborhood || '';
            const reference = addr.reference || '';

            const addressText = `${street}, ${number} - ${neighborhood}${reference ? ` (Ref: ${reference})` : ''}`.trim();
            savedAddressText.textContent = addressText;
            savedAddressSection.classList.remove('hidden');
            noAddressSection.classList.add('hidden');
        } else if (client && client.address) {
            // Old format: single address string
            savedAddressText.textContent = client.address;
            savedAddressSection.classList.remove('hidden');
            noAddressSection.classList.add('hidden');
        } else {
            savedAddressSection.classList.add('hidden');
            noAddressSection.classList.remove('hidden');
        }
    },

    renderClientAddresses: function (client) {
        const addressesDiv = document.getElementById('customerAddresses');
        if (!addressesDiv || !client) return;

        const addresses = client.addresses || [];
        if (addresses.length === 0) {
            addressesDiv.innerHTML = '<p class="text-sm text-gray-600">Nenhum endereço cadastrado.</p>';
            return;
        }

        addressesDiv.innerHTML = addresses.map((addr, index) => `
          <div class="bg-white border border-gray-200 p-2 rounded flex justify-between items-center mb-2">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-800">${addr.street}, ${addr.number}</p>
              <p class="text-xs text-gray-600">${addr.neighborhood || ''}</p>
              ${addr.reference ? `<p class="text-xs text-gray-500 italic">Ref: ${addr.reference}</p>` : ''}
              <span class="text-xs bg-gray-100 text-gray-600 px-1 rounded uppercase tracking-wider">${addr.label || 'Casa'}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="window.CustomerModule.selectAddress(${index})" class="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs cursor-pointer">Usar</button>
                <button onclick="window.CustomerModule.deleteAddress(${index})" class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs cursor-pointer">Excluir</button>
            </div>
          </div>
        `).join('');
    },

    selectAddress: function (index) {
        if (!this.currentClient) return;

        const address = this.currentClient.addresses[index];
        if (!address) return;

        const streetInput = document.getElementById('street');
        const numberInput = document.getElementById('number');
        const neighborhoodInput = document.getElementById('neighborhood');
        const referenceInput = document.getElementById('reference');

        if (streetInput) streetInput.value = address.street || '';
        if (numberInput) numberInput.value = address.number || '';
        if (neighborhoodInput) neighborhoodInput.value = address.neighborhood || '';
        if (referenceInput) referenceInput.value = address.reference || '';

        // Show address form
        const addressForm = document.getElementById('addressForm');
        if (addressForm) addressForm.classList.remove('hidden');

        // Update fee if neighborhood is filled (using global function or module?)
        // fast.html has 'updateCheckoutFeeAndTotalFast' which is global.
        // We should trigger a change event or call it if available.
        if (typeof window.updateCheckoutFeeAndTotalFast === 'function') {
            window.updateCheckoutFeeAndTotalFast();
        }
    },

    deleteAddress: function (index) {
        if (!this.currentClient) return;

        if (confirm('Deseja excluir este endereço?')) {
            this.currentClient.addresses.splice(index, 1);
            if (window.saveClients) window.saveClients();
            this.renderClientAddresses(this.currentClient);
            this.showClientAddressConfirmation(this.currentClient);
        }
    },

    saveNewAddress: function () {
        if (!this.currentClient) return;

        const street = document.getElementById('street').value.trim();
        const number = document.getElementById('number').value.trim();
        const neighborhood = document.getElementById('neighborhood').value.trim();
        const reference = document.getElementById('reference').value.trim();

        if (!street || !number || !neighborhood) {
            alert('Preencha rua, número e bairro.');
            return;
        }

        if (!this.currentClient.addresses) {
            this.currentClient.addresses = [];
        }

        this.currentClient.addresses.push({ street, number, neighborhood, reference });

        // Save using global saveClients
        if (window.saveClients) window.saveClients();

        this.renderClientAddresses(this.currentClient);
        this.showClientAddressConfirmation(this.currentClient);

        // Hide form or clear inputs? The original code didn't specify, 
        // but likely we want to clear or keep it shown?
        // Assuming we keep it for now.
    },

    checkTermsAcceptance: function (phone) {
        // Logic to verify if terms are accepted
        // This is usually handled by checking if client exists, relying on the fact 
        // that registration implies acceptance, OR a specific flag.
        // For now, relies on UI state (checkbox) if new client.
        return true;
    }
};

// Initialize listeners when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CustomerModule.init());
} else {
    window.CustomerModule.init();
}
