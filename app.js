// ===== Flow Money - Lógica del dashboard =====

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

async function api(path, options, retries = 2) {
    const res = await fetch(path, options);
    if (res.status === 401) {
        // Puede ser un 401 transitorio (servidor despertando): reintenta antes de expulsar
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 1500));
            return api(path, options, retries - 1);
        }
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
    renderProfile();

    const recipientSelect = document.getElementById('recipient');
    recipientSelect.innerHTML = users
        .map(u => `<option value="${u.username}">${u.name} (@${u.username})</option>`)
        .join('');

    const currencyOptions = Object.keys(state.rates)
        .map(code => `<option value="${code}">${code}</option>`)
        .join('');
    document.getElementById('fromCurrency').innerHTML = currencyOptions;
    document.getElementById('toCurrency').innerHTML = currencyOptions;
    document.getElementById('ordGiveCurrency').innerHTML = currencyOptions;
    document.getElementById('ordWantCurrency').innerHTML = currencyOptions;
    document.getElementById('depCurrency').innerHTML = currencyOptions;

    // Monedas por defecto: primera con saldo para enviar, CLP para recibir
    const firstWithBalance = Object.keys(user.balances).find(c => user.balances[c] > 0) || 'EUR';
    document.getElementById('fromCurrency').value = firstWithBalance;
    document.getElementById('toCurrency').value = 'CLP';
    document.getElementById('ordGiveCurrency').value = firstWithBalance;
    document.getElementById('ordWantCurrency').value = 'CLP';

    applyPendingExchange();
    renderBalances();
    updateConversion();
    updateOrderConversion();
    updateSavedCardHint();
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
        switchView('p2p');
        document.getElementById('ordAmount').focus({ preventScroll: true });
        showToast('Tu intercambio está listo: confirma y publica la oferta en el Mercado P2P');
    } catch (e) { /* dato corrupto: se ignora */ }
}

// ===== Navegación por vistas (barra lateral) =====
function switchView(name) {
    document.querySelectorAll('.view-section').forEach(s => {
        s.hidden = s.dataset.view !== name;
    });
    document.querySelectorAll('.sidebar-item').forEach(b => {
        b.classList.toggle('active', b.dataset.view === name);
    });
    document.getElementById('appSidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('appSidebar').classList.toggle('open');
});

