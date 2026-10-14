// ===== Flow Money - Lógica del dashboard =====

const FLAGS = {
    USD: '🇺🇸', EUR: '🇪🇺', MXN: '🇲🇽', ARS: '🇦🇷',
    COP: '🇨🇴', CLP: '🇨🇱', PEN: '🇵🇪', VES: '🇻🇪'
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
    renderKycBadge();

    const recipientSelect = document.getElementById('recipient');
    recipientSelect.innerHTML = users
        .map(u => `<option value="${u.username}">${u.name} (@${u.username})</option>`)
        .join('');

    const currencyOptions = Object.keys(state.rates)
        .map(code => `<option value="${code}">${FLAGS[code] || ''} ${code}</option>`)
        .join('');
    document.getElementById('fromCurrency').innerHTML = currencyOptions;
    document.getElementById('toCurrency').innerHTML = currencyOptions;
    document.getElementById('ordGiveCurrency').innerHTML = currencyOptions;
    document.getElementById('ordWantCurrency').innerHTML = currencyOptions;

    // Monedas por defecto: primera con saldo para enviar, CLP para recibir
    const firstWithBalance = Object.keys(user.balances).find(c => user.balances[c] > 0) || 'USD';
    document.getElementById('fromCurrency').value = firstWithBalance;
    document.getElementById('toCurrency').value = 'CLP';
    document.getElementById('ordGiveCurrency').value = firstWithBalance;
    document.getElementById('ordWantCurrency').value = 'CLP';

    applyPendingExchange();
    renderBalances();
    updateConversion();
    updateOrderConversion();
}

