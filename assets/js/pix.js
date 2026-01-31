// ========================================
// PIX PAYLOAD SERVICE (BR Code Generator)
// ========================================
// Dependências: storeConfig (global)

const PixPayloadService = {
  // CRC16 CCITT-FALSE calculation for PIX
  crc16: function (str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  },

  // Format EMV field: 2-digit ID + 2-digit length + value
  formatField: function (id, value) {
    const len = value.length.toString().padStart(2, '0');
    return id + len + value;
  },

  // Remove accents and special chars for PIX compatibility
  removeAccents: function (str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '')
      .toUpperCase()
      .trim();
  },

  // Check if PIX is properly configured
  isConfigured: function () {
    const key = storeConfig?.pix_key;
    const name = storeConfig?.pix_merchant_name;
    return !!(key && key.trim() && name && name.trim());
  },

  // Generate EMV/BR Code payload
  generate: function (params) {
    try {
      if (!params.pixKey || !params.merchantName) {
        console.warn('[PIX] Missing required params (pixKey, merchantName)');
        return null;
      }

      const merchantName = this.removeAccents(params.merchantName).substring(0, 25);
      const merchantCity = this.removeAccents(params.merchantCity || 'CIDADE').substring(0, 15);

      // Format amount as XX.XX (exactly 2 decimal places)
      const amount = params.amount ? params.amount.toFixed(2) : null;
      const txid = params.txid ? params.txid.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 25) : '';

      // Build Merchant Account Information (ID 26)
      let merchantAcct = '';
      merchantAcct += this.formatField('00', 'BR.GOV.BCB.PIX'); // GUI
      merchantAcct += this.formatField('01', params.pixKey); // Chave PIX

      // Build Additional Data Field (ID 62)
      let additionalData = '';
      if (txid) {
        additionalData += this.formatField('05', txid); // Reference Label (TXID)
      }

      // Build main payload
      let payload = '';
      payload += this.formatField('00', '01'); // Payload Format Indicator
      payload += this.formatField('01', '12'); // Point of Initiation (12 = dynamic/single use)
      payload += this.formatField('26', merchantAcct); // Merchant Account Info
      payload += this.formatField('52', '0000'); // Merchant Category Code
      payload += this.formatField('53', '986'); // Transaction Currency (BRL)

      if (amount) {
        payload += this.formatField('54', amount); // Transaction Amount
      }

      payload += this.formatField('58', 'BR'); // Country Code
      payload += this.formatField('59', merchantName); // Merchant Name
      payload += this.formatField('60', merchantCity); // Merchant City

      if (additionalData) {
        payload += this.formatField('62', additionalData); // Additional Data
      }

      // Add CRC16 placeholder
      payload += '6304';

      // Calculate and append CRC16
      const crc = this.crc16(payload);
      payload = payload.slice(0, -4) + this.formatField('63', crc);

      return payload;
    } catch (e) {
      console.error('[PIX] Error generating payload:', e);
      return null;
    }
  },

  // Generate PIX payload for order (50% of total)
  generateForOrder: function (order) {
    if (!this.isConfigured()) {
      console.log('[PIX] Not configured, skipping payload generation');
      return null;
    }

    const halfAmount = Math.round((order.total || 0) * 50) / 100; // 50%, rounded to 2 decimals
    const orderCode = (order.order_code || 'FAST' + order.id).replace(/[^A-Za-z0-9]/g, '');

    return this.generate({
      pixKey: storeConfig.pix_key,
      merchantName: storeConfig.pix_merchant_name,
      merchantCity: storeConfig.pix_merchant_city || 'CIDADE',
      amount: halfAmount,
      txid: orderCode
    });
  }
};

// Expose globally
window.PixPayloadService = PixPayloadService;
