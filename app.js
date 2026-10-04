// ===== Flow Money - Lógica del dashboard =====

const FLAGS = {
    USD: '🇺🇸', EUR: '🇪🇺', MXN: '🇲🇽', ARS: '🇦🇷', COP: '🇨🇴', CLP: '🇨🇱',
    PEN: '🇵🇪', BRL: '🇧🇷', VES: '🇻🇪', UYU: '🇺🇾', PYG: '🇵🇾', BOB: '🇧🇴',
    PAB: '🇵🇦', CRC: '🇨🇷', DOP: '🇩🇴', GBP: '🇬🇧'
};

const state = {
    user: null,
    rates: null,
    lastTxId: null,
    firstLoad: true
};

// ===== Utilidades =====
function fmt(num, currency) {
    const n = Number(num) || 0;
    return `${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
}

function initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 5000);
}

async function api(path, options) {
    const res = await fetch(path, options);
    if (res.status === 401) {
        window.location.href = 'login.html';
        throw new Error('No autenticado');
    }
    return res.json();
}

// ===== Carga de datos =====
async function loadSession() {
    const [{ user }, ratesData, { users }] = await Promise.all([
        api('/api/me'),
        api('/api/rates'),
        api('/api/users')
    ]);
    state.user = user;
    state.rates = ratesData.rates;

    document.getElementById('userName').textContent = user.name;
    document.getElementById('userUsername').textContent = '@' + user.username;
    document.getElementById('userAvatar').textContent = initials(user.name);

    const recipientSelect = document.getElementById('recipient');
    recipientSelect.innerHTML = users
        .map(u => `<option value="${u.username}">${u.name} (@${u.username})</option>`)
        .join('');

    const currencyOptions = Object.keys(state.rates)
        .map(code => `<option value="${code}">${FLAGS[code] || ''} ${code}</option>`)
        .join('');
    document.getElementById('fromCurrency').innerHTML = currencyOptions;
    document.getElementById('toCurrency').innerHTML = currencyOptions;
    document.getElementById('exFromCurrency').innerHTML = currencyOptions;
    document.getElementById('exToCurrency').innerHTML = currencyOptions;

    // Monedas por defecto: primera con saldo para enviar, CLP para recibir
    const firstWithBalance = Object.keys(user.balances).find(c => user.balances[c] > 0) || 'USD';
    document.getElementById('fromCurrency').value = firstWithBalance;
    document.getElementById('toCurrency').value = 'CLP';
    document.getElementById('exFromCurrency').value = firstWithBalance;
    document.getElementById('exToCurrency').value = 'CLP';

    applyPendingExchange();
    renderBalances();
    updateConversion();
    updateExchangeConversion();
}

// Si el usuario viene de la landing con un intercambio pendiente, pre-llenar el formulario
function applyPendingExchange() {
    const raw = sessionStorage.getItem('pendingExchange');
    if (!raw) return;
    sessionStorage.removeItem('pendingExchange');

    try {
        const p = JSON.parse(raw);
        if (state.rates[p.from]) document.getElementById('exFromCurrency').value = p.from;
        if (state.rates[p.to]) document.getElementById('exToCurrency').value = p.to;
        if (p.amount > 0) document.getElementById('exAmount').value = p.amount;
        document.getElementById('exchangePanel').scrollIntoView({ behavior: 'smooth' });
        showToast('Completa tu intercambio y confírmalo aquí');
    } catch (e) { /* dato corrupto: se ignora */ }
}

function renderBalances() {
    const grid = document.getElementById('balancesGrid');
    const entries = Object.entries(state.user.balances).sort((a, b) => a[0].localeCompare(b[0]));

    grid.innerHTML = entries.map(([currency, amount]) => `
        <div class="balance-card">
            <span class="balance-flag">${FLAGS[currency] || '💱'}</span>
            <div class="balance-info">
                <span class="balance-amount">${fmt(amount)}</span>
                <span class="balance-currency">${currency}</span>
            </div>
        </div>
    `).join('');

    updateFromHint();
    updateExchangeConversion();
}

function updateFromHint() {
    const from = document.getElementById('fromCurrency').value;
    const balance = state.user.balances[from] || 0;
    document.getElementById('fromBalanceHint').textContent = `Disponible: ${fmt(balance, from)}`;
}

function updateConversion() {
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const from = document.getElementById('fromCurrency').value;
    const to = document.getElementById('toCurrency').value;

    if (!state.rates || !from || !to) return;

    const rate = state.rates[to] / state.rates[from];
    const received = amount * rate;

    document.getElementById('receivedAmount').value = received
        ? received.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
    document.getElementById('rateHint').textContent = `1 ${from} = ${rate.toLocaleString('es-CL', { maximumFractionDigits: 4 })} ${to}`;
    updateFromHint();
}

// ===== Intercambio de divisas propias =====
function updateExchangeConversion() {
    const amount = parseFloat(document.getElementById('exAmount').value) || 0;
    const from = document.getElementById('exFromCurrency').value;
    const to = document.getElementById('exToCurrency').value;

    if (!state.rates || !from || !to || !state.user) return;

    const rate = state.rates[to] / state.rates[from];
    const received = amount * rate;
    const balance = state.user.balances[from] || 0;

    document.getElementById('exReceived').value = received
        ? received.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
    document.getElementById('exRateHint').textContent = `1 ${from} = ${rate.toLocaleString('es-CL', { maximumFractionDigits: 4 })} ${to}`;
    document.getElementById('exFromHint').textContent = `Disponible: ${fmt(balance, from)}`;
}

async function loadTransactions() {
    const { transactions } = await api('/api/transactions');
    const list = document.getElementById('txList');

    if (!transactions.length) {
        list.innerHTML = '<p class="tx-empty">Aún no hay movimientos</p>';
        state.lastTxId = null;
        return;
    }

    // Notificar transferencias recibidas nuevas
    const newest = transactions[0];
    if (!state.firstLoad && state.lastTxId && newest.id !== state.lastTxId) {
        const incoming = transactions.filter(t => t.type !== 'exchange' && t.to === state.user.username &&
            (!state.lastTxId || !document.querySelector(`[data-tx="${t.id}"]`)));
        incoming.forEach(t => showToast(`💸 Recibiste ${fmt(t.amountReceived, t.currencyReceived)} de ${t.fromName}`));
    }
    state.lastTxId = newest.id;
    state.firstLoad = false;

    list.innerHTML = transactions.map(t => {
        const isExchange = t.type === 'exchange';
        const isOutgoing = !isExchange && t.from === state.user.username;
        const date = new Date(t.date).toLocaleString('es-CL');
        const title = isExchange
            ? 'Intercambio de divisas'
            : (isOutgoing ? `Enviado a ${t.toName}` : `Recibido de ${t.fromName}`);
        const icon = isExchange ? '⇄' : (isOutgoing ? '↗' : '↙');
        return `
            <div class="tx-item ${isExchange ? 'tx-exchange' : (isOutgoing ? 'tx-out' : 'tx-in')}" data-tx="${t.id}">
                <div class="tx-icon">${icon}</div>
                <div class="tx-details">
                    <strong>${title}</strong>
                    <span class="tx-date">${date}</span>
                </div>
                <div class="tx-amounts">
                    <span class="tx-sent">− ${fmt(t.amountSent, t.currencySent)}</span>
                    <span class="tx-received">+ ${fmt(t.amountReceived, t.currencyReceived)}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function refreshBalances() {
    const { user } = await api('/api/me');
    state.user = user;
    renderBalances();
}

// ===== Polling: mantiene ambos notebooks sincronizados =====
async function poll() {
    try {
        await Promise.all([refreshBalances(), loadTransactions()]);
    } catch (e) {
        // errores de red puntuales: se reintenta en el próximo ciclo
    }
}

// ===== Eventos =====
document.getElementById('amount').addEventListener('input', updateConversion);
document.getElementById('fromCurrency').addEventListener('change', updateConversion);
document.getElementById('toCurrency').addEventListener('change', updateConversion);
document.getElementById('exAmount').addEventListener('input', updateExchangeConversion);
document.getElementById('exFromCurrency').addEventListener('change', updateExchangeConversion);
document.getElementById('exToCurrency').addEventListener('change', updateExchangeConversion);

document.getElementById('exchangeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('exError');
    const successBox = document.getElementById('exSuccess');
    const btn = document.getElementById('exBtn');
    errorBox.textContent = '';
    successBox.textContent = '';
    btn.disabled = true;

    try {
        const res = await fetch('/api/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromCurrency: document.getElementById('exFromCurrency').value,
                toCurrency: document.getElementById('exToCurrency').value,
                amount: parseFloat(document.getElementById('exAmount').value)
            })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'Error en el intercambio';
        } else {
            const t = json.transaction;
            successBox.textContent = `✓ Intercambiaste ${fmt(t.amountSent, t.currencySent)} por ${fmt(t.amountReceived, t.currencyReceived)}`;
            document.getElementById('exAmount').value = '';
            state.user.balances = json.balances;
            renderBalances();
            updateConversion();
            updateExchangeConversion();
            await loadTransactions();
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('transferForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('transferError');
    const successBox = document.getElementById('transferSuccess');
    const btn = document.getElementById('transferBtn');
    errorBox.textContent = '';
    successBox.textContent = '';
    btn.disabled = true;

    try {
        const res = await fetch('/api/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: document.getElementById('recipient').value,
                fromCurrency: document.getElementById('fromCurrency').value,
                toCurrency: document.getElementById('toCurrency').value,
                amount: parseFloat(document.getElementById('amount').value)
            })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'Error en la transferencia';
        } else {
            const t = json.transaction;
            successBox.textContent = `✓ Enviaste ${fmt(t.amountSent, t.currencySent)} → ${t.toName} recibió ${fmt(t.amountReceived, t.currencyReceived)}`;
            document.getElementById('amount').value = '';
            state.user.balances = json.balances;
            renderBalances();
            updateConversion();
            await loadTransactions();
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
});

document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('¿Reiniciar todos los saldos y el historial?')) return;
    await fetch('/api/reset', { method: 'POST' });
    state.firstLoad = true;
    await loadSession();
    await loadTransactions();
    showToast('Demo reiniciada: saldos y historial restaurados');
});

// ===== Inicio =====
(async () => {
    try {
        await loadSession();
        await loadTransactions();
        setInterval(poll, 3000);
    } catch (e) {
        // la redirección a login ya la maneja api()
    }
})();
