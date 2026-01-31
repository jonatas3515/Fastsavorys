/**
 * Fast Savory's - Ad Banner Module
 * Handles the promotional ad banner displayed at the bottom of the page
 * Different from BannerModule (carousel) - this manages a fixed ad banner
 */

window.AdBannerModule = {
    config: null,
    SESSION_KEY: 'fastBannerClosed',
    _initialized: false,

    // Load banner config from Supabase
    async loadConfig() {
        try {
            const { data, error } = await window.supabaseClient
                .from('fast_banner_config')
                .select('*')
                .eq('store_id', 1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            this.config = data || { enabled: true, image_url: null, link_url: null, alt_text: 'Anuncie aqui' };
            return this.config;
        } catch (e) {
            console.warn('[AdBanner] Error loading config:', e);
            this.config = { enabled: true, image_url: null, link_url: null, alt_text: 'Anuncie aqui' };
            return this.config;
        }
    },

    // Save banner config to Supabase
    async saveConfig(config) {
        try {
            const { error } = await window.supabaseClient
                .from('fast_banner_config')
                .upsert({
                    store_id: 1,
                    image_url: config.image_url || null,
                    link_url: config.link_url || null,
                    alt_text: config.alt_text || 'Anuncie aqui',
                    enabled: config.enabled !== false,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'store_id' });

            if (error) throw error;
            this.config = config;
            return true;
        } catch (e) {
            console.error('[AdBanner] Error saving config:', e);
            return false;
        }
    },

    // Check if banner should be shown (sessionStorage)
    shouldShow() {
        try {
            return !sessionStorage.getItem(this.SESSION_KEY);
        } catch (e) {
            return true; // Show by default if sessionStorage fails
        }
    },

    // Mark banner as closed for this session
    markClosed() {
        try {
            sessionStorage.setItem(this.SESSION_KEY, 'true');
        } catch (e) {
            console.warn('[AdBanner] Could not save close state');
        }
    },

    // Show public banner
    showPublicBanner() {
        if (!this.config || !this.config.enabled || !this.shouldShow()) {
            return;
        }

        const container = document.getElementById('adBannerPublic');
        const image = document.getElementById('adBannerImage');
        const fallback = document.getElementById('adBannerFallback');
        const link = document.getElementById('adBannerLink');

        if (!container) return;

        // Set link URL
        if (link) {
            link.href = this.config.link_url || '#';
        }

        // Check if image URL is valid
        const validImageUrl = (window.isValidImageUrl ? window.isValidImageUrl(this.config.image_url) : !!this.config.image_url);

        if (validImageUrl && image) {
            image.src = this.config.image_url;
            image.alt = this.config.alt_text || 'Publicidade';
            image.classList.remove('hidden');
            fallback.classList.add('hidden');
        } else {
            image.classList.add('hidden');
            fallback.classList.remove('hidden');
        }

        container.classList.remove('hidden');
    },

    // Hide public banner
    hideBanner() {
        const container = document.getElementById('adBannerPublic');
        if (container) {
            container.classList.add('hidden');
        }
        this.markClosed();
    },

    // Admin: Load config into form
    loadAdminForm() {
        if (!this.config) return;

        const enabledEl = document.getElementById('bannerEnabled');
        const imageUrlEl = document.getElementById('bannerImageUrl');
        const linkUrlEl = document.getElementById('bannerLinkUrl');
        const altTextEl = document.getElementById('bannerAltText');
        const previewEl = document.getElementById('bannerImagePreview');
        const previewImgEl = document.getElementById('bannerPreviewImg');

        if (enabledEl) enabledEl.checked = this.config.enabled !== false;
        if (imageUrlEl) imageUrlEl.value = this.config.image_url || '';
        if (linkUrlEl) linkUrlEl.value = this.config.link_url || '';
        if (altTextEl) altTextEl.value = this.config.alt_text || 'Anuncie aqui';

        // Show image preview
        const validPreviewUrl = (window.isValidImageUrl ? window.isValidImageUrl(this.config.image_url) : !!this.config.image_url);
        if (validPreviewUrl && previewEl && previewImgEl) {
            previewImgEl.src = this.config.image_url;
            previewEl.classList.remove('hidden');
        } else if (previewEl) {
            previewEl.classList.add('hidden');
        }

        // Update live preview
        this.updateLivePreview();
    },

    // Admin: Update live preview
    updateLivePreview() {
        const imageUrl = document.getElementById('bannerImageUrl')?.value;
        const altText = document.getElementById('bannerAltText')?.value || 'Anuncie aqui';
        const livePreviewEl = document.getElementById('bannerLivePreview');

        if (!livePreviewEl) return;

        const validImageUrl = (window.isValidImageUrl ? window.isValidImageUrl(imageUrl) : !!imageUrl);
        if (validImageUrl) {
            livePreviewEl.innerHTML = `<img src="${imageUrl}" alt="${altText}" class="mx-auto max-h-20 rounded">`;
        } else {
            livePreviewEl.innerHTML = `
        <p class="text-purple-600 font-medium">${altText}</p>
        <p class="text-xs text-gray-500 mt-1">Configure uma imagem para substituir este placeholder</p>
      `;
        }
    },

    // Admin: Save from form
    async saveFromForm() {
        const config = {
            enabled: document.getElementById('bannerEnabled')?.checked !== false,
            image_url: document.getElementById('bannerImageUrl')?.value || null,
            link_url: document.getElementById('bannerLinkUrl')?.value || null,
            alt_text: document.getElementById('bannerAltText')?.value || 'Anuncie aqui'
        };

        const success = await this.saveConfig(config);

        const msgEl = document.getElementById('bannerAdminMessage');
        if (msgEl) {
            msgEl.textContent = success ? '✅ Configuração salva com sucesso!' : '❌ Erro ao salvar configuração';
            msgEl.className = success
                ? 'mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700'
                : 'mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700';
            msgEl.classList.remove('hidden');
            setTimeout(() => msgEl.classList.add('hidden'), 3000);
        }

        return success;
    },

    // Admin: Image URL change handler
    adminImageUrlChangeHandler() {
        const url = document.getElementById('bannerImageUrl').value;
        const previewEl = document.getElementById('bannerImagePreview');
        const previewImgEl = document.getElementById('bannerPreviewImg');

        const validPreviewUrl = (window.isValidImageUrl ? window.isValidImageUrl(url) : !!url);
        if (validPreviewUrl && previewEl && previewImgEl) {
            previewImgEl.src = url;
            previewEl.classList.remove('hidden');
        } else if (previewEl) {
            previewEl.classList.add('hidden');
        }

        this.updateLivePreview();
    },

    // Initialize banner module
    async init() {
        // Carregar config sempre (pode ter mudado)
        await this.loadConfig();

        // Mostrar banner público
        this.showPublicBanner();

        // Registrar event listeners apenas UMA vez
        if (this._initialized) return;
        this._initialized = true;

        // Public: Close button handler
        document.getElementById('closeBannerBtn')?.addEventListener('click', () => {
            this.hideBanner();
        });

        // Admin: Save button handler
        document.getElementById('saveBannerConfig')?.addEventListener('click', async () => {
            await this.saveFromForm();
        });

        // Admin: Image URL change handler
        document.getElementById('bannerImageUrl')?.addEventListener('input', () => {
            this.adminImageUrlChangeHandler();
        });

        // Admin: Alt text change handler
        document.getElementById('bannerAltText')?.addEventListener('input', () => {
            this.updateLivePreview();
        });

        // Admin: Image upload handler
        document.getElementById('bannerImageUpload')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Convert to base64 for simplicity (or upload to Supabase Storage)
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                document.getElementById('bannerImageUrl').value = base64;
                const previewEl = document.getElementById('bannerImagePreview');
                const previewImgEl = document.getElementById('bannerPreviewImg');
                if (previewEl && previewImgEl) {
                    previewImgEl.src = base64;
                    previewEl.classList.remove('hidden');
                }
                this.updateLivePreview();
            };
            reader.readAsDataURL(file);
        });

        console.log('[AdBanner] Module initialized');
    }
};

// For backward compatibility, also expose as BannerModule if not already defined by carousel module
// The carousel module (banner.js) should be loaded BEFORE this file if both are used
if (!window.BannerModuleAd) {
    window.BannerModuleAd = window.AdBannerModule;
}

console.log('[AdBanner] Module loaded');
