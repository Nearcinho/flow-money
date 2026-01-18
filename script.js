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
    let currentStep = 1;
    let selectedPaymentMethod = 'bank';
    let rateCountdown = 30;

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
    const rateTimerDisplay = document.getElementById('rateTimer');

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

    // Step elements
    const stepIndicators = document.querySelectorAll('.step-indicator');
    const stepPanels = document.querySelectorAll('.step-panel');
    const nextStepBtn = document.getElementById('nextStepBtn');
    const backToStep1Btn = document.getElementById('backToStep1');
    const nextToStep3Btn = document.getElementById('nextToStep3');
    const backToStep2Btn = document.getElementById('backToStep2');
    const confirmExchangeBtn = document.getElementById('confirmExchangeBtn');

    // Summary elements
    const summarySendAmount = document.getElementById('summarySendAmount');
    const summaryReceiveAmount = document.getElementById('summaryReceiveAmount');
    const summaryRate = document.getElementById('summaryRate');
    const summaryMethod = document.getElementById('summaryMethod');
    const summaryFee = document.getElementById('summaryFee');

    // Payment cards
    const paymentCards = document.querySelectorAll('.payment-card');

    // Calculate exchange
    function calculateExchange() {
        const sendAmount = parseFloat(sendAmountInput.value) || 0;
        const rate = receiveCurrency.rate / sendCurrency.rate;
        const receiveAmount = sendAmount * rate;

        receiveAmountInput.value = formatNumber(receiveAmount);
        if (exchangeRateDisplay) {
            exchangeRateDisplay.textContent = `1 ${sendCurrency.code} = ${formatNumber(rate)} ${receiveCurrency.code}`;
        }

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
        if (sendFlag) sendFlag.textContent = sendCurrency.flag;
        if (sendCode) sendCode.textContent = sendCurrency.code;
        if (receiveFlag) receiveFlag.textContent = receiveCurrency.flag;
        if (receiveCode) receiveCode.textContent = receiveCurrency.code;
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

    // ===== Multi-Step Form Navigation =====
    function goToStep(step) {
        currentStep = step;

        // Update step indicators
        stepIndicators.forEach((indicator, index) => {
            indicator.classList.remove('active', 'completed');
            if (index + 1 < step) {
                indicator.classList.add('completed');
            } else if (index + 1 === step) {
                indicator.classList.add('active');
            }
        });

        // Update step panels
        stepPanels.forEach((panel, index) => {
            panel.classList.remove('active');
            if (index + 1 === step) {
                panel.classList.add('active');
            }
        });

        // Update summary on step 3
        if (step === 3) {
            updateSummary();
        }
    }

    function updateSummary() {
        const sendAmount = parseFloat(sendAmountInput.value) || 0;
        const rate = receiveCurrency.rate / sendCurrency.rate;
        const receiveAmount = sendAmount * rate;

        if (summarySendAmount) {
            summarySendAmount.textContent = `${formatNumber(sendAmount)} ${sendCurrency.code}`;
        }
        if (summaryReceiveAmount) {
            summaryReceiveAmount.textContent = `${formatNumber(receiveAmount)} ${receiveCurrency.code}`;
        }
        if (summaryRate) {
            summaryRate.textContent = `1 ${sendCurrency.code} = ${formatNumber(rate)} ${receiveCurrency.code}`;
        }
        if (summaryMethod) {
            const methodNames = {
                'bank': 'Transferencia Bancaria',
                'card': 'Tarjeta de Crédito/Débito',
                'wallet': 'Wallet Digital',
                'cash': 'Efectivo'
            };
            summaryMethod.textContent = methodNames[selectedPaymentMethod] || 'Transferencia Bancaria';
        }
        if (summaryFee) {
            summaryFee.textContent = '$0.00 USD';
        }
    }

    // Open confirmation modal
    function openConfirmationModal() {
        const sendAmount = parseFloat(sendAmountInput.value) || 0;
        const receiveAmount = receiveAmountInput.value;

        if (modalSent) modalSent.textContent = `${formatNumber(sendAmount)} ${sendCurrency.code}`;
        if (modalReceived) modalReceived.textContent = `${receiveAmount} ${receiveCurrency.code}`;

        modalOverlay.classList.add('active');
    }

    // Close confirmation modal
    function closeConfirmationModal() {
        modalOverlay.classList.remove('active');
    }

    // ===== Rate Timer =====
    function startRateTimer() {
        setInterval(() => {
            rateCountdown--;
            if (rateCountdown <= 0) {
                rateCountdown = 30;
                simulateRateUpdate();
            }
            if (rateTimerDisplay) {
                rateTimerDisplay.textContent = `${rateCountdown}s`;
            }
        }, 1000);
    }

    // ===== Event Listeners =====

    // Exchange amount input
    if (sendAmountInput) {
        sendAmountInput.addEventListener('input', calculateExchange);
    }

    // Currency selection buttons
    if (sendCurrencyBtn) {
        sendCurrencyBtn.addEventListener('click', () => openCurrencyModal('send'));
    }

    if (receiveCurrencyBtn) {
        receiveCurrencyBtn.addEventListener('click', () => openCurrencyModal('receive'));
    }

    // Currency modal
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

    // Swap button
    if (swapBtn) {
        swapBtn.addEventListener('click', swapCurrencies);
    }

    // Step navigation
    if (nextStepBtn) {
        nextStepBtn.addEventListener('click', () => goToStep(2));
    }

    if (backToStep1Btn) {
        backToStep1Btn.addEventListener('click', () => goToStep(1));
    }

    if (nextToStep3Btn) {
        nextToStep3Btn.addEventListener('click', () => goToStep(3));
    }

    if (backToStep2Btn) {
        backToStep2Btn.addEventListener('click', () => goToStep(2));
    }

    if (confirmExchangeBtn) {
        confirmExchangeBtn.addEventListener('click', openConfirmationModal);
    }

    // Payment method selection
    paymentCards.forEach(card => {
        card.addEventListener('click', function() {
            paymentCards.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            selectedPaymentMethod = this.dataset.method;
        });
    });

    // Confirmation modal
    if (modalClose) {
        modalClose.addEventListener('click', closeConfirmationModal);
    }

    if (modalDownload) {
        modalDownload.addEventListener('click', () => {
            closeConfirmationModal();
            // Reset to step 1
            goToStep(1);
            if (sendAmountInput) sendAmountInput.value = '1000';
            calculateExchange();
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeConfirmationModal();
            }
        });
    }

    // Initialize exchange
    if (sendAmountInput) {
        calculateExchange();
        startRateTimer();
    }

    // ===== FAQ Accordion =====
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all other items
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
            });

            // Toggle current item
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // ===== Live Ticker Animation =====
    function initTicker() {
        const tickerWrapper = document.querySelector('.ticker-wrapper');
        if (!tickerWrapper) return;

        // Clone ticker items for seamless loop
        const tickerItems = tickerWrapper.innerHTML;
        tickerWrapper.innerHTML = tickerItems + tickerItems;
    }

    initTicker();

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
    const animateElements = document.querySelectorAll('.step-card, .benefit-item, .security-card, .country-badge, .exchange-card, .p2p-offers, .testimonial-card, .faq-item, .comparison-row');

    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.03}s, transform 0.6s ease ${index * 0.03}s`;
        animateOnScroll.observe(el);
    });

    // ===== Stats counter animation =====
    const statsSection = document.querySelector('.hero-stats-section');
    let statsAnimated = false;

    function animateStats() {
        if (statsAnimated) return;

        const stats = document.querySelectorAll('.stat-number');

        stats.forEach(stat => {
            const text = stat.textContent;
            const hasPlus = text.includes('+');
            const hasM = text.includes('M');
            const hasK = text.includes('K');
            const hasPercent = text.includes('%');

            let finalValue = parseFloat(text.replace(/[^0-9.]/g, ''));
            let suffix = '';

            if (hasPercent) {
                suffix = '%';
            } else {
                if (hasM) suffix = 'M';
                if (hasK) suffix = 'K';
                if (hasPlus) suffix += '+';
            }

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
                } else if (hasPercent) {
                    stat.textContent = currentValue.toFixed(1) + '%';
                } else if (hasK) {
                    stat.textContent = Math.floor(currentValue) + 'K+';
                } else {
                    stat.textContent = Math.floor(currentValue) + '+';
                }
            }, stepTime);
        });

        statsAnimated = true;
    }

    // Trigger stats animation when hero stats section is visible
    const heroStatsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                setTimeout(animateStats, 300);
                heroStatsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    if (statsSection) {
        heroStatsObserver.observe(statsSection);
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

            if (rateValue && sendAmountInput) {
                const sendAmount = parseFloat(sendAmountInput.value) || 0;
                const receiveAmount = sendAmount * rateValue;
                receiveAmountInput.value = formatNumber(receiveAmount);
                if (exchangeRateDisplay) {
                    exchangeRateDisplay.textContent = `1 ${sendCurrency.code} = ${formatNumber(rateValue)} ${receiveCurrency.code}`;
                }
            }
        });
    });

    // ===== Floating notifications animation =====
    function animateNotifications() {
        const notifications = document.querySelectorAll('.notification-bubble');
        notifications.forEach((notification, index) => {
            notification.style.animationDelay = `${index * 1.5}s`;
        });
    }

    animateNotifications();

    console.log('Flow Money website loaded successfully!');
});
