// ===== Flow Money - JavaScript =====

document.addEventListener('DOMContentLoaded', function() {
    // ===== Variables =====
    const header = document.querySelector('.header');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-menu a');

    // ===== Currencies Data =====
    const currencies = [
        { code: 'USD', name: 'Dólar estadounidense', flag: '🇺🇸', rate: 1 },
        { code: 'EUR', name: 'Euro', flag: '🇪🇺', rate: 0.92 },
        { code: 'MXN', name: 'Peso mexicano', flag: '🇲🇽', rate: 17.25 },
        { code: 'ARS', name: 'Peso argentino', flag: '🇦🇷', rate: 875.50 },
        { code: 'COP', name: 'Peso colombiano', flag: '🇨🇴', rate: 3950.00 },
        { code: 'CLP', name: 'Peso chileno', flag: '🇨🇱', rate: 885.00 },
        { code: 'PEN', name: 'Sol peruano', flag: '🇵🇪', rate: 3.72 },
        { code: 'BRL', name: 'Real brasileño', flag: '🇧🇷', rate: 4.97 },
        { code: 'VES', name: 'Bolívar venezolano', flag: '🇻🇪', rate: 36.50 },
        { code: 'UYU', name: 'Peso uruguayo', flag: '🇺🇾', rate: 39.25 },
        { code: 'PYG', name: 'Guaraní paraguayo', flag: '🇵🇾', rate: 7350.00 },
        { code: 'BOB', name: 'Boliviano', flag: '🇧🇴', rate: 6.91 },
        { code: 'PAB', name: 'Balboa panameño', flag: '🇵🇦', rate: 1.00 },
        { code: 'CRC', name: 'Colón costarricense', flag: '🇨🇷', rate: 525.00 },
        { code: 'DOP', name: 'Peso dominicano', flag: '🇩🇴', rate: 58.50 },
        { code: 'GBP', name: 'Libra esterlina', flag: '🇬🇧', rate: 0.79 }
    ];

    // Exchange state
    let sendCurrency = currencies.find(c => c.code === 'USD');
    let receiveCurrency = currencies.find(c => c.code === 'MXN');
    let currentSelector = null; // 'send' or 'receive'

    // ===== Mobile Menu Toggle =====
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });

        // Close menu when clicking a link
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
    }

    // ===== Header scroll effect =====
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            header.style.boxShadow = '0 4px 20px rgba(13, 28, 46, 0.12)';
        } else {
            header.style.boxShadow = '0 2px 8px rgba(13, 28, 46, 0.08)';
        }

        lastScroll = currentScroll;
    });

    // ===== Smooth scroll for anchor links =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');

            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const headerHeight = header.offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ===== Exchange Platform Functionality =====
    const sendAmountInput = document.getElementById('sendAmount');
    const receiveAmountInput = document.getElementById('receiveAmount');
    const sendCurrencyBtn = document.getElementById('sendCurrencyBtn');
    const receiveCurrencyBtn = document.getElementById('receiveCurrencyBtn');
    const sendFlag = document.getElementById('sendFlag');
    const sendCode = document.getElementById('sendCode');
    const receiveFlag = document.getElementById('receiveFlag');
    const receiveCode = document.getElementById('receiveCode');
    const exchangeRateDisplay = document.getElementById('exchangeRate');
    const swapBtn = document.getElementById('swapBtn');
    const exchangeBtn = document.getElementById('exchangeBtn');
    const paymentMethod = document.getElementById('paymentMethod');
    const paymentOptions = document.querySelectorAll('.payment-option');

    // Currency Modal elements
    const currencyModalOverlay = document.getElementById('currencyModalOverlay');
    const currencyModalClose = document.getElementById('currencyModalClose');
    const currencySearch = document.getElementById('currencySearch');
    const currencyList = document.getElementById('currencyList');

    // Confirmation Modal elements
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');
    const modalDownload = document.getElementById('modalDownload');
    const modalSent = document.getElementById('modalSent');
    const modalReceived = document.getElementById('modalReceived');

    // Calculate exchange
    function calculateExchange() {
        const sendAmount = parseFloat(sendAmountInput.value) || 0;
        const rate = receiveCurrency.rate / sendCurrency.rate;
        const receiveAmount = sendAmount * rate;

        receiveAmountInput.value = formatNumber(receiveAmount);
        exchangeRateDisplay.textContent = `1 ${sendCurrency.code} = ${formatNumber(rate)} ${receiveCurrency.code}`;

        // Update P2P offers rates
        updateOffersRates(rate);
    }

    // Format number with commas
    function formatNumber(num) {
        if (num >= 1000) {
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return num.toFixed(2);
    }

    // Update offers rates based on current exchange
    function updateOffersRates(baseRate) {
        const offerRates = document.querySelectorAll('.offer-rate');
        const variations = [1.002, 1.000, 0.998, 1.003];

        offerRates.forEach((el, index) => {
            const variedRate = baseRate * variations[index];
            el.textContent = `${formatNumber(variedRate)} ${receiveCurrency.code}`;
        });
    }

    // Update currency display
    function updateCurrencyDisplay() {
        sendFlag.textContent = sendCurrency.flag;
        sendCode.textContent = sendCurrency.code;
        receiveFlag.textContent = receiveCurrency.flag;
        receiveCode.textContent = receiveCurrency.code;
        calculateExchange();
    }

    // Open currency modal
    function openCurrencyModal(type) {
        currentSelector = type;
        currencyModalOverlay.classList.add('active');
        currencySearch.value = '';
        renderCurrencyList(currencies);
        currencySearch.focus();
    }

    // Close currency modal
    function closeCurrencyModal() {
        currencyModalOverlay.classList.remove('active');
        currentSelector = null;
    }

    // Render currency list
    function renderCurrencyList(currencyArray) {
        currencyList.innerHTML = '';

        currencyArray.forEach(currency => {
            const item = document.createElement('div');
            item.className = 'currency-item';
            item.innerHTML = `
                <span class="flag">${currency.flag}</span>
                <div class="info">
                    <span class="code">${currency.code}</span>
                    <span class="name">${currency.name}</span>
                </div>
            `;

            item.addEventListener('click', () => {
                if (currentSelector === 'send') {
                    sendCurrency = currency;
                } else {
                    receiveCurrency = currency;
                }
                updateCurrencyDisplay();
                closeCurrencyModal();
            });

            currencyList.appendChild(item);
        });
    }

    // Filter currencies
    function filterCurrencies(query) {
        const filtered = currencies.filter(c =>
            c.code.toLowerCase().includes(query.toLowerCase()) ||
            c.name.toLowerCase().includes(query.toLowerCase())
        );
        renderCurrencyList(filtered);
    }

    // Swap currencies
    function swapCurrencies() {
        const temp = sendCurrency;
        sendCurrency = receiveCurrency;
        receiveCurrency = temp;
        updateCurrencyDisplay();
    }

    // Open confirmation modal
    function openConfirmationModal() {
        const sendAmount = parseFloat(sendAmountInput.value) || 0;
        const receiveAmount = receiveAmountInput.value;

        modalSent.textContent = `${formatNumber(sendAmount)} ${sendCurrency.code}`;
        modalReceived.textContent = `${receiveAmount} ${receiveCurrency.code}`;

        modalOverlay.classList.add('active');
    }

    // Close confirmation modal
    function closeConfirmationModal() {
        modalOverlay.classList.remove('active');
    }

    // Event Listeners for Exchange
    if (sendAmountInput) {
        sendAmountInput.addEventListener('input', calculateExchange);
    }

    if (sendCurrencyBtn) {
        sendCurrencyBtn.addEventListener('click', () => openCurrencyModal('send'));
    }

    if (receiveCurrencyBtn) {
        receiveCurrencyBtn.addEventListener('click', () => openCurrencyModal('receive'));
    }

    if (currencyModalClose) {
        currencyModalClose.addEventListener('click', closeCurrencyModal);
    }

    if (currencyModalOverlay) {
        currencyModalOverlay.addEventListener('click', (e) => {
            if (e.target === currencyModalOverlay) {
                closeCurrencyModal();
            }
        });
    }

    if (currencySearch) {
        currencySearch.addEventListener('input', (e) => {
            filterCurrencies(e.target.value);
        });
    }

    if (swapBtn) {
        swapBtn.addEventListener('click', swapCurrencies);
    }

    if (exchangeBtn) {
        exchangeBtn.addEventListener('click', openConfirmationModal);
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeConfirmationModal);
    }

    if (modalDownload) {
        modalDownload.addEventListener('click', closeConfirmationModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeConfirmationModal();
            }
        });
    }

    // Payment method selection
    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            paymentOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            paymentMethod.textContent = option.dataset.method;
        });
    });

    // Initialize exchange
    if (sendAmountInput) {
        calculateExchange();
    }

    // ===== Intersection Observer for animations =====
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const animateOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Elements to animate
    const animateElements = document.querySelectorAll('.step-card, .benefit-item, .security-card, .country-badge, .exchange-card, .p2p-offers');

    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.05}s, transform 0.6s ease ${index * 0.05}s`;
        animateOnScroll.observe(el);
    });

    // Add animation class
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            .animate-in {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        </style>
    `);

    // ===== Stats counter animation =====
    const statsSection = document.querySelector('.hero-stats');
    let statsAnimated = false;

    function animateStats() {
        if (statsAnimated) return;

        const stats = document.querySelectorAll('.stat-number');

        stats.forEach(stat => {
            const text = stat.textContent;
            const hasPlus = text.includes('+');
            const hasM = text.includes('M');
            const hasK = text.includes('K');

            let finalValue = parseFloat(text.replace(/[^0-9.]/g, ''));
            let suffix = '';

            if (hasPlus) suffix += '+';
            if (hasM) suffix = 'M' + suffix;
            if (hasK) suffix = 'K' + suffix;

            let currentValue = 0;
            const increment = finalValue / 50;
            const duration = 2000;
            const stepTime = duration / 50;

            const counter = setInterval(() => {
                currentValue += increment;

                if (currentValue >= finalValue) {
                    currentValue = finalValue;
                    clearInterval(counter);
                }

                if (text.includes('$')) {
                    stat.textContent = '$' + Math.floor(currentValue) + 'M+';
                } else if (hasK) {
                    stat.textContent = Math.floor(currentValue) + 'K+';
                } else {
                    stat.textContent = Math.floor(currentValue) + '+';
                }
            }, stepTime);
        });

        statsAnimated = true;
    }

    // Trigger stats animation when hero is visible
    const heroObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setTimeout(animateStats, 500);
                heroObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    if (statsSection) {
        heroObserver.observe(statsSection);
    }

    // ===== Active nav link on scroll =====
    const sections = document.querySelectorAll('section[id]');

    function highlightNavOnScroll() {
        const scrollY = window.pageYOffset;

        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 100;
            const sectionId = section.getAttribute('id');
            const navLink = document.querySelector(`.nav-menu a[href="#${sectionId}"]`);

            if (navLink) {
                if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                    navLink.classList.add('active');
                } else {
                    navLink.classList.remove('active');
                }
            }
        });
    }

    window.addEventListener('scroll', highlightNavOnScroll);

    // Add active link styles
    document.head.insertAdjacentHTML('beforeend', `
        <style>
            .nav-menu a.active {
                color: var(--turquoise);
            }
            .nav-menu a.active::after {
                width: 100%;
            }
        </style>
    `);

    // ===== Parallax effect on hero image =====
    const heroImage = document.querySelector('.hero-image img');

    if (heroImage) {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const heroSection = document.querySelector('.hero');
            const heroHeight = heroSection.offsetHeight;

            if (scrolled < heroHeight) {
                heroImage.style.transform = `translateY(${scrolled * 0.1}px)`;
            }
        });
    }

    // ===== Keyboard navigation for modals =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (currencyModalOverlay && currencyModalOverlay.classList.contains('active')) {
                closeCurrencyModal();
            }
            if (modalOverlay && modalOverlay.classList.contains('active')) {
                closeConfirmationModal();
            }
        }
    });

    // ===== Simulate real-time rate updates =====
    function simulateRateUpdate() {
        const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
        currencies.forEach(currency => {
            if (currency.code !== 'USD') {
                currency.rate = currency.rate * (1 + variation);
            }
        });

        if (sendAmountInput && sendAmountInput.value) {
            calculateExchange();
        }
    }

    // Update rates every 30 seconds
    setInterval(simulateRateUpdate, 30000);

    // ===== Click on P2P offers =====
    const offerCards = document.querySelectorAll('.offer-card');
    offerCards.forEach(card => {
        card.addEventListener('click', function() {
            // Highlight selected offer
            offerCards.forEach(c => c.style.background = 'rgba(255, 255, 255, 0.05)');
            this.style.background = 'rgba(0, 196, 204, 0.2)';

            // Update exchange rate based on offer
            const offerRate = this.querySelector('.offer-rate').textContent;
            const rateValue = parseFloat(offerRate.replace(/[^0-9.]/g, ''));

            if (rateValue) {
                const sendAmount = parseFloat(sendAmountInput.value) || 0;
                const receiveAmount = sendAmount * rateValue;
                receiveAmountInput.value = formatNumber(receiveAmount);
                exchangeRateDisplay.textContent = `1 ${sendCurrency.code} = ${formatNumber(rateValue)} ${receiveCurrency.code}`;
            }
        });
    });

    console.log('Flow Money website loaded successfully!');
});
