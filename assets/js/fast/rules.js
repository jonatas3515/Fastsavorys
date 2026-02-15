/**
 * Fast Savory's - Rules Module
 * Business logic for opening hours, delivery availability, etc.
 */

window.RulesModule = {
    // Helper function to get current time in Brasília timezone (UTC-3)
    getBrasiliaDate: function () {
        const now = new Date();
        // Brasília is UTC-3 (no daylight saving since 2019)
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const brasiliaOffset = -3 * 60 * 60000; // UTC-3 in milliseconds
        return new Date(utc + brasiliaOffset);
    },

    isOpen: function () {
        // Verificar se a loja foi fechada manualmente hoje (via banco de dados - cache)
        if (window.storeClosedToday) return false;

        const brasilia = this.getBrasiliaDate();
        const d = brasilia.getDay();
        const h = brasilia.getHours();
        const m = brasilia.getMinutes();
        const timeNow = h + m / 60;

        // Check configurable business hours
        const businessHours = window.businessHours || [];
        const todayHours = businessHours.find(bh => bh.day_of_week === d);

        if (todayHours) {
            if (!todayHours.is_open) return false;

            // Parse open/close times
            const [openH, openM] = (todayHours.open_time || '18:00').split(':').map(Number);
            const [closeH, closeM] = (todayHours.close_time || '23:00').split(':').map(Number);

            const openTime = openH + (openM || 0) / 60;
            const closeTime = closeH + (closeM || 0) / 60;

            // Handle overnight
            if (closeTime < openTime) {
                return timeNow >= openTime || timeNow < closeTime;
            }
            return timeNow >= openTime && timeNow < closeTime;
        }

        // Fallback to defaults if no config found (Legacy Logic)
        if (d === 0) return false; // Domingo fechado
        if (d === 5) return timeNow >= 14 && timeNow < 19.5; // Sexta até 19h30
        return timeNow >= 14 && timeNow < 18; // Seg-Qui e Sáb
    },

    // Birthday Logic
    isBirthdayDiscountValid: function (birthdate, config = null) {
        if (!birthdate) return false;
        // Parses YYYY-MM-DD
        const parts = birthdate.split('-');
        if (parts.length !== 3) return false;

        const birthMonth = parseInt(parts[1], 10) - 1; // 0-based
        const birthDay = parseInt(parts[2], 10);

        // Get valid days from config or use default (6)
        const cfg = config || (window.BirthdayDiscountService?.config);
        const validDays = (cfg && cfg.valid_days !== undefined) ? cfg.valid_days : 6;

        const today = new Date(); // Local time ok for comparison
        today.setHours(0, 0, 0, 0);

        const birthdayThisYear = new Date(today.getFullYear(), birthMonth, birthDay);
        birthdayThisYear.setHours(0, 0, 0, 0);

        const diffTime = today.getTime() - birthdayThisYear.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Valid if: today is birthday (diffDays = 0) OR up to validDays after
        if (diffDays >= 0 && diffDays <= validDays) return true;

        // Check last year's birthday (for late December birthdays in early January)
        const birthdayLastYear = new Date(today.getFullYear() - 1, birthMonth, birthDay);
        birthdayLastYear.setHours(0, 0, 0, 0);
        const diffTimeLast = today.getTime() - birthdayLastYear.getTime();
        const diffDaysLast = Math.floor(diffTimeLast / (1000 * 60 * 60 * 24));

        if (diffDaysLast >= 0 && diffDaysLast <= validDays) return true;

        return false;
    },

    calculateBirthdayDiscount: function (subtotal, config = null) {
        // Use dynamic config from BirthdayDiscountService if available
        const cfg = config || (window.BirthdayDiscountService?.config);
        
        if (cfg && cfg.discount_value) {
            if (cfg.discount_type === 'percentage') {
                return subtotal * (cfg.discount_value / 100);
            } else {
                // Fixed discount
                return Math.min(cfg.discount_value, subtotal);
            }
        }
        
        // Fallback to legacy rule: 10% >= R$50, 5% < R$50
        return (subtotal >= 50) ? subtotal * 0.10 : subtotal * 0.05;
    }
};

// Global Exports (Compatibility)
window.getBrasiliaDate = window.RulesModule.getBrasiliaDate;
window.isFastOpen = () => window.RulesModule.isOpen();
window.isBirthdayDiscountValid = window.RulesModule.isBirthdayDiscountValid;
window.calculateBirthdayDiscount = window.RulesModule.calculateBirthdayDiscount;

console.log('[Rules] Module Loaded');