// Si el usuario viene de la landing con un intercambio pendiente, pre-llenar el formulario de oferta P2P
function applyPendingExchange() {
    const raw = sessionStorage.getItem('pendingExchange');
    if (!raw) return;
    sessionStorage.removeItem('pendingExchange');

    try {
        const p = JSON.parse(raw);
        if (state.rates[p.from]) document.getElementById('ordGiveCurrency').value = p.from;
        if (state.rates[p.to]) document.getElementById('ordWantCurrency').value = p.to;
        if (p.amount > 0) document.getElementById('ordAmount').value = p.amount;
        updateOrderConversion();
        document.getElementById('p2pPanel').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('ordAmount').focus({ preventScroll: true });
        showToast('Tu intercambio está listo: confirma y publica la oferta en el Mercado P2P');
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

// ===== Mercado P2P =====
function updateOrderConversion() {
    const amount = parseFloat(document.getElementById('ordAmount').value) || 0;
    const give = document.getElementById('ordGiveCurrency').value;
    const want = document.getElementById('ordWantCurrency').value;

    if (!state.rates || !give || !want || !state.user) return;

    const market = amount * (state.rates[want] / state.rates[give]);
    const net = market * (1 - 0.0075);
    const balance = state.user.balances[give] || 0;

    document.getElementById('ordReceive').value = net
        ? net.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
    document.getElementById('ordRateHint').textContent =
        `Al cambio del día, menos la comisión del 0,75 %. Quien acepte pagará ${market ? market.toLocaleString('es-CL', { maximumFractionDigits: 2 }) : '0'} ${want}`;
    document.getElementById('ordGiveHint').textContent = `Disponible: ${fmt(balance, give)} (quedará en custodia escrow)`;
}

function orderBadge(o) {
    if (o.status === 'open') return '<span class="order-badge badge-escrow">🔒 Fondos en custodia escrow</span>';
    if (o.status === 'completed') return '<span class="order-badge badge-done">✓ Completada</span>';
    return '<span class="order-badge badge-cancelled">Cancelada</span>';
}

// Sello AML: la orden (y sus transacciones) llevan el origen de fondos declarado
function amlBadge(hasOrigin) {
    return hasOrigin ? '<span class="order-badge badge-aml">AML ✓ Origen declarado</span>' : '';
}

// ===== KYC: badge de identidad en el header =====
const DOC_LABELS = { dni: 'DNI', pasaporte: 'Pasaporte', licencia: 'Licencia' };

function renderKycBadge() {
    const badge = document.getElementById('kycBadge');
    const kyc = state.user.kyc;
    // Solo cuentas registradas reales (flujo QR con documento): las seed son demo
    if (!kyc || kyc.simulated) { badge.hidden = true; return; }

    const docLabel = DOC_LABELS[kyc.docType] || kyc.docType || '';
    badge.hidden = false;

    if (kyc.status === 'verified') {
        badge.className = 'kyc-badge kyc-verified';
        badge.innerHTML = (kyc.image ? `<img class="kyc-thumb" src="${kyc.image}" alt="Documento de identidad">` : '')
            + `✓ Identidad verificada${docLabel ? ` (${docLabel})` : ''}`;
        badge.title = kyc.image ? 'Clic para ver el documento' : '';
        badge.onclick = kyc.image
            ? () => {
                document.getElementById('docModalImg').src = kyc.image;
                document.getElementById('docModal').hidden = false;
            }
            : null;
    } else {
        badge.className = 'kyc-badge kyc-pending';
        badge.textContent = '⏳ Verificación pendiente';
        badge.onclick = null;
    }
}

async function loadOrders() {
    const { open, mine } = await api('/api/orders');

    const openList = document.getElementById('openOrders');
    if (!open.length) {
        openList.innerHTML = '<p class="tx-empty">No hay ofertas abiertas de otros usuarios</p>';
    } else {
        openList.innerHTML = open.map(o => `
            <div class="order-item" data-order="${o.id}">
                <div class="order-details">
                    <strong>${o.makerName} entrega ${fmt(o.giveAmount, o.giveCurrency)}</strong>
                    <span class="order-sub">Tú pagas ${fmt(o.takerPay, o.wantCurrency)} y recibes ${fmt(o.takerReceive, o.giveCurrency)}</span>
                    ${orderBadge(o)} ${amlBadge(o.fundOrigin)}
                </div>
                <button class="btn-accept" data-accept="${o.id}">Aceptar</button>
            </div>
        `).join('');
    }

    const myList = document.getElementById('myOrders');
    if (!mine.length) {
        myList.innerHTML = '<p class="tx-empty">Aún no has publicado ni aceptado ofertas</p>';
    } else {
        myList.innerHTML = mine.map(o => {
            const isMaker = o.maker === state.user.username;
            const title = isMaker
                ? `Ofreces ${fmt(o.giveAmount, o.giveCurrency)} por ${o.wantCurrency}`
                : `Aceptaste la oferta de ${o.makerName}`;
            const sub = o.status === 'completed'
                ? (isMaker
                    ? `Recibiste ${fmt(o.makerReceive, o.wantCurrency)} de ${o.takerName}`
                    : `Pagaste ${fmt(o.takerPay, o.wantCurrency)} y recibiste ${fmt(o.takerReceive, o.giveCurrency)}`)
                : `Recibirás ${fmt(o.makerReceive, o.wantCurrency)} al completarse`;
            const cancelBtn = (isMaker && o.status === 'open')
                ? `<button class="btn-cancel-order" data-cancel="${o.id}">Cancelar</button>`
                : '';
            return `
                <div class="order-item order-${o.status}" data-order="${o.id}">
                    <div class="order-details">
                        <strong>${title}</strong>
                        <span class="order-sub">${sub}</span>
                        ${orderBadge(o)} ${amlBadge(o.fundOrigin)}
                    </div>
                    ${cancelBtn}
                </div>
            `;
        }).join('');
    }
}

document.getElementById('ordAmount').addEventListener('input', updateOrderConversion);
document.getElementById('ordGiveCurrency').addEventListener('change', updateOrderConversion);
document.getElementById('ordWantCurrency').addEventListener('change', updateOrderConversion);

// ===== AML: modal de declaración de origen de fondos antes de publicar =====
document.getElementById('orderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('ordError');
    const successBox = document.getElementById('ordSuccess');
    errorBox.textContent = '';
    successBox.textContent = '';

    const give = document.getElementById('ordGiveCurrency').value;
    const want = document.getElementById('ordWantCurrency').value;
    const amount = parseFloat(document.getElementById('ordAmount').value);

    if (!isFinite(amount) || amount <= 0) {
        errorBox.textContent = 'Monto no válido';
        return;
    }
    if (give === want) {
        errorBox.textContent = 'Elige dos monedas distintas';
        return;
    }

    // Abrir la declaración AML; la publicación real ocurre al confirmarla
    document.getElementById('amlOrigin').value = '';
    document.getElementById('amlDeclare').checked = false;
    document.getElementById('amlError').textContent = '';
    document.getElementById('amlModal').hidden = false;
});

document.getElementById('amlCancel').addEventListener('click', () => {
    document.getElementById('amlModal').hidden = true;
});

document.getElementById('amlConfirm').addEventListener('click', async () => {
    const amlError = document.getElementById('amlError');
    const fundOrigin = document.getElementById('amlOrigin').value;
    const declared = document.getElementById('amlDeclare').checked;

    if (!fundOrigin) {
        amlError.textContent = 'Selecciona el origen de los fondos';
        return;
    }
    if (!declared) {
        amlError.textContent = 'Debes declarar que los fondos provienen de actividades lícitas';
        return;
    }

    const errorBox = document.getElementById('ordError');
    const successBox = document.getElementById('ordSuccess');
    const btn = document.getElementById('amlConfirm');
    amlError.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Publicando...';

    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                giveCurrency: document.getElementById('ordGiveCurrency').value,
                wantCurrency: document.getElementById('ordWantCurrency').value,
                amount: parseFloat(document.getElementById('ordAmount').value),
                fundOrigin
            })
        });
        const json = await res.json();

        if (!res.ok) {
            document.getElementById('amlModal').hidden = true;
            errorBox.textContent = json.error || 'Error al publicar la oferta';
        } else {
            const o = json.order;
            document.getElementById('amlModal').hidden = true;
            successBox.textContent = `✓ Oferta publicada: ${fmt(o.giveAmount, o.giveCurrency)} en custodia escrow, esperando contraparte`;
            document.getElementById('ordAmount').value = '';
            state.user.balances = json.balances;
            renderBalances();
            updateOrderConversion();
            await loadOrders();
        }
    } catch (err) {
        document.getElementById('amlModal').hidden = true;
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar y publicar oferta';
    }
});

