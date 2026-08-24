/**
 * Fast Savory's - Checkout Module
 * Handles order validation, message construction, and submission
 */

window.CheckoutModule = {

    // ===================================
    // INITIALIZATION & LISTENERS
    // ===================================
    init: function () {
        document.getElementById('cancelCheckout')?.addEventListener('click', () => {
            document.getElementById('checkoutModal').classList.add('hidden');
        });

        document.getElementById('confirmOrder')?.addEventListener('click', this.finalizeOrder.bind(this));

        // Phone Mask Listener
        document.getElementById('customerPhone')?.addEventListener('input', function (e) {
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
        });

        // Address confirmation listeners
        document.getElementById('confirmSavedAddress')?.addEventListener('click', this.confirmSavedAddress.bind(this));
        document.getElementById('useDifferentAddress')?.addEventListener('click', this.useDifferentAddress.bind(this));

        // Delivery/Pickup Toggle Logic (moved from inline)
        document.addEventListener('change', (e) => {
            if (e.target.name === 'delivery') this.handleDeliveryChange(e);
            if (e.target.name === 'payment') this.handlePaymentChange(e);
            if (e.target.id === 'noChangeNeeded') this.handleNoChangeToggle(e);

            // Auto-search client
            if (e.target.id === 'customerName' || e.target.id === 'customerPhone') this.handleClientSearch(e);

            // Atualiza aviso de valor mínimo quando bairro muda
            if (e.target.id === 'neighborhood') {
                if (window.updateNeighborhoodMinValueWarning) window.updateNeighborhoodMinValueWarning();
                if (window.updateCheckoutFeeAndTotalFast) window.updateCheckoutFeeAndTotalFast();
            }
        });

        // Listener para input de bairro (blur para capturar digitação)
        document.getElementById('neighborhood')?.addEventListener('blur', () => {
            if (window.updateNeighborhoodMinValueWarning) window.updateNeighborhoodMinValueWarning();
        });

        // Listener para atualizar horário mínimo quando data muda
        document.getElementById('orderDate')?.addEventListener('change', (e) => {
            this.updateMinTimeForDate(e.target.value);
        });

        // Listener para validar horário ao sair do campo
        document.getElementById('orderTimeSlot')?.addEventListener('blur', (e) => {
            this.validateTimeSlotNotPast(e.target.value);
        });

        // Confirmation Modal Listeners
        document.getElementById('confirmationModalCancel')?.addEventListener('click', () => {
            console.log('[Checkout] Modal Cancel clicked');
            document.getElementById('confirmationModal').classList.add('hidden');
            this.isSubmitting = false;
            if (document.getElementById('confirmOrder')) document.getElementById('confirmOrder').disabled = false;
        });
        document.getElementById('confirmationModalConfirm')?.addEventListener('click', () => {
            console.log('[Checkout] Modal Confirm clicked');
            document.getElementById('confirmationModal').classList.add('hidden');
            try {
                if (this.onConfirmationConfirm) {
                    console.log('[Checkout] Executing onConfirmationConfirm...');
                    this.onConfirmationConfirm();
                } else {
                    console.warn('[Checkout] No onConfirmationConfirm handler found!');
                }
            } catch (err) {
                console.error('[Checkout] Error in confirmation callback:', err);
                alert('Erro ao confirmar pedido. Tente novamente.');
            }
        });
    },

    // ===================================
    // UI HANDLERS
    // ===================================
    handleDeliveryChange: function (e) {
        const f = document.getElementById('addressForm');
        const dateBox = document.getElementById('orderDateBox');

        if (e.target.value === 'entrega') {
            const containsKit = window.cart.some(i => { const p = window.products.find(x => x.id === i.id); return p && p.category === 'kits'; });
            const containsBolo = window.cart.some(i => {
                const p = window.products.find(x => x.id === i.id);
                if (!p) return false;
                const name = p.name.toLowerCase();
                // Vulcão Mini e Bolo no Pote são liberados para entrega
                if (name.includes('vulcão mini') || name.includes('vulcao mini')) return false;
                if (name.includes('pote')) return false;
                return p.category === 'bolos' || name.includes('bolo p') || name.includes('bolo g') || name.match(/bolo\s*[pg]/i);
            });

            if (containsKit || containsBolo) {
                e.target.checked = false;
                document.querySelector('input[name="delivery"][value="retirada"]').checked = true;
                f.classList.add('hidden');
                this.showWarning('⚠️ Kits festa e bolos grandes não possuem entrega. Apenas retirada na loja. (Vulcão Mini e Bolo no Pote podem ser entregues!)');
                return;
            }
            f.classList.remove('hidden');
        } else {
            f.classList.add('hidden');
        }

        // Always show date/time fields for scheduling
        dateBox.classList.remove('hidden');

        try {
            const slot = document.getElementById('orderTimeSlot');
            if (slot) {
                if (e.target.value === 'entrega') { slot.min = '07:00'; slot.max = '18:00'; }
                else { slot.removeAttribute('min'); slot.removeAttribute('max'); }
            }
        } catch (e2) { }

        if (window.updateCheckoutFeeAndTotalFast) window.updateCheckoutFeeAndTotalFast();

        // Atualiza regras de pedido (valor mínimo por bairro, etc)
        if (window.updateOrderRulesUI) window.updateOrderRulesUI();
        if (window.updateNeighborhoodMinValueWarning) window.updateNeighborhoodMinValueWarning();
    },

    handlePaymentChange: function (e) {
        const b = document.getElementById('moneyChangeBox');
        if (e.target.value === 'dinheiro') {
            b.classList.remove('hidden');
        } else {
            b.classList.add('hidden');
            const cb = document.getElementById('noChangeNeeded');
            if (cb) cb.checked = false;
            const input = document.getElementById('moneyChangeValue');
            if (input) input.value = '';
            document.getElementById('changeValueWrapper')?.classList.remove('hidden');
        }
        if (window.updateCheckoutFeeAndTotalFast) window.updateCheckoutFeeAndTotalFast();
    },

    handleNoChangeToggle: function (e) {
        const input = document.getElementById('moneyChangeValue');
        const wrapper = document.getElementById('changeValueWrapper');
        if (!input || !wrapper) return;
        if (e.target.checked) {
            input.value = '';
            wrapper.classList.add('hidden');
        } else {
            wrapper.classList.remove('hidden');
        }
    },

    // Atualiza horário mínimo quando data é hoje
    updateMinTimeForDate: function (dateStr) {
        const timeInput = document.getElementById('orderTimeSlot');
        if (!timeInput) return;

        const brasilia = window.getBrasiliaDate ? window.getBrasiliaDate() : new Date();
        const todayStr = window.formatYYYYMMDD(brasilia);

        if (dateStr === todayStr) {
            // Data é hoje - definir horário mínimo como agora + 30min
            const currentHour = brasilia.getHours();
            const currentMin = brasilia.getMinutes();
            let minHour = currentHour;
            let minMin = currentMin + 30;

            if (minMin >= 60) {
                minHour += 1;
                minMin -= 60;
            }

            const minTime = `${String(minHour).padStart(2, '0')}:${String(minMin).padStart(2, '0')}`;
            timeInput.min = minTime;

            // Se horário atual é menor que mínimo, limpar
            if (timeInput.value && timeInput.value < minTime) {
                timeInput.value = '';
                if (window.showToast) window.showToast(`⏰ Horário mínimo para hoje: ${minTime}`, 'warning');
            }

            // Mostrar hint
            const hint = document.getElementById('orderTimeHint');
            if (hint) hint.textContent = `Para hoje, horário mínimo: ${minTime} (30min preparo)`;
        } else {
            // Data futura - REMOVER TODAS as restrições de horário
            timeInput.removeAttribute('min');
            timeInput.removeAttribute('max');
            const hint = document.getElementById('orderTimeHint');
            if (hint) hint.textContent = 'Horário de funcionamento: 07:00 às 18:00';
        }
    },

    // Valida se horário não é passado
    validateTimeSlotNotPast: function (timeStr) {
        if (!timeStr) return;

        const dateInput = document.getElementById('orderDate');
        if (!dateInput || !dateInput.value) return;

        const brasilia = window.getBrasiliaDate ? window.getBrasiliaDate() : new Date();
        const todayStr = window.formatYYYYMMDD(brasilia);

        if (dateInput.value !== todayStr) return; // Data futura - SEMPRE permitir qualquer horário

        const currentHour = brasilia.getHours();
        const currentMin = brasilia.getMinutes();
        const currentTimeNum = currentHour * 100 + currentMin;

        const [slotHour, slotMin] = timeStr.split(':').map(Number);
        const slotTimeNum = slotHour * 100 + (slotMin || 0);

        if (slotTimeNum < currentTimeNum) {
            const timeInput = document.getElementById('orderTimeSlot');
            if (timeInput) timeInput.value = '';
            if (window.showToast) {
                window.showToast(`⏰ O horário ${timeStr} já passou! Selecione um horário futuro.`, 'error');
            }
        }
    },

    handleClientSearch: function (e) {
        const name = document.getElementById('customerName').value.trim();
        const phone = document.getElementById('customerPhone').value.trim();

        if (name || phone) {
            let foundClient = null;
            if (window.CustomerModule) {
                foundClient = window.CustomerModule.searchClient(name, phone);
            }
            // window.searchClient removal: Legacy fallback removed.

            if (foundClient) {
                window.currentSelectedClient = foundClient;
                const searchArea = document.getElementById('customerSearchArea');
                const foundInfo = document.getElementById('foundCustomerInfo');

                if (searchArea) searchArea.classList.remove('hidden');
                if (foundInfo) foundInfo.innerHTML = `Nome: ${foundClient.name}<br>Telefone: ${foundClient.phone}`;

                this.showClientAddressConfirmation(foundClient);

                if (name && foundClient.name.toLowerCase().includes(name.toLowerCase()) && foundClient.name !== name) {
                    const el = document.getElementById('customerName');
                    if (el) el.value = foundClient.name;
                }
            } else {
                window.currentSelectedClient = null;
                const el = document.getElementById('customerSearchArea');
                if (el) el.classList.add('hidden');
            }
        } else {
            window.currentSelectedClient = null;
            document.getElementById('customerSearchArea').classList.add('hidden');
        }

        if (e.target.id === 'customerPhone' && window.checkTermsAcceptance) {
            window.checkTermsAcceptance(phone);
        }
    },

    showClientAddressConfirmation: function (client) {
        const savedAddressSection = document.getElementById('savedAddressSection');
        const noAddressSection = document.getElementById('noAddressSection');
        const savedAddressText = document.getElementById('savedAddressText');

        if (!savedAddressSection || !noAddressSection || !savedAddressText) return;

        const hasAddresses = client && Array.isArray(client.addresses) && client.addresses.length > 0;

        if (hasAddresses) {
            const addr = client.addresses[0];
            const addressText = `${addr.street || ''}, ${addr.number || ''} - ${addr.neighborhood || ''}${addr.reference ? ` (Ref: ${addr.reference})` : ''}`.trim();
            savedAddressText.textContent = addressText;
            savedAddressSection.classList.remove('hidden');
            noAddressSection.classList.add('hidden');
        } else if (client && client.address) {
            savedAddressText.textContent = client.address;
            savedAddressSection.classList.remove('hidden');
            noAddressSection.classList.add('hidden');
        } else {
            savedAddressSection.classList.add('hidden');
            noAddressSection.classList.remove('hidden');
        }
    },

    confirmSavedAddress: function () {
        if (!window.currentSelectedClient) return;

        const addresses = window.currentSelectedClient.addresses || [];
        const defaultAddress = addresses[0];
        if (defaultAddress) {
            document.getElementById('street').value = defaultAddress.street;
            document.getElementById('number').value = defaultAddress.number;
            document.getElementById('neighborhood').value = defaultAddress.neighborhood;
            document.getElementById('reference').value = defaultAddress.reference || '';

            document.getElementById('addressForm').classList.add('hidden');
            document.getElementById('savedAddressSection').innerHTML = `
                <div class="bg-green-100 border border-green-300 rounded-lg p-2">
                    <p class="text-sm text-green-800 font-medium">✓ Endereço confirmado!</p>
                    <p class="text-xs text-green-700">${defaultAddress.street}, ${defaultAddress.number} - ${defaultAddress.neighborhood}</p>
                </div>
            `;

            document.querySelector('input[name="delivery"][value="entrega"]').checked = true;
            if (window.updateCheckoutFeeAndTotalFast) window.updateCheckoutFeeAndTotalFast();
        }
    },

    useDifferentAddress: function () {
        document.getElementById('street').value = '';
        document.getElementById('number').value = '';
        document.getElementById('neighborhood').value = '';
        document.getElementById('reference').value = '';

        document.getElementById('addressForm').classList.remove('hidden');
        document.querySelector('input[name="delivery"][value="entrega"]').checked = true;
    },

    showWarning: function (txt) {
        const w = document.getElementById('validationWarnings');
        w.innerHTML = `<div class='p-3 bg-red-100 border border-red-400 text-red-900 rounded-lg text-sm'>${txt}</div>`;
        w.classList.remove('hidden');
    },

    // ===================================
    // MAIN ORDER FINALIZATION LOGIC
    // ===================================
    finalizeOrder: async function () {
        if (this.isSubmitting) return;
        console.log('[Checkout] Iniciando finalizeOrder...');

        try {
            this.isSubmitting = true;
            const btn = document.getElementById('confirmOrder');
            if (btn) btn.disabled = true;

            const warnings = document.getElementById('validationWarnings');
            warnings.innerHTML = '';
            warnings.classList.add('hidden');

            const payment = document.querySelector('input[name="payment"]:checked');
            const delivery = document.querySelector('input[name="delivery"]:checked');
            const customerName = document.getElementById('customerName')?.value?.trim();
            const customerPhone = document.getElementById('customerPhone')?.value?.trim();

            console.log('[Checkout] Step 1: Validating inputs...', { customerName, customerPhone, payment: payment?.value, delivery: delivery?.value });

            // 1. Validation
            if (!customerName || !customerPhone) {
                this.showWarning('Preencha seu nome e telefone.');
                this.isSubmitting = false;
                if (btn) btn.disabled = false;
                return;
            }

            const normalizedPhone = customerPhone.replace(/\D/g, '');
            if (normalizedPhone.length !== 11) {
                this.showWarning('Informe um telefone válido com DDD e 9 dígitos. Ex: 73999348552.');
                this.isSubmitting = false;
                if (btn) btn.disabled = false;
                return;
            }

            // ... (rest of validation) ...

            // Validate Full Name for new clients
            const isExistingClient = (window.clients || []).some(c => (c.phone || '').replace(/\D/g, '') === normalizedPhone);
            if (!isExistingClient) {
                const nameParts = customerName.split(/\s+/).filter(w => w.length > 0);
                if (nameParts.length < 2) {
                    this.showWarning('Por favor, informe nome e sobrenome completo.');
                    this.isSubmitting = false;
                    if (btn) btn.disabled = false;
                    return;
                }
            }

            const termsCheckbox = document.getElementById('acceptTermsCheckbox');
            if (termsCheckbox && !termsCheckbox.checked) {
                this.showWarning('Você precisa aceitar os Termos de Uso para continuar.');
                this.isSubmitting = false;
                if (btn) btn.disabled = false;
                return;
            }

            if (!payment) {
                this.showWarning('Selecione uma forma de pagamento.');
                this.isSubmitting = false;
                if (btn) btn.disabled = false;
                return;
            }

            // VALIDAÇÃO DE ENDEREÇO PARA ENTREGA
            if (delivery?.value === 'entrega') {
                const street = document.getElementById('street')?.value?.trim();
                const number = document.getElementById('number')?.value?.trim();
                const neighborhood = document.getElementById('neighborhood')?.value?.trim();

                if (!street || !number || !neighborhood) {
                    this.showWarning('Para entrega, preencha o endereço completo (rua, número e bairro).');
                    this.isSubmitting = false;
                    if (btn) btn.disabled = false;
                    return;
                }
            }

            // DELIVERY TIME CHECK
            const orderDateValue = document.getElementById('orderDate')?.value;
            const orderTimeValue = document.getElementById('orderTimeSlot')?.value;

            console.log('[Checkout] DEBUG - orderDate field:', document.getElementById('orderDate'));
            console.log('[Checkout] DEBUG - orderTimeSlot field:', document.getElementById('orderTimeSlot'));
            console.log('[Checkout] DEBUG - orderDateValue:', orderDateValue);
            console.log('[Checkout] DEBUG - orderTimeValue:', orderTimeValue);
            console.log('[Checkout] DEBUG - isFastOpen():', window.isFastOpen());

            let orderDateStr = '';
            let orderTimeSlot = '';

            if (!window.isFastOpen()) {
                if (!orderDateValue || !orderTimeValue) {
                    console.error('[Checkout] ERRO - Data ou horário vazio! Date:', orderDateValue, 'Time:', orderTimeValue);
                    this.showWarning('A loja está fechada. Selecione data e horário para encomenda.');
                    this.isSubmitting = false;
                    if (btn) btn.disabled = false;
                    return;
                }
                const [y, m, d] = orderDateValue.split('-');
                orderDateStr = `${d}/${m}/${y}`;
                orderTimeSlot = orderTimeValue;
                console.log('[Checkout] Data/hora processadas:', orderDateStr, orderTimeSlot);
            } else if (orderDateValue && orderTimeValue) {
                // Scheduled while open
                const [y, m, d] = orderDateValue.split('-');
                orderDateStr = `${d}/${m}/${y}`;
                orderTimeSlot = orderTimeValue;
                console.log('[Checkout] Agendamento:', orderDateStr, orderTimeSlot);
            }

            // ============================================================
            // VALIDAR REGRAS DE PEDIDO (horário, valor mínimo, etc.)
            // ============================================================
            const isDelivery = delivery?.value === 'entrega';
            const neighborhood = document.getElementById('neighborhood')?.value?.trim() || null;

            if (window.validateOrder) {
                const validation = window.validateOrder({
                    cartItems: window.cart,
                    cartTotal: window.cartTotal,
                    orderDate: orderDateValue,
                    timeSlot: orderTimeValue,
                    isDelivery: isDelivery,
                    neighborhood: neighborhood
                });

                if (!validation.valid) {
                    console.warn('[Checkout] Validação falhou:', validation.errors);
                    this.showWarning(validation.errors.join('<br>'));
                    this.isSubmitting = false;
                    if (btn) btn.disabled = false;
                    return;
                }
                console.log('[Checkout] Validação de regras OK');
            }

            console.log('[Checkout] Step 2: Generating code...');
            const codes = await window.generateOrderCode();
            const draftOrderCode = codes.code;
            const orderSequence = codes.sequence;
            const orderId = Date.now();

            console.log('[Checkout] Step 3: Building PRELIMINARY message...');
            const construction = await this.buildOrderMessageAndData({
                customerName, customerPhone, payment, delivery, orderCode: draftOrderCode, orderSequence, orderId, orderDateStr, orderTimeSlot
            });

            const { msg: draftMsg, orderData: builtOrderData, hasBirthdayDiscount, birthdayDiscount } = construction;

            // MOVED PAYMENT CHECK (Step 5) TO HERE (Before Saving)
            console.log('[Checkout] Checking Payment/Change...');
            const moneyChangeValue = document.getElementById('moneyChangeValue')?.value;
            const noChangeNeeded = document.getElementById('noChangeNeeded')?.checked;
            if (payment.value === 'dinheiro' && !noChangeNeeded && (!moneyChangeValue || parseFloat(moneyChangeValue) <= 0)) {
                console.log('[Checkout] Cash without change info.');
                alert('Por favor, informe o valor para o troco ou marque a opção "Não preciso de troco".');
                this.isSubmitting = false;
                if (document.getElementById('confirmOrder')) document.getElementById('confirmOrder').disabled = false;
                return;
            }

            // If no issue, proceed directly
            await this.proceedToSaveAndExecute(builtOrderData, draftMsg, draftOrderCode, customerPhone, hasBirthdayDiscount, birthdayDiscount);

        } catch (err) {
            console.error('[Checkout] CRITICAL ERROR IN FINALIZE:', err);
            alert('Ocorreu um erro ao processar seu pedido. Veja o console para detalhes.');
            this.isSubmitting = false;
            if (document.getElementById('confirmOrder')) document.getElementById('confirmOrder').disabled = false;
        }
    },

    handleBirthdayOrExecute: function (orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount) {
        const normalizedPhone = (customerPhone || '').replace(/\D/g, '');
        const clientForBirthday = window.clients.find(c => (c.phone || '').replace(/\D/g, '') === normalizedPhone);
        const needsBirthdayRegistration = !clientForBirthday || !clientForBirthday.birthdate || clientForBirthday.birthdate === '' ||
            (window.getBrasiliaDate && clientForBirthday.birthdate === window.formatYYYYMMDD(window.getBrasiliaDate()));

        if (needsBirthdayRegistration) {
            this.pendingOrderData = orderData;
            this.pendingWhatsAppMessage = msg;
            this.showBirthdayModal();
        } else {
            this.executeOrder(orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount);
        }
    },

    proceedToSaveAndExecute: async function (builtOrderData, draftMsg, draftOrderCode, customerPhone, hasBirthdayDiscount, birthdayDiscount) {
        console.log('[Checkout] Step 3.5: Saving to Supabase to confirm Order Code...');
        let orderSavedSuccessfully = false;
        if (window.saveOrderToSupabase) {
            try {
                const savedOrder = await window.saveOrderToSupabase(builtOrderData);

                if (savedOrder && savedOrder.order_code) {
                    console.log('[Checkout] Order Code from DB:', savedOrder.order_code);
                    builtOrderData.order_code = savedOrder.order_code;
                    builtOrderData.order_sequence = savedOrder.order_sequence;
                    builtOrderData.id = savedOrder.id;
                    orderSavedSuccessfully = true;
                }
            } catch (e) {
                console.error('[Checkout] ERRO ao salvar pedido:', e.message || e);
                if (window.showToast) {
                    window.showToast('⚠️ Erro ao registrar pedido no sistema. Continue pelo WhatsApp.', 'warning');
                }
            }
        }

        console.log('[Checkout] Pedido salvo no banco:', orderSavedSuccessfully);

        // NOW rebuild the message with the FINAL code if needed
        console.log('[Checkout] Step 4: Re-Building FINAL message...');
        let finalMsg = draftMsg;
        if (builtOrderData.order_code !== draftOrderCode) {
            finalMsg = finalMsg.replace(draftOrderCode, builtOrderData.order_code);
        }

        console.log('[Checkout] Proceeding to execution...');
        this.handleBirthdayOrExecute(builtOrderData, finalMsg, customerPhone, hasBirthdayDiscount, birthdayDiscount);
    },

    buildOrderMessageAndData: async function (ctx) {
        let msg = `🥟 *Pedido Fast Savory's*\n\n`;
        msg += `🧾 *Código:* ${ctx.orderCode}\n`;
        msg += `👤 *Cliente:* ${ctx.customerName}\n`;
        msg += `📱 *Telefone:* ${ctx.customerPhone}\n\n`;
        msg += `📋 *Itens do Pedido:*\n`;

        const hasPromoItems = window.cart.some(item => window.promotions.find(p => p.productId === item.id));
        let productDiscount = 0;
        let cartTotalWithPromo = 0;

        window.cart.forEach(i => {
            const promotion = window.promotions.find(p => p.productId === i.id);
            const original = window.products.find(p => p.id === i.id);
            const price = i.price;
            const originalPrice = original?.price || price;

            let discountText = '';
            if (promotion && original) {
                const savings = originalPrice - price;
                if (savings > 0) {
                    productDiscount += savings * i.quantity;
                    discountText = promotion.type === 'percentage' ? ` (-${promotion.value}%)` : ` (-R$ ${promotion.value.toFixed(2).replace('.', ',')})`;
                }
            }
            cartTotalWithPromo += price * i.quantity;
            msg += `${i.quantity}x ${i.name}${discountText} - R$ ${(price * i.quantity).toFixed(2).replace('.', ',')}\n`;
            if (i.description) msg += `   🥟 ${i.description}\n`;
            if (i.note) msg += `   📝 Obs: ${i.note}\n`;
        });

        let clientDiscount = 0;
        let birthdayDiscount = 0;
        let hasBirthdayDiscount = false;

        if (!hasPromoItems) {
            if (window.SpecialDiscountService) {
                const conf = await window.SpecialDiscountService.getConfig();
                if (conf && conf.active) {
                    const count = await window.SpecialDiscountService.getValidOrderCount(ctx.customerPhone.replace(/\D/g, ''));
                    const minO = conf.min_orders || 10;
                    if (count > 0 && (count % minO === 0) && cartTotalWithPromo >= (conf.min_order_value || 0)) {
                        clientDiscount = (conf.discount_type === 'percentage') ? cartTotalWithPromo * (conf.discount_value / 100) : conf.discount_value;
                        clientDiscount = Math.min(clientDiscount, cartTotalWithPromo);
                    }
                } else if (window.clientDiscounts && window.clientDiscounts[ctx.customerPhone]) {
                    clientDiscount = cartTotalWithPromo * (window.clientDiscounts[ctx.customerPhone] / 100);
                }
            }

            if (window.BirthdayDiscountService && window.isBirthdayDiscountValid && window.calculateBirthdayDiscount) {
                const bConfig = await window.BirthdayDiscountService.getConfig();
                const client = window.clients.find(c => c.phone === ctx.customerPhone);
                if (bConfig && bConfig.active && client && window.isBirthdayDiscountValid(client.birthdate, bConfig)) {
                    const used = await window.checkBirthdayDiscountUsed(ctx.customerPhone);
                    if (!used) {
                        birthdayDiscount = window.calculateBirthdayDiscount(Math.max(0, cartTotalWithPromo), bConfig);
                        birthdayDiscount = Math.min(birthdayDiscount, cartTotalWithPromo);
                        if (birthdayDiscount > 0) {
                            hasBirthdayDiscount = true;
                            clientDiscount = 0;
                        }
                    }
                }
            }
        }

        let deliveryFee = 0;
        let cardFee = 0;

        if (ctx.delivery.value === 'entrega') {
            const nb = document.getElementById('neighborhood').value;
            const f = window.calcFastDeliveryFee ? window.calcFastDeliveryFee(nb) : 0;
            if (f > 0) { msg += `Taxa de entrega: R$ ${f.toFixed(2).replace('.', ',')}\n`; deliveryFee = f; }
            else { msg += `Taxa de entrega: Grátis\n`; }
        }

        if (ctx.payment.value === 'cartao1x') {
            cardFee = window.cartTotal * ((window.storeConfig.card_fee_1x || 5) / 100);
            msg += `Taxa cartão (1x - ${window.storeConfig.card_fee_1x}%): R$ ${cardFee.toFixed(2).replace('.', ',')}\n`;
        }

        if (productDiscount > 0) msg += `Desconto produtos: -R$ ${productDiscount.toFixed(2).replace('.', ',')}\n`;
        if (clientDiscount > 0) msg += `Desconto fidelidade: -R$ ${clientDiscount.toFixed(2).replace('.', ',')}\n`;
        if (birthdayDiscount > 0) msg += `🎂 Desconto Aniversariante: -R$ ${birthdayDiscount.toFixed(2).replace('.', ',')}\n`;

        let couponDiscount = 0;
        let appliedCode = null;
        if (window.appliedCoupon && !hasPromoItems && birthdayDiscount <= 0) {
            const valid = window.findValidCouponByCode ? window.findValidCouponByCode(window.appliedCoupon.code) : null;
            if (valid && (!valid.minOrder || cartTotalWithPromo >= valid.minOrder)) {
                const base = cartTotalWithPromo - clientDiscount;
                couponDiscount = window.computeCouponDiscount ? window.computeCouponDiscount(base, valid) : 0;
                appliedCode = valid.code;
                if (couponDiscount > 0) msg += `🎟️ Cupom (${valid.code}): -R$ ${couponDiscount.toFixed(2).replace('.', ',')}\n`;
            }
        } else if (window.appliedCoupon) {
            msg += `⚠️ Cupom não aplicado (não acumula com promoções/aniversário)\n`;
        }

        const finalTotal = cartTotalWithPromo + deliveryFee + cardFee - clientDiscount - birthdayDiscount - couponDiscount;
        msg += `\n*Total: R$ ${finalTotal.toFixed(2).replace('.', ',')}*\n\n`;

        const paymentMap = { dinheiro: '💵 Dinheiro', cartao1x: '💳 Cartão 1x', pix: '📱 PIX' };
        msg += `*Pagamento:* ${paymentMap[ctx.payment.value] || ctx.payment.value}\n`;

        if (ctx.payment.value === 'cartao1x') {
            msg += `\n💳 *IMPORTANTE:* O link de pagamento em cartão será enviado após aceitarmos seu pedido.\n`;
        }
        if (ctx.payment.value === 'dinheiro') {
            const ch = parseFloat(document.getElementById('moneyChangeValue').value || '0');
            if (document.getElementById('noChangeNeeded')?.checked) {
                msg += `*Troco:* Não preciso de troco\n`;
            } else if (ch > 0) {
                msg += `*Troco para:* R$ ${ch.toFixed(2).replace('.', ',')}\n`;
            }
        }

        if (ctx.delivery.value === 'retirada') {
            msg += `*Entrega:* 🏪 Retirada na loja\n`;
        } else {
            const addr = {
                street: document.getElementById('street').value,
                number: document.getElementById('number').value,
                nbhd: document.getElementById('neighborhood').value,
                ref: document.getElementById('reference').value
            };
            msg += `*Entrega:* 🚚 Delivery\n*Endereço:* ${addr.street}, ${addr.number} - ${addr.nbhd}\n`;
            if (addr.ref) msg += `*Referência:* ${addr.ref}\n`;
        }

        if (!window.isFastOpen()) {
            msg += `\n⚠️ *Encomenda:* Pedido selecionado para:\n*Data:* ${ctx.orderDateStr}\n*Horário:* ${ctx.orderTimeSlot}\n`;
        } else if (ctx.orderDateStr && ctx.orderTimeSlot) {
            msg += `\n📅 *Agendamento:*\n*Data:* ${ctx.orderDateStr}\n*Horário:* ${ctx.orderTimeSlot}\n`;
        }

        const trackLink = window.TrackingModule && window.TrackingModule.buildTrackingLink ? window.TrackingModule.buildTrackingLink(ctx.orderCode, ctx.customerPhone) : '';
        msg += `\n⚠️ *Este pedido será válido após confirmação.*\n\n`;
        if (trackLink) msg += `🔍 *Acompanhar:* ${trackLink}\n\n`;
        msg += `📞 *Contato:* (73) 99936-6554\n\nObrigado! 😊`;

        const orderData = {
            id: ctx.orderId,
            order_sequence: ctx.orderSequence,
            order_code: ctx.orderCode,
            client_name: ctx.customerName,
            client_phone: ctx.customerPhone,
            items: window.cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, note: i.note })),
            subtotal: window.cartTotal,
            delivery_fee: deliveryFee,
            card_fee: cardFee,
            discount: productDiscount + clientDiscount + birthdayDiscount + couponDiscount,
            coupon_code: appliedCode,
            coupon_discount: couponDiscount,
            birthday_discount: birthdayDiscount,
            total: finalTotal,
            payment_method: ctx.payment.value,
            delivery_type: ctx.delivery.value,
            address: ctx.delivery.value === 'entrega' ? {
                street: document.getElementById('street').value,
                number: document.getElementById('number').value,
                neighborhood: document.getElementById('neighborhood').value,
                reference: document.getElementById('reference').value
            } : null,
            scheduled_date: ctx.orderDateStr || null,
            scheduled_time: ctx.orderTimeSlot || null,
            status: 'pending'
        };

        return { msg, orderData, hasBirthdayDiscount, birthdayDiscount };
    },

    executeOrder: function (orderData, msg, phone, hasBirthdayDiscount, birthdayDiscount) {
        // 1. WhatsApp Redirect (Improved to avoid duplicates)
        const number = '5573999366554';
        const url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;

        // Tentativa de abrir em nova aba
        const win = window.open(url, '_blank', 'noopener,noreferrer');

        // Se bloqueado ou falhou, redireciona a mesma página
        if (!win) {
            window.location.href = url;
        }

        // Reset submitting after delay (so user can't double click instantly, but can retry later if needed)
        setTimeout(() => {
            this.isSubmitting = false;
            const btn = document.getElementById('confirmOrder');
            if (btn) btn.disabled = false;
        }, 5000);

        // ...
        const existing = window.clients.find(c => c.phone === phone);
        if (!existing) {
            const newC = { id: Date.now(), name: orderData.client_name, phone: phone, birthdate: '', addresses: [] };
            window.clients.push(newC);
            if (window.saveClients) window.saveClients();
        }

        // 3. Save Address
        if (orderData.delivery_type === 'entrega' && orderData.address) {
            const saveCheck = document.getElementById('saveAddressCheckbox');
            if (saveCheck?.checked && window.AddressService) {
                window.AddressService.save(phone, orderData.address);
            }
            // Update client array logic (legacy) could go here but skipping for brevity as AddressService handles storage
        }

        // 4. Save History (Local)
        if (window.HistoryModule) {
            window.HistoryModule.save(phone, {
                id: orderData.id.toString(),
                createdAt: new Date().toISOString(),
                items: orderData.items,
                total: orderData.total,
                isEncomenda: !window.isFastOpen(),
                deliveryType: orderData.delivery_type,
                neighborhood: orderData.address?.neighborhood || '',
                encomendaDate: orderData.scheduled_date,
                encomendaSlot: orderData.scheduled_time
            });
        }

        // 5. Cleanup UI
        this.clearCheckoutData();
        if (window.clearAppliedCoupon) window.clearAppliedCoupon();
        if (window.TermsAcceptanceService) window.TermsAcceptanceService.markAccepted(phone);
        window.cart = [];
        if (window.updateCart) window.updateCart();
        document.getElementById('checkoutModal').classList.add('hidden');
        if (window.showToast) window.showToast('✅ Pedido enviado para o WhatsApp!', 'success');

        // 6. Notify ManyChat (Save to Supabase already happened)
        if (window.notifyManychatNewOrder) window.notifyManychatNewOrder(orderData).catch(e => console.warn('ManyChat Error:', e));

        if (hasBirthdayDiscount && birthdayDiscount > 0 && window.recordBirthdayDiscountUsage) {
            window.recordBirthdayDiscountUsage(phone, birthdayDiscount, orderData.id);
        }
        if (orderData.coupon_code && orderData.coupon_discount > 0 && window.CouponUsageService) {
            window.CouponUsageService.markUsed(phone, orderData.coupon_code, orderData.id, orderData.coupon_discount);
        }
    },

    clearCheckoutData: function () {
        document.getElementById('customerName').value = '';
        document.getElementById('customerPhone').value = '';
        document.getElementById('customerSearchArea').classList.add('hidden');
        window.currentSelectedClient = null;

        document.getElementById('street').value = '';
        document.getElementById('number').value = '';
        document.getElementById('neighborhood').value = '';
        document.getElementById('reference').value = '';
        document.getElementById('addressForm').classList.add('hidden');

        document.querySelectorAll('input[name="payment"]').forEach(i => i.checked = false);
        document.getElementById('moneyChangeValue').value = '';
        const noChangeNeeded = document.getElementById('noChangeNeeded');
        if (noChangeNeeded) noChangeNeeded.checked = false;
        const changeValueWrapper = document.getElementById('changeValueWrapper');
        if (changeValueWrapper) changeValueWrapper.classList.remove('hidden');
        document.getElementById('moneyChangeBox').classList.add('hidden');

        document.querySelector('input[name="delivery"][value="retirada"]').checked = true;

        document.getElementById('orderDate').value = '';
        document.getElementById('orderDateBox').classList.add('hidden');
        document.getElementById('validationWarnings').classList.add('hidden');
    },

    // ===================================
    // BIRTHDAY MODAL HOOKS
    // ===================================
    showBirthdayModal: function () {
        document.getElementById('birthdayStep1').classList.remove('hidden');
        document.getElementById('birthdayStep2').classList.add('hidden');
        document.getElementById('birthdayDateInput').value = '';
        document.getElementById('birthdayModal').classList.remove('hidden');
    },


    // Called when user clicks "Confirm Birthday" in modal (Step 1 -> Step 2)
    proceedToBirthdayStep2: function () {
        document.getElementById('birthdayStep1').classList.add('hidden');
        document.getElementById('birthdayStep2').classList.remove('hidden');
    },

    // Skip birthday registration
    skipBirthdayRegistration: function () {
        this.proceedWithOrderFromModal();
    },

    // Handle Birthday Save & Send
    handleBirthdaySubmit: function () {
        const birthdayDate = document.getElementById('birthdayDateInput').value;
        const customerPhone = this.pendingOrderData?.client_phone;

        if (birthdayDate && customerPhone) {
            const phoneDigits = (customerPhone || '').replace(/\D/g, '');
            // Find and update client in local cache
            const clientIndex = window.clients.findIndex(c => (c.phone || '').replace(/\D/g, '') === phoneDigits);
            if (clientIndex !== -1) {
                window.clients[clientIndex].birthdate = birthdayDate;
                if (window.saveClients) window.saveClients();
            }

            // Persistir birthdate no Supabase (fast_clients)
            if (window.supabaseClient) {
                window.supabaseClient
                    .from('fast_clients')
                    .upsert({ phone: phoneDigits, birthdate: birthdayDate, name: this.pendingOrderData?.client_name || '' }, { onConflict: 'phone' })
                    .then(({ error }) => {
                        if (error) console.warn('[Checkout] Erro ao salvar aniversário no Supabase:', error);
                        else console.log('[Checkout] Aniversário salvo no Supabase:', phoneDigits);
                    });
            }
        }

        this.proceedWithOrderFromModal();
    },

    // Finalize pending order
    proceedWithOrderFromModal: function () {
        if (!this.pendingOrderData || !this.pendingWhatsAppMessage) return;
        this.executeOrder(this.pendingOrderData, this.pendingWhatsAppMessage, this.pendingOrderData.client_phone,
            this.pendingOrderData.birthday_discount > 0, this.pendingOrderData.birthday_discount);
        this.pendingOrderData = null;
        this.pendingWhatsAppMessage = null;
        document.getElementById('birthdayModal').classList.add('hidden');
    }
};

// Initialize listeners when loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CheckoutModule.init());
} else {
    window.CheckoutModule.init();
}
