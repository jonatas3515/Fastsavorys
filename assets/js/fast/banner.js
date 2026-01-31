/**
 * Fast Savory's - Banner Module
 * Gerencia o carrossel de banners promocionais
 */

window.BannerModule = {
    interval: null,
    currentIndex: 0,
    banners: [],

    init: function () {
        console.log('[BannerModule] Initializing...');
        this.loadBanners();

        // Window resize handler for responsiveness if needed
        window.addEventListener('resize', () => {
            // adjust height if needed
        });
    },

    loadBanners: function () {
        // Defines default banners if no DB source yet
        // In future, fetch from Supabase: fast_banners
        this.banners = [
            { id: 1, image: '../assets/img/banner1.png', title: 'Promoção 1', active: true },
            { id: 2, image: '../assets/img/banner2.png', title: 'Promoção 2', active: true }
        ];

        // Check if DB loading is needed
        // For now, check if DOM elements exist and use them as source or render ours
        this.render();
        this.startAutoPlay();
    },

    render: function () {
        const container = document.getElementById('bannerContainer');
        if (!container) return;

        // Clean existing
        container.innerHTML = '';

        // Render Slides
        this.banners.forEach((b, i) => {
            const slide = document.createElement('div');
            slide.className = `absolute inset-0 transition-opacity duration-1000 ease-in-out ${i === 0 ? 'opacity-100' : 'opacity-0'}`;
            slide.style.backgroundImage = `url('${b.image}')`;
            slide.style.backgroundSize = 'cover';
            slide.style.backgroundPosition = 'center';
            slide.dataset.index = i;

            // Optional: Add caption/content
            if (b.title) {
                // slide.innerHTML = `...`;
            }
            container.appendChild(slide);
        });

        // Indicators
        this.renderIndicators();
    },

    renderIndicators: function () {
        const container = document.getElementById('bannerIndicators');
        if (!container) return;

        container.innerHTML = this.banners.map((_, i) => `
            <button 
                onclick="BannerModule.goToSlide(${i})"
                class="w-2 h-2 rounded-full transition-all ${i === 0 ? 'bg-white w-4' : 'bg-white/50 hover:bg-white'}"
                aria-label="Slide ${i + 1}"
            ></button>
        `).join('');
    },

    goToSlide: function (index) {
        const slides = document.querySelectorAll('#bannerContainer > div');
        const indicators = document.querySelectorAll('#bannerIndicators > button');

        if (slides.length === 0) return;

        // Wrap around
        if (index >= slides.length) index = 0;
        if (index < 0) index = slides.length - 1;

        this.currentIndex = index;

        // Update Slides
        slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.remove('opacity-0');
                slide.classList.add('opacity-100');
            } else {
                slide.classList.remove('opacity-100');
                slide.classList.add('opacity-0');
            }
        });

        // Update Indicators
        indicators.forEach((btn, i) => {
            if (i === index) {
                btn.className = 'w-2 h-2 rounded-full transition-all bg-white w-4';
            } else {
                btn.className = 'w-2 h-2 rounded-full transition-all bg-white/50 hover:bg-white';
            }
        });

        // Reset Timer
        this.startAutoPlay();
    },

    next: function () {
        this.goToSlide(this.currentIndex + 1);
    },

    prev: function () {
        this.goToSlide(this.currentIndex - 1);
    },

    startAutoPlay: function () {
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => this.next(), 5000);
    }
};

// Global Expose
// window.BannerModule is already defined by object literal assignment above