function renderBalances() {
    const grid = document.getElementById('balancesGrid');
    const entries = Object.entries(state.user.balances).sort((a, b) => a[0].localeCompare(b[0]));

    grid.innerHTML = entries.map(([currency, amount]) => `
        <div class="balance-card">
            <span class="balance-flag currency-pill">${currency}</span>
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
    if (o.status === 'open') return '<span class="order-badge badge-escrow">Fondos en custodia escrow</span>';
    if (o.status === 'completed') return '<span class="order-badge badge-done">Completada</span>';
    return '<span class="order-badge badge-cancelled">Cancelada</span>';
}

// Sello AML: la orden (y sus transacciones) llevan el origen de fondos declarado
function amlBadge(hasOrigin) {
    return hasOrigin ? '<span class="order-badge badge-aml">AML · Origen declarado</span>' : '';
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
            + `Identidad verificada${docLabel ? ` (${docLabel})` : ''}`;
        badge.title = kyc.image ? 'Clic para ver el documento' : '';
        // Doble protección: sin imagen el badge no es clickeable y el visor nunca abre
        badge.onclick = !kyc.image ? null : () => openDocViewer(kyc.image);
    } else {
        badge.className = 'kyc-badge kyc-pending';
        badge.textContent = 'Verificación pendiente';
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
            successBox.textContent = `Oferta publicada: ${fmt(o.giveAmount, o.giveCurrency)} en custodia escrow, esperando contraparte`;
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
            showToast(json.error || 'No se pudo completar la operación');
        } else {
            if (acceptId) {
                const o = json.order;
                showToast(`Intercambio completado: pagaste ${fmt(o.takerPay, o.wantCurrency)} y recibiste ${fmt(o.takerReceive, o.giveCurrency)}`);
            } else {
                showToast('Oferta cancelada: el escrow devolvió tus fondos');
            }
            state.user.balances = json.balances;
            renderBalances();
            updateOrderConversion();
            await Promise.all([loadOrders(), loadTransactions()]);
        }
    } catch (err) {
        showToast('No se pudo conectar con el servidor');
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

    // Notificar transferencias recibidas nuevas (los depósitos los anuncia loadDeposits)
    const newest = transactions[0];
    if (!state.firstLoad && state.lastTxId && newest.id !== state.lastTxId) {
        const incoming = transactions.filter(t => t.type !== 'exchange' && t.type !== 'deposit' && t.to === state.user.username &&
            (!state.lastTxId || !document.querySelector(`[data-tx="${t.id}"]`)));
        incoming.forEach(t => showToast(t.type === 'p2p'
            ? `Intercambio P2P completado: recibiste ${fmt(t.amountReceived, t.currencyReceived)} de ${t.fromName}`
            : `Recibiste ${fmt(t.amountReceived, t.currencyReceived)} de ${t.fromName}`));
    }
    state.lastTxId = newest.id;
    state.firstLoad = false;

    list.innerHTML = transactions.map(t => {
        const isExchange = t.type === 'exchange';
        const isP2p = t.type === 'p2p';
        const isDeposit = t.type === 'deposit';
        const isOutgoing = !isExchange && !isDeposit && t.from === state.user.username;
        const date = new Date(t.date).toLocaleString('es-CL');
        let title, icon, cssClass;
        if (isExchange) {
            title = 'Intercambio de divisas'; icon = '⇄'; cssClass = 'tx-exchange';
        } else if (isP2p) {
            const other = isOutgoing ? t.toName : t.fromName;
            title = `Intercambio P2P con ${other}`; icon = '⇄'; cssClass = 'tx-exchange';
        } else if (isDeposit) {
            title = t.method === 'card' ? 'Depósito con tarjeta' : 'Transferencia bancaria recibida';
            icon = '+'; cssClass = 'tx-in';
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
                    ${isDeposit ? '' : `<span class="tx-sent">− ${fmt(t.amountSent, t.currencySent)}</span>`}
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

// ===== Añadir dinero =====
const depState = { statuses: {}, firstLoad: true };

// Tarjeta guardada (si existe) como placeholder de ayuda
function updateSavedCardHint() {
    const saved = state.user && state.user.savedCard;
    document.getElementById('depCardNumber').placeholder = saved
        ? `${saved.brand} terminada en •••• ${saved.last4}`
        : '4242 4242 4242 4242';
}

// Formato de los campos de tarjeta
document.getElementById('depCardNumber').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
});

document.getElementById('depCardExp').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
});

document.getElementById('depCardCvv').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

// Selector de método (tarjeta / transferencia)
document.querySelectorAll('.dep-method').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.dep-method').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('cardForm').hidden = btn.dataset.method !== 'card';
        document.getElementById('transferDeposit').hidden = btn.dataset.method !== 'transfer';
    });
});

// Pago con tarjeta (simulado: procesando ~2,5 s y luego acredita)
document.getElementById('cardForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('depCardError');
    const successBox = document.getElementById('depCardSuccess');
    const btn = document.getElementById('depCardBtn');
    errorBox.textContent = '';
    successBox.textContent = '';

    const amount = parseFloat(document.getElementById('depAmount').value);
    if (!isFinite(amount) || amount <= 0) {
        errorBox.textContent = 'Ingresa el monto a cargar';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="kyc-spinner"></span> Conectando con el banco...';
    await new Promise(r => setTimeout(r, 2500));

    try {
        const res = await fetch('/api/deposit/card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount,
                currency: document.getElementById('depCurrency').value,
                cardNumber: document.getElementById('depCardNumber').value,
                name: document.getElementById('depCardName').value,
                exp: document.getElementById('depCardExp').value,
                cvv: document.getElementById('depCardCvv').value,
                saveCard: document.getElementById('depSaveCard').checked
            })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'El pago fue rechazado';
        } else {
            state.user.balances = json.balances;
            if (json.savedCard) { state.user.savedCard = json.savedCard; updateSavedCardHint(); }
            successBox.textContent = `Pago aprobado: se acreditaron ${fmt(json.deposit.amount, json.deposit.currency)} a tu cuenta`;
            document.getElementById('depCardNumber').value = '';
            document.getElementById('depCardExp').value = '';
            document.getElementById('depCardCvv').value = '';
            renderBalances();
            await loadTransactions();
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Pagar';
    }
});

// Depósito por transferencia: genera referencia y queda pendiente
document.getElementById('depTransferBtn').addEventListener('click', async () => {
    const errorBox = document.getElementById('depTransferError');
    const btn = document.getElementById('depTransferBtn');
    errorBox.textContent = '';

    const amount = parseFloat(document.getElementById('depAmount').value);
    if (!isFinite(amount) || amount <= 0) {
        errorBox.textContent = 'Ingresa el monto a cargar';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch('/api/deposit/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, currency: document.getElementById('depCurrency').value })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'No se pudo registrar la transferencia';
        } else {
            document.getElementById('depReference').textContent = json.deposit.reference;
            document.getElementById('depReferenceBox').hidden = false;
            showToast('Transferencia registrada: se acreditará cuando se confirme la recepción');
            await loadDeposits();
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('depCopyRef').addEventListener('click', async () => {
    const ref = document.getElementById('depReference').textContent;
    try {
        await navigator.clipboard.writeText(ref);
        showToast('Referencia copiada');
    } catch (e) {
        showToast(`Referencia: ${ref}`);
    }
});

// Lista de depósitos pendientes + toast cuando uno se confirma
async function loadDeposits() {
    const { deposits } = await api('/api/deposits');

    deposits.forEach(d => {
        const prev = depState.statuses[d.id];
        if (prev === 'pending' && d.status === 'completed') {
            showToast(`Tu transferencia fue recibida: + ${fmt(d.amount, d.currency)}`);
            refreshBalances();
            loadTransactions();
        }
        depState.statuses[d.id] = d.status;
    });
    depState.firstLoad = false;

    const pending = deposits.filter(d => d.status === 'pending');
    const box = document.getElementById('depPendingBox');
    box.hidden = !pending.length;
    document.getElementById('depPending').innerHTML = pending.map(d => `
        <div class="order-item">
            <div class="order-details">
                <strong>${fmt(d.amount, d.currency)} por transferencia</strong>
                <span class="order-sub">Referencia ${d.reference}</span>
                <span class="order-badge badge-escrow">Pendiente de confirmación</span>
            </div>
        </div>
    `).join('');
}

// ===== Mi perfil =====
function renderProfile() {
    const u = state.user;
    if (!u) return;

    document.getElementById('profName').value = u.name || '';
    document.getElementById('profEmail').value = u.email || '';
    document.getElementById('profUsername').value = '@' + u.username;
    document.getElementById('profCountry').value = u.country || '—';
    document.getElementById('profSince').value = u.createdAt
        ? new Date(u.createdAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
        : '—';

    // KYC
    const kyc = u.kyc;
    const box = document.getElementById('profKyc');
    if (!kyc) {
        box.innerHTML = '<p class="tx-empty">Sin información de verificación</p>';
    } else if (kyc.simulated) {
        let seedPersonal = '';
        if (kyc.personal) {
            const p = kyc.personal;
            const OCC = { empleado: 'Empleado', independiente: 'Independiente', empresario: 'Empresario', estudiante: 'Estudiante', otro: 'Otro' };
            seedPersonal = `
                <dl class="profile-kyc-data">
                    <div><dt>N° de documento</dt><dd>${p.docNumber}</dd></div>
                    <div><dt>Fecha de nacimiento</dt><dd>${new Date(p.birthDate + 'T12:00:00').toLocaleDateString('es-CL')}</dd></div>
                    <div><dt>Nacionalidad</dt><dd>${p.nationality}</dd></div>
                    <div><dt>Teléfono</dt><dd>${p.phone}</dd></div>
                    <div><dt>Dirección</dt><dd>${p.address.street}, ${p.address.city} ${p.address.postalCode}</dd></div>
                    <div><dt>Ocupación</dt><dd>${OCC[p.occupation] || p.occupation}</dd></div>
                    <div><dt>Persona políticamente expuesta</dt><dd>${p.pep === 'si' ? 'Sí' : 'No'}</dd></div>
                </dl>
                <p class="order-sub">Para modificar estos datos contacta a soporte.</p>
            `;
        }
        box.innerHTML = `<p class="profile-kyc-note"><span class="order-badge badge-done">Cuenta de demostración verificada</span></p>${seedPersonal}`;
    } else if (kyc.status === 'verified') {
        const docLabel = DOC_LABELS[kyc.docType] || kyc.docType || '';
        const date = kyc.verifiedAt ? new Date(kyc.verifiedAt).toLocaleString('es-CL') : '';
        const shots = [
            ['Frente', kyc.front], ['Reverso', kyc.back], ['Selfie', kyc.selfie]
        ].filter(([, src]) => src);

        let personalHtml = '';
        if (kyc.personal) {
            const p = kyc.personal;
            const OCC = { empleado: 'Empleado', independiente: 'Independiente', empresario: 'Empresario', estudiante: 'Estudiante', otro: 'Otro' };
            personalHtml = `
                <dl class="profile-kyc-data">
                    <div><dt>N° de documento</dt><dd>${p.docNumber}</dd></div>
                    <div><dt>Fecha de nacimiento</dt><dd>${new Date(p.birthDate + 'T12:00:00').toLocaleDateString('es-CL')}</dd></div>
                    <div><dt>Nacionalidad</dt><dd>${p.nationality}</dd></div>
                    <div><dt>Teléfono</dt><dd>${p.phone}</dd></div>
                    <div><dt>Dirección</dt><dd>${p.address.street}, ${p.address.city} ${p.address.postalCode}</dd></div>
                    <div><dt>Ocupación</dt><dd>${OCC[p.occupation] || p.occupation}</dd></div>
                    <div><dt>Persona políticamente expuesta</dt><dd>${p.pep === 'si' ? 'Sí' : 'No'}</dd></div>
                </dl>
                <p class="order-sub">Para modificar estos datos contacta a soporte.</p>
            `;
        }

        box.innerHTML = `
            <p class="profile-kyc-note">
                <span class="order-badge badge-done">Identidad verificada</span>
                <span class="order-sub">${docLabel}${date ? ' · ' + date : ''}</span>
            </p>
            ${personalHtml}
            <div class="profile-kyc-shots">
                ${shots.map(([label, src], i) => `
                    <button type="button" class="profile-kyc-shot" data-shot="${i}">
                        <img src="${src}" alt="${label} del documento">
                        <span>${label}</span>
                    </button>
                `).join('')}
            </div>
        `;
        box.querySelectorAll('.profile-kyc-shot').forEach(btn => {
            btn.addEventListener('click', () => openDocViewer(shots[Number(btn.dataset.shot)][1]));
        });
    } else {
        box.innerHTML = '<p class="profile-kyc-note"><span class="order-badge badge-escrow">Verificación pendiente</span></p>';
    }

    // Tarjeta guardada
    const cardBox = document.getElementById('profCardBox');
    cardBox.hidden = !u.savedCard;
    if (u.savedCard) {
        document.getElementById('profCardLabel').textContent = `${u.savedCard.brand} •••• ${u.savedCard.last4}`;
    }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('profError');
    const successBox = document.getElementById('profSuccess');
    errorBox.textContent = '';
    successBox.textContent = '';

    try {
        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('profName').value,
                email: document.getElementById('profEmail').value
            })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'No se pudo guardar';
        } else {
            state.user = json.user;
            document.getElementById('userName').textContent = json.user.name;
            document.getElementById('userAvatar').textContent = initials(json.user.name);
            successBox.textContent = 'Datos actualizados';
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('passError');
    const btn = document.getElementById('passBtn');
    errorBox.textContent = '';

    const newPassword = document.getElementById('profNewPass').value;
    if (newPassword !== document.getElementById('profNewPass2').value) {
        errorBox.textContent = 'Las contraseñas nuevas no coinciden';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch('/api/profile/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current: document.getElementById('profCurrentPass').value,
                newPassword
            })
        });
        const json = await res.json();

        if (!res.ok) {
            errorBox.textContent = json.error || 'No se pudo cambiar la contraseña';
        } else {
            showToast('Contraseña actualizada correctamente');
            document.getElementById('passwordForm').reset();
        }
    } catch (err) {
        errorBox.textContent = 'No se pudo conectar con el servidor';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('profCardDelete').addEventListener('click', async () => {
    try {
        const res = await fetch('/api/profile/card', { method: 'DELETE' });
        if (res.ok) {
            state.user.savedCard = null;
            renderProfile();
            updateSavedCardHint();
            showToast('Tarjeta eliminada');
        }
    } catch (err) {
        showToast('No se pudo conectar con el servidor');
    }
});

// ===== Cierre de modales (documento KYC y AML): botón, Escape y clic fuera =====
function closeModal(id) {
    document.getElementById(id).hidden = true;
}

// Visor de imagen reutilizable (KYC en header y perfil)
function openDocViewer(src) {
    if (!src) return;
    document.getElementById('docModalImg').src = src;
    document.getElementById('docModal').hidden = false;
}

document.getElementById('docModalClose').addEventListener('click', () => closeModal('docModal'));
document.getElementById('amlCancel').addEventListener('click', () => closeModal('amlModal'));

['docModal', 'amlModal'].forEach(id => {
    const overlay = document.getElementById(id);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.hidden = true;
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ['docModal', 'amlModal'].forEach(closeModal);
});

// ===== Polling: mantiene ambos notebooks sincronizados =====
async function poll() {
    try {
        await Promise.all([refreshBalances(), loadTransactions(), loadOrders(), loadDeposits()]);
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
            successBox.textContent = `Enviaste ${fmt(t.amountSent, t.currencySent)} → ${t.toName} recibió ${fmt(t.amountReceived, t.currencyReceived)}`;
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

// ===== Inicio =====
(async () => {
    // Mensaje único tras el registro: entorno de demostración con saldo de cortesía
    if (new URLSearchParams(window.location.search).get('welcome') === '1') {
        history.replaceState(null, '', 'app.html');
        setTimeout(() => showToast('Entorno de demostración privado: tu cuenta tiene saldo de cortesía para probar la plataforma'), 600);
    }

    try {
        await loadSession();
        await Promise.all([loadTransactions(), loadOrders(), loadDeposits()]);
        setInterval(poll, 3000);
    } catch (e) {
        // la redirección a login ya la maneja api()
    }
})();