// Delegación: botones Aceptar / Cancelar de las listas de órdenes
document.getElementById('p2pPanel').addEventListener('click', async (e) => {
    const acceptId = e.target.dataset && e.target.dataset.accept;
    const cancelId = e.target.dataset && e.target.dataset.cancel;
    if (!acceptId && !cancelId) return;

    const url = acceptId ? `/api/orders/${acceptId}/accept` : `/api/orders/${cancelId}/cancel`;
    try {
        const res = await fetch(url, { method: 'POST' });
        const json = await res.json();

        if (!res.ok) {
            showToast(`⚠️ ${json.error || 'No se pudo completar la operación'}`);
        } else {
            if (acceptId) {
                const o = json.order;
                showToast(`✓ Intercambio completado: pagaste ${fmt(o.takerPay, o.wantCurrency)} y recibiste ${fmt(o.takerReceive, o.giveCurrency)}`);
            } else {
                showToast('Oferta cancelada: el escrow devolvió tus fondos');
            }
            state.user.balances = json.balances;
            renderBalances();
            updateOrderConversion();
            await Promise.all([loadOrders(), loadTransactions()]);
        }
    } catch (err) {
        showToast('⚠️ No se pudo conectar con el servidor');
    }
});

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
        incoming.forEach(t => showToast(t.type === 'p2p'
            ? `🔒✓ Intercambio P2P completado: recibiste ${fmt(t.amountReceived, t.currencyReceived)} de ${t.fromName}`
            : `💸 Recibiste ${fmt(t.amountReceived, t.currencyReceived)} de ${t.fromName}`));
    }
    state.lastTxId = newest.id;
    state.firstLoad = false;

    list.innerHTML = transactions.map(t => {
        const isExchange = t.type === 'exchange';
        const isP2p = t.type === 'p2p';
        const isOutgoing = !isExchange && t.from === state.user.username;
        const date = new Date(t.date).toLocaleString('es-CL');
        let title, icon, cssClass;
        if (isExchange) {
            title = 'Intercambio de divisas'; icon = '⇄'; cssClass = 'tx-exchange';
        } else if (isP2p) {
            const other = isOutgoing ? t.toName : t.fromName;
            title = `Intercambio P2P con ${other}`; icon = '⇄'; cssClass = 'tx-exchange';
        } else {
            title = isOutgoing ? `Enviado a ${t.toName}` : `Recibido de ${t.fromName}`;
            icon = isOutgoing ? '↗' : '↙';
            cssClass = isOutgoing ? 'tx-out' : 'tx-in';
        }
        return `
            <div class="tx-item ${cssClass}" data-tx="${t.id}">
                <div class="tx-icon">${icon}</div>
                <div class="tx-details">
                    <strong>${title}</strong>
                    <span class="tx-date">${date}</span>
                    ${isP2p ? amlBadge(t.fundOrigin) : ''}
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
    renderKycBadge();
}

// Cerrar modal del documento KYC
document.getElementById('docModalClose').addEventListener('click', () => {
    document.getElementById('docModal').hidden = true;
});
document.getElementById('docModal').addEventListener('click', (e) => {
    if (e.target.id === 'docModal') e.target.hidden = true;
});

// ===== Polling: mantiene ambos notebooks sincronizados =====
async function poll() {
    try {
        await Promise.all([refreshBalances(), loadTransactions(), loadOrders()]);
    } catch (e) {
        // errores de red puntuales: se reintenta en el próximo ciclo
    }
}

// ===== Eventos =====
document.getElementById('amount').addEventListener('input', updateConversion);
document.getElementById('fromCurrency').addEventListener('change', updateConversion);
document.getElementById('toCurrency').addEventListener('change', updateConversion);

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
        await Promise.all([loadTransactions(), loadOrders()]);
        setInterval(poll, 3000);
    } catch (e) {
        // la redirección a login ya la maneja api()
    }
})();
