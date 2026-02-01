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

            // Auto-search client
            if (e.target.id === 'customerName' || e.target.id === 'customerPhone') this.handleClientSearch(e);
        });

        // Confirmation Modal Listeners
        document.getElementById('confirmationModalCancel')?.addEventListener('click', () => {
            console.log('[Checkout] Modal Cancel clicked');
            document.getElementById('confirmationModal').classList.add('hidden');
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
                return p.category === 'bolos' || name.includes('bolo p') || name.includes('bolo g') || name.match(/bolo\s*[pg]/i);
            });

            if (containsKit || containsBolo) {
                e.target.checked = false;
                document.querySelector('input[name="delivery"][value="retirada"]').checked = true;
                f.classList.add('hidden');
                alert('⚠️ Kits festa e bolos grandes não possuem entrega. Apenas retirada na loja.');
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
    },

    handlePaymentChange: function (e) {
        const b = document.getElementById('moneyChangeBox');
        if (e.target.value === 'dinheiro') b.classList.remove('hidden'); else b.classList.add('hidden');
        if (window.updateCheckoutFeeAndTotalFast) window.updateCheckoutFeeAndTotalFast();
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
        console.log('[Checkout] Iniciando finalizeOrder...');
        try {
            const warnings = document.getElementById('validationWarnings');
            warnings.innerHTML = '';
            warnings.classList.add('hidden');

            const payment = document.querySelector('input[name="payment"]:checked');
            const delivery = document.querySelector('input[name="delivery"]:checked');
            const customerName = document.getElementById('customerName')?.value?.trim();
            const customerPhone = document.getElementById('customerPhone')?.value?.trim();

            console.log('[Checkout] Step 1: Validating inputs...', { customerName, customerPhone, payment: payment?.value, delivery: delivery?.value });

            // 1. Validation
            if (!customerName || !customerPhone) { this.showWarning('Preencha seu nome e telefone.'); return; }

            const normalizedPhone = customerPhone.replace(/\D/g, '');
            if (normalizedPhone.length !== 11) {
                this.showWarning('Informe um telefone válido com DDD e 9 dígitos. Ex: 73999348552.');
                return;
            }

            // Validate Full Name for new clients
            const isExistingClient = (window.clients || []).some(c => (c.phone || '').replace(/\D/g, '') === normalizedPhone);
            if (!isExistingClient) {
                const nameParts = customerName.split(/\s+/).filter(w => w.length > 0);
                if (nameParts.length < 2) {
                    this.showWarning('Por favor, informe nome e sobrenome completo.');
                    return;
                }
            }

            const termsCheckbox = document.getElementById('acceptTermsCheckbox');
            if (termsCheckbox && !termsCheckbox.checked) {
                this.showWarning('Você precisa aceitar os Termos de Uso para continuar.');
                return;
            }

            if (!payment) { this.showWarning('Selecione uma forma de pagamento.'); return; }

            const minOrder = (delivery && delivery.value === 'entrega') ? 15 : 8;
            if (window.cartTotal < minOrder) { this.showWarning(`Pedido mínimo: R$ ${minOrder.toFixed(2).replace('.', ',')}`); return; }

            console.log('[Checkout] Step 1.1: Product restrictions...');
            // Product Restrictions
            const containsKit = window.cart.some(i => window.products.find(p => p.id === i.id)?.category === 'kits');

            // Apenas kits festa não têm entrega (bolos podem ter entrega com antecedência)
            if (containsKit && delivery && delivery.value === 'entrega') {
                this.showWarning('Kits festa não possuem entrega. Altere para retirada na loja.');
                return;
            }

            const onlyBeverages = window.cart.every(i => window.products.find(p => p.id === i.id)?.category === 'bebidas');
            if (onlyBeverages && delivery && delivery.value === 'entrega') {
                this.showWarning('Não entregamos apenas refrigerantes. Adicione salgados ao pedido ou escolha retirada na loja.');
                return;
            }

            console.log('[Checkout] Step 1.2: Address validation...');
            // Address Validation
            if (delivery && delivery.value === 'entrega') {
                const street = document.getElementById('street')?.value?.trim();
                const number = document.getElementById('number')?.value?.trim();
                const neighborhood = document.getElementById('neighborhood')?.value;

                console.log('[Checkout] Address Data:', { street, number, neighborhood });

                if (!street || !number || !neighborhood) {
                    this.showWarning('Por favor, preencha o endereço completo (Rua, Número e Bairro).');
                    return;
                }
            }

            console.log('[Checkout] Step 1.3: Time/Date validation...');
            // Time & Date Validation
            const orderDateStr = document.getElementById('orderDate').value;
            const orderTimeSlot = document.getElementById('orderTimeSlot').value;

            if (!window.isFastOpen()) {
                if (!orderDateStr) { this.showWarning('Informe a data da encomenda.'); return; }
                if (!orderTimeSlot) { this.showWarning('Selecione um horário desejado.'); return; }

                const todayDate = window.formatYYYYMMDD(window.getBrasiliaDate());
                const isOrderForToday = orderDateStr === todayDate;
                const isRetirada = delivery && delivery.value === 'retirada';

                if (isOrderForToday) {
                    if (window.canOrderTodayWithoutBolo) {
                        const val = window.canOrderTodayWithoutBolo(isRetirada, window.cartTotal, orderTimeSlot);
                        if (!val.allowed) { this.showWarning(val.reason); return; }
                    }
                } else {
                    const minDate = window.getMinEncomendaDateYYYYMMDD();
                    if (orderDateStr < minDate) { this.showWarning('Data da encomenda inválida.'); return; }
                }

                // Time Window Logic
                const timeNum = parseInt(orderTimeSlot.replace(/:/g, ''), 10);
                const hasBolo = window.cartContainsBolo();
                
                if (isOrderForToday && !hasBolo) {
                    // Pedido mesmo dia SEM bolo: usa janela same_day (11:00-18:00)
                    const startStr = (window.storeConfig?.same_day_pickup_start || '11:00').replace(':', '');
                    const endStr = (window.storeConfig?.same_day_pickup_end || '18:00').replace(':', '');
                    const startNum = parseInt(startStr, 10) || 1100;
                    const endNum = parseInt(endStr, 10) || 1800;
                    
                    if (timeNum < startNum || timeNum > endNum) {
                        const startFormatted = window.storeConfig?.same_day_pickup_start || '11:00';
                        const endFormatted = window.storeConfig?.same_day_pickup_end || '18:00';
                        this.showWarning(`Para retirada no mesmo dia, o horário deve ser entre ${startFormatted} e ${endFormatted}.`);
                        return;
                    }
                } else {
                    // Encomenda (data futura) OU pedido com bolo
                    let minTime = 700;
                    let maxTime = 1800;

                    if (hasBolo) {
                        // BOLO: usa Janela de Pedidos do admin (07:00-18:00)
                        const orderWindowStart = (window.storeConfig?.order_window_start || '07:00').replace(':', '');
                        const orderWindowEnd = (window.storeConfig?.order_window_end || '18:00').replace(':', '');
                        minTime = parseInt(orderWindowStart, 10) || 700;
                        maxTime = parseInt(orderWindowEnd, 10) || 1800;
                    } else {
                        // SEM BOLO: usa businessHours (horário comercial normal)
                        try {
                            const [y, m, d] = orderDateStr.split('-').map(Number);
                            const dateObj = new Date(y, m - 1, d);
                            const dayOfWeek = dateObj.getDay();
                            const rules = (window.businessHours || []).find(b => b.day_of_week === dayOfWeek);

                            if (rules && rules.is_open) {
                                const openStr = (rules.open_time || '14:00').replace(':', '');
                                const closeStr = (rules.close_time || '18:00').replace(':', '');
                                minTime = parseInt(openStr, 10);
                                maxTime = parseInt(closeStr, 10);
                            } else {
                                minTime = 1400;
                                maxTime = 1800;
                            }
                        } catch (e) {
                            console.warn('[Checkout] Erro ao calcular horário dinâmico:', e);
                            minTime = 1400;
                            maxTime = 1800;
                        }
                    }

                    if (timeNum < minTime || timeNum > maxTime) {
                        const tipo = delivery && delivery.value === 'entrega' ? 'entrega' : 'retirada';
                        const minStr = String(minTime).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');
                        const maxStr = String(maxTime).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');
                        this.showWarning(`Para ${tipo} nesta data, o horário permitido é das ${minStr} às ${maxStr}.`);
                        return;
                    }
                    
                    // Regra da manhã: se NÃO tem bolo, valida valor mínimo antes das 14h
                    if (!hasBolo && window.isOrderAllowedAtTime) {
                        const tVal = window.isOrderAllowedAtTime(orderTimeSlot, window.cartTotal, window.cart);
                        if (!tVal.allowed) { this.showWarning(tVal.reason); return; }
                    }
                }
            }

            console.log('[Checkout] Step 2: Generating code...');
            // 2. Generate Order Data
            const codes = await window.generateOrderCode();
            const orderCode = codes.code;
            const orderSequence = codes.sequence;
            const orderId = Date.now();

            console.log('[Checkout] Step 3: Building message...');
            // 3. Build WhatsApp Message & Calculate Discounts
            const construction = await this.buildOrderMessageAndData({
                customerName, customerPhone, payment, delivery, orderCode, orderSequence, orderId, orderDateStr, orderTimeSlot
            });

            console.log('[Checkout] Step 3 Done. Data:', construction);
            const { msg, orderData, hasBirthdayDiscount, birthdayDiscount } = construction;

            console.log('[Checkout] Step 4: Payment checks...');
            // 4. Check for "No Change" Confirmation (Cash Payment)
            const moneyChangeValue = document.getElementById('moneyChangeValue')?.value;
            // Check if payment is Dinheiro and Change is EMPTY or ZERO
            if (payment.value === 'dinheiro' && (!moneyChangeValue || parseFloat(moneyChangeValue) <= 0)) {
                console.log('[Checkout] Opening confirmation modal for no change...');
                document.getElementById('confirmationModalTitle').textContent = 'Confirmar Troco';
                document.getElementById('confirmationModalText').textContent = 'Você não informou valor para troco. O entregador não levará troco. Deseja confirmar?';

                const modal = document.getElementById('confirmationModal');
                if (modal) {
                    modal.classList.remove('hidden');
                    console.log('[Checkout] Modal class removed (hidden).');

                    this.onConfirmationConfirm = () => {
                        console.log('[Checkout] Confirmation received. Proceeding...');
                        this.handleBirthdayOrExecute(orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount);
                    };
                    return;
                } else {
                    console.error('[Checkout] confirmationModal not found in DOM!');
                    alert('Erro interno: Modal de confirmação não encontrado.');
                }
            }

            console.log('[Checkout] Proceeding to execution...');
            // Proceed normally
            this.handleBirthdayOrExecute(orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount);

        } catch (err) {
            console.error('[Checkout] CRITICAL ERROR IN FINALIZE:', err);
            alert('Ocorreu um erro ao processar seu pedido. Veja o console para detalhes.');
        }
    },

    handleBirthdayOrExecute: function (orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount) {
        // Check if client needs birthday registration
        const clientForBirthday = window.clients.find(c => c.phone === customerPhone);
        const needsBirthdayRegistration = !clientForBirthday || !clientForBirthday.birthdate || clientForBirthday.birthdate === '' ||
            (window.getBrasiliaDate && clientForBirthday.birthdate === window.formatYYYYMMDD(window.getBrasiliaDate()));

        if (needsBirthdayRegistration) {
            // Store pending state for modal
            this.pendingOrderData = orderData;
            this.pendingWhatsAppMessage = msg;
            this.showBirthdayModal();
        } else {
            // Proceed directly
            this.executeOrder(orderData, msg, customerPhone, hasBirthdayDiscount, birthdayDiscount);
        }
    },

    // Helper: Build Message (Complex Logic Extracted)
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
            const price = i.price; // Cart price includes promo
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
            if (i.note) msg += `   📝 Obs: ${i.note}\n`;
        });

        let clientDiscount = 0;
        let birthdayDiscount = 0;
        let hasBirthdayDiscount = false;

        // Apply external discounts ONLY if no promo items
        if (!hasPromoItems) {
            // Loyalty / Special
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

            // Birthday
            if (window.BirthdayDiscountService && window.isBirthdayDiscountValid && window.calculateBirthdayDiscount) {
                const bConfig = await window.BirthdayDiscountService.getConfig();
                const client = window.clients.find(c => c.phone === ctx.customerPhone);
                if (bConfig && bConfig.active && client && window.isBirthdayDiscountValid(client.birthdate)) {
                    // Check usage
                    const used = await window.checkBirthdayDiscountUsed(ctx.customerPhone);
                    if (!used) {
                        birthdayDiscount = window.calculateBirthdayDiscount(Math.max(0, cartTotalWithPromo));
                        birthdayDiscount = Math.min(birthdayDiscount, cartTotalWithPromo);
                        if (birthdayDiscount > 0) {
                            hasBirthdayDiscount = true;
                            clientDiscount = 0; // Don't accumulate
                        }
                    }
                }
            }
        }

        // Fees
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

        // Coupon
        let couponDiscount = 0;
        let appliedCode = null;
        if (window.appliedCoupon && !hasPromoItems && birthdayDiscount <= 0) {
            // Re-verify coupon logic
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
            if (ch > 0) msg += `*Troco para:* R$ ${ch.toFixed(2).replace('.', ',')}\n`;
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

        // Handle Schedule
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
            subtotal: window.cartTotal, // Base subtotal
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
        // 1. WhatsApp Redirect
        const number = '5573999366554';
        const url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win || win.closed || typeof win.closed === 'undefined') {
            window.location.href = url;
        }

        // 2. Save Client
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

        // 6. Background Saves
        if (window.saveOrderToSupabase) window.saveOrderToSupabase(orderData).catch(e => console.warn('Supabase Error:', e));
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
            // Find and update client
            const clientIndex = window.clients.findIndex(c => c.phone === customerPhone);
            if (clientIndex !== -1) {
                window.clients[clientIndex].birthdate = birthdayDate;
                if (window.saveClients) window.saveClients(); // Persist to local/supabase
            }

            // Check if discount applies NOW (for next time? or valid for this one? 
            // Original code didn't re-apply discount instantly, just saved date.)
            // But if it IS valid, maybe we should offer it? 
            // For now, mirroring original behavior: Just save and send.

            // Update pending order data with birthdate for backend?
            // The order payload doesn't carry client birthdate, only client_phone.
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
